import { BookOpen, History, List, MoreHorizontal, Plus, Printer, Send, Trash2, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { ListView } from '../components/ListView'
import { JournalTable } from '../components/Shared'
import { TxTable } from './Transactions'
import { Badge, Card, Confirm, Dropdown, Empty, Field, FormGrid, NumInput, ReadOnly, SaveSplit, Select, Tabs } from '../components/ui'
import { bookValue, grossOf, remainingDepreciable } from '../data/calc'
import { blankDocLine, docKindLabel, docRoute, docTypeOf, newDoc, postDoc, reverseDoc, syncDocNumber } from '../data/documents'
import { iqd, money } from '../data/format'
import { defaultCcDate, exitPreview } from '../data/lifecycle'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { Asset, AssetDoc, AssetDocLine, DB, DocKind, DocStatus } from '../data/types'

const statusLabel: Record<DocStatus, string> = { draft: 'مسودة', posted: 'مُرحّل', reversed: 'معكوس' }
const statusTone = { draft: 'gray', posted: 'green', reversed: 'red' } as const

const docTitle = (d: Pick<AssetDoc, 'kind' | 'direction' | 'adjType' | 'transferType'>) => {
  switch (d.kind) {
    case 'reval': return d.direction === 'up' ? 'إعادة تقييم (زيادة)' : 'هبوط قيمة (نقص)'
    case 'costAdj': return d.adjType === 'addition' ? 'إضافة لاحقة' : 'تخفيض اقتناء'
    case 'transfer': return d.transferType === 'location' ? 'نقل موقع / عهدة' : 'نقل مركز كلفة'
    default: return docKindLabel[d.kind]
  }
}

/** Assets a line may target, per document type (§4.1 matrix). */
function eligible(db: DB, d: AssetDoc): Asset[] {
  const s = (a: Asset, ...st: string[]) => st.includes(a.state)
  return db.assets.filter((a) => {
    const k = db.classes.find((c) => c.id === a.classId)
    switch (d.kind) {
      case 'reval': return d.direction === 'up' ? s(a, 'running', 'paused', 'closed') : s(a, 'running', 'paused')
      case 'disposal': return s(a, 'running', 'paused', 'closed')
      case 'costAdj': return d.adjType === 'addition' ? s(a, 'running', 'paused', 'closed') : s(a, 'running', 'paused')
      case 'manual': return s(a, 'running', 'paused') && !!k?.isDepreciable && k.kind !== 'land'
      case 'transfer': return s(a, 'running', 'paused', 'closed')
    }
  })
}

export function DocsList({ kind }: { kind: DocKind }) {
  const { db, can } = useStore()
  const L = useLookups()
  const rows = db.docs.filter((d) => d.kind === kind).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
  return (
    <ListView
      title={docKindLabel[kind]}
      crumbs={[{ label: 'الحركات' }, { label: docKindLabel[kind] }]}
      rows={rows}
      newTo={`/${docRoute[kind]}/new`}
      newLabel="مستند جديد"
      canNew={can('post')}
      rowTo={(d) => `/${docRoute[kind]}/${d.id}`}
      searchText={(d) => `${d.number} ${d.notes} ${d.lines.map((l) => L.assetLabel(l.assetId)).join(' ')}`}
      columns={[
        { key: 'n', label: 'رقم المستند', render: (d) => <span className="font-medium text-navy" dir="ltr">{d.number}</span> },
        { key: 't', label: 'النوع', render: (d) => <span>{docTitle(d)} <span className="text-xs text-gray-400" dir="ltr">({d.docType})</span></span> },
        { key: 'd', label: 'التاريخ الفعلي', render: (d) => <span dir="ltr">{d.date}</span> },
        { key: 'a', label: 'الأصول', render: (d) => <span className="text-gray-600">{d.lines.map((l) => L.asset(l.assetId)?.code).join('، ')}</span> },
        { key: 'c', label: 'عدد الأسطر', num: true, render: (d) => d.lines.length },
        { key: 'x', label: 'ملاحظات', render: (d) => <span className="text-xs text-gray-500">{d.notes}</span> },
        { key: 's', label: 'الحالة', render: (d) => <Badge tone={statusTone[d.status]}>{statusLabel[d.status]}</Badge> },
      ]}
    />
  )
}

type T = 'lines' | 'journal' | 'txs'

export function DocForm({ kind }: { kind: DocKind }) {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { db, run, can, toast } = useStore()
  const L = useLookups()
  const stored = db.docs.find((d) => d.id === id)
  const isNew = !stored
  const [d, setD] = useState<AssetDoc>(() => {
    if (stored) return structuredClone(stored)
    const x = newDoc(db, kind)
    if (params.get('dir') === 'down') x.direction = 'down'
    if (params.get('adj') === 'reduction') x.adjType = 'reduction'
    if (params.get('tt') === 'costCenter') x.transferType = 'costCenter'
    const pre = params.get('asset')
    if (pre) {
      const a = db.assets.find((y) => y.id === pre)
      const l = { ...blankDocLine(), assetId: pre }
      if (a && kind === 'reval') l.newValue = Math.round(bookValue(db, a))
      x.lines.push(l)
      if (a && x.kind === 'transfer' && x.transferType === 'costCenter') x.date = defaultCcDate(db, a)
    }
    syncDocNumber(db, x)
    return x
  })
  const [tab, setTab] = useState<T>('lines')
  const [pick, setPick] = useState('')
  const [ask, setAsk] = useState<null | 'post' | 'reverse' | 'delete'>(null)
  useEffect(() => { if (stored && stored.status !== d.status) setD(structuredClone(stored)) }, [stored, d.status])

  const draft = d.status === 'draft'
  const editable = draft && can('post')
  const setHead = (patch: Partial<AssetDoc>) => setD((p) => { const n = { ...p, ...patch }; syncDocNumber(db, n); return n })
  const setLine = (lid: string, patch: Partial<AssetDocLine>) => setD((p) => ({ ...p, lines: p.lines.map((l) => (l.id === lid ? { ...l, ...patch } : l)) }))
  const options = eligible(db, d).filter((a) => !d.lines.some((l) => l.assetId === a.id)).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))
  const addLine = () => {
    if (!pick) return
    const a = db.assets.find((x) => x.id === pick)!
    setD((p) => ({ ...p, lines: [...p.lines, { ...blankDocLine(), assetId: pick, newValue: p.kind === 'reval' ? Math.round(bookValue(db, a)) : 0 }] }))
    setPick('')
  }

  const save = (thenPost = false) => {
    let savedId = d.id
    const ok = run((x) => {
      const copy = structuredClone(d)
      syncDocNumber(x, copy)
      const i = x.docs.findIndex((y) => y.id === copy.id)
      if (i >= 0) x.docs[i] = copy
      else x.docs.push(copy)
      savedId = copy.id
      if (thenPost) return postDoc(x, copy.id)
    }, thenPost ? 'تم ترحيل المستند' : 'تم حفظ المستند كمسودة')
    if (ok && isNew) nav(`/${docRoute[kind]}/${savedId}`, { replace: true })
  }

  const txs = d.txIds.map((tid) => db.txs.find((t) => t.id === tid)!).filter(Boolean)
  const reversals = db.txs.filter((t) => t.sourceDocId === d.id && t.reversedTxId)
  const journal = [...txs, ...reversals].flatMap((t) => t.journal.map((j) => ({ ...j, desc: `${j.desc} (${t.date})` })))
  const total = d.lines.reduce((s, l) => {
    const a = L.asset(l.assetId)
    if (!a) return s
    if (d.kind === 'reval') return s + l.newValue - bookValue(db, a)
    if (d.kind === 'costAdj' || d.kind === 'manual') return s + l.amount
    if (d.kind === 'disposal') return s + bookValue(db, a)
    return s
  }, 0)

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'الحركات' }, { label: docKindLabel[kind], to: `/${docRoute[kind]}` }, { label: isNew ? 'مستند جديد' : d.number }]}
        title={`${docTitle(d)} ${isNew ? '— مستند جديد' : d.number}`}
        badge={<><Badge tone={statusTone[d.status]}>{statusLabel[d.status]}</Badge><span className="text-xs text-gray-400" dir="ltr">{docTypeOf(d)}</span></>}
        summary={d.kind !== 'transfer' ? { label: d.kind === 'reval' ? 'صافي الفرق' : d.kind === 'disposal' ? 'القيمة الدفترية المشطوبة' : 'الإجمالي', value: iqd(total) } : undefined}
        actions={
          <>
            <SaveSplit disabled={!editable} onSave={() => save()} items={[{ label: 'حفظ وترحيل', onClick: () => setAsk('post') }]} />
            <button type="button" className="btn" disabled={!editable || !d.lines.length} onClick={() => setAsk('post')}><Send className="h-4 w-4" />ترحيل</button>
            <button type="button" className="btn" disabled={d.status !== 'posted' || !can('reverse')} onClick={() => setAsk('reverse')}><Undo2 className="h-4 w-4" />عكس</button>
            <button type="button" className="btn" onClick={() => nav(`/${docRoute[kind]}`)}>إلغاء</button>
            <Dropdown label="إجراءات" icon={MoreHorizontal} items={[
              { label: 'طباعة', icon: Printer, onClick: () => window.print() },
              { label: 'حذف المسودة', icon: Trash2, danger: true, disabled: !draft || isNew, onClick: () => setAsk('delete') },
            ]} />
          </>
        }
      />
      {d.status === 'posted' && <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">مُرحّل بتاريخ {d.postedAt}. كل سطر سُجّل حركةً على أصله بنفس رقم المستند. التصحيح بالعكس لا بالتعديل.</div>}
      {d.status === 'reversed' && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">معكوس — أُضيفت حركات عكس مؤرَّخة بتاريخ المستند الأصلي وأُعيد توليد الأقساط غير المُرحّلة.</div>}

      <Card className="mb-4">
        <FormGrid>
          <Field label="رقم المستند"><ReadOnly ltr>{d.number}</ReadOnly></Field>
          <Field label={d.kind === 'transfer' && d.transferType === 'costCenter' ? 'تاريخ السريان' : 'التاريخ الفعلي'} required>
            <input type="date" className="inp" disabled={!editable} value={d.date} onChange={(e) => setHead({ date: e.target.value })} />
          </Field>
          {d.kind === 'reval' && (
            <Field label="الاتجاه" required hint="زيادة = 233 · نقص = 238">
              <Select value={d.direction} disabled={!editable} onChange={(v) => setHead({ direction: v as AssetDoc['direction'] })} options={[{ value: 'up', label: 'زيادة — إعادة تقييم (233)' }, { value: 'down', label: 'نقص — هبوط قيمة (238)' }]} />
            </Field>
          )}
          {d.kind === 'costAdj' && (
            <Field label="النوع" required hint="إضافة = 240 · تخفيض = 241">
              <Select value={d.adjType} disabled={!editable} onChange={(v) => setHead({ adjType: v as AssetDoc['adjType'] })} options={[{ value: 'addition', label: 'إضافة لاحقة (240)' }, { value: 'reduction', label: 'تخفيض اقتناء (241)' }]} />
            </Field>
          )}
          {d.kind === 'transfer' && (
            <Field label="نوع النقل" required hint="موقع/عهدة = 234 · مركز كلفة = 237">
              <Select value={d.transferType} disabled={!editable} onChange={(v) => setHead({ transferType: v as AssetDoc['transferType'] })} options={[{ value: 'location', label: 'موقع / عهدة (234)' }, { value: 'costCenter', label: 'مركز كلفة (237)' }]} />
            </Field>
          )}
          <Field label="نوع الوثيقة"><ReadOnly ltr>{docTypeOf(d)}</ReadOnly></Field>
          <Field label="ملاحظات / السبب" span={d.kind === 'disposal' || d.kind === 'manual' ? 3 : 2}><input className="inp" disabled={!editable} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></Field>
        </FormGrid>
        {d.kind === 'transfer' && d.transferType === 'costCenter' && <p className="mt-2 text-xs text-gray-500">بلا قيد افتراضياً؛ كل قسط يأخذ المركز الساري في تاريخه، ولا نقل بأثر رجعي قبل آخر قسط مُرحّل (§5.5). المقترح: أول يوم من الفترة التالية غير المُرحّلة.</p>}
      </Card>

      <div className="card">
        <Tabs<T> active={tab} onChange={setTab} tabs={[
          { id: 'lines', label: 'الأسطر', icon: List, count: d.lines.length },
          { id: 'journal', label: 'القيد المحاسبي', icon: BookOpen },
          { id: 'txs', label: 'الحركات المُنشأة', icon: History, count: txs.length || undefined },
        ]} />
        {tab === 'lines' && (
          <>
            {editable && (
              <div className="flex items-center gap-2 border-b border-line p-3">
                <div className="w-96"><Select value={pick} onChange={setPick} options={options} placeholder="اختر أصلاً مؤهلاً..." /></div>
                <button type="button" className="btn btn-primary" disabled={!pick} onClick={addLine}><Plus className="h-4 w-4" />إضافة سطر</button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>#</th><th>الأصل</th><LineHeads d={d} />{editable && <th />}</tr></thead>
                <tbody>
                  {d.lines.map((l, i) => {
                    const a = L.asset(l.assetId)
                    if (!a) return null
                    return (
                      <tr key={l.id}>
                        <td className="text-gray-400">{i + 1}</td>
                        <td><Link className="text-navy hover:underline" to={`/assets/${a.id}`}>{a.code}</Link> <span className="text-gray-600">{a.name}</span></td>
                        <LineCells db={db} d={d} l={l} a={a} editable={editable} set={(p) => setLine(l.id, p)} L={L} />
                        {editable && <td><button type="button" className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={() => setD({ ...d, lines: d.lines.filter((x) => x.id !== l.id) })}><Trash2 className="h-4 w-4" /></button></td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {d.lines.length === 0 && <Empty text="أضف الأصول المشمولة بالمستند" />}
            </div>
          </>
        )}
        {tab === 'journal' && (
          <div className="p-4">
            {draft ? <Empty text={d.kind === 'transfer' ? 'النقل بلا قيد' : 'يُنشأ القيد عند الترحيل — سطر لكل أصل حسب حسابات فئته'} /> : <JournalTable lines={journal} note={d.kind === 'transfer' ? 'النقل لا يُنشئ قيداً (§5.3، §5.5).' : undefined} />}
          </div>
        )}
        {tab === 'txs' && <div className="p-2">{txs.length || reversals.length ? <TxTable rows={[...txs, ...reversals]} /> : <Empty text="تُنشأ حركة على كل أصل عند الترحيل" />}</div>}
      </div>

      {ask === 'post' && <Confirm title="ترحيل المستند" text={`سيُرحَّل ${d.lines.length} سطراً كحركات ${docTitle(d)} بالرقم ${d.number} ويُعاد توليد الأقساط غير المُرحّلة. هل تريد المتابعة؟`} onClose={() => setAsk(null)} onYes={() => save(true)} />}
      {ask === 'reverse' && <Confirm danger title="عكس المستند" text="تُعكس كل حركات المستند (آخر سطر أولاً) بتاريخها الأصلي. يُرفض إن وُجد قسط مُرحّل بعدها — اعكس دورات الإهلاك اللاحقة أولاً." onClose={() => setAsk(null)}
        onYes={() => run((x) => reverseDoc(x, d.id), 'تم عكس المستند')} />}
      {ask === 'delete' && <Confirm danger title="حذف المسودة" text="حذف المسودة لا يؤثر على الأصول." onClose={() => setAsk(null)}
        onYes={() => { if (run((x) => { x.docs = x.docs.filter((y) => y.id !== d.id) }, 'تم حذف المسودة')) { toast('تم حذف المسودة'); nav(`/${docRoute[kind]}`) } }} />}
    </div>
  )
}

function LineHeads({ d }: { d: AssetDoc }) {
  switch (d.kind) {
    case 'reval': return <><th className="!text-end">القيمة الدفترية الحالية</th><th className="!text-end w-44">القيمة الجديدة</th><th className="!text-end">الفرق</th></>
    case 'disposal': return <><th className="!text-end">التكلفة</th><th className="!text-end">المجمّع</th><th className="!text-end">إهلاك حتى التاريخ</th><th className="!text-end">المشطوب (خسارة)</th></>
    case 'costAdj': return <><th className="!text-end">القيمة الأصلية</th><th className="!text-end w-40">المبلغ</th><th className="w-40">مرجع الفاتورة / مذكرة الدائن</th>{d.adjType === 'addition' && <th className="w-32">عمر متبقٍّ جديد</th>}<th className="!text-end">بعد</th></>
    case 'manual': return <><th className="!text-end">المتبقي القابل للإهلاك</th><th className="!text-end w-44">المبلغ</th></>
    case 'transfer': return d.transferType === 'location'
      ? <><th>الموقع الحالي</th><th className="w-56">الموقع الجديد</th><th>العهدة الحالية</th><th className="w-56">العهدة الجديدة</th></>
      : <><th>المركز الحالي</th><th className="w-56">المركز الجديد</th></>
  }
}

function LineCells({ db, d, l, a, editable, set, L }: {
  db: DB; d: AssetDoc; l: AssetDocLine; a: Asset; editable: boolean; set: (p: Partial<AssetDocLine>) => void; L: ReturnType<typeof useLookups>
}) {
  const nbv = bookValue(db, a)
  switch (d.kind) {
    case 'reval': {
      const diff = l.newValue - nbv
      return <><td className="num">{money(nbv)}</td><td className="num">{editable ? <NumInput value={l.newValue} onChange={(n) => set({ newValue: n })} /> : money(l.newValue)}</td><td className={`num ${diff < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{money(diff)}</td></>
    }
    case 'disposal': {
      const p = d.status === 'draft' ? exitPreview(db, a, d.date) : null
      const t = db.txs.find((x) => d.txIds.includes(x.id) && x.assetId === a.id && x.type === 'disposal')
      return p
        ? <><td className="num">{money(p.gross)}</td><td className="num">{money(p.accum)}</td><td className="num">{money(p.toDate)}</td><td className="num text-red-600">{p.blocking ? <span className="text-xs">رحّل {p.blocking.date.slice(0, 7)} أولاً</span> : money(p.nbv)}</td></>
        : <><td className="num">{money(t?.fromValue ?? 0)}</td><td className="num">{money(t?.accumulatedAtEvent ?? 0)}</td><td className="num">{money(t?.toDateAmount ?? 0)}</td><td className="num">{money((t?.fromValue ?? 0) - (t?.accumulatedAtEvent ?? 0))}</td></>
    }
    case 'costAdj':
      return (
        <>
          <td className="num">{money(grossOf(a))}</td>
          <td className="num">{editable ? <NumInput value={l.amount} onChange={(n) => set({ amount: n })} /> : money(l.amount)}</td>
          <td>{editable ? <input className="inp" dir="ltr" value={l.sourceDocRef} onChange={(e) => set({ sourceDocRef: e.target.value })} placeholder="اختياري" /> : <span dir="ltr">{l.sourceDocRef || '—'}</span>}</td>
          {d.adjType === 'addition' && <td>{editable ? <NumInput value={l.newRemainingLife} onChange={(n) => set({ newRemainingLife: n })} /> : l.newRemainingLife || '—'}</td>}
          <td className="num">{d.status === 'draft' ? money(grossOf(a) + (d.adjType === 'addition' ? l.amount : -l.amount)) : '—'}</td>
        </>
      )
    case 'manual':
      return <><td className="num">{money(remainingDepreciable(db, a))}</td><td className="num">{editable ? <NumInput value={l.amount} onChange={(n) => set({ amount: n })} /> : money(l.amount)}</td></>
    case 'transfer':
      return d.transferType === 'location'
        ? <>
            <td className="text-gray-600">{L.locName(a.locationId)}</td>
            <td>{editable ? <Select value={l.toLocationId} onChange={(v) => set({ toLocationId: v })} options={L.locOptions} placeholder="بلا تغيير" /> : L.locName(l.toLocationId || a.locationId)}</td>
            <td className="text-gray-600">{L.empName(a.custodianId)}</td>
            <td>{editable ? <Select value={l.toCustodianId} onChange={(v) => set({ toCustodianId: v })} options={L.empOptions} placeholder="بلا تغيير" /> : L.empName(l.toCustodianId || a.custodianId)}</td>
          </>
        : <>
            <td className="text-gray-600">{L.ccName(a.costCenterId)}</td>
            <td>{editable ? <Select value={l.toCostCenterId} onChange={(v) => set({ toCostCenterId: v })} options={L.ccOptions} placeholder="اختر" /> : L.ccName(l.toCostCenterId)}</td>
          </>
  }
}

