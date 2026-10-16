import { BookOpen, Ban, CheckCircle2, Info, MoreHorizontal, Play, Printer, Wrench } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { ListView } from '../components/ListView'
import { JournalTable } from '../components/Shared'
import { Badge, Card, Confirm, Dropdown, Field, FormGrid, Modal, NumInput, ReadOnly, SaveSplit, Select, Tabs } from '../components/ui'
import { iqd, maintStatusLabel, maintStatusTone, maintTypeLabel, money } from '../data/format'
import { cancelMaint, completeMaint, maintJournal, maintValidate, nextNo, startMaint, TODAY } from '../data/lifecycle'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { Maintenance, MaintStatus, MaintType } from '../data/types'

type TabId = 'all' | 'open' | 'overdue' | MaintStatus
const isOpen = (m: Maintenance) => m.status === 'planned' || m.status === 'inProgress'
const isOverdue = (m: Maintenance) => isOpen(m) && m.plannedDate < TODAY
const in30 = (d: string) => d >= TODAY && d <= '2026-11-15'

export function MaintenanceList() {
  const { db, can } = useStore()
  const L = useLookups()
  const [params] = useSearchParams()
  const [tab, setTab] = useState<TabId>((params.get('tab') as TabId) ?? 'open')
  const [type, setType] = useState<MaintType | ''>('')
  const match = (m: Maintenance, t: TabId) =>
    t === 'all' || (t === 'open' ? isOpen(m) : t === 'overdue' ? isOverdue(m) : m.status === t)
  const base = db.maintenance.filter((m) => !type || m.type === type)
  const rows = base.filter((m) => match(m, tab)).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate))
  const count = (t: TabId) => base.filter((m) => match(m, t)).length
  const done2026 = db.maintenance.filter((m) => m.status === 'done' && (m.doneDate ?? '').startsWith('2026'))

  return (
    <ListView
      title="الصيانة"
      rows={rows}
      newTo="/maintenance/new"
      newLabel="أمر صيانة"
      canNew={can('create')}
      rowTo={(m) => `/maintenance/${m.id}`}
      searchText={(m) => `${m.number} ${L.assetLabel(m.assetId)} ${L.partnerName(m.partnerId)} ${m.notes}`}
      kpis={[
        { label: 'أوامر مفتوحة', value: String(db.maintenance.filter(isOpen).length) },
        { label: 'متأخرة عن موعدها', value: String(db.maintenance.filter(isOverdue).length) },
        { label: 'مستحقة خلال 30 يوماً', value: String(db.maintenance.filter((m) => isOpen(m) && in30(m.plannedDate)).length) },
        { label: 'تكلفة الصيانة المنجزة 2026', value: iqd(done2026.reduce((s, m) => s + m.cost, 0)) },
      ]}
      tabs={
        <Tabs<TabId>
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'open', label: 'المفتوحة', count: count('open') },
            { id: 'overdue', label: 'المتأخرة', count: count('overdue') },
            { id: 'planned', label: maintStatusLabel.planned, count: count('planned') },
            { id: 'inProgress', label: maintStatusLabel.inProgress, count: count('inProgress') },
            { id: 'done', label: maintStatusLabel.done, count: count('done') },
            { id: 'cancelled', label: maintStatusLabel.cancelled, count: count('cancelled') },
            { id: 'all', label: 'الكل', count: count('all') },
          ]}
        />
      }
      filters={
        <div className="w-40">
          <Select<MaintType> value={type} onChange={setType} placeholder="كل الأنواع" options={(Object.keys(maintTypeLabel) as MaintType[]).map((k) => ({ value: k, label: maintTypeLabel[k] }))} />
        </div>
      }
      columns={[
        { key: 'n', label: 'رقم الأمر', render: (m) => <span className="font-medium text-navy" dir="ltr">{m.number}</span> },
        { key: 'a', label: 'الأصل', render: (m) => L.assetLabel(m.assetId) },
        { key: 't', label: 'النوع', render: (m) => maintTypeLabel[m.type] },
        { key: 'p', label: 'الجهة المنفذة', render: (m) => L.partnerName(m.partnerId) },
        { key: 'd', label: 'الموعد المخطط', render: (m) => <span dir="ltr" className={isOverdue(m) ? 'font-semibold text-red-600' : ''}>{m.plannedDate}</span> },
        { key: 'r', label: 'التكرار', render: (m) => (m.intervalMonths ? `كل ${m.intervalMonths} أشهر` : 'مرة واحدة') },
        { key: 'c', label: 'التكلفة', num: true, render: (m) => money(m.cost), total: (rs) => money(rs.reduce((s, m) => s + m.cost, 0)) },
        { key: 's', label: 'الحالة', render: (m) => <span className="flex items-center gap-1"><Badge tone={maintStatusTone[m.status]}>{maintStatusLabel[m.status]}</Badge>{isOverdue(m) && <Badge tone="red">متأخرة</Badge>}</span> },
      ]}
    />
  )
}

