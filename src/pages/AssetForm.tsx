import {
  ArrowLeftRight, Barcode, CheckCircle2, Copy, FileText, History, Info, MapPin, MoreHorizontal, Paperclip, Trash2,
  TrendingDown, TrendingUp, Upload, Wrench,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Badge, Card, Confirm, Dropdown, Empty, Field, FormGrid, Modal, NumInput, ReadOnly, SaveSplit, Select, Tabs } from '../components/ui'
import { bookedAccum, grossValue, lastDepPeriod, monthlyDep, nbvOf, schedule } from '../data/calc'
import { assetStatusLabel, assetStatusTone, docStatusLabel, docStatusTone, iqd, methodLabel, money, periodLabel, today } from '../data/format'
import { useLookups } from '../data/lookups'
import { uid, useStore } from '../data/store'
import type { Asset, DepMethod } from '../data/types'

type Tab = 'general' | 'value' | 'location' | 'tech' | 'moves' | 'files' | 'history'

const blank = (): Asset => ({
  id: '', code: '', name: '', categoryId: '', locationId: '', custodianId: '', costCenter: '', status: 'draft',
  acquisitionDate: today(), inServiceDate: today(), cost: 0, salvage: 0, lifeMonths: 60, method: 'SL', openingAccum: 0,
  revaluation: 0, supplier: '', invoiceNo: '', serial: '', brand: '', model: '', warrantyEnd: '', notes: '', history: [],
})

