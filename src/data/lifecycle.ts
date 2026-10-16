// State machine — plan §4 (AssetStateManager) and journal entries — plan §5.3.
// Every function mutates a draft DB and returns an error message, or null on success.
import { accumOf, bookValue, generateSchedule, grossOf, monthEnd, postedLines, runJournal, simulateRun } from './calc'
import type { Asset, AssetTx, DB, JournalLine, Maintenance, TxType } from './types'

export const TODAY = '2026-10-16'
export const CASH_ACCT = '1200000001'
export const SUPPLIER_ACCT = '2100000001'

const prefix: Record<TxType, string> = {
  capitalization: 'ACP', revaluation: 'ARV', transfer: 'ATR', pause: 'APS', resume: 'ARS', sale: 'ASL', disposal: 'ADS', adjustment: 'AAJ',
}

export function nextNo(pfx: string, existing: string[], year = '2026') {
  const n = existing.filter((x) => x.startsWith(`${pfx}-${year}`)).length + 1
  return `${pfx}-${year}-${String(n).padStart(4, '0')}`
}
export const nextAssetCode = (db: DB) => `FA-${String(db.assets.length + 1).padStart(6, '0')}`

const acc = (db: DB, code: string) => `${code} — ${db.accounts.find((a) => a.code === code)?.name ?? '؟'}`
const cls = (db: DB, a: Asset) => db.classes.find((c) => c.id === a.classId)!

