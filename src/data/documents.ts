// Transaction documents (§8 / §6.2), sales invoices with asset lines (§5.6.9) and the legacy import batch (§9 phase 4).
// Every function mutates a draft DB and returns an error message, or null on success.
import { acctsOf, bookValue, DEFAULT_AREA, generateSchedule, MPP, periodEndOf, postedLines } from './calc'
import { registerAsOf, glBalancesAsOf } from './asof'
import {
  addCost, allNumbers, costCenterTransfer, dispose, docPrefix, impair, manualDepreciation, nextAssetCode, nextNo, reduceCost, reverseExit,
  reverseTx, revalue, sellFromInvoice, TODAY, transfer, withSource,
} from './lifecycle'
import type { Asset, AssetDoc, AssetDocLine, DB, DocKind, ImportRow, JournalLine, OpeningBatch, SaleInvoice } from './types'

const fmt = (n: number) => Math.round(n).toLocaleString('en-US')
const acc = (db: DB, code: string) => `${code} — ${db.accounts.find((a) => a.code === code)?.name ?? '؟'}`
export const RECEIVABLE_ACCT = '1210000001'

// ---- Transaction documents -------------------------------------------------------------------

export const docKindLabel: Record<DocKind, string> = {
  reval: 'إعادة التقييم والهبوط', disposal: 'الاستبعاد بلا مقابل', costAdj: 'الإضافة والتخفيض', manual: 'الإهلاك اليدوي', transfer: 'النقل',
}
export const docRoute: Record<DocKind, string> = { reval: 'revaluations', disposal: 'disposals', costAdj: 'cost-adjustments', manual: 'manual-depreciation', transfer: 'transfers' }

export function docTypeOf(d: Pick<AssetDoc, 'kind' | 'direction' | 'adjType' | 'transferType'>) {
  switch (d.kind) {
    case 'reval': return d.direction === 'up' ? '233' : '238'
    case 'disposal': return '235'
    case 'costAdj': return d.adjType === 'addition' ? '240' : '241'
    case 'manual': return '242'
    case 'transfer': return d.transferType === 'location' ? '234' : '237'
  }
}

export const blankDocLine = (): AssetDocLine => ({
  id: `dl${Math.random().toString(36).slice(2, 8)}`, assetId: '', newValue: 0, amount: 0, sourceDocRef: '', newRemainingLife: 0,
  toLocationId: '', toCustodianId: '', toCostCenterId: '',
})

export function newDoc(db: DB, kind: DocKind, date = TODAY): AssetDoc {
  const d: AssetDoc = {
    id: `doc${db.docs.length + 1}-${Math.random().toString(36).slice(2, 6)}`, kind, number: '', docType: '', date, status: 'draft',
    direction: 'up', adjType: 'addition', transferType: 'location', lines: [], notes: '', txIds: [], postedAt: null,
  }
  return d
}

/** The number follows the document type (prefix); it is (re)assigned while the document is a draft. */
export function syncDocNumber(db: DB, d: AssetDoc) {
  const type = docTypeOf(d)
  const pfx = docPrefix[type]
  if (d.docType !== type || !d.number.startsWith(`${pfx}-`)) {
    d.docType = type
    d.number = nextNo(pfx, allNumbers(db).filter((n) => n !== d.number), d.date.slice(0, 4))
  }
}

export function docLineError(db: DB, d: AssetDoc, l: AssetDocLine): string | null {
  const a = db.assets.find((x) => x.id === l.assetId)
  if (!a) return 'اختر الأصل'
  if (d.kind === 'reval' && l.newValue < 0) return 'القيمة الجديدة غير صحيحة'
  if ((d.kind === 'costAdj' || d.kind === 'manual') && l.amount <= 0) return 'المبلغ مطلوب'
  if (d.kind === 'transfer' && d.transferType === 'location' && !l.toLocationId && !l.toCustodianId) return 'حدد الموقع أو العهدة الجديدة'
  if (d.kind === 'transfer' && d.transferType === 'costCenter' && !l.toCostCenterId) return 'حدد مركز الكلفة الجديد'
  return null
}