export default function AssetForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const { db, update, toast } = useStore()
  const L = useLookups()
  const copyFrom = (useLocation().state as { copy?: Asset } | null)?.copy
  const existing = db.assets.find((a) => a.id === id)
  const isNew = !existing
  const [a, setA] = useState<Asset>(() => (existing ? structuredClone(existing) : copyFrom ?? blank()))
  const copyOf = (src: Asset): Asset => ({ ...src, id: '', code: '', name: `${src.name} (نسخة)`, status: 'draft', openingAccum: 0, revaluation: 0, history: [] })
  const [tab, setTab] = useState<Tab>('general')
  const [errors, setErrors] = useState<string[]>([])
  const [confirm, setConfirm] = useState<null | 'delete' | 'activate'>(null)
  const [barcode, setBarcode] = useState(false)

  const locked = a.status === 'disposed' || a.status === 'sold'
  const set = <K extends keyof Asset>(k: K, v: Asset[K]) => setA((p) => ({ ...p, [k]: v }))

  const onCategory = (cid: string) => {
    const c = L.cat(cid)
    if (!c) return
    setA((p) => ({
      ...p,
      categoryId: cid,
      ...(p.status === 'draft' && {
        method: c.method,
        lifeMonths: c.lifeYears * 12,
        salvage: Math.round((p.cost * c.salvagePct) / 100),
      }),
    }))
  }

  const validate = () => {
    const e: string[] = []
    if (!a.name.trim()) e.push('اسم الموجود')
    if (!a.categoryId) e.push('الفئة')
    if (!a.locationId) e.push('الموقع')
    if (!a.custodianId) e.push('صاحب العهدة')
    if (a.cost <= 0) e.push('تكلفة الاقتناء')
    if (!a.inServiceDate) e.push('تاريخ بدء الاستخدام')
    if (a.lifeMonths <= 0) e.push('العمر الإنتاجي')
    setErrors(e)
    return e.length === 0
  }

  const save = (after?: 'new' | 'copy') => {
    if (!validate()) {
      toast('يرجى إكمال الحقول الإلزامية', 'err')
      return
    }
    let saved = a
    update((db) => {
      if (isNew) {
        const c = db.categories.find((x) => x.id === a.categoryId)!
        const seq = db.assets.length + 1
        saved = {
          ...a,
          id: uid(),
          code: `${db.settings.prefixAsset}-${c.code}-${String(seq).padStart(4, '0')}`,
          costCenter: db.employees.find((e) => e.id === a.custodianId)?.department ?? '',
          history: [{ date: today(), action: 'إنشاء بطاقة الموجود', user: 'superadmin' }],
        }
        db.assets.push(saved)
      } else {
        saved = { ...a, history: [...a.history, { date: today(), action: 'تعديل بيانات البطاقة', user: 'superadmin' }] }
        db.assets = db.assets.map((x) => (x.id === a.id ? saved : x))
      }
    })
    toast(isNew ? `تم إنشاء الموجود ${saved.code}` : 'تم حفظ التعديلات')
    if (after === 'new') { if (isNew) setA(blank()); else nav('/assets/new') }
    else if (after === 'copy') { if (isNew) setA(copyOf(saved)); else nav('/assets/new', { state: { copy: copyOf(saved) } }) }
    else if (isNew) nav(`/assets/${saved.id}`, { replace: true })
    else setA(saved)
  }

  const activate = () => {
    update((db) => {
      const x = db.assets.find((y) => y.id === a.id)!
      x.status = 'active'
      x.history.push({ date: today(), action: 'تفعيل الموجود وبدء الاستهلاك', user: 'superadmin' })
    })
    setA((p) => ({ ...p, status: 'active' }))
    toast('تم تفعيل الموجود، وسيُشمل في احتساب الاستهلاك القادم')
  }

  const remove = () => {
    update((db) => { db.assets = db.assets.filter((x) => x.id !== a.id) })
    toast('تم حذف الموجود')
    nav('/assets')
  }

  const accum = existing ? bookedAccum(db, a.id) : 0
  const nbv = existing ? nbvOf(db, a) : a.cost
  const sched = useMemo(() => (a.cost > 0 && a.lifeMonths > 0 ? schedule(a) : []), [a])
  const last = existing ? lastDepPeriod(db, a.id) : null

  const moves = useMemo(() => {
    if (!existing) return []
    const r: { date: string; type: string; number: string; to: string; status: keyof typeof docStatusLabel; detail: string }[] = []
    db.depRuns.forEach((d) => d.lines.forEach((l) => l.assetId === a.id && r.push({ date: d.date, type: 'استهلاك', number: d.number, to: `/depreciation/${d.id}`, status: d.status, detail: `${periodLabel(d.period)} — ${money(l.amount)}` })))
    db.transfers.forEach((d) => d.lines.forEach((l) => l.assetId === a.id && r.push({ date: d.date, type: 'نقل', number: d.number, to: `/transfers/${d.id}`, status: d.status, detail: `${L.locName(l.fromLocationId)} ← ${L.locName(l.toLocationId)}` })))
    db.revaluations.forEach((d) => d.lines.forEach((l) => l.assetId === a.id && r.push({ date: d.date, type: 'إعادة تقييم', number: d.number, to: `/revaluations/${d.id}`, status: d.status, detail: `${money(l.oldValue)} → ${money(l.newValue)}` })))
    db.disposals.forEach((d) => d.lines.forEach((l) => l.assetId === a.id && r.push({ date: d.date, type: 'استبعاد', number: d.number, to: `/disposals/${d.id}`, status: d.status, detail: `سعر: ${money(l.price)}` })))
    db.maintenance.forEach((d) => d.assetId === a.id && r.push({ date: d.date, type: 'صيانة', number: d.number, to: `/maintenance/${d.id}`, status: d.status, detail: `${d.vendor} — ${money(d.cost)}` }))
    return r.sort((x, y) => y.date.localeCompare(x.date))
  }, [db, a.id, existing, L])

  const methods: { value: DepMethod; label: string }[] = [
    { value: 'SL', label: methodLabel.SL },
    { value: 'DDB', label: methodLabel.DDB },
  ]
  const err = (f: string) => errors.includes(f)
  const ring = (f: string) => (err(f) ? 'ring-1 ring-red-400 rounded-md' : '')

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'سجل الموجودات', to: '/assets' }, { label: isNew ? 'موجود جديد' : a.code }]}
        title={isNew ? 'موجود جديد' : a.name}
        badge={<Badge tone={assetStatusTone[a.status]}>{assetStatusLabel[a.status]}</Badge>}
        summary={{ label: 'صافي القيمة الدفترية', value: iqd(nbv) }}
        actions={
          <>
            <SaveSplit
              disabled={locked}
              onSave={() => save()}
              items={[{ label: 'حفظ وإنشاء جديد', onClick: () => save('new') }, { label: 'حفظ ونسخ', onClick: () => save('copy') }]}
            />
            {a.status === 'draft' && !isNew && (
              <button type="button" className="btn" onClick={() => setConfirm('activate')}><CheckCircle2 className="h-4 w-4" />تفعيل</button>
            )}
            <button type="button" className="btn" onClick={() => nav('/assets')}>إلغاء</button>
            {!isNew && (
              <Dropdown
                label="إجراءات"
                icon={MoreHorizontal}
                items={[
                  { label: 'نقل الموجود', icon: ArrowLeftRight, onClick: () => nav(`/transfers/new?asset=${a.id}`), disabled: locked || a.status === 'draft' },
                  { label: 'أمر صيانة', icon: Wrench, onClick: () => nav(`/maintenance/new?asset=${a.id}`), disabled: locked },
                  { label: 'إعادة تقييم', icon: TrendingUp, onClick: () => nav(`/revaluations/new?asset=${a.id}`), disabled: locked || a.status === 'draft' },
                  { label: 'استبعاد / بيع', icon: Trash2, onClick: () => nav(`/disposals/new?asset=${a.id}`), disabled: locked || a.status === 'draft' },
                  { label: 'طباعة ملصق باركود', icon: Barcode, onClick: () => setBarcode(true) },
                  { label: 'نسخ البطاقة', icon: Copy, onClick: () => nav('/assets/new', { state: { copy: copyOf(a) } }) },
                  { label: 'حذف', icon: Trash2, danger: true, onClick: () => setConfirm('delete'), disabled: a.status !== 'draft' },
                ]}
              />
            )}
          </>
        }
      />

      {errors.length > 0 && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          الحقول التالية مطلوبة: {errors.join('، ')}
        </div>
      )}
      {locked && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          هذا الموجود {assetStatusLabel[a.status]} ولا يمكن تعديل بياناته.
        </div>
      )}

      <Card className="mb-4">
        <FormGrid>
          <Field label="رمز الموجود"><ReadOnly ltr>{a.code || 'يُولَّد تلقائياً'}</ReadOnly></Field>
          <Field label="اسم الموجود" required span={2}>
            <input className={`inp ${err('اسم الموجود') ? '!border-red-400' : ''}`} value={a.name} disabled={locked} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="الفئة" required>
            <div className={ring('الفئة')}><Select value={a.categoryId} onChange={onCategory} options={L.catOptions} placeholder="اختر الفئة" disabled={locked} /></div>
          </Field>
          <Field label="الحالة"><ReadOnly>{assetStatusLabel[a.status]}</ReadOnly></Field>
        </FormGrid>
      </Card>

      <div className="card">
        <Tabs<Tab>
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'general', label: 'البيانات الأساسية', icon: Info },
            { id: 'value', label: 'القيمة والاستهلاك', icon: TrendingDown },
            { id: 'location', label: 'الموقع والعهدة', icon: MapPin },
            { id: 'tech', label: 'المعلومات الفنية', icon: Wrench },
            { id: 'moves', label: 'الحركات', icon: FileText, count: moves.length },
            { id: 'files', label: 'المرفقات', icon: Paperclip },
            { id: 'history', label: 'السجل', icon: History },
          ]}
        />
        <div className="p-4">
          {tab === 'general' && (
            <FormGrid>
              <Field label="تاريخ الاقتناء" required>
                <input type="date" className="inp" value={a.acquisitionDate} disabled={locked} onChange={(e) => set('acquisitionDate', e.target.value)} />
              </Field>
              <Field label="تاريخ بدء الاستخدام" required>
                <input type="date" className="inp" value={a.inServiceDate} disabled={locked || a.status !== 'draft'} onChange={(e) => set('inServiceDate', e.target.value)} />
              </Field>
              <Field label="المورد"><input className="inp" value={a.supplier} disabled={locked} onChange={(e) => set('supplier', e.target.value)} /></Field>
              <Field label="رقم فاتورة الشراء"><input className="inp" dir="ltr" value={a.invoiceNo} disabled={locked} onChange={(e) => set('invoiceNo', e.target.value)} /></Field>
              <Field label="مركز الكلفة"><ReadOnly>{L.emp(a.custodianId)?.department ?? '—'}</ReadOnly></Field>
              <Field label="ملاحظات" span={5}>
                <textarea className="inp h-20 py-1.5" value={a.notes} disabled={locked} onChange={(e) => set('notes', e.target.value)} />
              </Field>
            </FormGrid>
          )}

          {tab === 'value' && (
            <div className="space-y-4">
              <FormGrid>
                <Field label="تكلفة الاقتناء (IQD)" required>
                  <div className={ring('تكلفة الاقتناء')}><NumInput value={a.cost} disabled={locked || a.status !== 'draft'} onChange={(n) => set('cost', n)} /></div>
                </Field>
                <Field label="القيمة التخريدية"><NumInput value={a.salvage} disabled={locked || a.status !== 'draft'} onChange={(n) => set('salvage', n)} /></Field>
                <Field label="طريقة الاستهلاك" required>
                  <Select value={a.method} onChange={(v) => set('method', v)} options={methods} disabled={locked || a.status !== 'draft'} />
                </Field>
                <Field label="العمر الإنتاجي (شهر)" required>
                  <NumInput value={a.lifeMonths} disabled={locked || a.status !== 'draft'} onChange={(n) => set('lifeMonths', n)} />
                </Field>
                <Field label="القسط الشهري الحالي"><ReadOnly ltr>{money(monthlyDep(a, nbv))}</ReadOnly></Field>
                <Field label="فرق إعادة التقييم"><ReadOnly ltr>{money(a.revaluation)}</ReadOnly></Field>
                <Field label="القيمة الإجمالية"><ReadOnly ltr>{money(grossValue(a))}</ReadOnly></Field>
                <Field label="مجمع الاستهلاك"><ReadOnly ltr>{money(accum)}</ReadOnly></Field>
                <Field label="صافي القيمة الدفترية"><ReadOnly ltr><b>{money(nbv)}</b></ReadOnly></Field>
                <Field label="آخر فترة مستهلكة"><ReadOnly>{last ? periodLabel(last) : a.openingAccum ? 'رصيد افتتاحي' : '—'}</ReadOnly></Field>
              </FormGrid>

              <div className="rounded-md border border-line">
                <div className="flex items-center justify-between border-b border-line px-3 py-2">
                  <span className="text-sm font-semibold">جدول الاستهلاك المتوقع</span>
                  <span className="text-xs text-gray-500">{sched.length} شهر — {methodLabel[a.method]}</span>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  <table className="tbl">
                    <thead className="sticky top-0">
                      <tr><th>#</th><th>الفترة</th><th className="!text-end">القيمة أول المدة</th><th className="!text-end">قسط الاستهلاك</th><th className="!text-end">المجمع</th><th className="!text-end">القيمة آخر المدة</th></tr>
                    </thead>
                    <tbody>
                      {sched.map((r, i) => (
                        <tr key={r.period} className={last && r.period <= last ? 'text-gray-400' : ''}>
                          <td className="text-gray-400">{i + 1}</td>
                          <td>{periodLabel(r.period)}</td>
                          <td className="num">{money(r.opening)}</td>
                          <td className="num">{money(r.dep)}</td>
                          <td className="num">{money(r.accum)}</td>
                          <td className="num">{money(r.closing)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {sched.length === 0 && <Empty text="أدخل التكلفة والعمر الإنتاجي لعرض الجدول" />}
                </div>
              </div>
            </div>
          )}

          {tab === 'location' && (
            <FormGrid>
              <Field label="الموقع" required>
                <div className={ring('الموقع')}><Select value={a.locationId} onChange={(v) => set('locationId', v)} options={L.locOptions} placeholder="اختر الموقع" disabled={locked || (!isNew && a.status !== 'draft')} /></div>
              </Field>
              <Field label="الفرع"><ReadOnly>{L.loc(a.locationId)?.branch ?? '—'}</ReadOnly></Field>
              <Field label="صاحب العهدة" required>
                <div className={ring('صاحب العهدة')}><Select value={a.custodianId} onChange={(v) => set('custodianId', v)} options={L.empOptions} placeholder="اختر الموظف" disabled={locked || (!isNew && a.status !== 'draft')} /></div>
              </Field>
              <Field label="القسم"><ReadOnly>{L.emp(a.custodianId)?.department ?? '—'}</ReadOnly></Field>
              <Field label="نوع الموقع"><ReadOnly>{L.loc(a.locationId)?.type ?? '—'}</ReadOnly></Field>
              {!isNew && a.status !== 'draft' && (
                <div className="md:col-span-5 rounded-md bg-navy-50 px-3 py-2 text-xs text-navy">
                  لتغيير الموقع أو صاحب العهدة لموجود فعّال استخدم <Link className="font-semibold underline" to={`/transfers/new?asset=${a.id}`}>مستند نقل الموجودات</Link>.
                </div>
              )}
            </FormGrid>
          )}

          {tab === 'tech' && (
            <FormGrid>
              <Field label="العلامة التجارية"><input className="inp" dir="ltr" value={a.brand} disabled={locked} onChange={(e) => set('brand', e.target.value)} /></Field>
              <Field label="الموديل"><input className="inp" dir="ltr" value={a.model} disabled={locked} onChange={(e) => set('model', e.target.value)} /></Field>
              <Field label="الرقم التسلسلي"><input className="inp" dir="ltr" value={a.serial} disabled={locked} onChange={(e) => set('serial', e.target.value)} /></Field>
              <Field label="نهاية الضمان"><input type="date" className="inp" value={a.warrantyEnd} disabled={locked} onChange={(e) => set('warrantyEnd', e.target.value)} /></Field>
              <Field label="الباركود"><ReadOnly ltr>{a.code || '—'}</ReadOnly></Field>
            </FormGrid>
          )}

          {tab === 'moves' && (
            moves.length ? (
              <table className="tbl">
                <thead><tr><th>التاريخ</th><th>نوع الحركة</th><th>رقم المستند</th><th>التفاصيل</th><th>الحالة</th></tr></thead>
                <tbody>
                  {moves.map((m, i) => (
                    <tr key={i} className="cursor-pointer" onClick={() => nav(m.to)}>
                      <td dir="ltr" className="text-end">{m.date}</td><td>{m.type}</td>
                      <td className="font-medium text-navy" dir="ltr">{m.number}</td><td>{m.detail}</td>
                      <td><Badge tone={docStatusTone[m.status]}>{docStatusLabel[m.status]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty text="لا توجد حركات على هذا الموجود" />
          )}

          {tab === 'files' && (
            <div className="space-y-3">
              {!isNew && (
                <div className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                  <FileText className="h-5 w-5 text-red-500" />
                  <div className="flex-1"><div className="text-sm font-medium" dir="ltr" style={{ textAlign: 'right' }}>{a.invoiceNo}.pdf</div><div className="text-xs text-gray-500">فاتورة الشراء — 240 KB</div></div>
                </div>
              )}
              <button type="button" className="flex w-full flex-col items-center gap-1 rounded-md border-2 border-dashed border-line py-6 text-sm text-gray-500 hover:bg-gray-50" onClick={() => toast('تم رفع المرفق (محاكاة)')}>
                <Upload className="h-5 w-5" />اسحب الملفات هنا أو انقر للرفع
              </button>
            </div>
          )}

          {tab === 'history' && (
            a.history.length ? (
              <ol className="relative space-y-4 border-s border-line ps-5">
                {[...a.history].reverse().map((h, i) => (
                  <li key={i}>
                    <span className="absolute -start-1.5 mt-1 h-3 w-3 rounded-full border-2 border-white bg-navy" />
                    <div className="text-sm">{h.action} {h.ref && <span className="text-navy" dir="ltr">({h.ref})</span>}</div>
                    <div className="text-xs text-gray-500" dir="ltr" style={{ textAlign: 'right' }}>{h.date} · {h.user}</div>
                  </li>
                ))}
              </ol>
            ) : <Empty text="لا يوجد سجل بعد" />
          )}
        </div>
      </div>

      {confirm === 'delete' && <Confirm danger title="حذف الموجود" text={`هل تريد حذف ${a.name}؟ لا يمكن التراجع.`} onYes={remove} onClose={() => setConfirm(null)} />}
      {confirm === 'activate' && <Confirm title="تفعيل الموجود" text="سيتم تثبيت التكلفة والعمر الإنتاجي وبدء احتساب الاستهلاك. هل تريد المتابعة؟" onYes={activate} onClose={() => setConfirm(null)} />}
      {barcode && (
        <Modal title="ملصق الباركود" onClose={() => setBarcode(false)} footer={<button type="button" className="btn btn-primary" onClick={() => { toast('تم إرسال الملصق للطابعة (محاكاة)'); setBarcode(false) }}>طباعة</button>}>
          <div className="mx-auto w-72 rounded-md border border-gray-300 p-3 text-center">
            <div className="text-xs font-semibold">{db.settings.company}</div>
            <div className="my-2 flex h-14 items-end justify-center gap-[2px]">
              {a.code.split('').flatMap((ch, i) => [ch.charCodeAt(0) % 3 + 1, (i % 2) + 1]).map((w, i) => (
                <span key={i} className={i % 2 ? 'bg-white' : 'bg-black'} style={{ width: w * 1.5, height: '100%' }} />
              ))}
            </div>
            <div className="text-sm font-bold" dir="ltr">{a.code}</div>
            <div className="text-xs text-gray-600">{a.name}</div>
          </div>
        </Modal>
      )}
    </div>
  )
}

