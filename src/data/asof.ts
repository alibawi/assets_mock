// One definition of "as of a date" shared by the register, ledger reconciliation, asset ledger
// and roll-forward — plan §7.1–§7.3. Reversed items count as if they never happened.
import { acctsOf, monthEnd, prevDay, runJournal } from './calc'
import type { Asset, AssetTx, DB, TxType } from './types'

const VALUE_TX: TxType[] = ['capitalization', 'openingBalance', 'addition', 'acquisitionReduction', 'revaluation', 'impairment']
const live = (t: AssetTx) => !t.isReversed && !t.reversedTxId

const txsOf = (db: DB, a: Asset) =>
  db.txs.filter((t) => t.assetId === a.id).map((t, i) => ({ t, i })).sort((x, y) => x.t.date.localeCompare(y.t.date) || x.i - y.i).map((x) => x.t)

/** Legacy assets are excluded before their import cut-off (§7.1). */
export const beforeCutoff = (a: Asset, d: string) => a.isLegacy && !!a.importCutoffDate && d < a.importCutoffDate

export function inRegister(db: DB, a: Asset, d: string) {
  if (a.state === 'draft' || a.state === 'cancelled' || !a.capitalizationDate || a.capitalizationDate > d) return false
  if (beforeCutoff(a, d)) return false
  return !db.txs.some((t) => t.assetId === a.id && live(t) && (t.type === 'sale' || t.type === 'disposal') && t.date <= d)
}

/** §7.1 original value = ToValue of the last live value-changing transaction on or before d. */
export function costAsOf(db: DB, a: Asset, d: string) {
  const v = txsOf(db, a).filter((t) => live(t) && VALUE_TX.includes(t.type) && t.date <= d)
  return v.length ? v[v.length - 1].toValue ?? 0 : 0
}
export function accumAsOf(db: DB, a: Asset, d: string) {
  const imported = a.isLegacy && a.importCutoffDate && d >= a.importCutoffDate ? a.importedAccum : 0
  return imported + db.lines.filter((l) => l.assetId === a.id && l.isPosted && l.date <= d).reduce((s, l) => s + l.amount, 0)
}
export const pendingAsOf = (db: DB, a: Asset, d: string) =>
  db.lines.filter((l) => l.assetId === a.id && !l.isPosted && l.date <= d).reduce((s, l) => s + l.amount, 0)

function fieldAsOf(db: DB, a: Asset, d: string, type: TxType, from: keyof AssetTx, to: keyof AssetTx, current: string) {
  const moves = txsOf(db, a).filter((t) => t.type === type && live(t))
  const before = moves.filter((t) => t.date <= d)
  if (before.length) return before[before.length - 1][to] as string
  if (moves.length) return moves[0][from] as string
  return current
}
export const locAsOf = (db: DB, a: Asset, d: string) => fieldAsOf(db, a, d, 'transfer', 'fromLocationId', 'toLocationId', a.locationId)
export const custAsOf = (db: DB, a: Asset, d: string) => fieldAsOf(db, a, d, 'transfer', 'fromCustodianId', 'toCustodianId', a.custodianId)
export const ccOfAsOf = (db: DB, a: Asset, d: string) => fieldAsOf(db, a, d, 'costCenterTransfer', 'fromCostCenterId', 'toCostCenterId', a.costCenterId)

export interface RegisterRow { a: Asset; cost: number; accum: number; nbv: number; pending: number; salvage: number; locationId: string; custodianId: string; costCenterId: string }

export function registerAsOf(db: DB, d: string) {
  const rows: RegisterRow[] = db.assets.filter((a) => inRegister(db, a, d)).map((a) => {
    const cost = costAsOf(db, a, d)
    const accum = accumAsOf(db, a, d)
    return { a, cost, accum, nbv: cost - accum, pending: pendingAsOf(db, a, d), salvage: a.salvage, locationId: locAsOf(db, a, d), custodianId: custAsOf(db, a, d), costCenterId: ccOfAsOf(db, a, d) }
  })
  const excludedLegacy = db.assets.filter((a) => a.state !== 'draft' && a.state !== 'cancelled' && beforeCutoff(a, d)).length
  return { rows, excludedLegacy }
}

// ---- GL side (§7.1 reconciliation) ----------------------------------------------------------

const codeOf = (account: string) => account.split(' — ')[0]

