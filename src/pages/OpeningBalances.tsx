import { AlertTriangle, CheckCircle2, FileSpreadsheet, MoreHorizontal, Printer, Trash2, Undo2, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { ListView } from '../components/ListView'
import { Badge, Card, Confirm, Dropdown, Empty, Field, FormGrid, ReadOnly } from '../components/ui'
import { batchGlCheck, checkRow, commitBatch, reverseBatch, sampleImportRows } from '../data/documents'
import { money } from '../data/format'
import { nextNo, TODAY } from '../data/lifecycle'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { BatchStatus, OpeningBatch } from '../data/types'

const statusLabel: Record<BatchStatus, string> = { draft: 'مسودة (معاينة)', committed: 'معتمدة', reversed: 'معكوسة' }
const statusTone = { draft: 'gray', committed: 'green', reversed: 'red' } as const

export function BatchesList() {
  const { db, can } = useStore()
  return (
    <ListView
      title="استيراد الأصول القديمة"
      crumbs={[{ label: 'الإعدادات' }, { label: 'استيراد الأصول القديمة' }]}
      rows={[...db.batches].sort((a, b) => b.number.localeCompare(a.number))}
      newTo="/opening-balances/new"
      newLabel="دفعة استيراد جديدة"
      canNew={can('post')}
      rowTo={(b) => `/opening-balances/${b.id}`}
      searchText={(b) => `${b.number} ${b.fileName} ${b.notes}`}
      columns={[
        { key: 'n', label: 'رقم الدفعة', render: (b) => <span className="font-medium text-navy" dir="ltr">{b.number}</span> },
        { key: 'c', label: 'تاريخ القطع', render: (b) => <span dir="ltr">{b.cutoffDate}</span> },
        { key: 'f', label: 'الملف', render: (b) => <span dir="ltr" className="text-xs text-gray-600">{b.fileName || '—'}</span> },
        { key: 'r', label: 'الأسطر', num: true, render: (b) => b.rows.length },
        { key: 'v', label: 'إجمالي التكلفة', num: true, render: (b) => money(b.rows.reduce((s, r) => s + r.originalValue, 0)) },
        { key: 'a', label: 'المجمّع المستورد', num: true, render: (b) => money(b.rows.reduce((s, r) => s + r.importedAccum, 0)) },
        { key: 's', label: 'الحالة', render: (b) => <Badge tone={statusTone[b.status]}>{statusLabel[b.status]}</Badge> },
      ]}
    />
  )
}

export function BatchForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const { db, run, can, toast } = useStore()
  const L = useLookups()
  const stored = db.batches.find((b) => b.id === id)
  const isNew = !stored
  const [b, setB] = useState<OpeningBatch>(() => stored ? structuredClone(stored) : {
    id: `ob${db.batches.length + 1}-${Math.random().toString(36).slice(2, 5)}`, number: nextNo('AOB', db.batches.map((x) => x.number)), cutoffDate: '2026-09-30',
    fileName: '', status: 'draft', rows: [], glLoaded: true, assetIds: [], committedAt: null, notes: '',
  })
  const [ask, setAsk] = useState<null | 'commit' | 'reverse' | 'delete'>(null)
  useEffect(() => { if (stored && stored.status !== b.status) setB(structuredClone(stored)) }, [stored, b.status])

  const draft = b.status === 'draft'
  const editable = draft && can('post')
  const checks = b.rows.map((r) => checkRow(db, b, r))
  const errors = checks.reduce((n, c) => n + c.errors.length, 0)
  const warnings = checks.reduce((n, c) => n + c.warnings.length, 0)
  const gl = batchGlCheck(db, b)

  const persist = (then?: 'commit') => {
    let savedId = b.id
    const ok = run((d) => {
      const copy = structuredClone(b)
      const i = d.batches.findIndex((x) => x.id === copy.id)
      if (i >= 0) d.batches[i] = copy
      else d.batches.push(copy)
      savedId = copy.id
      if (then === 'commit') return commitBatch(d, copy.id)
    }, then === 'commit' ? 'تم اعتماد الدفعة وإنشاء الأصول القديمة' : 'تم حفظ الدفعة')
    if (ok && isNew) nav(`/opening-balances/${savedId}`, { replace: true })
  }
  const upload = () => {
    setB({ ...b, rows: sampleImportRows(), fileName: 'legacy-assets-branches.xlsx' })
    toast('تم رفع الملف وقراءة 6 أسطر (محاكاة)')
  }

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'الإعدادات' }, { label: 'استيراد الأصول القديمة', to: '/opening-balances' }, { label: isNew ? 'دفعة جديدة' : b.number }]}
        title={`دفعة استيراد ${b.number}`}
        badge={<><Badge tone={statusTone[b.status]}>{statusLabel[b.status]}</Badge><span className="text-xs text-gray-400" dir="ltr">239</span></>}
        summary={{ label: 'إجمالي التكلفة', value: `IQD ${money(b.rows.reduce((s, r) => s + r.originalValue, 0))}` }}
        actions={
          <>
            <button type="button" className="btn" disabled={!editable} onClick={upload}><Upload className="h-4 w-4" />رفع ملف Excel</button>
            <button type="button" className="btn" disabled={!editable} onClick={() => persist()}>حفظ المعاينة</button>
            <button type="button" className="btn btn-primary" disabled={!editable || !b.rows.length || errors > 0} onClick={() => setAsk('commit')}><CheckCircle2 className="h-4 w-4" />اعتماد</button>
            <button type="button" className="btn" disabled={b.status !== 'committed' || !can('reverse')} onClick={() => setAsk('reverse')}><Undo2 className="h-4 w-4" />عكس</button>
            <Dropdown label="إجراءات" icon={MoreHorizontal} items={[
              { label: 'طباعة', icon: Printer, onClick: () => window.print() },
              { label: 'حذف المسودة', icon: Trash2, danger: true, disabled: !draft || isNew, onClick: () => setAsk('delete') },
            ]} />
          </>
        }
      />
      <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
        المدخل الوحيد للأصول القديمة: رفع Excel ← معاينة بأخطاء الصف ← اعتماد (ينشئ الأصول «قيد الإهلاك» أو «مكتملة») ← عكس (ممنوع بعد ترحيل أي قسط لأصل في الدفعة).
      </div>

      <Card className="mb-4">
        <FormGrid>
          <Field label="رقم الدفعة"><ReadOnly ltr>{b.number}</ReadOnly></Field>
          <Field label="تاريخ قطع الاستيراد" required hint="نهاية فترة — أول قسط في الفترة التالية">
            <input type="date" className="inp" disabled={!editable} value={b.cutoffDate} onChange={(e) => setB({ ...b, cutoffDate: e.target.value })} />
          </Field>
          <Field label="الملف"><ReadOnly ltr><span className="flex items-center gap-1"><FileSpreadsheet className="h-4 w-4 text-emerald-600" />{b.fileName || '—'}</span></ReadOnly></Field>
          <Field label="أرصدة الأستاذ الافتتاحية" hint="تُدخل من عملية Finance المستقلة (محاكاة)">
            <label className="flex h-8 items-center gap-2 text-sm"><input type="checkbox" disabled={!editable} checked={b.glLoaded} onChange={(e) => setB({ ...b, glLoaded: e.target.checked })} />مُدخلة في المالية</label>
          </Field>
          <Field label="المعاينة"><ReadOnly><span className={errors ? 'text-red-600' : 'text-emerald-700'}>{errors} خطأ</span> · <span className="text-amber-600">{warnings} تحذير</span></ReadOnly></Field>
          <Field label="ملاحظات" span={5}><input className="inp" disabled={!editable} value={b.notes} onChange={(e) => setB({ ...b, notes: e.target.value })} /></Field>
        </FormGrid>
      </Card>

      <div className="card mb-4">
        <div className="border-b border-line px-4 py-2.5 text-sm font-semibold">الأسطر المستوردة {draft && b.rows.length > 0 && <span className="ms-2 text-xs font-normal text-gray-500">احذف أو صحّح الأسطر الخاطئة في الملف ثم أعد الرفع — الاعتماد ممنوع مع أي خطأ</span>}</div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>#</th><th>رمز النظام السابق</th><th>الاسم</th><th>الفئة</th><th>الموقع</th><th>مركز الكلفة</th><th>بدء الإهلاك</th><th className="!text-end">التكلفة</th><th className="!text-end">التخريدية</th><th className="!text-end">المجمّع</th><th className="!text-end">العمر</th><th className="!text-end">المتبقي</th><th>المعاينة</th>{editable && <th />}</tr></thead>
            <tbody>
              {b.rows.map((r, i) => {
                const c = checks[i]
                const created = b.assetIds[i] ? db.assets.find((a) => a.id === b.assetIds[i]) : undefined
                return (
                  <tr key={r.id} className={c.errors.length ? 'bg-red-50/60' : ''}>
                    <td className="text-gray-400">{i + 1}</td>
                    <td dir="ltr" className="text-end">{r.code}</td>
                    <td>{created ? <Link className="text-navy hover:underline" to={`/assets/${created.id}`}>{created.code} — {r.name}</Link> : r.name}</td>
                    <td dir="ltr" className="text-end">{r.classCode}</td><td dir="ltr" className="text-end">{r.locationCode}</td><td dir="ltr" className="text-end">{r.costCenterCode}</td>
                    <td dir="ltr" className="text-end">{r.depStartDate}</td>
                    <td className="num">{money(r.originalValue)}</td><td className="num">{money(r.salvage)}</td><td className="num">{money(r.importedAccum)}</td>
                    <td className="num">{r.lifeMonths}</td><td className="num">{r.remainingLife}</td>
                    <td className="text-xs">
                      {c.errors.map((e) => <div key={e} className="text-red-600">✗ {e}</div>)}
                      {c.warnings.map((w) => <div key={w} className="text-amber-600">⚠ {w}</div>)}
                      {!c.errors.length && !c.warnings.length && <span className="text-emerald-700">✓ صالح</span>}
                    </td>
                    {editable && <td><button type="button" className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={() => setB({ ...b, rows: b.rows.filter((x) => x.id !== r.id) })}><Trash2 className="h-4 w-4" /></button></td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
          {b.rows.length === 0 && <Empty text="ارفع ملف Excel لعرض المعاينة" />}
        </div>
      </div>

      {b.rows.length > 0 && (
        <Card title={<span className="flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-amber-500" />إجماليات الدفعة مقابل أرصدة الأستاذ بتاريخ القطع — تحذير لا خطأ مانع</span>} pad={false}>
          <table className="tbl">
            <thead><tr><th>حساب الأصل</th><th className="!text-end">تكلفة الدفعة</th><th className="!text-end">رصيد الأستاذ المتاح</th><th className="!text-end">الفرق</th><th>حساب المجمّع</th><th className="!text-end">مجمّع الدفعة</th><th className="!text-end">رصيد الأستاذ المتاح</th><th className="!text-end">الفرق</th></tr></thead>
            <tbody>
              {gl.map((g) => (
                <tr key={g.code}>
                  <td className="text-xs">{L.acctName(g.code)}</td><td className="num">{money(g.cost)}</td><td className="num">{money(g.glCost)}</td>
                  <td className={`num ${Math.round(g.glCost - g.cost) ? 'text-amber-600 font-semibold' : 'text-emerald-700'}`}>{money(g.glCost - g.cost)}</td>
                  <td className="text-xs">{g.accumCode ? L.acctName(g.accumCode) : '—'}</td><td className="num">{money(g.accum)}</td><td className="num">{money(g.glAccum)}</td>
                  <td className={`num ${Math.round(g.glAccum - g.accum) ? 'text-amber-600 font-semibold' : 'text-emerald-700'}`}>{money(g.glAccum - g.accum)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-gray-500">رصيد الأستاذ المتاح = رصيد الحساب في الأستاذ بتاريخ القطع ناقص ما يخص الأصول الموجودة أصلاً في السجل. أرصدة الأستاذ تُدخل من عملية Finance وقد تتأخر؛ والفرق يلتقطه تقرير المطابقة.{draft ? ' عند الاعتماد مع «مُدخلة في المالية» تُضاف أرصدة الافتتاح كقيد خارجي للمطابقة.' : ''}</p>
        </Card>
      )}

      {ask === 'commit' && <Confirm title="اعتماد الدفعة" text={`ينشئ ${b.rows.length} أصلاً قديماً بتاريخ قطع ${b.cutoffDate}، بإهلاك مستورد وعمر متبقٍّ، وحركة «رصيد افتتاحي» برقم الدفعة. هل تريد المتابعة؟`} onClose={() => setAsk(null)} onYes={() => persist('commit')} />}
      {ask === 'reverse' && <Confirm danger title="عكس الدفعة" text="تُلغى أصول الدفعة وتُعكس أرصدتها. ممنوع بعد ترحيل أي قسط إهلاك لأصل في الدفعة." onClose={() => setAsk(null)} onYes={() => run((d) => reverseBatch(d, b.id), 'تم عكس الدفعة')} />}
      {ask === 'delete' && <Confirm danger title="حذف المسودة" text="حذف مسودة الدفعة لا يؤثر على الأصول." onClose={() => setAsk(null)}
        onYes={() => { if (run((d) => { d.batches = d.batches.filter((x) => x.id !== b.id) }, 'تم حذف المسودة')) nav('/opening-balances') }} />}
      <p className="mt-2 text-xs text-gray-400" dir="ltr">{TODAY}</p>
    </div>
  )
}
