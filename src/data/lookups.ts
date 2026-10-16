import { useMemo } from 'react'
import { useStore } from './store'

export function useLookups() {
  const { db } = useStore()
  return useMemo(() => {
    const by = <T extends { id: string }>(arr: T[]) => new Map(arr.map((x) => [x.id, x]))
    const classes = by(db.classes)
    const locs = by(db.locations)
    const emps = by(db.employees)
    const assets = by(db.assets)
    const groups = by(db.groups)
    const partners = by(db.partners)
    const ccs = by(db.costCenters)
    const locPath = (id: string): string => {
      const l = locs.get(id)
      if (!l) return '—'
      return l.parentId ? `${locPath(l.parentId)} / ${l.name}` : l.name
    }
    const branchOf = (id: string): string => {
      const l = locs.get(id)
      if (!l) return ''
      return l.parentId ? branchOf(l.parentId) : l.id
    }
    return {
      cls: (id: string) => classes.get(id),
      loc: (id: string) => locs.get(id),
      emp: (id: string) => emps.get(id),
      asset: (id: string) => assets.get(id),
      clsName: (id: string) => classes.get(id)?.name ?? '—',
      groupName: (id: string) => groups.get(id)?.name ?? '—',
      locName: (id: string) => locs.get(id)?.name ?? '—',
      locPath,
      branchOf,
      empName: (id: string) => emps.get(id)?.name ?? '—',
      partnerName: (id: string) => partners.get(id)?.name ?? '—',
      ccName: (id: string) => ccs.get(id)?.name ?? '—',
      acctName: (code: string) => (code ? `${code} — ${db.accounts.find((a) => a.code === code)?.name ?? 'غير موجود'}` : '—'),
      assetLabel: (id: string) => {
        const a = assets.get(id)
        return a ? `${a.code} — ${a.name}` : '—'
      },
      clsOptions: db.classes.filter((c) => c.isActive).map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
      groupOptions: db.groups.filter((g) => g.isActive).map((g) => ({ value: g.id, label: g.name })),
      locOptions: db.locations.filter((l) => l.isActive).map((l) => ({ value: l.id, label: locPath(l.id) })),
      branchOptions: db.locations.filter((l) => !l.parentId).map((l) => ({ value: l.id, label: l.name })),
      empOptions: db.employees.map((e) => ({ value: e.id, label: `${e.name} — ${e.department}` })),
      partnerOptions: db.partners.map((p) => ({ value: p.id, label: p.name })),
      ccOptions: db.costCenters.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
      acctOptions: db.accounts.map((a) => ({ value: a.code, label: `${a.code} — ${a.name}${a.postable ? '' : ' (غير قابل للترحيل)'}` })),
    }
  }, [db])
}