/** Ledger balances (debit − credit) by account code for entries dated on or before d. */
export function glBalancesAsOf(db: DB, d: string) {
  const gl = new Map<string, number>()
  const add = (code: string, v: number) => gl.set(code, (gl.get(code) ?? 0) + v)
  // Module entries and the matching entries of other modules (purchase bills, opening balances).
  // A purchase bill stays posted even after UndoCapitalization, so external lines are always counted.
  db.txs.filter((t) => t.date <= d).forEach((t) => {
    t.journal.forEach((j) => add(codeOf(j.account), j.debit - j.credit))
    t.externalJournal.forEach((j) => add(codeOf(j.account), j.debit - j.credit))
  })
  // Runs: the reversing entry is dated at the original PeriodEnd, so a reversed run nets to zero at any date.
  db.runs.filter((r) => r.status === 'posted' && monthEnd(r.periodEnd) <= d).forEach((r) => {
    runJournal(db, r).forEach((j) => add(codeOf(j.account), j.debit - j.credit))
  })
  db.invoices.filter((i) => i.status === 'posted' && i.postingDate <= d).forEach((i) => i.journal.forEach((j) => add(codeOf(j.account), j.debit - j.credit)))
  db.maintenance.filter((m) => m.status === 'done' && (m.doneDate ?? '') <= d).forEach((m) => m.journal.forEach((j) => add(codeOf(j.account), j.debit - j.credit)))
  return gl
}

export function reconciliationAsOf(db: DB, d: string) {
  const gl = glBalancesAsOf(db, d)
  const { rows } = registerAsOf(db, d)
  const assetCodes = [...new Set(db.classes.map((c) => acctsOf(db, c.id).assetAcct).filter(Boolean))]
  const accumCodes = [...new Set(db.classes.map((c) => acctsOf(db, c.id).accumAcct).filter(Boolean))]
  const out: { code: string; kind: string; gl: number; mod: number }[] = []
  assetCodes.forEach((code) => out.push({ code, kind: 'القيمة الأصلية', gl: gl.get(code) ?? 0, mod: rows.filter((r) => acctsOf(db, r.a.classId).assetAcct === code).reduce((s, r) => s + r.cost, 0) }))
  ;[...new Set(db.classes.map((c) => acctsOf(db, c.id).saleClearingAcct).filter(Boolean))].forEach((code) => out.push({ code, kind: 'تسوية بيع الأصول (يجب أن يُصفَّر)', gl: gl.get(code) ?? 0, mod: 0 }))
  accumCodes.forEach((code) => out.push({ code, kind: 'مجمّع الاندثار', gl: -(gl.get(code) ?? 0), mod: rows.filter((r) => acctsOf(db, r.a.classId).accumAcct === code).reduce((s, r) => s + r.accum, 0) }))
  return out
}

// ---- §7.2 Asset ledger ----------------------------------------------------------------------

export interface LedgerRow { date: string; event: string; doc: string; je: boolean; cost: number; dep: number; runCost: number; runAccum: number; runNbv: number; reversed: boolean; notes: string; txId?: string; runId?: string }

