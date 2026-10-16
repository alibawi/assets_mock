import { BookOpen, Calculator, List, MoreHorizontal, Printer, RefreshCw, Send, Trash2, Undo2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { ListView } from '../components/ListView'
import { JournalTable } from '../components/Shared'
import { Badge, Card, Confirm, Dropdown, Empty, Field, FormGrid, ReadOnly, Select, Tabs } from '../components/ui'
import { monthEnd, runJournal, runTotal, simulateRun } from '../data/calc'
import { iqd, money, periodLabel, runStatusLabel, runStatusTone } from '../data/format'
import { createRun, postRun, reversalOf, reverseRun, TODAY } from '../data/lifecycle'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'

const periods = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)

export function RunsList() {
  const { db, can } = useStore()
  const L = useLookups()
  return (
    <ListView
      title="دورات الإهلاك"
      rows={[...db.runs].sort((a, b) => b.number.localeCompare(a.number))}
      newTo="/runs/new"
      newLabel="دورة إهلاك جديدة"
      canNew={can('post')}
      rowTo={(r) => `/runs/${r.id}`}
      searchText={(r) => `${r.number} ${periodLabel(r.periodEnd)}`}
      columns={[
        { key: 'n', label: 'رقم الدورة', render: (r) => <span className="font-medium text-navy" dir="ltr">{r.number}</span> },
        { key: 'p', label: 'نهاية الفترة', render: (r) => <span>{periodLabel(r.periodEnd)} <span className="text-xs text-gray-400" dir="ltr">({monthEnd(r.periodEnd)})</span></span> },
        { key: 'c', label: 'النطاق', render: (r) => (r.classId ? L.clsName(r.classId) : 'كل الفئات') },
        { key: 'a', label: 'عدد الأصول', num: true, render: (r) => new Set(r.lines.map((l) => l.assetId)).size },
        { key: 't', label: 'إجمالي الإهلاك', num: true, render: (r) => money(runTotal(r)), total: (rs) => money(rs.filter((r) => r.status === 'posted').reduce((s, r) => s + runTotal(r), 0)) },
        { key: 'd', label: 'تاريخ الترحيل', render: (r) => <span dir="ltr">{r.postedAt ?? '—'}</span> },
        { key: 's', label: 'الحالة', render: (r) => <Badge tone={runStatusTone[r.status]}>{runStatusLabel[r.status]}</Badge> },
      ]}
    />
  )
}

type T = 'lines' | 'journal'

