import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ListView } from '../components/ListView'
import { Badge, Select } from '../components/ui'
import { bookedAccum, grossValue, nbvOf } from '../data/calc'
import { assetStatusLabel, assetStatusTone, iqd, money } from '../data/format'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { Asset, AssetStatus } from '../data/types'

export default function AssetsList() {
  const { db } = useStore()
  const L = useLookups()
  const [params] = useSearchParams()
  const [cat, setCat] = useState(params.get('cat') ?? '')
  const [loc, setLoc] = useState('')
  const [status, setStatus] = useState<AssetStatus | ''>((params.get('status') as AssetStatus) ?? '')

  const rows = db.assets.filter(
    (a) => (!cat || a.categoryId === cat) && (!loc || a.locationId === loc) && (!status || a.status === status),
  )
  const sum = (f: (a: Asset) => number) => (rs: Asset[]) => money(rs.reduce((s, a) => s + f(a), 0))
  const live = db.assets.filter((a) => a.status === 'active' || a.status === 'maintenance')

  return (
    <ListView
      title="سجل الموجودات"
      rows={rows}
      newTo="/assets/new"
      newLabel="موجود جديد"
      rowTo={(a) => `/assets/${a.id}`}
      searchText={(a) => `${a.code} ${a.name} ${a.serial} ${L.empName(a.custodianId)}`}
      kpis={[
        { label: 'عدد الموجودات الفعالة', value: String(live.length) },
        { label: 'إجمالي التكلفة', value: iqd(live.reduce((s, a) => s + grossValue(a), 0)) },
        { label: 'مجمع الاستهلاك', value: iqd(live.reduce((s, a) => s + bookedAccum(db, a.id), 0)) },
        { label: 'صافي القيمة الدفترية', value: iqd(live.reduce((s, a) => s + nbvOf(db, a), 0)) },
      ]}
      filters={
        <>
          <div className="w-48"><Select value={cat} onChange={setCat} options={L.catOptions} placeholder="كل الفئات" /></div>
          <div className="w-52"><Select value={loc} onChange={setLoc} options={L.locOptions} placeholder="كل المواقع" /></div>
          <div className="w-40">
            <Select
              value={status}
              onChange={setStatus}
              placeholder="كل الحالات"
              options={(Object.keys(assetStatusLabel) as AssetStatus[]).map((s) => ({ value: s, label: assetStatusLabel[s] }))}
            />
          </div>
        </>
      }
      columns={[
        { key: 'code', label: 'رمز الموجود', render: (a) => <span className="font-medium text-navy" dir="ltr">{a.code}</span> },
        { key: 'name', label: 'اسم الموجود', render: (a) => a.name },
        { key: 'cat', label: 'الفئة', render: (a) => L.catName(a.categoryId) },
        { key: 'loc', label: 'الموقع', render: (a) => L.locName(a.locationId) },
        { key: 'cust', label: 'صاحب العهدة', render: (a) => L.empName(a.custodianId) },
        { key: 'date', label: 'تاريخ الاستخدام', render: (a) => <span dir="ltr">{a.inServiceDate}</span> },
        { key: 'cost', label: 'التكلفة', num: true, render: (a) => money(grossValue(a)), total: sum(grossValue) },
        { key: 'acc', label: 'مجمع الاستهلاك', num: true, render: (a) => money(bookedAccum(db, a.id)), total: sum((a) => bookedAccum(db, a.id)) },
        { key: 'nbv', label: 'القيمة الدفترية', num: true, render: (a) => <b>{money(nbvOf(db, a))}</b>, total: sum((a) => nbvOf(db, a)) },
        { key: 'st', label: 'الحالة', render: (a) => <Badge tone={assetStatusTone[a.status]}>{assetStatusLabel[a.status]}</Badge> },
      ]}
    />
  )
}
