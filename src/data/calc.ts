// Depreciation engine — plan §5.1 / §5.1.1 (DepreciationScheduleGenerator) and run helpers §5.4.
import type { Asset, AssetClass, ClassAccounts, DB, DepLine, DepRun, JournalLine, Periodicity } from './types'

export const MPP: Record<Periodicity, number> = { M: 1, Q: 3, Y: 12 }
export const DEFAULT_AREA = 'a01'

const pad = (n: number) => String(n).padStart(2, '0')
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate() // m is 1-based
const ymd = (d: string) => d.split('-').map(Number) as [number, number, number]
export const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return `${y}-${pad(m)}-${pad(lastDay(y, m))}`
}
export const monthStart = (ym: string) => `${ym.slice(0, 7)}-01`
export const nextDay = (date: string) => {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
export const prevDay = (date: string) => {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}
/** Inclusive day count. */
export const daysIncl = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1
/** Inclusive month count from the month of `from` to the month of `to`. */
export const monthsIncl = (from: string, to: string) => {
  const [y1, m1] = ymd(from)
  const [y2, m2] = ymd(to)
  return (y2 - y1) * 12 + (m2 - m1) + 1
}

/**
 * §5.1.1 — end of the period containing `date`. Quarters and years follow the fiscal calendar that
 * starts in month `fs` (1 = January, which makes them calendar quarters/years).
 */
export function periodEndOf(date: string, p: Periodicity, fs = 1) {
  const [y, m] = ymd(date)
  const fm = ((m - fs + 12) % 12) + 1 // fiscal month 1..12
  const endFm = p === 'M' ? fm : p === 'Q' ? Math.ceil(fm / 3) * 3 : 12
  const em = ((fs - 1 + endFm - 1) % 12) + 1
  const ey = em < m ? y + 1 : y
  return `${ey}-${pad(em)}-${pad(lastDay(ey, em))}`
}
export function periodStartOf(periodEnd: string, p: Periodicity) {
  const [y, m] = ymd(periodEnd)
  let sm = m - MPP[p] + 1
  let sy = y
  if (sm < 1) { sm += 12; sy -= 1 }
  return `${sy}-${pad(sm)}-01`
}

/** §5.1.1 — the life must be a whole number of periods. */
export const lifeError = (lifeMonths: number, p: Periodicity) =>
  lifeMonths % MPP[p] !== 0 ? `العمر (${lifeMonths} شهراً) يجب أن يكون من مضاعفات ${MPP[p]} أشهر للدورية المختارة` : null

/** §3.1.1 — account codes for (class × area). */
export function acctsOf(db: DB, classId: string, areaId = DEFAULT_AREA): ClassAccounts {
  const r = db.classAreaAccounts.find((x) => x.classId === classId && x.areaId === areaId)
  return r ?? { assetAcct: '', accumAcct: '', expenseAcct: '', gainAcct: '', lossAcct: '', revalSurplusAcct: '' }
}

export const linesOf = (db: DB, assetId: string) =>
  db.lines.filter((l) => l.assetId === assetId).sort((a, b) => a.date.localeCompare(b.date) || a.seq - b.seq)
export const postedLines = (db: DB, assetId: string) => linesOf(db, assetId).filter((l) => l.isPosted)
export const postedSum = (db: DB, assetId: string, asOf?: string) =>
  postedLines(db, assetId).filter((l) => !asOf || l.date <= asOf).reduce((s, l) => s + l.amount, 0)

/** Accumulated depreciation booked = imported (legacy) + Σ posted lines. */
export const accumOf = (db: DB, a: Asset) => a.importedAccum + postedSum(db, a.id)
export const grossOf = (a: Asset) => a.originalValue + a.revaluationAdj
/** §1: book value = original − Σ posted − imported ± revaluation. Never stored. Salvage is not deducted. */
export const bookValue = (db: DB, a: Asset) => grossOf(a) - accumOf(db, a)
export const depBase = (a: Asset) => a.originalValue - a.salvage
/** Remaining depreciable amount = gross − salvage − accumulated. */
export const remainingDepreciable = (db: DB, a: Asset) => grossOf(a) - a.salvage - accumOf(db, a)

let seqId = 0
const lid = () => `ln${Date.now().toString(36)}${(seqId++).toString(36)}`

export interface GenOpts { from?: string; noProrata?: boolean }

/**
 * §5.1 GenerateAsync: drops unposted lines and regenerates from the current remaining value.
 * Posted lines (Depreciation, Manual, ToDate) are never touched (§3.6).
 */
export function generateSchedule(db: DB, a: Asset, cls: AssetClass, opts: GenOpts = {}): DepLine[] {
  db.lines = db.lines.filter((l) => l.assetId !== a.id || l.isPosted)
  const posted = postedLines(db, a.id)
  const postedPeriods = posted.filter((l) => l.type === 'depreciation')
  const fs = db.settings.fiscalStartMonth
  const mpp = MPP[a.periodicity]
  let remaining = grossOf(a) - a.salvage - a.importedAccum - posted.reduce((s, l) => s + l.amount, 0)
  if (cls.kind === 'land' || !cls.isDepreciable || a.method === 'NONE' || remaining <= 0) return []

  const lastPeriodLine = postedPeriods[postedPeriods.length - 1]
  let start = lastPeriodLine ? nextDay(lastPeriodLine.date) : a.isLegacy && a.importCutoffDate ? nextDay(a.importCutoffDate) : a.depStartDate
  if (opts.from && opts.from > start) start = opts.from
  const mk = (date: string, amount: number, accum: number, rem: number, fraction: number | null, d: number | null): DepLine => ({
    id: lid(), assetId: a.id, areaId: DEFAULT_AREA, seq: 0, date, type: 'depreciation', days: d, fraction, amount, accum, remaining: rem,
    isPosted: false, runId: null, txId: null,
  })
  let accum = a.importedAccum + posted.reduce((s, l) => s + l.amount, 0)

  // §5.6.5 LowValue: one line with 100 % of the base at the end of the in-service period.
  if (cls.kind === 'lowValue') {
    if (postedPeriods.length) return []
    const l = mk(periodEndOf(start, a.periodicity, fs), remaining, accum + remaining, 0, 1, null)
    db.lines.push(l)
    renumber(db, a.id)
    return [l]
  }

  const N = Math.round((a.isLegacy ? a.remainingLifeAtImport ?? 0 : a.lifeMonths) / mpp)
  if (N <= 0) return []
  // §5.1.1 proration of the first period — skipped for legacy assets and after Resume (§4.1).
  let f = 1
  let firstDays: number | null = null
  const firstEnd = periodEndOf(start, a.periodicity, fs)
  if (!postedPeriods.length && !a.isLegacy && !opts.noProrata && a.prorata !== 'NONE') {
    const ps = periodStartOf(firstEnd, a.periodicity)
    if (a.prorata === 'DAYS') {
      firstDays = daysIncl(start, firstEnd)
      f = firstDays / daysIncl(ps, firstEnd)
    } else {
      f = monthsIncl(start, firstEnd) / mpp
    }
  }
  const firstPosted = postedPeriods[0]
  const hasPartial = firstPosted ? (firstPosted.fraction ?? 1) < 1 : f < 1
  const totalLines = N + (hasPartial ? 1 : 0) // N + 1 with a completion line when f < 1
  const periodsLeft = totalLines - postedPeriods.length
  if (periodsLeft <= 0) return []
  // Full-period equivalents still to depreciate — "remaining periods unchanged" (§5.6.2).
  let eq = N - postedPeriods.reduce((s, l) => s + (l.fraction ?? 1), 0)
  if (eq <= 0) eq = 1
  const factor = a.decliningFactor ?? 2
  const regular = remaining / eq
  let end = firstEnd
  const out: DepLine[] = []
  for (let i = 0; i < periodsLeft; i++) {
    const frac = i === 0 && !postedPeriods.length ? f : 1
    const last = i === periodsLeft - 1
    let amt =
      a.method === 'SL' ? regular * frac
      : a.method === 'DB' ? remaining * (factor / N) * frac
      : Math.max(remaining * (factor / N), remaining / Math.max(eq, 1)) * frac
    amt = Math.round(amt) // each line rounded once (IQD has no decimals) — §5.1.1
    if (last) amt = remaining // the last line absorbs every rounding difference
    amt = Math.min(amt, remaining)
    remaining -= amt
    accum += amt
    eq -= frac
    out.push(mk(end, amt, accum, remaining, last && hasPartial ? null : frac, i === 0 ? firstDays : null))
    end = periodEndOf(nextDay(end), a.periodicity, fs)
  }
  db.lines.push(...out)
  renumber(db, a.id)
  return out
}

/** Sequence numbers follow date order across posted and planned lines. */
export function renumber(db: DB, assetId: string) {
  linesOf(db, assetId).forEach((l, i) => { l.seq = i + 1 })
}

/** §5.5 — cost center as of a date, from the CostCenterTransfer history. */
export function ccAsOf(db: DB, a: Asset, date: string) {
  const moves = db.txs.filter((t) => t.assetId === a.id && t.type === 'costCenterTransfer' && !t.isReversed).sort((x, y) => x.date.localeCompare(y.date))
  const before = moves.filter((t) => t.date <= date)
  if (before.length) return before[before.length - 1].toCostCenterId!
  if (moves.length) return moves[0].fromCostCenterId!
  return a.costCenterId
}

/** Run scope — §3.8.1. */
export const runInScope = (db: DB, classId: string) =>
  db.assets.filter((a) => a.state === 'running' && (!classId || a.classId === classId))

/** §5.4 step 1: unposted lines dated inside the period, for running assets in scope (simulation). */
export function simulateRun(db: DB, periodEnd: string, classId: string) {
  const s = monthStart(periodEnd)
  const e = monthEnd(periodEnd)
  const scope = new Map(runInScope(db, classId).map((a) => [a.id, a]))
  return db.lines
    .filter((l) => !l.isPosted && l.type === 'depreciation' && l.date >= s && l.date <= e && scope.has(l.assetId))
    .sort((x, y) => x.assetId.localeCompare(y.assetId) || x.seq - y.seq)
    .map((l) => {
      const a = scope.get(l.assetId)!
      const ac = acctsOf(db, a.classId)
      return { assetId: a.id, lineId: l.id, amount: l.amount, expenseAcct: ac.expenseAcct, accumAcct: ac.accumAcct, costCenterId: ccAsOf(db, a, l.date) }
    })
}

/** §5.4 step 2: one entry per run — debit grouped by (expense acct, cost center), credit by accum acct. */
export function runJournal(db: DB, r: DepRun): JournalLine[] {
  const dr = new Map<string, number>()
  const cr = new Map<string, number>()
  r.lines.forEach((l) => {
    const k = `${l.expenseAcct}|${l.costCenterId}`
    dr.set(k, (dr.get(k) ?? 0) + l.amount)
    cr.set(l.accumAcct, (cr.get(l.accumAcct) ?? 0) + l.amount)
  })
  const acc = (code: string) => `${code} — ${db.accounts.find((a) => a.code === code)?.name ?? ''}`
  const cc = (id: string) => db.costCenters.find((c) => c.id === id)?.name ?? ''
  const out: JournalLine[] = []
  dr.forEach((v, k) => {
    const [code, ccId] = k.split('|')
    out.push({ account: acc(code), desc: `إهلاك ${r.periodEnd}`, debit: v, credit: 0, costCenter: cc(ccId) })
  })
  out.sort((x, y) => x.account.localeCompare(y.account) || (x.costCenter ?? '').localeCompare(y.costCenter ?? ''))
  ;[...cr.entries()].sort((x, y) => x[0].localeCompare(y[0])).forEach(([code, v]) => out.push({ account: acc(code), desc: `إهلاك ${r.periodEnd}`, debit: 0, credit: v }))
  return out
}

export const runTotal = (r: { lines: { amount: number }[] }) => r.lines.reduce((s, l) => s + l.amount, 0)