function addTx(db: DB, a: Asset, type: TxType, date: string, p: Partial<AssetTx>) {
  const tx: AssetTx = {
    id: `tx${db.txs.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
    number: nextNo(prefix[type], db.txs.map((t) => t.number), date.slice(0, 4)),
    assetId: a.id, type, date, amount: 0, fromValue: null, toValue: null, journal: [], notes: '', user: 'superadmin', ...p,
  }
  db.txs.push(tx)
  return tx
}

/** Required account checks for a class — §3.1 mandatory rule. */
export function classAccountErrors(db: DB, c: { assetAcct: string; accumAcct: string; expenseAcct: string; gainAcct: string; lossAcct: string; isDepreciable: boolean }) {
  const req: [string, string][] = [['حساب الأصل', c.assetAcct], ['حساب الربح من الاستبعاد', c.gainAcct], ['حساب الخسارة من الاستبعاد', c.lossAcct]]
  if (c.isDepreciable) req.push(['حساب مجمّع الاندثار', c.accumAcct], ['حساب مصروف الاندثار', c.expenseAcct])
  const errs: string[] = []
  req.forEach(([label, code]) => {
    const acct = db.accounts.find((x) => x.code === code)
    if (!code) errs.push(`${label}: مطلوب`)
    else if (!acct) errs.push(`${label}: الحساب ${code} غير موجود في الدليل`)
    else if (!acct.postable) errs.push(`${label}: الحساب ${code} غير قابل للترحيل`)
  })
  return errs
}

/** §4 rule 1: Draft → Running. */
export function capitalize(db: DB, id: string, date: string): string | null {
  const a = db.assets.find((x) => x.id === id)!
  const c = cls(db, a)
  if (a.state !== 'draft') return 'الأصل ليس في حالة مسودة'
  if (!a.classId) return 'يجب تحديد فئة الأصل'
  if (a.originalValue <= 0) return 'القيمة الأصلية يجب أن تكون أكبر من صفر'
  if (a.salvage >= a.originalValue) return 'القيمة التخريدية يجب أن تكون أقل من القيمة الأصلية'
  if (!a.depStartDate) return 'تاريخ بدء الإهلاك مطلوب'
  const errs = classAccountErrors(db, c)
  if (errs.length) return `حسابات الفئة غير مكتملة — ${errs[0]}`
  a.state = 'running'
  generateSchedule(db, a, c)
  // §12 decision 3: when a purchase bill already posted the asset, capitalization only links to it.
  const journal: JournalLine[] = a.sourceDocRef ? [] : [
    { account: acc(db, c.assetAcct), desc: `رسملة ${a.code}`, debit: a.originalValue, credit: 0 },
    { account: acc(db, SUPPLIER_ACCT), desc: `رسملة ${a.code}`, debit: 0, credit: a.originalValue },
  ]
  addTx(db, a, 'capitalization', date, { amount: a.originalValue, toValue: a.originalValue, journal, notes: a.sourceDocRef ? `مرتبط بوثيقة الشراء ${a.sourceDocRef} — لا قيد إضافي` : '' })
  return null
}

export function pause(db: DB, id: string, date: string, notes: string): string | null {
  const a = db.assets.find((x) => x.id === id)!
  if (a.state !== 'running') return 'يمكن إيقاف الأصل قيد الإهلاك فقط'
  a.state = 'paused'
  addTx(db, a, 'pause', date, { notes })
  return null
}

export function resume(db: DB, id: string, date: string, notes: string): string | null {
  const a = db.assets.find((x) => x.id === id)!
  if (a.state !== 'paused') return 'الأصل ليس موقوفاً'
  a.state = 'running'
  generateSchedule(db, a, cls(db, a), date)
  addTx(db, a, 'resume', date, { notes })
  return null
}

export function revalue(db: DB, id: string, date: string, newValue: number, notes: string): string | null {
  const a = db.assets.find((x) => x.id === id)!
  if (a.state !== 'running' && a.state !== 'paused') return 'لا يمكن إعادة تقييم أصل بهذه الحالة'
  const c = cls(db, a)
  const old = bookValue(db, a)
  const diff = newValue - old
  if (!diff) return 'القيمة الجديدة تساوي القيمة الدفترية الحالية'
  if (newValue < 0) return 'القيمة الجديدة غير صحيحة'
  if (diff > 0 && !c.revalSurplusAcct) return 'لم يُحدَّد حساب فائض إعادة التقييم في الفئة'
  a.revaluationAdj += diff
  const d = `إعادة تقييم ${a.code}`
  const journal: JournalLine[] = diff > 0
    ? [{ account: acc(db, c.assetAcct), desc: d, debit: diff, credit: 0 }, { account: acc(db, c.revalSurplusAcct), desc: d, debit: 0, credit: diff }]
    : [{ account: acc(db, c.lossAcct), desc: d, debit: -diff, credit: 0 }, { account: acc(db, c.assetAcct), desc: d, debit: 0, credit: -diff }]
  generateSchedule(db, a, c) // regenerate unposted only (§3.6)
  addTx(db, a, 'revaluation', date, { amount: diff, fromValue: old, toValue: newValue, journal, notes })
  return null
}

export function transfer(db: DB, id: string, date: string, to: { locationId: string; custodianId: string; costCenterId: string }, notes: string): string | null {
  const a = db.assets.find((x) => x.id === id)!
  if (a.state !== 'running' && a.state !== 'paused') return 'لا يمكن نقل أصل بهذه الحالة'
  if (to.locationId === a.locationId && to.custodianId === a.custodianId && to.costCenterId === a.costCenterId) return 'لم يتم تغيير أي من الموقع أو العهدة أو مركز الكلفة'
  const from = { fromLocationId: a.locationId, fromCustodianId: a.custodianId, fromCostCenterId: a.costCenterId }
  a.locationId = to.locationId
  a.custodianId = to.custodianId
  a.costCenterId = to.costCenterId
  const ccChanged = from.fromCostCenterId !== to.costCenterId
  addTx(db, a, 'transfer', date, {
    ...from, toLocationId: to.locationId, toCustodianId: to.custodianId, toCostCenterId: to.costCenterId,
    notes: notes || (ccChanged ? 'تغيّر مركز الكلفة — تُحمَّل أقساط الإهلاك على المركز الجديد ابتداءً من الفترة التالية' : 'نقل موقع / عهدة — بلا قيد'),
  })
  return null
}

function removeUnposted(db: DB, a: Asset) {
  db.lines = db.lines.filter((l) => l.assetId !== a.id || l.isPosted)
}

export function sell(db: DB, id: string, date: string, price: number, buyer: string, notes: string): string | null {
  const a = db.assets.find((x) => x.id === id)!
  if (a.state !== 'running' && a.state !== 'paused') return 'لا يمكن بيع أصل بهذه الحالة'
  if (price <= 0) return 'سعر البيع مطلوب'
  if (!buyer.trim()) return 'اسم المشتري مطلوب'
  const c = cls(db, a)
  const gross = grossOf(a)
  const accum = accumOf(db, a)
  const nbv = gross - accum
  const gl = price - nbv
  const d = `بيع ${a.code}`
  const journal: JournalLine[] = [
    { account: acc(db, CASH_ACCT), desc: d, debit: price, credit: 0 },
    { account: acc(db, c.accumAcct || c.assetAcct), desc: d, debit: accum, credit: 0 },
  ]
  if (gl < 0) journal.push({ account: acc(db, c.lossAcct), desc: `خسارة ${d}`, debit: -gl, credit: 0 })
  journal.push({ account: acc(db, c.assetAcct), desc: d, debit: 0, credit: gross })
  if (gl > 0) journal.push({ account: acc(db, c.gainAcct), desc: `ربح ${d}`, debit: 0, credit: gl })
  removeUnposted(db, a)
  a.state = 'sold'
  addTx(db, a, 'sale', date, { amount: price, fromValue: nbv, toValue: 0, party: buyer, journal, notes })
  return null
}

export function dispose(db: DB, id: string, date: string, notes: string): string | null {
  const a = db.assets.find((x) => x.id === id)!
  if (a.state !== 'running' && a.state !== 'paused' && a.state !== 'closed') return 'لا يمكن استبعاد أصل بهذه الحالة'
  const c = cls(db, a)
  const gross = grossOf(a)
  const accum = accumOf(db, a)
  const nbv = gross - accum
  const d = `استبعاد ${a.code}`
  const journal: JournalLine[] = [{ account: acc(db, c.accumAcct || c.assetAcct), desc: d, debit: accum, credit: 0 }]
  if (nbv > 0) journal.push({ account: acc(db, c.lossAcct), desc: `خسارة ${d}`, debit: nbv, credit: 0 })
  journal.push({ account: acc(db, c.assetAcct), desc: d, debit: 0, credit: gross })
  removeUnposted(db, a)
  a.state = 'disposed'
  addTx(db, a, 'disposal', date, { amount: 0, fromValue: nbv, toValue: 0, journal, notes })
  return null
}

/** §4 rule 2 */
export function canDelete(db: DB, a: Asset) {
  if (a.state !== 'draft') return 'لا يمكن حذف أصل بعد رسملته'
  if (a.isLegacy) return 'لا يمكن حذف أصل مستورد كرصيد افتتاحي'
  if (postedLines(db, a.id).length) return 'لا يمكن حذف أصل له أقساط إهلاك مُرحّلة'
  return null
}

// ---- Depreciation runs (§5.4) -------------------------------------------------

export function createRun(db: DB, periodEnd: string, classId: string, notes = '') {
  const run = {
    id: `run${db.runs.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
    number: nextNo('DPR', db.runs.map((r) => r.number), periodEnd.slice(0, 4)),
    periodEnd, classId, status: 'draft' as const, lines: simulateRun(db, periodEnd, classId), createdAt: TODAY, postedAt: null, notes,
  }
  db.runs.push(run)
  return run
}

export function postRun(db: DB, runId: string, date: string): string | null {
  const r = db.runs.find((x) => x.id === runId)!
  if (r.status !== 'draft') return 'الدورة ليست مسودة'
  const clash = db.runs.find((x) => x.id !== r.id && x.status === 'posted' && x.periodEnd === r.periodEnd && (x.classId === r.classId || !x.classId || !r.classId))
  if (clash) return `توجد دورة مُرحّلة لنفس الفترة والنطاق (${clash.number})`
  // Re-check IsPosted on every line (concurrency guard) and refresh amounts.
  r.lines = r.lines.filter((rl) => db.lines.some((l) => l.id === rl.lineId && !l.isPosted))
  if (!r.lines.length) return 'لا توجد أقساط مستحقة للترحيل'
  r.lines.forEach((rl) => {
    const l = db.lines.find((x) => x.id === rl.lineId)!
    l.isPosted = true
    l.runId = r.id
  })
  r.status = 'posted'
  r.postedAt = date
  // Assets with no remaining lines → Closed (+ Adjustment transaction).
  new Set(r.lines.map((l) => l.assetId)).forEach((aid) => {
    const a = db.assets.find((x) => x.id === aid)!
    if (!db.lines.some((l) => l.assetId === aid && !l.isPosted)) {
      a.state = 'closed'
      addTx(db, a, 'adjustment', date, { notes: `اكتمل إهلاك الأصل بالدورة ${r.number}` })
    }
  })
  return null
}

export function reverseRun(db: DB, runId: string): string | null {
  const r = db.runs.find((x) => x.id === runId)!
  if (r.status !== 'posted') return 'يمكن عكس الدورات المُرحّلة فقط'
  const later = db.runs.find((x) => x.status === 'posted' && x.periodEnd > r.periodEnd && x.lines.some((l) => r.lines.some((y) => y.assetId === l.assetId)))
  if (later) return `يجب عكس الدورة اللاحقة ${later.number} أولاً`
  r.lines.forEach((rl) => {
    const l = db.lines.find((x) => x.id === rl.lineId)
    if (l) { l.isPosted = false; l.runId = null }
    const a = db.assets.find((x) => x.id === rl.assetId)!
    if (a.state === 'closed') a.state = 'running'
  })
  r.status = 'reversed'
  return null
}

// ---- Maintenance (plan §9 phase 5 — the rules below are mock assumptions) ----------------

export const MAINT_EXPENSE_ACCT = '3600000001'

export function maintJournal(db: DB, m: Maintenance): JournalLine[] {
  if (!m.cost) return []
  const a = db.assets.find((x) => x.id === m.assetId)
  const cc = db.costCenters.find((c) => c.id === a?.costCenterId)?.name
  if (m.capitalize && a) {
    const d = `رسملة صيانة ${a.code} — ${m.number}`
    return [
      { account: acc(db, cls(db, a).assetAcct), desc: d, debit: m.cost, credit: 0 },
      { account: acc(db, SUPPLIER_ACCT), desc: d, debit: 0, credit: m.cost },
    ]
  }
  const d = `صيانة ${a?.code ?? ''} — ${m.number}`
  return [
    { account: acc(db, MAINT_EXPENSE_ACCT), desc: d, debit: m.cost, credit: 0, costCenter: cc },
    { account: acc(db, SUPPLIER_ACCT), desc: d, debit: 0, credit: m.cost },
  ]
}

export function maintValidate(db: DB, m: Maintenance): string | null {
  if (!m.assetId) return 'يجب تحديد الأصل'
  const a = db.assets.find((x) => x.id === m.assetId)
  if (!a || a.state === 'sold' || a.state === 'disposed' || a.state === 'draft') return 'الصيانة متاحة للأصول المُرسملة غير المستبعدة فقط'
  if (!m.plannedDate) return 'تاريخ الصيانة المخطط مطلوب'
  if (!m.partnerId) return 'الجهة المنفذة مطلوبة'
  if (m.cost < 0) return 'التكلفة غير صحيحة'
  if (m.capitalize && a.state !== 'running' && a.state !== 'paused') return 'الرسملة متاحة للأصول قيد الإهلاك أو الموقوفة فقط'
  return null
}

/** Rules for capitalizing a maintenance cost (IAS 16 subsequent costs — mock assumption). */
export function capitalizeError(db: DB, m: Maintenance, cost: number): string | null {
  if (!m.capitalize) return null
  const a = db.assets.find((x) => x.id === m.assetId)
  if (!a || (a.state !== 'running' && a.state !== 'paused')) return 'الرسملة متاحة للأصول قيد الإهلاك أو الموقوفة فقط'
  if (cost < db.capThreshold) return `لا يمكن رسملة مبلغ أقل من حد الرسملة ${db.capThreshold.toLocaleString('en-US')} — حمّله كمصروف`
  return null
}

export function startMaint(db: DB, id: string): string | null {
  const m = db.maintenance.find((x) => x.id === id)!
  if (m.status !== 'planned') return 'يمكن بدء أوامر الصيانة المخطّطة فقط'
  m.status = 'inProgress'
  return null
}

const addMonths = (date: string, n: number) => {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}

/** Completes an order, books its cost as an expense and, for recurring orders, schedules the next one. */
export function completeMaint(db: DB, id: string, doneDate: string, cost: number): string | null {
  const m = db.maintenance.find((x) => x.id === id)!
  if (m.status !== 'planned' && m.status !== 'inProgress') return 'أمر الصيانة مغلق'
  if (cost <= 0) return 'أدخل التكلفة الفعلية'
  const capErr = capitalizeError(db, m, cost)
  if (capErr) return capErr
  m.cost = cost
  m.status = 'done'
  m.doneDate = doneDate
  m.journal = maintJournal(db, m)
  if (m.capitalize) {
    // The improvement raises the depreciable base; only unposted lines are regenerated (§3.6).
    const a = db.assets.find((x) => x.id === m.assetId)!
    const before = bookValue(db, a)
    a.capitalizedCost += cost
    generateSchedule(db, a, cls(db, a))
    addTx(db, a, 'adjustment', doneDate, {
      amount: cost, fromValue: before, toValue: before + cost,
      notes: `رسملة تكلفة صيانة ${m.number} بمبلغ ${cost.toLocaleString('en-US')} — أُعيد توليد الأقساط غير المُرحّلة (القيد في أمر الصيانة)`,
    })
  }
  if (m.intervalMonths > 0) {
    db.maintenance.push({
      ...m, id: `m${Date.now().toString(36)}`, number: nextNo('MNT', db.maintenance.map((x) => x.number)),
      plannedDate: addMonths(doneDate, m.intervalMonths), doneDate: null, status: 'planned', journal: [], capitalize: false,
    })
  }
  return null
}

export function cancelMaint(db: DB, id: string): string | null {
  const m = db.maintenance.find((x) => x.id === id)!
  if (m.status === 'done' || m.status === 'cancelled') return 'لا يمكن إلغاء أمر مغلق'
  m.status = 'cancelled'
  return null
}

export const reversalOf = (j: JournalLine[]) => j.map((l) => ({ ...l, desc: `عكس: ${l.desc}`, debit: l.credit, credit: l.debit }))
export { runJournal, monthEnd }