type T = 'details' | 'journal'

export function MaintenanceForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { db, run, can } = useStore()
  const L = useLookups()
  const existing = db.maintenance.find((m) => m.id === id)
  const isNew = !existing
  const [m, setM] = useState<Maintenance>(() =>
    existing ? structuredClone(existing) : {
      id: '', number: nextNo('MNT', db.maintenance.map((x) => x.number)), assetId: params.get('asset') ?? '', type: 'preventive',
      partnerId: '', plannedDate: TODAY, doneDate: null, cost: 0, intervalMonths: 0, status: 'planned', notes: '', journal: [],
    },
  )
  const [tab, setTab] = useState<T>('details')
  const [ask, setAsk] = useState<null | 'complete' | 'cancel'>(null)
  const [doneDate, setDoneDate] = useState(TODAY)
  const [actual, setActual] = useState(m.cost)

  const stored = existing ?? m
  const editable = isOpen(stored) && can(isNew ? 'create' : 'update')
  const set = <K extends keyof Maintenance>(k: K, v: Maintenance[K]) => setM((p) => ({ ...p, [k]: v }))
  const a = L.asset(m.assetId)
  const eligible = db.assets.filter((x) => x.state === 'running' || x.state === 'paused' || x.state === 'closed')
  const history = db.maintenance.filter((x) => x.assetId === m.assetId && x.id !== m.id).sort((x, y) => y.plannedDate.localeCompare(x.plannedDate))

  const persist = (then?: (d: typeof db, saved: Maintenance) => string | null, ok?: string) => {
    let savedId = m.id
    const done = run((d) => {
      const err = maintValidate(d, m)
      if (err) return err
      let saved = m
      if (isNew) {
        savedId = `m${Date.now().toString(36)}`
        saved = { ...m, id: savedId, number: nextNo('MNT', d.maintenance.map((x) => x.number)) }
        d.maintenance.push(saved)
      } else {
        const i = d.maintenance.findIndex((x) => x.id === m.id)
        d.maintenance[i] = { ...d.maintenance[i], ...m, status: d.maintenance[i].status }
      }
      return then ? then(d, saved) : null
    }, ok)
    if (done && isNew) nav(`/maintenance/${savedId}`, { replace: true })
    return done
  }
  const save = () => persist(undefined, 'تم حفظ أمر الصيانة')

  const journal = stored.status === 'done' ? stored.journal : maintJournal(db, m)

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'الصيانة', to: '/maintenance' }, { label: isNew ? 'أمر جديد' : m.number }]}
        title={isNew ? 'أمر صيانة جديد' : `أمر صيانة ${m.number}`}
        badge={<><Badge tone={maintStatusTone[stored.status]}>{maintStatusLabel[stored.status]}</Badge>{isOverdue(stored) && !isNew && <Badge tone="red">متأخرة</Badge>}</>}
        summary={{ label: stored.status === 'done' ? 'التكلفة الفعلية' : 'التكلفة التقديرية', value: iqd(m.cost) }}
        actions={
          <>
            <SaveSplit disabled={!editable} onSave={save} items={[{ label: 'حفظ وإنشاء جديد', onClick: () => { if (persist(undefined, 'تم حفظ أمر الصيانة')) nav('/maintenance/new') } }]} />
            {!isNew && stored.status === 'planned' && (
              <button type="button" className="btn" disabled={!can('update')} onClick={() => { if (run((d) => startMaint(d, m.id), 'بدأ تنفيذ الصيانة')) setM({ ...m, status: 'inProgress' }) }}>
                <Play className="h-4 w-4" />بدء التنفيذ
              </button>
            )}
            {!isNew && isOpen(stored) && (
              <button type="button" className="btn" disabled={!can('post')} onClick={() => { setActual(m.cost); setAsk('complete') }}><CheckCircle2 className="h-4 w-4" />إنجاز</button>
            )}
            <button type="button" className="btn" onClick={() => nav('/maintenance')}>إلغاء</button>
            {!isNew && (
              <Dropdown
                label="إجراءات"
                icon={MoreHorizontal}
                items={[
                  { label: 'طباعة أمر العمل', icon: Printer, onClick: () => window.print() },
                  { label: 'إلغاء الأمر', icon: Ban, danger: true, disabled: !isOpen(stored) || !can('update'), onClick: () => setAsk('cancel') },
                ]}
              />
            )}
          </>
        }
      />
      {stored.status === 'done' && <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">أُنجزت الصيانة بتاريخ {stored.doneDate} وسُجّلت تكلفتها كمصروف.{stored.intervalMonths > 0 && ' تمت جدولة الأمر التالي تلقائياً.'}</div>}
      {stored.status === 'cancelled' && <div className="mb-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600">هذا الأمر ملغى.</div>}

      <Card className="mb-4">
        <FormGrid>
          <Field label="رقم الأمر"><ReadOnly ltr>{m.number}</ReadOnly></Field>
          <Field label="الأصل" required span={2}>
            <Select value={m.assetId} onChange={(v) => set('assetId', v)} disabled={!editable || !isNew} placeholder="اختر الأصل" options={eligible.map((x) => ({ value: x.id, label: `${x.code} — ${x.name}` }))} />
          </Field>
          <Field label="نوع الصيانة" required>
            <Select<MaintType> value={m.type} disabled={!editable} onChange={(v) => set('type', v)} options={(Object.keys(maintTypeLabel) as MaintType[]).map((k) => ({ value: k, label: maintTypeLabel[k] }))} />
          </Field>
          <Field label="الجهة المنفذة" required><Select value={m.partnerId} disabled={!editable} onChange={(v) => set('partnerId', v)} options={L.partnerOptions} placeholder="اختر" /></Field>
          <Field label="الموعد المخطط" required><input type="date" className="inp" disabled={!editable} value={m.plannedDate} onChange={(e) => set('plannedDate', e.target.value)} /></Field>
          <Field label="التكلفة التقديرية (IQD)"><NumInput value={m.cost} disabled={!editable} onChange={(n) => set('cost', n)} /></Field>
          <Field label="التكرار">
            <Select value={String(m.intervalMonths)} disabled={!editable} onChange={(v) => set('intervalMonths', Number(v))}
              options={[['0', 'مرة واحدة'], ['1', 'شهرياً'], ['3', 'كل 3 أشهر'], ['4', 'كل 4 أشهر'], ['6', 'كل 6 أشهر'], ['12', 'سنوياً']].map(([value, label]) => ({ value, label }))} />
          </Field>
          <Field label="تاريخ الإنجاز"><ReadOnly ltr>{stored.doneDate ?? '—'}</ReadOnly></Field>
          <Field label="وصف العمل" span={5}><input className="inp" disabled={!editable} value={m.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        </FormGrid>
      </Card>

      <div className="card">
        <Tabs<T> active={tab} onChange={setTab} tabs={[{ id: 'details', label: 'الأصل وسجل صيانته', icon: Info, count: history.length }, { id: 'journal', label: 'القيد المحاسبي', icon: BookOpen }]} />
        <div className="p-4">
          {tab === 'details' && (a ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                <div><div className="text-[11px] text-gray-500">الأصل</div><Link className="font-medium text-navy hover:underline" to={`/assets/${a.id}`}>{a.code} — {a.name}</Link></div>
                <div><div className="text-[11px] text-gray-500">الموقع</div>{L.locPath(a.locationId)}</div>
                <div><div className="text-[11px] text-gray-500">صاحب العهدة</div>{L.empName(a.custodianId)}</div>
                <div><div className="text-[11px] text-gray-500">مركز الكلفة</div>{L.ccName(a.costCenterId)}</div>
                <div><div className="text-[11px] text-gray-500">الرقم التسلسلي</div><span dir="ltr">{a.serial}</span></div>
              </div>
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Wrench className="h-4 w-4 text-gray-400" />أوامر الصيانة الأخرى لهذا الأصل</h4>
                {history.length ? (
                  <table className="tbl">
                    <thead><tr><th>رقم الأمر</th><th>النوع</th><th>الموعد</th><th>الإنجاز</th><th className="!text-end">التكلفة</th><th>الحالة</th></tr></thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id} className="cursor-pointer" onClick={() => nav(`/maintenance/${h.id}`)}>
                          <td dir="ltr" className="text-end text-navy">{h.number}</td><td>{maintTypeLabel[h.type]}</td>
                          <td dir="ltr" className="text-end">{h.plannedDate}</td><td dir="ltr" className="text-end">{h.doneDate ?? '—'}</td>
                          <td className="num">{money(h.cost)}</td><td><Badge tone={maintStatusTone[h.status]}>{maintStatusLabel[h.status]}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : <p className="text-sm text-gray-400">لا توجد أوامر أخرى</p>}
              </div>
            </div>
          ) : <p className="text-sm text-gray-400">اختر الأصل في رأس الأمر</p>)}
          {tab === 'journal' && (
            <JournalTable lines={journal} note={stored.status === 'done' ? undefined : 'معاينة القيد الذي يُنشأ عند الإنجاز: مدين مصروف الصيانة (على مركز كلفة الأصل) / دائن الموردون.'} />
          )}
        </div>
      </div>

      {ask === 'complete' && (
        <Modal title={`إنجاز ${m.number}`} onClose={() => setAsk(null)}
          footer={<><button type="button" className="btn" onClick={() => setAsk(null)}>إلغاء</button><button type="button" className="btn btn-primary" onClick={() => {
            if (persist((d, saved) => completeMaint(d, saved.id, doneDate, actual), m.intervalMonths ? 'أُنجزت الصيانة وجُدول الأمر التالي' : 'أُنجزت الصيانة')) {
              setM({ ...m, status: 'done', doneDate, cost: actual })
              setAsk(null)
            }
          }}>إنجاز</button></>}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="تاريخ الإنجاز" required><input type="date" className="inp" value={doneDate} onChange={(e) => setDoneDate(e.target.value)} /></Field>
            <Field label="التكلفة الفعلية" required><NumInput value={actual} onChange={setActual} /></Field>
            <p className="col-span-2 text-xs text-gray-500">تُسجَّل التكلفة كمصروف صيانة.{m.intervalMonths > 0 && ` سيُنشأ أمر جديد بعد ${m.intervalMonths} أشهر من تاريخ الإنجاز.`}</p>
          </div>
        </Modal>
      )}
      {ask === 'cancel' && (
        <Confirm danger title="إلغاء أمر الصيانة" text="لن يُسجَّل أي قيد. هل تريد المتابعة؟" onClose={() => setAsk(null)}
          onYes={() => { if (run((d) => cancelMaint(d, m.id), 'تم إلغاء الأمر')) setM({ ...m, status: 'cancelled' }) }} />
      )}
    </div>
  )
}
