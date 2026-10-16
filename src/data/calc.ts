import type { Asset, DB } from './types'

export const round = (n: number) => Math.round(n)

/** "YYYY-MM" index of months since year 0, for period arithmetic. */
export const monthIndex = (date: string) => {
  const [y, m] = date.slice(0, 7).split('-').map(Number)
  return y * 12 + (m - 1)
}
export const periodOf = (idx: number) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`

/** Depreciation for one month given the book value at the start of that month. */
export function monthlyDep(a: Pick<Asset, 'cost' | 'salvage' | 'lifeMonths' | 'method' | 'revaluation'>, nbv: number) {
  const base = a.cost + a.revaluation
  if (nbv <= a.salvage) return 0
  const amount =
    a.method === 'SL'
      ? (base - a.salvage) / a.lifeMonths
      : nbv * (2 / a.lifeMonths)
  return round(Math.min(amount, nbv - a.salvage))
}

export interface ScheduleRow { period: string; opening: number; dep: number; accum: number; closing: number }

/** Full theoretical schedule from in-service month across the useful life. */
export function schedule(a: Asset): ScheduleRow[] {
  const rows: ScheduleRow[] = []
  const start = monthIndex(a.inServiceDate)
  let nbv = a.cost
  let accum = 0
  for (let i = 0; i < a.lifeMonths; i++) {
    const dep = monthlyDep({ ...a, revaluation: 0 }, nbv)
    accum += dep
    rows.push({ period: periodOf(start + i), opening: nbv, dep, accum, closing: nbv - dep })
    nbv -= dep
    if (dep === 0) break
  }
  return rows
}

/** Accumulated depreciation that has actually been booked (opening + posted runs). */
export function bookedAccum(db: DB, assetId: string) {
  const a = db.assets.find((x) => x.id === assetId)
  if (!a) return 0
  const posted = db.depRuns
    .filter((r) => r.status === 'posted')
    .flatMap((r) => r.lines)
    .filter((l) => l.assetId === assetId)
    .reduce((s, l) => s + l.amount, 0)
  return a.openingAccum + posted
}

export const grossValue = (a: Asset) => a.cost + a.revaluation
export const nbvOf = (db: DB, a: Asset) => grossValue(a) - bookedAccum(db, a.id)

export function lastDepPeriod(db: DB, assetId: string): string | null {
  const periods = db.depRuns
    .filter((r) => r.status === 'posted' && r.lines.some((l) => l.assetId === assetId))
    .map((r) => r.period)
    .sort()
  return periods.length ? periods[periods.length - 1] : null
}

/** Lines a depreciation run would produce for a period. */
export function computeRun(db: DB, period: string, excludeRunId?: string) {
  const pIdx = monthIndex(period + '-01')
  const done = new Set(
    db.depRuns
      .filter((r) => r.period === period && r.status !== 'cancelled' && r.id !== excludeRunId)
      .flatMap((r) => r.lines.map((l) => l.assetId)),
  )
  return db.assets
    .filter((a) => (a.status === 'active' || a.status === 'maintenance') && monthIndex(a.inServiceDate) <= pIdx && !done.has(a.id))
    .map((a) => ({ assetId: a.id, amount: monthlyDep(a, nbvOf(db, a)) }))
    .filter((l) => l.amount > 0)
}