export function postDoc(db: DB, docId: string, postedAt = TODAY): string | null {
  const d = db.docs.find((x) => x.id === docId)!
  if (d.status !== 'draft') return 'المستند ليس مسودة'
  if (!d.lines.length) return 'أضف سطراً واحداً على الأقل'
  const seen = new Set<string>()
  for (const l of d.lines) {
    if (seen.has(l.assetId)) return `الأصل مكرر في المستند`
    seen.add(l.assetId)
    const e = docLineError(db, d, l)
    if (e) return e
  }
  syncDocNumber(db, d)
  const before = new Set(db.txs.map((t) => t.id))
  const err = withSource({ number: d.number, sourceDocType: d.docType, sourceDocId: d.id, sourceDocRef: d.number }, () => {
    for (const l of d.lines) {
      const a = db.assets.find((x) => x.id === l.assetId)!
      let e: string | null = null
      switch (d.kind) {
        case 'reval': e = d.direction === 'up' ? revalue(db, a.id, d.date, l.newValue, d.notes) : impair(db, a.id, d.date, l.newValue, d.notes); break
        case 'disposal': e = dispose(db, a.id, d.date, d.notes); break
        case 'costAdj': e = d.adjType === 'addition'
          ? addCost(db, a.id, d.date, l.amount, l.sourceDocRef, l.newRemainingLife || null, d.notes)
          : reduceCost(db, a.id, d.date, l.amount, l.sourceDocRef, d.notes); break
        case 'manual': e = manualDepreciation(db, a.id, d.date, l.amount, d.notes); break
        case 'transfer': e = d.transferType === 'location'
          ? transfer(db, a.id, d.date, { locationId: l.toLocationId || a.locationId, custodianId: l.toCustodianId || a.custodianId }, d.notes)
          : costCenterTransfer(db, a.id, d.date, l.toCostCenterId, d.notes); break
      }
      if (e) return `${a.code}: ${e}`
    }
    return null
  })
  if (err) return err
  d.txIds = db.txs.filter((t) => !before.has(t.id)).map((t) => t.id)
  d.status = 'posted'
  d.postedAt = postedAt
  return null
}

/** Reverses every transaction of the document, last line first (§3.8.1 rule 4 — clears dependent events). */
export function reverseDoc(db: DB, docId: string): string | null {
  const d = db.docs.find((x) => x.id === docId)!
  if (d.status !== 'posted') return 'يمكن عكس المستندات المُرحّلة فقط'
  const main = d.txIds.map((id) => db.txs.find((t) => t.id === id)!).filter((t) => !t.reversedTxId && t.type !== 'adjustment').reverse()
  const err = withSource({ number: d.number, sourceDocType: d.docType, sourceDocId: d.id, sourceDocRef: d.number }, () => {
    for (const t of main) {
      const e = reverseTx(db, t.id)
      if (e) return e
    }
    return null
  })
  if (err) return err
  d.status = 'reversed'
  return null
}

// ---- Sales invoices (§5.6.9) ----------------------------------------------------------------

export const eligibleForSale = (db: DB, invoiceId = '') =>
  db.assets.filter((a) => ['running', 'paused', 'closed'].includes(a.state) && !assetInOtherInvoice(db, a.id, invoiceId))

export function assetInOtherInvoice(db: DB, assetId: string, invoiceId: string) {
  return db.invoices.find((i) => i.id !== invoiceId && i.status !== 'cancelled' && i.lines.some((l) => l.assetId === assetId))
}

