// Depreciation engine — plan §5.1 (DepreciationScheduleGenerator) and §5.4 (runs).
import type { Asset, AssetClass, DB, DepLine, DepRun, JournalLine, Periodicity } from './types'

export const MPP: Record<Periodicity, number> = { M: 1, Q: 3, Y: 12 }

const pad = (n: number) => String(n).padStart(2, '0')
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate() // m is 1-based
export const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return `${y}-${pad(m)}-${pad(lastDay(y, m))}`
}
const ymd = (d: string) => d.split('-').map(Number) as [number, number, number]

/** End date of the period (month / calendar quarter / calendar year) containing `date`. */
export function periodEndOf(date: string, p: Periodicity) {
  const [y, m] = ymd(date)
  const em = p === 'M' ? m : p === 'Q' ? Math.ceil(m / 3) * 3 : 12
  return `${y}-${pad(em)}-${pad(lastDay(y, em))}`
}
/** First day after `periodEnd` — start of the next period. */
export function nextDay(date: string) {
  const d = new Date(date + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5)

export const postedLines = (db: DB, assetId: string) =>
  db.lines.filter((l) => l.assetId === assetId && l.isPosted).sort((a, b) => a.seq - b.seq)
export const scheduleOf = (db: DB, assetId: string) =>
  db.lines.filter((l) => l.assetId === assetId).sort((a, b) => a.seq - b.seq)

export const postedSum = (db: DB, assetId: string, asOf?: string) =>
  postedLines(db, assetId).filter((l) => !asOf || l.date <= asOf).reduce((s, l) => s + l.amount, 0)

/** Accumulated depreciation booked = imported (legacy) + Σ posted lines. */
export const accumOf = (db: DB, a: Asset, asOf?: string) => a.importedAccum + postedSum(db, a.id, asOf)
export const grossOf = (a: Asset) => a.originalValue + a.revaluationAdj
/** §1: book value = original − Σ posted − imported ± revaluation. Never stored. */
export const bookValue = (db: DB, a: Asset, asOf?: string) => grossOf(a) - accumOf(db, a, asOf)
export const depBase = (a: Asset) => a.originalValue - a.salvage

let seqId = 0
const lid = () => `ln${Date.now().toString(36)}${(seqId++).toString(36)}`

/**
 * §5.1 GenerateAsync: drops unposted lines and regenerates from the current remaining value.
 * Posted lines are never touched. `from` = resume date (§4 rule 4).
 */
export function generateSchedule(db: DB, a: Asset, cls: AssetClass, from?: string): DepLine[] {
  db.lines = db.lines.filter((l) => l.assetId !== a.id || l.isPosted)
  const posted = postedLines(db, a.id)
  const pSum = posted.reduce((s, l) => s + l.amount, 0)
  const mpp = MPP[a.periodicity]
  const total = Math.max(1, Math.round(a.lifeMonths / mpp))
  let remaining = depBase(a) + a.revaluationAdj - a.importedAccum - pSum
  const periodsLeft = total - posted.length
  if (!cls.isDepreciable || a.method === 'NONE' || remaining <= 0 || periodsLeft <= 0) return []

  let start = posted.length ? nextDay(posted[posted.length - 1].date) : a.depStartDate
  if (from && from > start) start = from

  // Partial first period (prorata) only on a fresh, non-legacy schedule.
  let fraction = 1
  let firstDays: number | null = null
  const firstEnd = periodEndOf(start, a.periodicity)
  if (!posted.length && !a.isLegacy && a.prorata !== 'NONE') {
    const [y, m] = ymd(firstEnd)
    const periodStart = `${y}-${pad(m - mpp + 1)}-01`
    if (a.prorata === 'DAYS') {
      firstDays = daysBetween(start, firstEnd) + 1
      fraction = firstDays / (daysBetween(periodStart, firstEnd) + 1)
    } else {
      fraction = (m - ymd(start)[1] + 1) / mpp
    }
  }

  const factor = a.decliningFactor ?? 2
  const sl = remaining / periodsLeft
  const out: DepLine[] = []
  let accum = a.importedAccum + pSum
  let end = firstEnd
  for (let i = 0; i < periodsLeft; i++) {
    const left = periodsLeft - i
    let amt =
      a.method === 'SL' ? sl
      : a.method === 'DB' ? remaining * (factor / total)
      : Math.max(remaining * (factor / total), remaining / left)
    if (i === 0) amt *= fraction
    amt = Math.round(amt)
    if (i === periodsLeft - 1) amt = remaining // rounding difference goes to the last line
    amt = Math.min(amt, remaining)
    remaining -= amt
    accum += amt
    out.push({
      id: lid(), assetId: a.id, seq: posted.length + i + 1, date: end, type: 'depreciation',
      days: i === 0 ? firstDays : null, amount: amt, accum, remaining, isPosted: false, runId: null,
    })
    end = periodEndOf(nextDay(end), a.periodicity)
  }
  db.lines.push(...out)
  return out
}

/** §5.4 step 1: unposted lines due by period end for running assets (simulation). */
export function simulateRun(db: DB, periodEnd: string, classId: string) {
  const end = monthEnd(periodEnd)
  const running = new Map(db.assets.filter((a) => a.state === 'running' && (!classId || a.classId === classId)).map((a) => [a.id, a]))
  return db.lines
    .filter((l) => !l.isPosted && l.date <= end && running.has(l.assetId))
    .sort((x, y) => x.assetId.localeCompare(y.assetId) || x.seq - y.seq)
    .map((l) => {
      const a = running.get(l.assetId)!
      const c = db.classes.find((x) => x.id === a.classId)!
      return { assetId: a.id, lineId: l.id, amount: l.amount, expenseAcct: c.expenseAcct, accumAcct: c.accumAcct, costCenterId: a.costCenterId }
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
