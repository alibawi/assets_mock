import { FileStack } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ListView } from '../components/ListView'
import { Badge, Field, Modal, NumInput, Select, Tabs } from '../components/ui'
import { accumOf, bookValue, grossOf } from '../data/calc'
import { iqd, kindLabel, money, stateLabel, stateTone } from '../data/format'
import { draftsFromBillLine, TODAY } from '../data/lifecycle'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { Asset, AssetState } from '../data/types'

type TabId = 'all' | AssetState | 'out'
const inBooks = (s: AssetState) => s === 'running' || s === 'paused' || s === 'closed'

export default function AssetsList() {
  const { db, can } = useStore()
  const L = useLookups()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<TabId>((params.get('state') as TabId) ?? 'all')
  const [cls, setCls] = useState(params.get('class') ?? '')
  const [group, setGroup] = useState('')
  const [branch, setBranch] = useState('')
  const [bill, setBill] = useState(false)

  const inTab = (a: Asset, t: TabId) => t === 'all' || (t === 'out' ? a.state === 'sold' || a.state === 'disposed' : a.state === t)
  const filtered = db.assets.filter((a) => (!cls || a.classId === cls) && (!group || a.groupId === group) && (!branch || L.branchOf(a.locationId) === branch))
  const rows = filtered.filter((a) => inTab(a, tab))
  const count = (t: TabId) => filtered.filter((a) => inTab(a, t)).length
  const book = db.assets.filter((a) => inBooks(a.state))
  const sum = (f: (a: Asset) => number) => (rs: Asset[]) => money(rs.reduce((s, a) => s + f(a), 0))
  const nbvOrDash = (a: Asset) => (inBooks(a.state) ? bookValue(db, a) : 0)

  return (
    <>
      <ListView
        title="سجل الأصول"
        rows={rows}
        newTo="/assets/new"
        newLabel="أصل جديد"
        canNew={can('create')}
        rowTo={(a) => `/assets/${a.id}`}
        searchText={(a) => `${a.code} ${a.name} ${a.serial} ${a.tagNumber} ${a.sourceDocRef} ${L.empName(a.custodianId)}`}
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
              { id: 'cancelled', label: stateLabel.cancelled, count: count('cancelled') },
            ]}
          />
        }
        filters={
          <>
            <div className="w-52"><Select value={cls} onChange={setCls} options={L.clsOptions} placeholder="كل الفئات" /></div>
            <div className="w-44"><Select value={group} onChange={setGroup} options={L.groupOptions} placeholder="كل المجموعات" /></div>
            <div className="w-36"><Select value={branch} onChange={setBranch} options={L.branchOptions} placeholder="كل الفروع" /></div>
            {can('create') && <button type="button" className="btn" onClick={() => setBill(true)}><FileStack className="h-4 w-4" />من سطر فاتورة شراء</button>}
          </>
        }
        columns={[
          { key: 'code', label: 'رمز الأصل', render: (a) => <span className="font-medium text-navy" dir="ltr">{a.code}</span> },
          { key: 'name', label: 'اسم الأصل', render: (a) => (
            <span>{a.name}
              {a.isLegacy && <span className="ms-1.5 rounded bg-gray-100 px-1 text-[10px] text-gray-500">مستورد</span>}
              {L.cls(a.classId)?.kind && L.cls(a.classId)!.kind !== 'tangible' && <span className="ms-1.5 rounded bg-sky-50 px-1 text-[10px] text-sky-700">{kindLabel[L.cls(a.classId)!.kind]}</span>}
            </span>
          ) },
          { key: 'cls', label: 'الفئة', render: (a) => L.clsName(a.classId) },
          { key: 'loc', label: 'الموقع', render: (a) => L.locName(a.locationId) },
          { key: 'cust', label: 'العهدة', render: (a) => L.empName(a.custodianId) },
          { key: 'date', label: 'تاريخ الرسملة', render: (a) => <span dir="ltr">{a.capitalizationDate ?? '—'}</span> },
          { key: 'orig', label: 'القيمة الأصلية', num: true, render: (a) => money(grossOf(a)), total: sum(grossOf) },
          { key: 'acc', label: 'المجمّع', num: true, render: (a) => money(accumOf(db, a)), total: sum((a) => accumOf(db, a)) },
          { key: 'nbv', label: 'القيمة الدفترية', num: true, render: (a) => <b>{inBooks(a.state) ? money(bookValue(db, a)) : '—'}</b>, total: sum(nbvOrDash) },
          { key: 'st', label: 'الحالة', render: (a) => <Badge tone={stateTone[a.state]}>{stateLabel[a.state]}</Badge> },
        ]}
      />
      {bill && <BillLineModal onClose={() => setBill(false)} />}
    </>
  )
}