export function assetLedger(db: DB, a: Asset, from: string, to: string, label: (t: AssetTx) => string): { opening: { cost: number; accum: number }; rows: LedgerRow[] } {
  const start = prevDay(from)
  const inBooks = inRegister(db, a, start)
  const opening = { cost: inBooks ? costAsOf(db, a, start) : 0, accum: inBooks ? accumAsOf(db, a, start) : 0 }
  type Ev = { date: string; order: number; row: Omit<LedgerRow, 'runCost' | 'runAccum' | 'runNbv'> }
  const evs: Ev[] = []
  txsOf(db, a).forEach((t, i) => {
    if (t.date < from || t.date > to) return
    let cost = 0
    let dep = 0
    if (VALUE_TX.includes(t.type)) cost = (t.toValue ?? 0) - (t.fromValue ?? 0)
    if (t.type === 'openingBalance') { cost = t.toValue ?? 0; dep = a.importedAccum }
    if (t.type === 'manualDepreciation') dep = t.amount
    if (t.type === 'sale' || t.type === 'disposal') {
      // §7.2 — the ToDate line is its own row, just before the exit.
      if (t.toDateAmount) evs.push({ date: t.date, order: i * 2, row: { date: t.date, event: 'إهلاك حتى تاريخ الإخراج', doc: t.number, je: true, cost: 0, dep: t.toDateAmount, reversed: t.isReversed, notes: '', txId: t.id } })
      cost = -(t.fromValue ?? 0)
      dep = -(t.accumulatedAtEvent ?? 0)
    }
    if (t.type === 'capitalizationReversal' || t.type === 'saleReversal' || t.type === 'disposalReversal') {
      const o = db.txs.find((x) => x.id === t.reversedTxId)
      if (o) {
        if (t.type === 'capitalizationReversal') cost = -((o.toValue ?? 0) - (o.fromValue ?? 0))
        else {
          cost = o.fromValue ?? 0
          dep = (o.accumulatedAtEvent ?? 0) - (o.toDateAmount ?? 0) // the ToDate pair is reversed with the exit
        }
      }
    }
    const transferNote = t.type === 'transfer' || t.type === 'costCenterTransfer'
    evs.push({ date: t.date, order: i * 2 + 1, row: {
      date: t.date, event: label(t), doc: t.number, je: t.journal.length > 0, cost, dep, reversed: t.isReversed || !!t.reversedTxId, notes: transferNote ? t.notes : '', txId: t.id,
    } })
  })
  // One row per posted run (not per line).
  db.runs.filter((r) => r.status === 'posted').forEach((r) => {
    const amt = r.lines.filter((l) => l.assetId === a.id).reduce((s, l) => s + l.amount, 0)
    const d = db.lines.find((l) => l.runId === r.id && l.assetId === a.id)?.date
    if (!amt || !d || d < from || d > to) return
    evs.push({ date: d, order: 0, row: { date: d, event: 'دورة إهلاك', doc: r.number, je: true, cost: 0, dep: amt, reversed: false, notes: '', runId: r.id } })
  })
  evs.sort((x, y) => x.date.localeCompare(y.date) || x.order - y.order)
  let c = opening.cost
  let ac = opening.accum
  const rows = evs.map((e) => {
    c += e.row.cost
    ac += e.row.dep
    return { ...e.row, runCost: c, runAccum: ac, runNbv: c - ac }
  })
  return { opening, rows }
}

// ---- §7.3 Roll-forward ----------------------------------------------------------------------

export interface RollRow {
  key: string; label: string
  costOpen: number; additions: number; reductions: number; reval: number; opening: number; exits: number; costClose: number; costUnexplained: number
  accOpen: number; dep: number; accImported: number; accExits: number; accClose: number; accUnexplained: number
}

export function rollForward(db: DB, from: string, to: string, groupOf: (a: Asset) => { key: string; label: string }) {
  const start = prevDay(from)
  const rows = new Map<string, RollRow>()
  const row = (a: Asset) => {
    const g = groupOf(a)
    if (!rows.has(g.key)) rows.set(g.key, { key: g.key, label: g.label, costOpen: 0, additions: 0, reductions: 0, reval: 0, opening: 0, exits: 0, costClose: 0, costUnexplained: 0, accOpen: 0, dep: 0, accImported: 0, accExits: 0, accClose: 0, accUnexplained: 0 })
    return rows.get(g.key)!
  }
  db.assets.forEach((a) => {
    if (a.state === 'draft' || a.state === 'cancelled') return
    const r = row(a)
    if (inRegister(db, a, start)) { r.costOpen += costAsOf(db, a, start); r.accOpen += accumAsOf(db, a, start) }
    if (inRegister(db, a, to)) { r.costClose += costAsOf(db, a, to); r.accClose += accumAsOf(db, a, to) }
    db.txs.filter((t) => t.assetId === a.id && live(t) && t.date >= from && t.date <= to).forEach((t) => {
      const delta = (t.toValue ?? 0) - (t.fromValue ?? 0)
      if (t.type === 'capitalization' || t.type === 'addition') r.additions += delta
      if (t.type === 'acquisitionReduction') r.reductions += delta
      if (t.type === 'revaluation' || t.type === 'impairment') r.reval += delta
      if (t.type === 'openingBalance') { r.opening += t.toValue ?? 0; r.accImported += a.importedAccum }
      if (t.type === 'sale' || t.type === 'disposal') { r.exits -= t.fromValue ?? 0; r.accExits -= t.accumulatedAtEvent ?? 0 }
    })
    r.dep += db.lines.filter((l) => l.assetId === a.id && l.isPosted && l.date >= from && l.date <= to).reduce((s, l) => s + l.amount, 0)
  })
  const list = [...rows.values()].filter((r) => r.costOpen || r.costClose || r.additions || r.exits || r.opening)
  list.forEach((r) => {
    r.costUnexplained = r.costClose - (r.costOpen + r.additions + r.reductions + r.reval + r.opening + r.exits)
    r.accUnexplained = r.accClose - (r.accOpen + r.dep + r.accImported + r.accExits)
  })
  return list
}
