import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ListView } from '../components/ListView'
import { Badge, Select, Tabs } from '../components/ui'
import { accumOf, bookValue, grossOf } from '../data/calc'
import { iqd, money, stateLabel, stateTone } from '../data/format'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { Asset, AssetState } from '../data/types'

type TabId = 'all' | AssetState | 'out'

export default function AssetsList() {
  const { db, can } = useStore()
  const L = useLookups()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<TabId>((params.get('state') as TabId) ?? 'all')
  const [cls, setCls] = useState(params.get('class') ?? '')
  const [group, setGroup] = useState('')
  const [branch, setBranch] = useState('')

  const inTab = (a: Asset) => tab === 'all' || (tab === 'out' ? a.state === 'sold' || a.state === 'disposed' : a.state === tab)
  const filtered = db.assets.filter((a) => (!cls || a.classId === cls) && (!group || a.groupId === group) && (!branch || L.branchOf(a.locationId) === branch))
  const rows = filtered.filter(inTab)
  const count = (t: TabId) => filtered.filter((a) => t === 'all' || (t === 'out' ? a.state === 'sold' || a.state === 'disposed' : a.state === t)).length
  const book = db.assets.filter((a) => ['running', 'paused', 'closed'].includes(a.state))
  const sum = (f: (a: Asset) => number) => (rs: Asset[]) => money(rs.reduce((s, a) => s + f(a), 0))

  return (
    <ListView
      title="سجل الأصول"
      rows={rows}
      newTo="/assets/new"
      newLabel="أصل جديد"
      canNew={can('create')}
      rowTo={(a) => `/assets/${a.id}`}
      searchText={(a) => `${a.code} ${a.name} ${a.serial} ${a.tagNumber} ${L.empName(a.custodianId)}`}
      kpis={[
        { label: 'أصول في الدفاتر', value: String(book.length) },
        { label: 'إجمالي القيمة الأصلية', value: iqd(book.reduce((s, a) => s + grossOf(a), 0)) },
        { label: 'مجمّع الاندثار', value: iqd(book.reduce((s, a) => s + accumOf(db, a), 0)) },
        { label: 'القيمة الدفترية', value: iqd(book.reduce((s, a) => s + bookValue(db, a), 0)) },
      ]}
      tabs={
        <Tabs<TabId>
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'all', label: 'الكل', count: count('all') },
            { id: 'draft', label: stateLabel.draft, count: count('draft') },
            { id: 'running', label: stateLabel.running, count: count('running') },
            { id: 'paused', label: stateLabel.paused, count: count('paused') },
            { id: 'closed', label: stateLabel.closed, count: count('closed') },
            { id: 'out', label: 'مباع / مستبعد', count: count('out') },
          ]}
        />
      }
      filters={
        <>
          <div className="w-52"><Select value={cls} onChange={setCls} options={L.clsOptions} placeholder="كل الفئات" /></div>
          <div className="w-44"><Select value={group} onChange={setGroup} options={L.groupOptions} placeholder="كل المجموعات" /></div>
          <div className="w-36"><Select value={branch} onChange={setBranch} options={L.branchOptions} placeholder="كل الفروع" /></div>
        </>
      }
      columns={[
        { key: 'code', label: 'رمز الأصل', render: (a) => <span className="font-medium text-navy" dir="ltr">{a.code}</span> },
        { key: 'name', label: 'اسم الأصل', render: (a) => <span>{a.name}{a.isLegacy && <span className="ms-1.5 rounded bg-gray-100 px-1 text-[10px] text-gray-500">مستورد</span>}</span> },
        { key: 'cls', label: 'الفئة', render: (a) => L.clsName(a.classId) },
        { key: 'loc', label: 'الموقع', render: (a) => L.locName(a.locationId) },
        { key: 'cust', label: 'العهدة', render: (a) => L.empName(a.custodianId) },
        { key: 'date', label: 'بدء الإهلاك', render: (a) => <span dir="ltr">{a.depStartDate}</span> },
        { key: 'orig', label: 'القيمة الأصلية', num: true, render: (a) => money(grossOf(a)), total: sum(grossOf) },
        { key: 'acc', label: 'المجمّع', num: true, render: (a) => money(accumOf(db, a)), total: sum((a) => accumOf(db, a)) },
        { key: 'nbv', label: 'القيمة الدفترية', num: true, render: (a) => <b>{a.state === 'sold' || a.state === 'disposed' ? '—' : money(bookValue(db, a))}</b>, total: sum((a) => (a.state === 'sold' || a.state === 'disposed' ? 0 : bookValue(db, a))) },
        { key: 'st', label: 'الحالة', render: (a) => <Badge tone={stateTone[a.state]}>{stateLabel[a.state]}</Badge> },
      ]}
    />
  )
}
