import { useMemo } from 'react'
import { useStore } from './store'

export function useLookups() {
  const { db } = useStore()
  return useMemo(() => {
    const by = <T extends { id: string }>(arr: T[]) => new Map(arr.map((x) => [x.id, x]))
    const cats = by(db.categories)
    const locs = by(db.locations)
    const emps = by(db.employees)
    const assets = by(db.assets)
    return {
      cat: (id: string) => cats.get(id),
      loc: (id: string) => locs.get(id),
      emp: (id: string) => emps.get(id),
      asset: (id: string) => assets.get(id),
      catName: (id: string) => cats.get(id)?.name ?? '—',
      locName: (id: string) => locs.get(id)?.name ?? '—',
      empName: (id: string) => emps.get(id)?.name ?? '—',
      assetLabel: (id: string) => {
        const a = assets.get(id)
        return a ? `${a.code} — ${a.name}` : '—'
      },
      catOptions: db.categories.map((c) => ({ value: c.id, label: c.name })),
      locOptions: db.locations.map((l) => ({ value: l.id, label: `${l.name} (${l.branch})` })),
      empOptions: db.employees.map((e) => ({ value: e.id, label: `${e.name} — ${e.department}` })),
    }
  }, [db])
}
