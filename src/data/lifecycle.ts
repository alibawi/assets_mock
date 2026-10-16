// State machine — plan §4.1 (AssetStateManager), run rules — §3.8.1 / §5.4, events — §5.5 / §5.6,
// journal entries — §5.3. Every function mutates a draft DB and returns an error message, or null on success.
import {
  accumOf, acctsOf, bookValue, ccAsOf, DEFAULT_AREA, generateSchedule, grossOf, lifeError, linesOf, monthEnd, monthsIncl, MPP,
  daysIncl, nextDay, periodEndOf, periodStartOf, postedLines, remainingDepreciable, renumber, runInScope, simulateRun,
} from './calc'
import type { Asset, AssetState, AssetTx, DB, DepRun, JournalLine, Maintenance, TxType } from './types'

export const TODAY = '2026-10-16'
export const CASH_ACCT = '1200000001'
export const SUPPLIER_ACCT = '2100000001'
export const MAINT_EXPENSE_ACCT = '3600000001'

/** §3.10 — event → document type. Reversals reuse the original type (IsReversal). */
export const txDocType: Record<TxType, string> = {
  capitalization: '231', capitalizationReversal: '231', openingBalance: '239', addition: '240', acquisitionReduction: '241',
  manualDepreciation: '242', revaluation: '233', impairment: '238', transfer: '234', costCenterTransfer: '237',
  sale: '236', saleReversal: '236', disposal: '235', disposalReversal: '235', pause: '', resume: '', adjustment: '', cancellation: '',
}
export const docPrefix: Record<string, string> = {
  '230': 'FA', '231': 'ACP', '232': 'DPR', '233': 'ARV', '234': 'ATR', '235': 'ADS', '236': 'ASL', '237': 'ACC',
  '238': 'AIM', '239': 'AOB', '240': 'AAD', '241': 'ACR', '242': 'AMD', '243': 'MNT', '': 'TRX',
}

export function nextNo(pfx: string, existing: string[], year = '2026') {
  const n = existing.filter((x) => x.startsWith(`${pfx}-${year}`)).length + 1
  return `${pfx}-${year}-${String(n).padStart(4, '0')}`
}
export const nextAssetCode = (db: DB) => `FA-${String(db.assets.length + 1).padStart(6, '0')}`

const acc = (db: DB, code: string) => `${code} — ${db.accounts.find((a) => a.code === code)?.name ?? '؟'}`
const cls = (db: DB, a: Asset) => db.classes.find((c) => c.id === a.classId)!
const get = (db: DB, id: string) => db.assets.find((x) => x.id === id)!
const ccName = (db: DB, id: string) => db.costCenters.find((c) => c.id === id)?.name
const fmt = (n: number) => Math.round(n).toLocaleString('en-US')