export function newInvoice(db: DB): SaleInvoice {
  return {
    id: `inv${db.invoices.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
    number: nextNo('SI', db.invoices.map((i) => i.number)), customerId: '', organization: 'شركة إنكي للتجارة العامة', currency: 'IQD',
    invoiceDate: TODAY, postingDate: TODAY, status: 'draft', lines: [], notes: '', saleTxIds: [], journal: [],
  }
}

/** Path B — «بيع» on the asset card creates a draft invoice with the asset line ready. */
export function createSaleInvoiceForAsset(db: DB, assetId: string): SaleInvoice | string {
  const a = db.assets.find((x) => x.id === assetId)!
  if (!['running', 'paused', 'closed'].includes(a.state)) return 'الأصل غير مؤهل للبيع'
  const other = assetInOtherInvoice(db, a.id, '')
  if (other) return `Assets:AssetAlreadyInSaleInvoice — الأصل مرتبط بالفاتورة ${other.number}`
  const item = db.items.find((i) => i.isFixedAsset)!
  const inv = newInvoice(db)
  inv.lines.push({ id: `il${Date.now().toString(36)}`, itemId: item.id, assetId: a.id, qty: 1, price: Math.max(0, Math.round(bookValue(db, a))), revenueAcct: acctsOf(db, a.classId).saleClearingAcct, description: a.name })
  db.invoices.push(inv)
  return inv
}

export function invoiceLineError(db: DB, inv: SaleInvoice, lineIdx: number): string | null {
  const l = inv.lines[lineIdx]
  const item = db.items.find((i) => i.id === l.itemId)
  if (!item) return 'اختر المادة'
  if (l.qty <= 0) return 'الكمية مطلوبة'
  if (item.isFixedAsset) {
    if (!l.assetId) return 'سطر مادة أصل ثابت بلا أصل محدد — يرفضه معالج الترحيل'
    if (l.qty !== 1) return 'الكمية لسطر الأصل 1 حصراً'
    const a = db.assets.find((x) => x.id === l.assetId)
    if (!a || !['running', 'paused', 'closed'].includes(a.state)) return `الأصل ${a?.code ?? ''} في حالة ${a?.state ?? '؟'} — غير مؤهل للبيع`
    const other = assetInOtherInvoice(db, a.id, inv.id)
    if (other) return `Assets:AssetAlreadyInSaleInvoice — ${a.code} مرتبط بالفاتورة ${other.number}`
    if (inv.lines.filter((x) => x.assetId === l.assetId).length > 1) return `${a.code} مكرر في الفاتورة`
  }
  return null
}

export const invoiceTotal = (inv: SaleInvoice) => inv.lines.reduce((s, l) => s + l.qty * l.price, 0)

export function invoiceJournal(db: DB, inv: SaleInvoice): JournalLine[] {
  const customer = db.customers.find((c) => c.id === inv.customerId)?.name ?? ''
  const out: JournalLine[] = [{ account: acc(db, RECEIVABLE_ACCT), desc: `فاتورة ${inv.number} — ${customer}`, debit: invoiceTotal(inv), credit: 0 }]
  inv.lines.forEach((l) => {
    const a = db.assets.find((x) => x.id === l.assetId)
    out.push({ account: acc(db, l.revenueAcct), desc: a ? `بيع ${a.code} — ${inv.number}` : `${l.description} — ${inv.number}`, debit: 0, credit: l.qty * l.price })
  })
  return out
}

/** Posting the invoice: its own entry, then the listener exits each asset line (§5.6.9). */
export function postInvoice(db: DB, invId: string): string | null {
  const inv = db.invoices.find((x) => x.id === invId)!
  if (inv.status !== 'draft') return 'الفاتورة ليست مسودة'
  if (!inv.customerId) return 'الشريك التجاري (العميل) مطلوب'
  if (!inv.lines.length) return 'أضف سطراً واحداً على الأقل'
  for (let i = 0; i < inv.lines.length; i++) {
    const e = invoiceLineError(db, inv, i)
    if (e) return `السطر ${i + 1}: ${e}`
  }
  const customer = db.customers.find((c) => c.id === inv.customerId)!.name
  inv.journal = invoiceJournal(db, inv)
  const before = new Set(db.txs.map((t) => t.id))
  const err = withSource({ sourceDocType: 'SaleInvoice', sourceDocId: inv.id, sourceDocRef: inv.number }, () => {
    for (const l of inv.lines.filter((x) => x.assetId)) {
      const e = sellFromInvoice(db, l.assetId, inv.postingDate, l.qty * l.price, customer, `بيع بالفاتورة ${inv.number}`)
      if (e) return `${db.assets.find((a) => a.id === l.assetId)?.code}: ${e}`
    }
    return null
  })
  if (err) return err
  inv.saleTxIds = db.txs.filter((t) => !before.has(t.id) && t.type === 'sale').map((t) => t.id)
  inv.status = 'posted'
  return null
}

/** Cancelling the invoice runs ReverseSale automatically for each asset line (§4.1). */
export function cancelInvoice(db: DB, invId: string): string | null {
  const inv = db.invoices.find((x) => x.id === invId)!
  if (inv.status === 'cancelled') return 'الفاتورة ملغاة أصلاً'
  if (inv.status === 'posted') {
    const err = withSource({ sourceDocType: 'SaleInvoice', sourceDocId: inv.id, sourceDocRef: inv.number }, () => {
      for (const id of [...inv.saleTxIds].reverse()) {
        const e = reverseExit(db, id)
        if (e) return e
      }
      return null
    })
    if (err) return err
  }
  inv.status = 'cancelled'
  return null
}

// ---- Legacy import batch (§9 phase 4, document type 239) ------------------------------------

export interface RowCheck { errors: string[]; warnings: string[] }

export function checkRow(db: DB, b: OpeningBatch, r: ImportRow): RowCheck {
  const errors: string[] = []
  const warnings: string[] = []
  const c = db.classes.find((x) => x.code === r.classCode)
  if (!r.name.trim()) errors.push('الاسم مطلوب')
  if (!c) errors.push(`الفئة ${r.classCode || '؟'} غير موجودة`)
  if (!db.locations.find((x) => x.code === r.locationCode)) errors.push(`الموقع ${r.locationCode || '؟'} غير موجود`)
  if (!db.costCenters.find((x) => x.code === r.costCenterCode)) errors.push(`مركز الكلفة ${r.costCenterCode || '؟'} غير موجود`)
  if (r.originalValue <= 0) errors.push('القيمة الأصلية مطلوبة')
  if (b.rows.filter((x) => x.code && x.code === r.code).length > 1) errors.push('رمز مكرر في الملف')
  if (c) {
    const fs = db.settings.fiscalStartMonth
    if (periodEndOf(b.cutoffDate, c.periodicity, fs) !== b.cutoffDate) errors.push('تاريخ القطع ليس نهاية فترة')
    if (c.kind !== 'land' && r.remainingLife % MPP[c.periodicity] !== 0) errors.push(`العمر المتبقي ليس من مضاعفات ${MPP[c.periodicity]} أشهر`)
    const base = r.originalValue - r.salvage
    if (r.importedAccum > base) errors.push('المجمّع أكبر من قاعدة الإهلاك')
    if (c.kind !== 'land' && r.remainingLife === 0 && r.originalValue - r.importedAccum > r.salvage) errors.push('العمر المتبقي 0 بينما القيمة الدفترية أعلى من التخريدية')
    if (c.kind !== 'land' && r.remainingLife > 0 && r.importedAccum >= base && base > 0) warnings.push('مُهلَك بالكامل وعمر متبقٍّ > 0 — يُستورد «مكتمل الإهلاك»')
  }
  return { errors, warnings }
}

export const batchErrors = (db: DB, b: OpeningBatch) => b.rows.reduce((n, r) => n + checkRow(db, b, r).errors.length, 0)

/** Batch totals vs ledger balances at the cut-off — a warning, never a blocker (§9 phase 4). */
export function batchGlCheck(db: DB, b: OpeningBatch) {
  const totals = new Map<string, { cost: number; accum: number }>()
  b.rows.forEach((r) => {
    const c = db.classes.find((x) => x.code === r.classCode)
    if (!c) return
    const ac = acctsOf(db, c.id)
    const t = totals.get(ac.assetAcct) ?? { cost: 0, accum: 0 }
    t.cost += r.originalValue
    t.accum += r.importedAccum
    totals.set(ac.assetAcct, t)
  })
  const gl = glBalancesAsOf(db, b.cutoffDate)
  const others = registerAsOf(db, b.cutoffDate).rows.filter((x) => !b.assetIds.includes(x.a.id))
  return [...totals.entries()].map(([code, t]) => {
    const cls = db.classes.find((c) => acctsOf(db, c.id).assetAcct === code)!
    const accumCode = acctsOf(db, cls.id).accumAcct
    const glCost = (gl.get(code) ?? 0) - others.filter((x) => acctsOf(db, x.a.classId).assetAcct === code).reduce((s, x) => s + x.cost, 0)
    const glAccum = accumCode ? -(gl.get(accumCode) ?? 0) - others.filter((x) => acctsOf(db, x.a.classId).accumAcct === accumCode).reduce((s, x) => s + x.accum, 0) : 0
    return { code, accumCode, cost: t.cost, accum: t.accum, glCost: b.status === 'committed' ? glCost : glCost, glAccum }
  })
}

export function commitBatch(db: DB, batchId: string): string | null {
  const b = db.batches.find((x) => x.id === batchId)!
  if (b.status !== 'draft') return 'الدفعة ليست مسودة'
  if (!b.rows.length) return 'لا توجد أسطر — ارفع الملف أولاً'
  const n = batchErrors(db, b)
  if (n) return `لا يمكن الاعتماد: ${n} خطأ في المعاينة`
  b.assetIds = []
  for (const r of b.rows) {
    const c = db.classes.find((x) => x.code === r.classCode)!
    const ac = acctsOf(db, c.id)
    const a: Asset = {
      id: `a${db.assets.length + 1}-${Math.random().toString(36).slice(2, 5)}`, code: nextAssetCode(db), name: r.name,
      description: r.code ? `رمز النظام السابق: ${r.code}` : '', classId: c.id, groupId: '', locationId: db.locations.find((x) => x.code === r.locationCode)!.id,
      custodianId: db.employees[0].id, serial: '', tagNumber: '', partnerId: '', sourceDocRef: '', sourceDocLine: '', sourceLineSeq: null,
      acquisitionDate: r.acquisitionDate, depStartDate: r.depStartDate, originalValue: r.originalValue, salvage: r.salvage, lifeMonths: r.lifeMonths || c.lifeMonths,
      method: c.method, periodicity: c.periodicity, prorata: c.prorata, decliningFactor: c.decliningFactor, capitalizationDate: b.cutoffDate, state: 'running',
      isLegacy: true, importedAccum: r.importedAccum, importCutoffDate: b.cutoffDate, remainingLifeAtImport: r.remainingLife, revaluationAdj: 0,
      costCenterId: db.costCenters.find((x) => x.code === r.costCenterCode)!.id, project: '',
    }
    db.assets.push(a)
    db.areaSettings.push({
      assetId: a.id, areaId: DEFAULT_AREA, method: a.method, lifeMonths: a.lifeMonths, decliningFactor: a.decliningFactor, periodicity: a.periodicity,
      prorata: a.prorata, salvage: a.salvage, depStartDate: a.depStartDate, importedAccum: a.importedAccum, remainingLifeAtImport: a.remainingLifeAtImport,
    })
    generateSchedule(db, a, c)
    if (c.isDepreciable && c.kind !== 'land' && !db.lines.some((l) => l.assetId === a.id)) a.state = 'closed'
    const ext: JournalLine[] = b.glLoaded ? [
      { account: acc(db, ac.assetAcct), desc: `رصيد افتتاحي ${a.code}`, debit: a.originalValue, credit: 0 },
      ...(a.importedAccum && ac.accumAcct ? [{ account: acc(db, ac.accumAcct), desc: `رصيد افتتاحي ${a.code}`, debit: 0, credit: a.importedAccum }] : []),
      { account: 'أرصدة افتتاحية — خارج الوحدة', desc: `رصيد افتتاحي ${a.code}`, debit: 0, credit: a.originalValue - a.importedAccum },
    ] : []
    db.txs.push({
      id: `tx-ob-${a.id}`, number: b.number, docType: '239', assetId: a.id, type: 'openingBalance', date: b.cutoffDate, amount: a.originalValue,
      fromValue: 0, toValue: a.originalValue, isReversed: false, journal: [], externalJournal: ext,
      externalNote: b.glLoaded ? 'الأرصدة الافتتاحية للأستاذ (عملية Finance المستقلة)' : undefined,
      sourceDocType: '239', sourceDocId: b.id, sourceDocRef: b.number,
      notes: `استيراد رصيد افتتاحي — مجمّع ${fmt(a.importedAccum)}، عمر متبقٍّ ${a.remainingLifeAtImport} شهراً`, user: 'superadmin',
    })
    b.assetIds.push(a.id)
  }
  b.status = 'committed'
  b.committedAt = TODAY
  return null
}

/** Reversal is blocked once any depreciation line of an asset in the batch is posted. */
export function reverseBatch(db: DB, batchId: string): string | null {
  const b = db.batches.find((x) => x.id === batchId)!
  if (b.status !== 'committed') return 'يمكن عكس الدفعات المعتمدة فقط'
  for (const id of b.assetIds) {
    const a = db.assets.find((x) => x.id === id)!
    const p = postedLines(db, id)[0]
    if (p) return `لا يمكن العكس: للأصل ${a.code} قسط مُرحّل بتاريخ ${p.date}`
    const other = db.txs.find((t) => t.assetId === id && t.type !== 'openingBalance' && !t.isReversed && !t.reversedTxId)
    if (other) return `لا يمكن العكس: للأصل ${a.code} حركة ${other.number} — اعكسها أولاً`
  }
  for (const id of b.assetIds) {
    const a = db.assets.find((x) => x.id === id)!
    db.lines = db.lines.filter((l) => l.assetId !== id)
    const ob = db.txs.find((t) => t.assetId === id && t.type === 'openingBalance' && !t.isReversed)
    if (ob) {
      ob.isReversed = true
      db.txs.push({
        ...ob, id: `${ob.id}-r`, amount: -ob.amount, fromValue: ob.toValue, toValue: 0, reversedTxId: ob.id, isReversed: true,
        externalJournal: ob.externalJournal.map((l) => ({ ...l, desc: `عكس: ${l.desc}`, debit: l.credit, credit: l.debit })), notes: `عكس الدفعة ${b.number}`,
      })
    }
    a.state = 'cancelled'
  }
  b.status = 'reversed'
  return null
}

/** Mock Excel file: a realistic sheet with two rows that fail the preview. */
export function sampleImportRows(): ImportRow[] {
  const r = (code: string, name: string, classCode: string, loc: string, acq: string, orig: number, salvage: number, accum: number, life: number, rem: number, cc: string): ImportRow => ({
    id: `ir${Math.random().toString(36).slice(2, 8)}`, code, name, classCode, locationCode: loc, acquisitionDate: acq, depStartDate: acq,
    originalValue: orig, salvage, importedAccum: accum, lifeMonths: life, remainingLife: rem, costCenterCode: cc,
  })
  return [
    r('OLD-VEH-118', 'سيارة نيسان صني 2021 — فرع البصرة', 'VEH', 'BSR-01', '2021-06-01', 21000000, 2100000, 14100000, 60, 7, 'CC-05'),
    r('OLD-FUR-342', 'أثاث استقبال فرع أربيل', 'FUR', 'EBL-01', '2020-03-01', 7200000, 0, 4950000, 96, 30, 'CC-05'),
    r('OLD-MCH-077', 'ماكينة تغليف حراري', 'MCH', 'BGD-FAC', '2019-09-01', 48000000, 2400000, 30000000, 120, 47, 'CC-04'),
    r('OLD-BLD-005', 'مخزن تبريد — أبو غريب', 'BLD', 'BGD-WH', '2017-01-01', 380000000, 38000000, 123120000, 300, 185, 'CC-06'),
    r('OLD-ITE-230', 'طابعات شبكية (6)', 'ITE', 'BGD-HQ', '2021-01-01', 5400000, 0, 5400000, 48, 0, 'CC-02'),
    r('OLD-VEH-131', 'حافلة صغيرة تويوتا هايس', 'VEH', 'BGD-WH', '2020-01-01', 36000000, 3600000, 34000000, 60, 0, 'CC-06'),
  ]
}