export function RunForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const { db, run, can } = useStore()
  const L = useLookups()
  const r = db.runs.find((x) => x.id === id)
  const [period, setPeriod] = useState('2026-10')
  const [cls, setCls] = useState('')
  const [tab, setTab] = useState<T>('lines')
  const [ask, setAsk] = useState<null | 'post' | 'reverse' | 'delete'>(null)

  // ---- New run: choose period + scope, then simulate (creates a Draft document) ----
  if (!r) {
    const preview = simulateRun(db, period, cls)
    const simulate = () => {
      let newId = ''
      const ok = run((d) => {
        const x = createRun(d, period, cls)
        if (!x.lines.length) return 'لا توجد أقساط مستحقة لهذه الفترة والنطاق'
        newId = x.id
      }, 'تم إنشاء الدورة بحالة مسودة (محاكاة)')
      if (ok) nav(`/runs/${newId}`, { replace: true })
    }
    return (
      <div>
        <PageHeader
          crumbs={[{ label: 'دورات الإهلاك', to: '/runs' }, { label: 'دورة جديدة' }]}
          title="دورة إهلاك جديدة"
          actions={<><button type="button" className="btn btn-primary" disabled={!can('post')} onClick={simulate}><Calculator className="h-4 w-4" />محاكاة</button><button type="button" className="btn" onClick={() => nav('/runs')}>إلغاء</button></>}
          summary={{ label: 'إجمالي متوقع', value: iqd(runTotal({ lines: preview })) }}
        />
        <Card>
          <FormGrid>
            <Field label="نهاية الفترة المحاسبية" required>
              <Select value={period} onChange={setPeriod} options={periods.map((p) => ({ value: p, label: `${periodLabel(p)} (${monthEnd(p)})` }))} />
            </Field>
            <Field label="النطاق"><Select value={cls} onChange={setCls} options={L.clsOptions} placeholder="كل الفئات" /></Field>
            <Field label="مجال الإهلاك"><ReadOnly>01 — Local GAAP</ReadOnly></Field>
            <Field label="أقساط مستحقة"><ReadOnly ltr>{preview.length}</ReadOnly></Field>
            <Field label="الفترة المحاسبية"><ReadOnly>مفتوحة</ReadOnly></Field>
          </FormGrid>
          <p className="mt-3 text-xs text-gray-500">
            المحاكاة تجمع الأقساط غير المُرحّلة حتى نهاية الفترة للأصول «قيد الإهلاك» فقط (الموقوفة مستثناة)، وتنشئ وثيقة مسودة يمكن مراجعتها قبل الترحيل. لا يُنشأ قيد ولا يُعلَّم أي قسط كمُرحّل.
          </p>
        </Card>
      </div>
    )
  }

  const draft = r.status === 'draft'
  const journal = runJournal(db, r)
  const assets = new Set(r.lines.map((l) => l.assetId)).size

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'دورات الإهلاك', to: '/runs' }, { label: r.number }]}
        title={`دورة إهلاك ${r.number}`}
        badge={<Badge tone={runStatusTone[r.status]}>{runStatusLabel[r.status]}</Badge>}
        summary={{ label: 'إجمالي الإهلاك', value: iqd(runTotal(r)) }}
        actions={
          <>
            <button type="button" className="btn btn-primary" disabled={!draft || !can('post')} onClick={() => setAsk('post')}><Send className="h-4 w-4" />ترحيل</button>
            {draft && (
              <button type="button" className="btn" disabled={!can('post')} onClick={() => run((d) => { const x = d.runs.find((y) => y.id === r.id)!; x.lines = simulateRun(d, x.periodEnd, x.classId) }, 'أُعيدت المحاكاة')}>
                <RefreshCw className="h-4 w-4" />إعادة المحاكاة
              </button>
            )}
            <button type="button" className="btn" disabled={r.status !== 'posted' || !can('reverse')} onClick={() => setAsk('reverse')}><Undo2 className="h-4 w-4" />عكس</button>
            <button type="button" className="btn" onClick={() => nav('/runs')}>إلغاء</button>
            <Dropdown
              label="إجراءات"
              icon={MoreHorizontal}
              items={[
                { label: 'طباعة', icon: Printer, onClick: () => window.print() },
                { label: 'حذف المسودة', icon: Trash2, danger: true, disabled: !draft || !can('post'), onClick: () => setAsk('delete') },
              ]}
            />
          </>
        }
      />
      {r.status === 'posted' && <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">تم ترحيل الدورة بقيد واحد بتاريخ {r.postedAt}. التصحيح يتم بالعكس لا بالحذف.</div>}
      {r.status === 'reversed' && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">تم عكس هذه الدورة بقيد عكسي، وأُعيدت أقساطها إلى «مخطَّط».</div>}

      <Card className="mb-4">
        <FormGrid>
          <Field label="رقم الدورة"><ReadOnly ltr>{r.number}</ReadOnly></Field>
          <Field label="نهاية الفترة"><ReadOnly>{periodLabel(r.periodEnd)} — <span dir="ltr">{monthEnd(r.periodEnd)}</span></ReadOnly></Field>
          <Field label="النطاق"><ReadOnly>{r.classId ? L.clsName(r.classId) : 'كل الفئات'}</ReadOnly></Field>
          <Field label="مجال الإهلاك"><ReadOnly>01 — Local GAAP</ReadOnly></Field>
          <Field label="عدد الأصول / الأقساط"><ReadOnly ltr>{assets} / {r.lines.length}</ReadOnly></Field>
        </FormGrid>
      </Card>

      <div className="card">
        <Tabs<T> active={tab} onChange={setTab} tabs={[{ id: 'lines', label: 'الأسطر', icon: List, count: r.lines.length }, { id: 'journal', label: 'القيد المحاسبي', icon: BookOpen }]} />
        {tab === 'lines' && (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>#</th><th>رمز الأصل</th><th>اسم الأصل</th><th>الفئة</th><th>تاريخ القسط</th><th>حساب المصروف</th><th>مركز الكلفة</th><th className="!text-end">القسط</th></tr></thead>
              <tbody>
                {r.lines.map((l, i) => {
                  const a = L.asset(l.assetId)
                  const dl = db.lines.find((x) => x.id === l.lineId)
                  return (
                    <tr key={l.lineId}>
                      <td className="text-gray-400">{i + 1}</td>
                      <td dir="ltr" className="text-end"><Link to={`/assets/${l.assetId}`} className="text-navy hover:underline">{a?.code}</Link></td>
                      <td>{a?.name}</td>
                      <td>{L.clsName(a?.classId ?? '')}</td>
                      <td dir="ltr" className="text-end">{dl?.date ?? '—'}</td>
                      <td className="text-xs text-gray-600" dir="ltr" style={{ textAlign: 'right' }}>{l.expenseAcct}</td>
                      <td>{L.ccName(l.costCenterId)}</td>
                      <td className="num">{money(l.amount)}</td>
                    </tr>
                  )
                })}
              </tbody>
              {r.lines.length > 0 && <tfoot><tr><td colSpan={7}>المجموع:</td><td className="num">{money(runTotal(r))}</td></tr></tfoot>}
            </table>
            {r.lines.length === 0 && <Empty text="لا توجد أسطر" />}
          </div>
        )}
        {tab === 'journal' && (
          <div className="space-y-5 p-4">
            <JournalTable lines={journal} note={draft ? 'معاينة القيد الواحد الذي سيُنشأ عند الترحيل — مُجمّع حسب (حساب المصروف، مركز الكلفة) مديناً وحسب حساب المجمّع دائناً.' : undefined} />
            {r.status === 'reversed' && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-red-700">القيد العكسي (IsReversal)</h4>
                <JournalTable lines={reversalOf(journal)} />
              </div>
            )}
          </div>
        )}
      </div>

      {ask === 'post' && (
        <Confirm title="ترحيل دورة الإهلاك" text={`سيتم ترحيل ${r.lines.length} قسطاً لـ ${assets} أصلاً بمبلغ ${iqd(runTotal(r))} بقيد واحد. هل تريد المتابعة؟`}
          onYes={() => run((d) => postRun(d, r.id, TODAY), 'تم ترحيل الدورة')} onClose={() => setAsk(null)} />
      )}
      {ask === 'reverse' && (
        <Confirm danger title="عكس الدورة" text="سيُنشأ قيد عكسي وتعود الأقساط إلى «مخطَّط». هل تريد المتابعة؟" onYes={() => run((d) => reverseRun(d, r.id), 'تم عكس الدورة')} onClose={() => setAsk(null)} />
      )}
      {ask === 'delete' && (
        <Confirm danger title="حذف المسودة" text="حذف المحاكاة لا يؤثر على الأصول." onYes={() => { if (run((d) => { d.runs = d.runs.filter((x) => x.id !== r.id) }, 'تم حذف المسودة')) nav('/runs') }} onClose={() => setAsk(null)} />
      )}
    </div>
  )
}