/** §5.6.6 — a purchase-bill line with quantity N creates N draft assets (the phase-4 listener, simulated). */
function BillLineModal({ onClose }: { onClose: () => void }) {
  const { run } = useStore()
  const L = useLookups()
  const [f, setF] = useState({ bill: 'PB-2026-0150', line: '1', qty: 3, total: 10000000, name: '', classId: 'c5', locationId: 'l11', custodianId: 'e3', costCenterId: 'cc3', partnerId: 'p7' })
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }))
  const each = f.qty > 0 ? Math.round(f.total / f.qty) : 0
  const submit = () => {
    const c = L.cls(f.classId)
    if (!f.name.trim() || !c) return run(() => 'اسم الصنف والفئة مطلوبان')
    const base: Asset = {
      id: '', code: '', name: f.name, description: '', classId: c.id, groupId: '', locationId: f.locationId, custodianId: f.custodianId, serial: '', tagNumber: '',
      partnerId: f.partnerId, sourceDocRef: '', sourceDocLine: '', sourceLineSeq: null, acquisitionDate: TODAY, depStartDate: TODAY, originalValue: 0,
      salvage: 0, lifeMonths: c.lifeMonths, method: c.method, periodicity: c.periodicity, prorata: c.prorata, decliningFactor: c.decliningFactor,
      capitalizationDate: null, state: 'draft', isLegacy: false, importedAccum: 0, importCutoffDate: null, remainingLifeAtImport: null, revaluationAdj: 0,
      costCenterId: f.costCenterId, project: '',
    }
    if (run((d) => draftsFromBillLine(d, base, f.bill, f.line, f.qty, f.total), `تم إنشاء ${f.qty} أصول بحالة مسودة`)) onClose()
  }
  return (
    <Modal wide title="إنشاء أصول من سطر فاتورة شراء (كمية N)" onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>إلغاء</button><button type="button" className="btn btn-primary" onClick={submit}>إنشاء {f.qty} مسودة</button></>}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="رقم الفاتورة" required><input className="inp" dir="ltr" value={f.bill} onChange={(e) => set('bill', e.target.value)} /></Field>
        <Field label="رقم السطر" required><input className="inp" dir="ltr" value={f.line} onChange={(e) => set('line', e.target.value)} /></Field>
        <Field label="المورّد"><Select value={f.partnerId} onChange={(v) => set('partnerId', v)} options={L.partnerOptions} /></Field>
        <Field label="اسم الصنف" required><input className="inp" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="مثال: حاسوب محمول Dell Latitude" /></Field>
        <Field label="الكمية N" required hint="عدد صحيح — تُرفض الكسور"><NumInput value={f.qty} onChange={(n) => set('qty', n)} /></Field>
        <Field label="صافي السطر (IQD)" required><NumInput value={f.total} onChange={(n) => set('total', n)} /></Field>
        <Field label="الفئة" required><Select value={f.classId} onChange={(v) => set('classId', v)} options={L.clsOptions} /></Field>
        <Field label="الموقع"><Select value={f.locationId} onChange={(v) => set('locationId', v)} options={L.locOptions} /></Field>
        <Field label="صاحب العهدة"><Select value={f.custodianId} onChange={(v) => set('custodianId', v)} options={L.empOptions} /></Field>
      </div>
      <div className="mt-3 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
        يُنشأ {f.qty || 0} أصلاً بحالة مسودة، لكل منها كمية 1 وتكلفة {money(each)} والأخير {money(f.total - each * Math.max(f.qty - 1, 0))} (يأخذ فرق التقريب)، مع مرجع الفاتورة والسطر والتسلسل 1..N.
        إعادة ترحيل نفس السطر لا تنشئ شيئاً (idempotent). يحاكي مستمع المرحلة 4 (§5.6.6).
      </div>
    </Modal>
  )
}