function addTx(db: DB, a: Asset, type: TxType, date: string, p: Partial<AssetTx>) {
  const docType = txDocType[type]
  const tx: AssetTx = {
    id: `tx${db.txs.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
    number: nextNo(docPrefix[docType], db.txs.map((t) => t.number), date.slice(0, 4)),
    docType, assetId: a.id, type, date, amount: 0, fromValue: null, toValue: null, isReversed: false,
    journal: [], externalJournal: [], notes: '', user: 'superadmin', ...p,
  }
  db.txs.push(tx)
  return tx
}

const lastPostedLineDate = (db: DB, a: Asset) => {
  const p = postedLines(db, a.id)
  return p.length ? p[p.length - 1].date : null
}
const lastPostedPeriodDate = (db: DB, a: Asset) => {
  const p = postedLines(db, a.id).filter((l) => l.type === 'depreciation')
  return p.length ? p[p.length - 1].date : null
}
const notBefore = (db: DB, a: Asset, date: string) => {
  const last = lastPostedLineDate(db, a)
  return last && date <= last ? `التاريخ يجب أن يكون بعد آخر قسط مُرحّل (${last})` : null
}
const reopenIfClosed = (db: DB, a: Asset) => {
  if (a.state === 'closed' && remainingDepreciable(db, a) > 0) a.state = 'running'
}
const regen = (db: DB, a: Asset) => {
  if (a.state === 'running' || a.state === 'paused' || a.state === 'closed') generateSchedule(db, a, cls(db, a))
  if (a.state === 'running' && !db.lines.some((l) => l.assetId === a.id && !l.isPosted) && remainingDepreciable(db, a) <= 0 && postedLines(db, a.id).length) a.state = 'closed'
}
const fail = (msg: string) => msg

/** Required account checks for a class — §3.1 mandatory rule (applied to the default-area row, §3.1.1). */
export function classAccountErrors(db: DB, c: { assetAcct: string; accumAcct: string; expenseAcct: string; gainAcct: string; lossAcct: string }, depreciable: boolean) {
  const req: [string, string][] = [['حساب الأصل', c.assetAcct], ['حساب الربح من الاستبعاد', c.gainAcct], ['حساب الخسارة من الاستبعاد', c.lossAcct]]
  if (depreciable) req.push(['حساب مجمّع الاندثار', c.accumAcct], ['حساب مصروف الاندثار', c.expenseAcct])
  const errs: string[] = []
  req.forEach(([label, code]) => {
    const acct = db.accounts.find((x) => x.code === code)
    if (!code) errs.push(`${label}: مطلوب`)
    else if (!acct) errs.push(`${label}: الحساب ${code} غير موجود في الدليل`)
    else if (!acct.postable) errs.push(`${label}: الحساب ${code} غير قابل للترحيل`)
  })
  return errs
}

/** §5.6.5 — LowValue threshold (null = disabled). */
export function lowValueError(db: DB, a: Asset) {
  const t = db.settings.lowValueThreshold
  return cls(db, a)?.kind === 'lowValue' && t !== null && a.originalValue > t
    ? `قيمة الأصل تتجاوز حدّ الأصول منخفضة القيمة (${fmt(t)}) — سجّله في فئة عادية`
    : null
}

function writeAreaSetting(db: DB, a: Asset) {
  const row = {
    assetId: a.id, areaId: DEFAULT_AREA, method: a.method, lifeMonths: a.lifeMonths, decliningFactor: a.decliningFactor, periodicity: a.periodicity,
    prorata: a.prorata, salvage: a.salvage, depStartDate: a.depStartDate, importedAccum: a.importedAccum, remainingLifeAtImport: a.remainingLifeAtImport,
  }
  const i = db.areaSettings.findIndex((x) => x.assetId === a.id && x.areaId === DEFAULT_AREA)
  if (i >= 0) db.areaSettings[i] = row
  else db.areaSettings.push(row)
}

// ---------------------------------------------------------------------------------------------
// §4.1 rule 1 — Draft → Running
export function capitalize(db: DB, id: string, date: string): string | null {
  const a = get(db, id)
  const c = cls(db, a)
  if (a.state !== 'draft') return fail('الأصل ليس في حالة مسودة')
  if (!a.classId) return fail('يجب تحديد فئة الأصل')
  if (a.originalValue <= 0) return fail('القيمة الأصلية يجب أن تكون أكبر من صفر')
  if (a.salvage >= a.originalValue) return fail('القيمة التخريدية يجب أن تكون أقل من القيمة الأصلية')
  if (!a.depStartDate) return fail('تاريخ بدء الإهلاك مطلوب')
  const le = c.isDepreciable && c.kind !== 'lowValue' ? lifeError(a.lifeMonths, a.periodicity) : null
  if (le) return le
  const lv = lowValueError(db, a)
  if (lv) return lv
  const errs = classAccountErrors(db, acctsOf(db, c.id), c.isDepreciable)
  if (errs.length) return fail(`حسابات الفئة غير مكتملة — ${errs[0]}`)
  const ac = acctsOf(db, c.id)
  a.state = 'running'
  a.capitalizationDate = date
  writeAreaSetting(db, a)
  generateSchedule(db, a, c)
  const lines: JournalLine[] = [
    { account: acc(db, ac.assetAcct), desc: `رسملة ${a.code}`, debit: a.originalValue, credit: 0 },
    { account: acc(db, SUPPLIER_ACCT), desc: `رسملة ${a.code}`, debit: 0, credit: a.originalValue },
  ]
  // §12 decision 3: a posted purchase bill already carries the asset — the module only links to it.
  addTx(db, a, 'capitalization', date, {
    amount: a.originalValue, fromValue: 0, toValue: grossOf(a), fromState: 'draft', toState: 'running', sourceDocRef: a.sourceDocRef || undefined,
    journal: a.sourceDocRef ? [] : lines, externalJournal: a.sourceDocRef ? lines : [],
    externalNote: a.sourceDocRef ? `قيد فاتورة المشتريات ${a.sourceDocRef}` : undefined,
    notes: a.sourceDocRef ? `مرتبط بوثيقة الشراء ${a.sourceDocRef} — لا قيد من الوحدة` : '',
  })
  return null
}

/** §4.1 Draft → Cancelled (final; the code stays reserved). */
export function cancelAsset(db: DB, id: string, date: string, notes: string): string | null {
  const a = get(db, id)
  if (a.state !== 'draft') return fail('يمكن إلغاء الأصول بحالة مسودة فقط')
  a.state = 'cancelled'
  addTx(db, a, 'cancellation', date, { fromState: 'draft', toState: 'cancelled', notes: notes || 'إلغاء الأصل — يبقى الرمز محجوزاً' })
  return null
}

/** §4.1 Running → Draft when nothing has been posted. */
export function undoCapitalization(db: DB, id: string, notes: string): string | null {
  const a = get(db, id)
  if (a.state !== 'running') return fail('التراجع عن الرسملة متاح للأصول قيد الإهلاك فقط')
  if (a.isLegacy) return fail('لا يمكن التراجع عن رسملة أصل مستورد')
  if (postedLines(db, a.id).length) return fail('لا يمكن التراجع: يوجد قسط إهلاك مُرحّل')
  const live = (t: TxType) => db.txs.some((x) => x.assetId === a.id && x.type === t && !x.isReversed)
  if (live('revaluation') || live('impairment')) return fail('لا يمكن التراجع: توجد إعادة تقييم أو هبوط قيمة')
  const cap = db.txs.find((x) => x.assetId === a.id && x.type === 'capitalization' && !x.isReversed)!
  cap.isReversed = true
  addTx(db, a, 'capitalizationReversal', cap.date, {
    amount: -cap.amount, fromValue: cap.toValue, toValue: 0, fromState: 'running', toState: 'draft', reversedTxId: cap.id,
    journal: reversalOf(cap.journal),
    notes: notes || (cap.externalJournal.length ? `تراجع عن الرسملة — قيد فاتورة الشراء ${cap.sourceDocRef} يبقى قائماً في المشتريات` : 'تراجع عن الرسملة وعكس قيدها'),
  })
  db.lines = db.lines.filter((l) => l.assetId !== a.id)
  a.state = 'draft'
  a.capitalizationDate = null
  return null
}

export function pause(db: DB, id: string, date: string, notes: string): string | null {
  const a = get(db, id)
  if (a.state !== 'running') return fail('يمكن إيقاف الأصل قيد الإهلاك فقط')
  a.state = 'paused'
  addTx(db, a, 'pause', date, { fromState: 'running', toState: 'paused', notes })
  return null
}

/** §4.1 — Pause does not consume life; the first installment after Resume is full. */
export function resume(db: DB, id: string, date: string, notes: string): string | null {
  const a = get(db, id)
  if (a.state !== 'paused') return fail('الأصل ليس موقوفاً')
  a.state = 'running'
  generateSchedule(db, a, cls(db, a), { from: date, noProrata: true })
  addTx(db, a, 'resume', date, { fromState: 'paused', toState: 'running', notes })
  return null
}

/** Revaluation upward (233). Closed → Running when depreciable value remains. */
export function revalue(db: DB, id: string, date: string, newValue: number, notes: string): string | null {
  const a = get(db, id)
  if (!['running', 'paused', 'closed'].includes(a.state)) return fail('لا يمكن إعادة تقييم أصل بهذه الحالة')
  const ac = acctsOf(db, a.classId)
  const old = bookValue(db, a)
  const diff = newValue - old
  if (diff <= 0) return fail('إعادة التقييم بالزيادة فقط — للنقص استخدم «هبوط قيمة»')
  if (!ac.revalSurplusAcct) return fail('لم يُحدَّد حساب فائض إعادة التقييم في الفئة')
  const ne = notBefore(db, a, date)
  if (ne) return ne
  const from = grossOf(a)
  a.revaluationAdj += diff
  const d = `إعادة تقييم ${a.code}`
  reopenIfClosed(db, a)
  regen(db, a)
  addTx(db, a, 'revaluation', date, {
    amount: diff, fromValue: from, toValue: grossOf(a), notes: notes || `القيمة الدفترية من ${fmt(old)} إلى ${fmt(newValue)}`,
    journal: [{ account: acc(db, ac.assetAcct), desc: d, debit: diff, credit: 0 }, { account: acc(db, ac.revalSurplusAcct), desc: d, debit: 0, credit: diff }],
  })
  return null
}

/** Impairment (238) — revaluation downward. */
export function impair(db: DB, id: string, date: string, newValue: number, notes: string): string | null {
  const a = get(db, id)
  if (a.state !== 'running' && a.state !== 'paused') return fail('هبوط القيمة متاح للأصول قيد الإهلاك أو الموقوفة')
  const ac = acctsOf(db, a.classId)
  const old = bookValue(db, a)
  const diff = old - newValue
  if (newValue < 0) return fail('القيمة الجديدة غير صحيحة')
  if (diff <= 0) return fail('القيمة الجديدة يجب أن تكون أقل من القيمة الدفترية الحالية')
  const ne = notBefore(db, a, date)
  if (ne) return ne
  const from = grossOf(a)
  a.revaluationAdj -= diff
  const d = `هبوط قيمة ${a.code}`
  regen(db, a)
  // §5.3 / §12.8 — LossOnDisposal until a dedicated impairment account is approved.
  addTx(db, a, 'impairment', date, {
    amount: -diff, fromValue: from, toValue: grossOf(a), notes: notes || `القيمة الدفترية من ${fmt(old)} إلى ${fmt(newValue)}`,
    journal: [{ account: acc(db, ac.lossAcct), desc: d, debit: diff, credit: 0 }, { account: acc(db, ac.assetAcct), desc: d, debit: 0, credit: diff }],
  })
  return null
}

/** §5.6.2 AddCost (240). Optional new remaining life is logged as an Adjustment. */
export function addCost(db: DB, id: string, date: string, amount: number, sourceDocRef: string, newRemainingLife: number | null, notes: string): string | null {
  const a = get(db, id)
  if (!['running', 'paused', 'closed'].includes(a.state)) return fail('الإضافة اللاحقة متاحة للأصول قيد الإهلاك أو الموقوفة أو مكتملة الإهلاك')
  if (amount <= 0) return fail('المبلغ مطلوب')
  const ne = notBefore(db, a, date)
  if (ne) return ne
  const ac = acctsOf(db, a.classId)
  const from = grossOf(a)
  a.originalValue += amount
  if (newRemainingLife) {
    const done = postedLines(db, a.id).filter((l) => l.type === 'depreciation').length * MPP[a.periodicity]
    const le = lifeError(newRemainingLife, a.periodicity)
    if (le) return le
    if (a.isLegacy) a.remainingLifeAtImport = done + newRemainingLife
    else a.lifeMonths = done + newRemainingLife
  }
  reopenIfClosed(db, a)
  regen(db, a)
  writeAreaSetting(db, a)
  const lines: JournalLine[] = [
    { account: acc(db, ac.assetAcct), desc: `إضافة لاحقة ${a.code}`, debit: amount, credit: 0 },
    { account: acc(db, SUPPLIER_ACCT), desc: `إضافة لاحقة ${a.code}`, debit: 0, credit: amount },
  ]
  const tx = addTx(db, a, 'addition', date, {
    amount, fromValue: from, toValue: grossOf(a), sourceDocRef: sourceDocRef || undefined,
    journal: sourceDocRef ? [] : lines, externalJournal: sourceDocRef ? lines : [],
    externalNote: sourceDocRef ? `قيد فاتورة المشتريات ${sourceDocRef}` : undefined,
    notes: notes || (sourceDocRef ? `مرتبط بالفاتورة ${sourceDocRef} — لا قيد من الوحدة` : ''),
  })
  if (newRemainingLife) addTx(db, a, 'adjustment', date, { notes: `عمر متبقٍّ جديد ${newRemainingLife} شهراً مع الإضافة ${tx.number}`, changesLife: true })
  return null
}

/** §5.6.3 ReduceCost (241). */
export function reduceCost(db: DB, id: string, date: string, amount: number, sourceDocRef: string, notes: string): string | null {
  const a = get(db, id)
  if (a.state !== 'running' && a.state !== 'paused') return fail('تخفيض الاقتناء متاح للأصول قيد الإهلاك أو الموقوفة')
  if (amount <= 0) return fail('المبلغ مطلوب')
  if (grossOf(a) - amount < accumOf(db, a)) return fail('Assets:ReductionExceedsBookValue — القيمة بعد التخفيض أقل من المجمّع المُرحّل والمستورد؛ استبعد الأصل أو عدّله')
  const ne = notBefore(db, a, date)
  if (ne) return ne
  const ac = acctsOf(db, a.classId)
  const from = grossOf(a)
  a.originalValue -= amount
  if (a.salvage > a.originalValue) a.salvage = 0
  regen(db, a)
  writeAreaSetting(db, a)
  const lines: JournalLine[] = [
    { account: acc(db, SUPPLIER_ACCT), desc: `تخفيض اقتناء ${a.code}`, debit: amount, credit: 0 },
    { account: acc(db, ac.assetAcct), desc: `تخفيض اقتناء ${a.code}`, debit: 0, credit: amount },
  ]
  addTx(db, a, 'acquisitionReduction', date, {
    amount: -amount, fromValue: from, toValue: grossOf(a), sourceDocRef: sourceDocRef || undefined,
    journal: sourceDocRef ? [] : lines, externalJournal: sourceDocRef ? lines : [],
    externalNote: sourceDocRef ? `قيد مذكرة الدائن ${sourceDocRef}` : undefined,
    notes: notes || (sourceDocRef ? `مرتبط بمذكرة الدائن ${sourceDocRef}` : ''),
  })
  return null
}

/** §5.6.4 ManualDepreciation (242) — a posted Manual line with its own entry. */
export function manualDepreciation(db: DB, id: string, date: string, amount: number, notes: string): string | null {
  const a = get(db, id)
  const c = cls(db, a)
  if (a.state !== 'running' && a.state !== 'paused') return fail('الإهلاك اليدوي متاح للأصول قيد الإهلاك أو الموقوفة')
  if (!c.isDepreciable || c.kind === 'land') return fail('الفئة غير قابلة للإهلاك')
  if (amount <= 0) return fail('المبلغ يجب أن يكون أكبر من صفر')
  if (amount > remainingDepreciable(db, a)) return fail(`المبلغ يتجاوز القيمة المتبقية القابلة للإهلاك (${fmt(remainingDepreciable(db, a))})`)
  const ne = notBefore(db, a, date)
  if (ne) return ne
  const ac = acctsOf(db, a.classId)
  const accum = accumOf(db, a) + amount
  const tx = addTx(db, a, 'manualDepreciation', date, {
    amount, notes,
    journal: [
      { account: acc(db, ac.expenseAcct), desc: `إهلاك يدوي ${a.code}`, debit: amount, credit: 0, costCenter: ccName(db, ccAsOf(db, a, date)) },
      { account: acc(db, ac.accumAcct), desc: `إهلاك يدوي ${a.code}`, debit: 0, credit: amount },
    ],
  })
  db.lines.push({
    id: `mn-${tx.id}`, assetId: a.id, areaId: DEFAULT_AREA, seq: 0, date, type: 'manual', days: null, fraction: 0, amount, accum,
    remaining: grossOf(a) - a.salvage - accum, isPosted: true, runId: null, txId: tx.id,
  })
  regen(db, a)
  renumber(db, a.id)
  return null
}

/** Useful-life change (recompute-schedule, §6.2) — Adjustment; Closed → Running if value remains. */
export function changeLife(db: DB, id: string, date: string, newLife: number, notes: string): string | null {
  const a = get(db, id)
  if (!['running', 'paused', 'closed'].includes(a.state)) return fail('لا يمكن تعديل العمر بهذه الحالة')
  const le = lifeError(newLife, a.periodicity)
  if (le) return le
  const done = postedLines(db, a.id).filter((l) => l.type === 'depreciation').length * MPP[a.periodicity]
  if (newLife <= done) return fail(`العمر الجديد يجب أن يتجاوز الأشهر المُرحّلة (${done})`)
  const old = a.isLegacy ? a.remainingLifeAtImport : a.lifeMonths
  if (a.isLegacy) a.remainingLifeAtImport = newLife
  else a.lifeMonths = newLife
  reopenIfClosed(db, a)
  regen(db, a)
  writeAreaSetting(db, a)
  addTx(db, a, 'adjustment', date, {
    notes: `تعديل ${a.isLegacy ? 'العمر المتبقي عند الاستيراد' : 'العمر الإنتاجي'} من ${old} إلى ${newLife} شهراً — أُعيد توليد الأقساط غير المُرحّلة فقط${notes ? ` — ${notes}` : ''}`,
    changesLife: true,
  })
  return null
}

/** Transfer of location / custodian (234) — no entry. Allowed on Closed too (§4.1). */
export function transfer(db: DB, id: string, date: string, to: { locationId: string; custodianId: string }, notes: string): string | null {
  const a = get(db, id)
  if (!['running', 'paused', 'closed'].includes(a.state)) return fail('لا يمكن نقل أصل بهذه الحالة')
  if (to.locationId === a.locationId && to.custodianId === a.custodianId) return fail('لم يتغيّر الموقع ولا العهدة')
  const from = { fromLocationId: a.locationId, fromCustodianId: a.custodianId }
  a.locationId = to.locationId
  a.custodianId = to.custodianId
  addTx(db, a, 'transfer', date, { ...from, toLocationId: to.locationId, toCustodianId: to.custodianId, notes: notes || 'نقل موقع / عهدة — بلا قيد' })
  return null
}

/** §5.5 — default effective date = first day of the next unposted period. */
export function defaultCcDate(db: DB, a: Asset) {
  const last = lastPostedPeriodDate(db, a)
  return last ? nextDay(last) : a.depStartDate > TODAY ? a.depStartDate : TODAY
}

/** §5.5 CostCenterTransfer (237) — effective-dated, no retroactive transfers, no entry by default (§12.6). */
export function costCenterTransfer(db: DB, id: string, date: string, toCostCenterId: string, notes: string): string | null {
  const a = get(db, id)
  if (!['running', 'paused', 'closed'].includes(a.state)) return fail('لا يمكن نقل مركز الكلفة بهذه الحالة')
  if (toCostCenterId === a.costCenterId) return fail('مركز الكلفة الجديد مطابق للحالي')
  const ne = notBefore(db, a, date)
  if (ne) return `لا نقل بأثر رجعي — ${ne}`
  const from = a.costCenterId
  a.costCenterId = toCostCenterId
  addTx(db, a, 'costCenterTransfer', date, {
    fromCostCenterId: from, toCostCenterId,
    notes: notes || `تاريخ السريان ${date} — الأقساط بتاريخ ≥ ${date} تُحمَّل على المركز الجديد؛ بلا قيد (§12.6)`,
  })
  return null
}

/** §5.5 rule 5 — a cost-center transfer is reversible while no posted line is dated on/after it. */
export function reverseCostCenterTransfer(db: DB, txId: string): string | null {
  const t = db.txs.find((x) => x.id === txId)!
  if (t.isReversed) return fail('الحركة معكوسة أصلاً')
  const a = get(db, t.assetId)
  if (postedLines(db, a.id).some((l) => l.date >= t.date)) return fail('لا يمكن العكس: يوجد قسط مُرحّل بتاريخ يساوي أو يلي تاريخ السريان')
  t.isReversed = true
  a.costCenterId = t.fromCostCenterId!
  addTx(db, a, 'costCenterTransfer', t.date, {
    fromCostCenterId: t.toCostCenterId, toCostCenterId: t.fromCostCenterId, reversedTxId: t.id, isReversed: true, notes: `عكس ${t.number}`,
  })
  return null
}

// ---- Sale / disposal with depreciation to date (§5.6.1) ------------------------------------

/** Share of the exit period depreciated up to D, per the class proration (§5.6.1, §12.10). */
export function exitFraction(a: Asset, d: string, fs: number) {
  const pe = periodEndOf(d, a.periodicity, fs)
  const ps = periodStartOf(pe, a.periodicity)
  if (a.prorata === 'DAYS') return daysIncl(ps, d) / daysIncl(ps, pe)
  if (a.prorata === 'CONST') return monthsIncl(ps, d) / MPP[a.periodicity]
  return 0
}

/** Preview used by the sale / disposal dialog. */
export function exitPreview(db: DB, a: Asset, d: string) {
  const fs = db.settings.fiscalStartMonth
  const pe = periodEndOf(d, a.periodicity, fs)
  const ps = periodStartOf(pe, a.periodicity)
  const blocking = a.state === 'running'
    ? linesOf(db, a.id).find((l) => !l.isPosted && l.type === 'depreciation' && l.date < ps)
    : undefined
  const periodLine = linesOf(db, a.id).find((l) => l.type === 'depreciation' && l.date === pe)
  let toDate = 0
  const g = exitFraction(a, d, fs)
  if (a.state === 'running' && periodLine && !periodLine.isPosted) toDate = Math.min(Math.round(periodLine.amount * g), remainingDepreciable(db, a))
  const gross = grossOf(a)
  const accum = accumOf(db, a) + toDate
  return { blocking, toDate, g, gross, accum, nbv: gross - accum, periodLine }
}

function exitAsset(db: DB, id: string, kind: 'sale' | 'disposal', date: string, price: number, buyer: string, notes: string): string | null {
  const a = get(db, id)
  if (!['running', 'paused', 'closed'].includes(a.state)) return fail(kind === 'sale' ? 'لا يمكن بيع أصل بهذه الحالة' : 'لا يمكن استبعاد أصل بهذه الحالة')
  if (kind === 'sale' && price <= 0) return fail('سعر البيع مطلوب')
  if (kind === 'sale' && !buyer.trim()) return fail('اسم المشتري مطلوب')
  const ne = notBefore(db, a, date)
  if (ne) return ne
  const p = exitPreview(db, a, date)
  if (p.blocking) return fail(`Assets:PostDepreciationFirst — رحّل دورة ${p.blocking.date.slice(0, 7)} أولاً`)
  const ac = acctsOf(db, a.classId)
  const label = `${kind === 'sale' ? 'بيع' : 'استبعاد'} ${a.code}`
  const journal: JournalLine[] = []
  if (p.toDate > 0) {
    journal.push(
      { account: acc(db, ac.expenseAcct), desc: `إهلاك حتى ${date} — ${a.code}`, debit: p.toDate, credit: 0, costCenter: ccName(db, ccAsOf(db, a, date)) },
      { account: acc(db, ac.accumAcct), desc: `إهلاك حتى ${date} — ${a.code}`, debit: 0, credit: p.toDate },
    )
  }
  const gl = (kind === 'sale' ? price : 0) - p.nbv
  if (kind === 'sale') journal.push({ account: acc(db, CASH_ACCT), desc: label, debit: price, credit: 0 })
  if (p.accum) journal.push({ account: acc(db, ac.accumAcct || ac.assetAcct), desc: label, debit: p.accum, credit: 0 })
  if (gl < 0) journal.push({ account: acc(db, ac.lossAcct), desc: `خسارة ${label}`, debit: -gl, credit: 0 })
  journal.push({ account: acc(db, ac.assetAcct), desc: label, debit: 0, credit: p.gross })
  if (gl > 0) journal.push({ account: acc(db, ac.gainAcct), desc: `ربح ${label}`, debit: 0, credit: gl })

  const fromState = a.state as AssetState
  const tx = addTx(db, a, kind, date, {
    amount: kind === 'sale' ? price : 0, fromValue: p.gross, toValue: 0, accumulatedAtEvent: p.accum, toDateAmount: p.toDate, fromState, toState: kind === 'sale' ? 'sold' : 'disposed',
    party: buyer || undefined, journal,
    notes: notes || (p.toDate ? `يشمل إهلاكاً حتى التاريخ ${fmt(p.toDate)} (${Math.round(p.g * 100)}% من قسط الفترة)` : ''),
  })
  if (p.toDate > 0) {
    db.lines.push({
      id: `td-${tx.id}`, assetId: a.id, areaId: DEFAULT_AREA, seq: 0, date, type: 'toDate', days: null, fraction: 0, amount: p.toDate,
      accum: p.accum, remaining: p.gross - a.salvage - p.accum, isPosted: true, runId: null, txId: tx.id,
    })
  }
  db.lines = db.lines.filter((l) => l.assetId !== a.id || l.isPosted) // cancel the remaining unposted lines
  renumber(db, a.id)
  a.state = kind === 'sale' ? 'sold' : 'disposed'
  return null
}
export const sell = (db: DB, id: string, date: string, price: number, buyer: string, notes: string) => exitAsset(db, id, 'sale', date, price, buyer, notes)
export const dispose = (db: DB, id: string, date: string, notes: string) => exitAsset(db, id, 'disposal', date, 0, '', notes)

/** §4.1 ReverseSale / ReverseDisposal → FromState; reversal dated at the original event; schedule regenerated. */
export function reverseExit(db: DB, txId: string): string | null {
  const t = db.txs.find((x) => x.id === txId)!
  if (t.isReversed) return fail('الحركة معكوسة أصلاً')
  if (t.type !== 'sale' && t.type !== 'disposal') return fail('هذه الحركة لا تُعكس من هنا')
  const a = get(db, t.assetId)
  t.isReversed = true
  db.lines = db.lines.filter((l) => l.txId !== t.id) // the ToDate pair is reversed with the sale
  a.state = t.fromState ?? 'running'
  addTx(db, a, t.type === 'sale' ? 'saleReversal' : 'disposalReversal', t.date, {
    amount: -t.amount, fromValue: 0, toValue: t.fromValue, fromState: t.toState, toState: a.state, reversedTxId: t.id,
    journal: reversalOf(t.journal), notes: `عكس ${t.number} — مؤرَّخ بتاريخ ${t.type === 'sale' ? 'البيع' : 'الاستبعاد'} الأصلي`,
  })
  if (a.state !== 'closed') generateSchedule(db, a, cls(db, a))
  renumber(db, a.id)
  return null
}

/** §4.1 rule 2 */
export function canDelete(db: DB, a: Asset) {
  if (a.state !== 'draft') return 'لا يمكن حذف أصل بعد رسملته'
  if (a.isLegacy) return 'لا يمكن حذف أصل مستورد كرصيد افتتاحي'
  if (postedLines(db, a.id).length) return 'Assets:CannotDeletePostedAsset'
  if (db.txs.some((t) => t.assetId === a.id)) return 'للأصل حركات مسجّلة — استخدم «إلغاء» بدلاً من الحذف'
  return null
}

// ---- Depreciation runs (§3.8.1, §5.4) -------------------------------------------------------

const overlaps = (x: { classId: string }, y: { classId: string }) => !x.classId || !y.classId || x.classId === y.classId
const scopeName = (db: DB, classId: string) => (classId ? db.classes.find((c) => c.id === classId)?.name : 'كل الفئات')

/** Rule 1: no two non-reversed runs on the same period with overlapping scopes (max one Draft). */
export function overlapError(db: DB, periodEnd: string, classId: string, selfId?: string) {
  const r = db.runs.find((x) => x.id !== selfId && x.status !== 'reversed' && x.periodEnd === periodEnd && overlaps(x, { classId }))
  return r ? `يوجد ${r.status === 'draft' ? 'مسودة دورة' : 'دورة مُرحّلة'} لنفس الفترة بنطاق متداخل: ${r.number} (${scopeName(db, r.classId)})` : null
}

/** Rule 2: no gaps — an older due line in scope must be posted first. */
export function gapError(db: DB, periodEnd: string, classId: string) {
  const s = `${periodEnd}-01`
  const scope = new Set(runInScope(db, classId).map((a) => a.id))
  const old = db.lines.filter((l) => !l.isPosted && l.type === 'depreciation' && l.date < s && scope.has(l.assetId)).sort((x, y) => x.date.localeCompare(y.date))[0]
  return old ? `لا فجوات: يوجد قسط مستحق غير مُرحّل في ${old.date.slice(0, 7)} — رحّل الأشهر الأقدم أولاً` : null
}

export function createRun(db: DB, periodEnd: string, classId: string, notes = ''): DepRun | string {
  const e = overlapError(db, periodEnd, classId) ?? gapError(db, periodEnd, classId)
  if (e) return e
  const lines = simulateRun(db, periodEnd, classId)
  if (!lines.length) return 'لا توجد أقساط مستحقة لهذه الفترة والنطاق'
  const run: DepRun = {
    id: `run${db.runs.length + 1}-${Math.random().toString(36).slice(2, 6)}`,
    number: nextNo('DPR', db.runs.map((r) => r.number), periodEnd.slice(0, 4)),
    periodStart: `${periodEnd}-01`, periodEnd, areaId: DEFAULT_AREA, classId, status: 'draft', lines, createdAt: TODAY,
    postedAt: null, reversedAt: null, notes,
  }
  db.runs.push(run)
  return run
}

export function postRun(db: DB, runId: string, date: string): string | null {
  const r = db.runs.find((x) => x.id === runId)!
  if (r.status !== 'draft') return 'الدورة ليست مسودة'
  const e = overlapError(db, r.periodEnd, r.classId, r.id) ?? gapError(db, r.periodEnd, r.classId)
  if (e) return e
  // Re-check IsPosted on every line (concurrency guard) and take cost centers as of LineDate (§5.4 1a).
  r.lines = simulateRun(db, r.periodEnd, r.classId)
  if (!r.lines.length) return 'لا توجد أقساط مستحقة للترحيل'
  r.lines.forEach((rl) => {
    const l = db.lines.find((x) => x.id === rl.lineId)!
    l.isPosted = true
    l.runId = r.id
  })
  r.status = 'posted'
  r.postedAt = date
  new Set(r.lines.map((l) => l.assetId)).forEach((aid) => {
    const a = get(db, aid)
    if (!db.lines.some((l) => l.assetId === aid && !l.isPosted)) {
      a.state = 'closed'
      addTx(db, a, 'adjustment', monthEnd(r.periodEnd), { fromState: 'running', toState: 'closed', notes: `اكتمل إهلاك الأصل بالدورة ${r.number}` })
    }
  })
  return null
}

const DEPENDENT: TxType[] = ['revaluation', 'impairment', 'addition', 'acquisitionReduction', 'manualDepreciation', 'sale', 'disposal']

export function reverseRun(db: DB, runId: string): string | null {
  const r = db.runs.find((x) => x.id === runId)!
  if (r.status !== 'posted') return 'يمكن عكس الدورات المُرحّلة فقط'
  // Rule 3 — LIFO
  const later = db.runs.find((x) => x.status === 'posted' && x.periodEnd > r.periodEnd && overlaps(x, r))
  if (later) return `Assets:ReverseLaterRunsFirst — يجب عكس الدورة ${later.number} (${later.periodEnd}) أولاً`
  // Rule 4 — no reversal under later dependent events
  const end = monthEnd(r.periodEnd)
  const ids = new Set(r.lines.map((l) => l.assetId))
  const dep = db.txs.find((t) => ids.has(t.assetId) && !t.isReversed && !t.reversedTxId && t.date > end &&
    (DEPENDENT.includes(t.type) || (t.type === 'adjustment' && t.changesLife)))
  if (dep) return `لا عكس تحت أحداث تابعة: ${dep.number} على ${db.assets.find((a) => a.id === dep.assetId)?.code} بتاريخ ${dep.date} — اعكسها أولاً`
  r.lines.forEach((rl) => {
    const l = db.lines.find((x) => x.id === rl.lineId)
    if (l) { l.isPosted = false; l.runId = null }
    const a = get(db, rl.assetId)
    if (a.state === 'closed') a.state = 'running'
  })
  r.status = 'reversed'
  r.reversedAt = end // the reversing entry is dated at the original PeriodEnd (§5.4)
  return null
}

export const reversalOf = (j: JournalLine[]) => j.map((l) => ({ ...l, desc: `عكس: ${l.desc}`, debit: l.credit, credit: l.debit }))

// ---- Purchase-bill line with quantity N (§5.6.6) --------------------------------------------

export function draftsFromBillLine(db: DB, base: Asset, billRef: string, lineRef: string, qty: number, lineTotal: number): string | null {
  if (!billRef.trim() || !lineRef.trim()) return 'رقم الفاتورة والسطر مطلوبان'
  if (!Number.isInteger(qty) || qty < 1) return 'الكمية يجب أن تكون عدداً صحيحاً موجباً — تُرفض الكميات الكسرية'
  if (lineTotal <= 0) return 'صافي السطر مطلوب'
  if (db.assets.some((a) => a.sourceDocRef === billRef && a.sourceDocLine === lineRef)) return `السطر ${lineRef} من الفاتورة ${billRef} أنشأ أصولاً من قبل — لا يُعاد الإنشاء (idempotent)`
  const each = Math.round(lineTotal / qty)
  for (let i = 1; i <= qty; i++) {
    const cost = i === qty ? lineTotal - each * (qty - 1) : each
    db.assets.push({
      ...base, id: `a${db.assets.length + 1}-${Math.random().toString(36).slice(2, 5)}`, code: nextAssetCode(db),
      name: `${base.name} (${i}/${qty})`, originalValue: cost, sourceDocRef: billRef, sourceDocLine: lineRef, sourceLineSeq: i, state: 'draft',
    })
  }
  return null
}

// ---- Maintenance (plan §9 phase 5 — rules below are mock assumptions) -----------------------

export function maintJournal(db: DB, m: Maintenance): JournalLine[] {
  if (!m.cost) return []
  const a = db.assets.find((x) => x.id === m.assetId)
  if (m.capitalize && a) {
    const d = `إضافة لاحقة ${a.code} — ${m.number}`
    return [
      { account: acc(db, acctsOf(db, a.classId).assetAcct), desc: d, debit: m.cost, credit: 0 },
      { account: acc(db, SUPPLIER_ACCT), desc: d, debit: 0, credit: m.cost },
    ]
  }
  const d = `صيانة ${a?.code ?? ''} — ${m.number}`
  return [
    { account: acc(db, MAINT_EXPENSE_ACCT), desc: d, debit: m.cost, credit: 0, costCenter: a ? ccName(db, ccAsOf(db, a, m.doneDate ?? TODAY)) : undefined },
    { account: acc(db, SUPPLIER_ACCT), desc: d, debit: 0, credit: m.cost },
  ]
}

export function maintValidate(db: DB, m: Maintenance): string | null {
  if (!m.assetId) return 'يجب تحديد الأصل'
  const a = db.assets.find((x) => x.id === m.assetId)
  if (!a || !['running', 'paused', 'closed'].includes(a.state)) return 'الصيانة متاحة للأصول المُرسملة غير المستبعدة فقط'
  if (!m.plannedDate) return 'تاريخ الصيانة المخطط مطلوب'
  if (!m.partnerId) return 'الجهة المنفذة مطلوبة'
  if (m.cost < 0) return 'التكلفة غير صحيحة'
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

/** Completes an order. A capitalized order is posted as an AddCost (240) on the asset (§5.6.2). */
export function completeMaint(db: DB, id: string, doneDate: string, cost: number): string | null {
  const m = db.maintenance.find((x) => x.id === id)!
  if (m.status !== 'planned' && m.status !== 'inProgress') return 'أمر الصيانة مغلق'
  if (cost <= 0) return 'أدخل التكلفة الفعلية'
  if (m.capitalize && cost < db.settings.capThreshold) return `لا يمكن رسملة مبلغ أقل من حد الرسملة ${fmt(db.settings.capThreshold)} — حمّله كمصروف`
  m.cost = cost
  m.status = 'done'
  m.doneDate = doneDate
  if (m.capitalize) {
    const err = addCost(db, m.assetId, doneDate, cost, '', null, `رسملة تكلفة الصيانة ${m.number}`)
    if (err) return err
    m.addCostTxId = db.txs[db.txs.length - 1].id
    m.journal = []
  } else {
    m.journal = maintJournal(db, m)
  }
  if (m.intervalMonths > 0) {
    db.maintenance.push({
      ...m, id: `m${Date.now().toString(36)}`, number: nextNo('MNT', db.maintenance.map((x) => x.number)),
      plannedDate: addMonths(doneDate, m.intervalMonths), doneDate: null, status: 'planned', journal: [], capitalize: false, addCostTxId: null,
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

export { monthEnd }
