import {
  ArrowLeftRight, Barcode, CheckCircle2, CirclePause, CirclePlay, Clock3, FileText, History, Info, MapPin, MoreHorizontal,
  Paperclip, Trash2, TrendingDown, TrendingUp, Upload, Wallet,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { TxModal, txSummary } from '../components/Shared'
import { Badge, Card, Confirm, Dropdown, Empty, Field, FormGrid, Modal, NumInput, ReadOnly, SaveSplit, Select, Tabs } from '../components/ui'
import { accumOf, bookValue, depBase, generateSchedule, MPP } from '../data/calc'
import { iqd, methodLabel, money, periodicityLabel, prorataLabel, stateLabel, stateTone, txLabel, txTone } from '../data/format'
import { canDelete, capitalize, dispose, nextAssetCode, nextNo, pause, resume, revalue, sell, TODAY, transfer } from '../data/lifecycle'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { Asset, AssetTx, DepLine, DepMethod, Periodicity, Prorata } from '../data/types'

type Tab = 'general' | 'dep' | 'location' | 'events' | 'files'
type Action = 'capitalize' | 'pause' | 'resume' | 'revalue' | 'transfer' | 'sell' | 'dispose' | 'life' | 'delete' | 'tag'

const blank = (): Asset => ({
  id: '', code: '', name: '', description: '', classId: '', groupId: '', locationId: '', custodianId: '', serial: '', tagNumber: '',
  partnerId: '', sourceDocRef: '', acquisitionDate: TODAY, depStartDate: TODAY, originalValue: 0, salvage: 0, lifeMonths: 60,
  method: 'SL', periodicity: 'M', prorata: 'NONE', decliningFactor: null, state: 'draft', isLegacy: false, importedAccum: 0,
  revaluationAdj: 0, costCenterId: '', project: '',
})

export default function AssetForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const { db, run, toast, can } = useStore()
  const L = useLookups()
  const existing = db.assets.find((a) => a.id === id)
  const isNew = !existing
  const [a, setA] = useState<Asset>(() => (existing ? structuredClone(existing) : blank()))
  const [tab, setTab] = useState<Tab>('general')
  const [errors, setErrors] = useState<string[]>([])
  const [action, setAction] = useState<Action | null>(null)
  const [openTx, setOpenTx] = useState<AssetTx | null>(null)

  // Lifecycle actions change the stored asset; refresh the local copy from it.
  useEffect(() => {
    if (existing && existing.state !== 'draft') setA(structuredClone(existing))
  }, [existing])

  const draft = a.state === 'draft'
  const closedOut = a.state === 'sold' || a.state === 'disposed'
  const editable = draft && can(isNew ? 'create' : 'update')
  const c = L.cls(a.classId)
  const set = <K extends keyof Asset>(k: K, v: Asset[K]) => setA((p) => ({ ...p, [k]: v }))

  // Class settings are copied (not referenced) onto the asset — plan §3.5.
  const onClass = (cid: string) => {
    const k = L.cls(cid)
    if (!k) return
    setA((p) => ({ ...p, classId: cid, method: k.method, lifeMonths: k.lifeMonths, periodicity: k.periodicity, prorata: k.prorata, decliningFactor: k.decliningFactor }))
  }

  const validate = () => {
    const e: string[] = []
    if (!a.name.trim()) e.push('اسم الأصل')
    if (!a.classId) e.push('الفئة')
    if (!a.locationId) e.push('الموقع')
    if (!a.custodianId) e.push('صاحب العهدة')
    if (!a.costCenterId) e.push('مركز الكلفة')
    if (!a.acquisitionDate) e.push('تاريخ الاقتناء')
    if (!a.depStartDate) e.push('تاريخ بدء الإهلاك')
    if (a.originalValue <= 0) e.push('القيمة الأصلية')
    setErrors(e)
    if (e.length) { toast('يرجى إكمال الحقول الإلزامية', 'err'); return false }
    if (a.salvage >= a.originalValue) { toast('القيمة التخريدية يجب أن تكون أقل من القيمة الأصلية', 'err'); return false }
    if (c?.isDepreciable && a.method !== 'NONE' && a.lifeMonths <= 0) { toast('العمر الإنتاجي مطلوب', 'err'); return false }
    if (a.tagNumber && db.assets.some((x) => x.id !== a.id && x.tagNumber === a.tagNumber)) { toast('رقم الملصق مستخدم لأصل آخر', 'err'); return false }
    return true
  }

  const save = (thenNew = false) => {
    if (draft && !validate()) return
    let savedId = a.id
    const ok = run((d) => {
      if (isNew) {
        savedId = `a${d.assets.length + 1}-${Math.random().toString(36).slice(2, 5)}`
        d.assets.push({ ...a, id: savedId, code: nextAssetCode(d) })
      } else {
        const i = d.assets.findIndex((x) => x.id === a.id)
        // After capitalization only descriptive fields are editable.
        d.assets[i] = draft ? a : { ...d.assets[i], description: a.description, serial: a.serial, tagNumber: a.tagNumber, project: a.project }
      }
    }, isNew ? 'تم إنشاء الأصل بحالة مسودة' : 'تم حفظ التعديلات')
    if (!ok) return
    if (thenNew) { setA(blank()); setErrors([]); if (!isNew) nav('/assets/new') }
    else if (isNew) nav(`/assets/${savedId}`, { replace: true })
  }

  const accum = existing ? accumOf(db, a) : a.importedAccum
  const nbv = existing ? bookValue(db, a) : a.originalValue - a.importedAccum
  const txs = db.txs.filter((t) => t.assetId === a.id).sort((x, y) => y.date.localeCompare(x.date) || y.number.localeCompare(x.number))

  // Depreciation board: real lines once capitalized, otherwise a preview computed on a scratch copy.
  const board: DepLine[] = useMemo(() => {
    if (!draft) return db.lines.filter((l) => l.assetId === a.id).sort((x, y) => x.seq - y.seq)
    const k = db.classes.find((x) => x.id === a.classId)
    if (!k || a.originalValue <= 0) return []
    return generateSchedule({ ...db, lines: [] }, a, k)
  }, [db, a, draft])
  const runNo = (rid: string | null) => db.runs.find((r) => r.id === rid)?.number

  const err = (f: string) => (errors.includes(f) ? 'ring-1 ring-red-400 rounded-md' : '')
  const active = a.state === 'running' || a.state === 'paused'
  const methods = (Object.keys(methodLabel) as DepMethod[]).map((k) => ({ value: k, label: methodLabel[k] }))

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'سجل الأصول', to: '/assets' }, { label: isNew ? 'أصل جديد' : a.code }]}
        title={isNew ? 'أصل جديد' : a.name}
        badge={<><Badge tone={stateTone[a.state]}>{stateLabel[a.state]}</Badge>{a.isLegacy && <Badge tone="gray">مستورد (Legacy)</Badge>}</>}
        summary={{ label: 'القيمة الدفترية', value: iqd(nbv) }}
        actions={
          <>
            <SaveSplit
              disabled={!can(isNew ? 'create' : 'update') || closedOut}
              onSave={() => save()}
              items={[{ label: 'حفظ وإنشاء جديد', onClick: () => save(true) }]}
            />
            {draft && !isNew && can('post') && (
              <button type="button" className="btn" onClick={() => setAction('capitalize')}><CheckCircle2 className="h-4 w-4" />رسملة</button>
            )}
            <button type="button" className="btn" onClick={() => nav('/assets')}>إلغاء</button>
            {!isNew && (
              <Dropdown
                label="إجراءات"
                icon={MoreHorizontal}
                items={[
                  { label: 'إيقاف الإهلاك', icon: CirclePause, onClick: () => setAction('pause'), disabled: a.state !== 'running' || !can('post') },
                  { label: 'استئناف الإهلاك', icon: CirclePlay, onClick: () => setAction('resume'), disabled: a.state !== 'paused' || !can('post') },
                  { label: 'إعادة تقييم', icon: TrendingUp, onClick: () => setAction('revalue'), disabled: !active || !can('post') },
                  { label: 'تعديل العمر الإنتاجي', icon: Clock3, onClick: () => setAction('life'), disabled: !active || !can('post') || !c?.isDepreciable },
                  { label: 'نقل (موقع / عهدة / مركز كلفة)', icon: ArrowLeftRight, onClick: () => setAction('transfer'), disabled: !active || !can('update') },
                  { label: 'بيع', icon: Wallet, onClick: () => setAction('sell'), disabled: !active || !can('post') },
                  { label: 'استبعاد بلا مقابل', icon: Trash2, onClick: () => setAction('dispose'), disabled: !(active || a.state === 'closed') || !can('post') },
                  { label: 'طباعة ملصق الأصل', icon: Barcode, onClick: () => setAction('tag') },
                  { label: 'حذف', icon: Trash2, danger: true, onClick: () => setAction('delete'), disabled: !!canDelete(db, a) || !can('delete') },
                ]}
              />
            )}
          </>
        }
      />

      {errors.length > 0 && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">الحقول التالية مطلوبة: {errors.join('، ')}</div>}
      {!draft && (
        <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
          {closedOut
            ? `هذا الأصل ${stateLabel[a.state]} — السجل للقراءة فقط.`
            : 'بعد الرسملة لا تُعدَّل القيمة أو إعدادات الإهلاك مباشرة؛ استخدم «إجراءات» (إعادة تقييم، نقل، تعديل العمر...) ليُسجَّل الحدث ويُعاد توليد الأقساط غير المُرحّلة فقط.'}
        </div>
      )}

      <Card className="mb-4">
        <FormGrid>
          <Field label="رمز الأصل"><ReadOnly ltr>{a.code || 'يُولَّد عند الحفظ (FA)'}</ReadOnly></Field>
          <Field label="اسم الأصل" required span={2}>
            <input className={`inp ${errors.includes('اسم الأصل') ? '!border-red-400' : ''}`} value={a.name} disabled={!editable} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="الفئة" required>
            <div className={err('الفئة')}><Select value={a.classId} onChange={onClass} options={L.clsOptions} placeholder="اختر الفئة" disabled={!editable} /></div>
          </Field>
          <Field label="المجموعة"><Select value={a.groupId} onChange={(v) => set('groupId', v)} options={L.groupOptions} placeholder="—" disabled={!editable} /></Field>
        </FormGrid>
      </Card>

      <div className="card">
        <Tabs<Tab>
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'general', label: 'البيانات الأساسية', icon: Info },
            { id: 'dep', label: 'القيمة وجدول الإهلاك', icon: TrendingDown, count: board.length || undefined },
            { id: 'location', label: 'الموقع والعهدة', icon: MapPin },
            { id: 'events', label: 'سجل الأحداث', icon: History, count: txs.length },
            { id: 'files', label: 'المرفقات', icon: Paperclip },
          ]}
        />
        <div className="p-4">
          {tab === 'general' && (
            <FormGrid>
              <Field label="تاريخ الاقتناء" required>
                <input type="date" className={`inp ${err('تاريخ الاقتناء')}`} value={a.acquisitionDate} disabled={!editable} onChange={(e) => set('acquisitionDate', e.target.value)} />
              </Field>
              <Field label="تاريخ بدء الإهلاك (دخول الخدمة)" required>
                <input type="date" className={`inp ${err('تاريخ بدء الإهلاك')}`} value={a.depStartDate} disabled={!editable} onChange={(e) => set('depStartDate', e.target.value)} />
              </Field>
              <Field label="المورّد"><Select value={a.partnerId} onChange={(v) => set('partnerId', v)} options={L.partnerOptions} placeholder="—" disabled={!editable} /></Field>
              <Field label="مرجع وثيقة الشراء" hint="مع فاتورة مشتريات مُرحّلة لا يُنشأ قيد رسملة">
                <input className="inp" dir="ltr" placeholder="PB-2026-0000" value={a.sourceDocRef} disabled={!editable} onChange={(e) => set('sourceDocRef', e.target.value)} />
              </Field>
              <Field label="المشروع"><input className="inp" value={a.project} disabled={closedOut} onChange={(e) => set('project', e.target.value)} /></Field>
              <Field label="الرقم التسلسلي"><input className="inp" dir="ltr" value={a.serial} disabled={closedOut} onChange={(e) => set('serial', e.target.value)} /></Field>
              <Field label="رقم الملصق (Tag)" hint="فريد إن أُدخل"><input className="inp" dir="ltr" value={a.tagNumber} disabled={closedOut} onChange={(e) => set('tagNumber', e.target.value)} /></Field>
              <Field label="العملة"><ReadOnly>IQD — عملة النظام</ReadOnly></Field>
              <Field label="الوصف" span={2}>
                <input className="inp" value={a.description} disabled={closedOut} onChange={(e) => set('description', e.target.value)} />
              </Field>
            </FormGrid>
          )}

          {tab === 'dep' && (
            <div className="space-y-4">
              <FormGrid>
                <Field label="القيمة الأصلية (IQD)" required>
                  <div className={err('القيمة الأصلية')}><NumInput value={a.originalValue} disabled={!editable} onChange={(n) => set('originalValue', n)} /></div>
                </Field>
                <Field label="القيمة التخريدية"><NumInput value={a.salvage} disabled={!editable} onChange={(n) => set('salvage', n)} /></Field>
                <Field label="قاعدة الإهلاك" hint="القيمة الأصلية − التخريدية"><ReadOnly ltr>{money(depBase(a))}</ReadOnly></Field>
                <Field label="طريقة الإهلاك" hint="مُورَّثة من الفئة وقابلة للتجاوز">
                  <Select value={a.method} onChange={(v) => set('method', v)} options={methods} disabled={!editable || !c?.isDepreciable} />
                </Field>
                <Field label={a.isLegacy ? 'العمر المتبقي (شهر)' : 'العمر الإنتاجي (شهر)'} required>
                  <NumInput value={a.lifeMonths} disabled={!editable || !c?.isDepreciable} onChange={(n) => set('lifeMonths', n)} />
                </Field>
                <Field label="الدورية">
                  <Select<Periodicity> value={a.periodicity} onChange={(v) => set('periodicity', v)} options={(Object.keys(periodicityLabel) as Periodicity[]).map((k) => ({ value: k, label: periodicityLabel[k] }))} disabled={!editable || !c?.isDepreciable} />
                </Field>
                <Field label="التحاصص للقسط الأول">
                  <Select<Prorata> value={a.prorata} onChange={(v) => set('prorata', v)} options={(Object.keys(prorataLabel) as Prorata[]).map((k) => ({ value: k, label: prorataLabel[k] }))} disabled={!editable || !c?.isDepreciable} />
                </Field>
                {(a.method === 'DB' || a.method === 'DBSL') && (
                  <Field label="معامل التناقص"><NumInput value={a.decliningFactor ?? 2} disabled={!editable} onChange={(n) => set('decliningFactor', n)} /></Field>
                )}
                <Field label="أصل مستورد (رصيد افتتاحي)">
                  <label className="flex h-8 items-center gap-2 text-sm">
                    <input type="checkbox" checked={a.isLegacy} disabled={!editable} onChange={(e) => set('isLegacy', e.target.checked)} />
                    مستورد من النظام السابق
                  </label>
                </Field>
                {a.isLegacy && <Field label="الإهلاك المستورد"><NumInput value={a.importedAccum} disabled={!editable} onChange={(n) => set('importedAccum', n)} /></Field>}
                <Field label="تعديلات إعادة التقييم"><ReadOnly ltr>{money(a.revaluationAdj)}</ReadOnly></Field>
                <Field label="مجمّع الاندثار"><ReadOnly ltr>{money(accum)}</ReadOnly></Field>
                <Field label="القيمة الدفترية"><ReadOnly ltr><b>{money(nbv)}</b></ReadOnly></Field>
              </FormGrid>
              {c && !c.isDepreciable && <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">فئة «{c.name}» غير قابلة للإهلاك — الجدول فارغ والقيمة الدفترية تساوي القيمة الأصلية إلا بإعادة تقييم.</div>}

              <div className="rounded-md border border-line">
                <div className="flex items-center justify-between border-b border-line px-3 py-2">
                  <span className="text-sm font-semibold">جدول الإهلاك {draft && <span className="ms-1 text-xs font-normal text-amber-600">(معاينة — يُولَّد فعلياً عند الرسملة)</span>}</span>
                  <span className="text-xs text-gray-500">
                    {board.length} قسط — {methodLabel[a.method]} — {periodicityLabel[a.periodicity]} · مُرحّل {board.filter((l) => l.isPosted).length}
                  </span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="tbl">
                    <thead className="sticky top-0">
                      <tr><th>#</th><th>تاريخ القسط</th><th className="!text-end">القسط</th><th className="!text-end">المجمّع</th><th className="!text-end">المتبقي للإهلاك</th><th>الحالة</th><th>الدورة</th></tr>
                    </thead>
                    <tbody>
                      {board.map((l) => (
                        <tr key={l.id} className={l.isPosted ? 'bg-emerald-50/40' : ''}>
                          <td className="text-gray-400">{l.seq}</td>
                          <td dir="ltr" className="text-end">{l.date}{l.days ? <span className="ms-1 text-[11px] text-gray-400">({l.days} يوم)</span> : null}</td>
                          <td className="num">{money(l.amount)}</td>
                          <td className="num">{money(l.accum)}</td>
                          <td className="num">{money(l.remaining)}</td>
                          <td>{l.isPosted ? <Badge tone="green">مُرحّل</Badge> : <Badge tone="gray">مخطَّط</Badge>}</td>
                          <td dir="ltr" className="text-end text-navy">{l.runId && <Link to={`/runs/${l.runId}`}>{runNo(l.runId)}</Link>}</td>
                        </tr>
                      ))}
                    </tbody>
                    {board.length > 0 && (
                      <tfoot><tr><td colSpan={2}>المجموع:</td><td className="num">{money(board.reduce((s, l) => s + l.amount, 0))}</td><td colSpan={4} /></tr></tfoot>
                    )}
                  </table>
                  {board.length === 0 && <Empty text={c?.isDepreciable === false ? 'لا أقساط — فئة غير قابلة للإهلاك' : closedOut ? 'أُلغيت الأقساط غير المُرحّلة عند الإغلاق' : 'أدخل الفئة والقيمة الأصلية لعرض الجدول'} />}
                </div>
              </div>
            </div>
          )}

          {tab === 'location' && (
            <FormGrid>
              <Field label="الموقع" required>
                <div className={err('الموقع')}><Select value={a.locationId} onChange={(v) => set('locationId', v)} options={L.locOptions} placeholder="اختر الموقع" disabled={!editable} /></div>
              </Field>
              <Field label="صاحب العهدة" required>
                <div className={err('صاحب العهدة')}><Select value={a.custodianId} onChange={(v) => set('custodianId', v)} options={L.empOptions} placeholder="اختر الموظف" disabled={!editable} /></div>
              </Field>
              <Field label="القسم"><ReadOnly>{L.emp(a.custodianId)?.department ?? '—'}</ReadOnly></Field>
              <Field label="مركز الكلفة" required hint="يُمرَّر إلى سطر قيد الإهلاك">
                <div className={err('مركز الكلفة')}><Select value={a.costCenterId} onChange={(v) => set('costCenterId', v)} options={L.ccOptions} placeholder="اختر" disabled={!editable} /></div>
              </Field>
              <Field label="المسار"><ReadOnly>{L.locPath(a.locationId)}</ReadOnly></Field>
              {!draft && active && (
                <div className="rounded-md bg-navy-50 px-3 py-2 text-xs text-navy md:col-span-5">
                  لتغيير الموقع أو العهدة أو مركز الكلفة استخدم الإجراء <button type="button" className="font-semibold underline" onClick={() => setAction('transfer')}>نقل</button> ليُسجَّل في سجل الأحداث.
                </div>
              )}
            </FormGrid>
          )}

          {tab === 'events' && (
            txs.length ? (
              <ol className="relative space-y-3 border-s border-line ps-5">
                {txs.map((t) => (
                  <li key={t.id} className="relative cursor-pointer rounded-md p-1.5 hover:bg-gray-50" onClick={() => setOpenTx(t)}>
                    <span className="absolute -start-[27px] top-3 h-3 w-3 rounded-full border-2 border-white bg-navy" />
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge tone={txTone[t.type]}>{txLabel[t.type]}</Badge>
                      <span className="font-medium text-navy" dir="ltr">{t.number}</span>
                      {t.journal.length > 0 && <span className="flex items-center gap-1 text-[11px] text-gray-500"><FileText className="h-3 w-3" />قيد</span>}
                    </div>
                    <div className="mt-0.5 text-sm text-gray-700">{txSummary(t, L) || t.notes}</div>
                    <div className="text-xs text-gray-400" dir="ltr" style={{ textAlign: 'right' }}>{t.date} · {t.user}</div>
                  </li>
                ))}
              </ol>
            ) : <Empty text="لا توجد أحداث بعد — تُسجَّل الأحداث بدءاً من الرسملة" />
          )}

          {tab === 'files' && (
            <div className="space-y-3">
              {a.sourceDocRef && (
                <div className="flex items-center gap-3 rounded-md border border-line px-3 py-2">
                  <FileText className="h-5 w-5 text-red-500" />
                  <div className="flex-1"><div className="text-sm font-medium" dir="ltr" style={{ textAlign: 'right' }}>{a.sourceDocRef}.pdf</div><div className="text-xs text-gray-500">فاتورة المشتريات — 240 KB</div></div>
                </div>
              )}
              <button type="button" className="flex w-full flex-col items-center gap-1 rounded-md border-2 border-dashed border-line py-6 text-sm text-gray-500 hover:bg-gray-50" onClick={() => toast('تم رفع المرفق (محاكاة)')}>
                <Upload className="h-5 w-5" />اسحب الملفات هنا أو انقر للرفع
              </button>
            </div>
          )}
        </div>
      </div>

      {action && action !== 'delete' && action !== 'tag' && <ActionModal kind={action} asset={a} onClose={() => setAction(null)} />}
      {action === 'delete' && (
        <Confirm danger title="حذف الأصل" text={`هل تريد حذف ${a.name}؟`} onClose={() => setAction(null)}
          onYes={() => { if (run((d) => { const e = canDelete(d, a); if (e) return e; d.assets = d.assets.filter((x) => x.id !== a.id) }, 'تم حذف الأصل')) nav('/assets') }} />
      )}
      {action === 'tag' && (
        <Modal title="ملصق الأصل" onClose={() => setAction(null)} footer={<button type="button" className="btn btn-primary" onClick={() => { toast('تم إرسال الملصق للطابعة (محاكاة)'); setAction(null) }}>طباعة</button>}>
          <div className="mx-auto w-72 rounded-md border border-gray-300 p-3 text-center">
            <div className="text-xs font-semibold">شركة إنكي للتجارة العامة</div>
            <div className="my-2 flex h-14 items-end justify-center gap-[2px]">
              {(a.tagNumber || a.code).split('').flatMap((ch, i) => [(ch.charCodeAt(0) % 3) + 1, (i % 2) + 1]).map((w, i) => (
                <span key={i} className={i % 2 ? 'bg-white' : 'bg-black'} style={{ width: w * 1.5, height: '100%' }} />
              ))}
            </div>
            <div className="text-sm font-bold" dir="ltr">{a.tagNumber || a.code}</div>
            <div className="text-xs text-gray-600">{a.code} — {a.name}</div>
          </div>
        </Modal>
      )}
      {openTx && <TxModal tx={openTx} onClose={() => setOpenTx(null)} />}
    </div>
  )
}

function ActionModal({ kind, asset: a, onClose }: { kind: Exclude<Action, 'delete' | 'tag'>; asset: Asset; onClose: () => void }) {
  const { db, run } = useStore()
  const L = useLookups()
  const [date, setDate] = useState(TODAY)
  const [notes, setNotes] = useState('')
  const [value, setValue] = useState(() => (kind === 'life' ? a.lifeMonths : kind === 'revalue' ? bookValue(db, a) : 0))
  const [party, setParty] = useState('')
  const [to, setTo] = useState({ locationId: a.locationId, custodianId: a.custodianId, costCenterId: a.costCenterId })
  const nbv = bookValue(db, a)
  const posted = db.lines.filter((l) => l.assetId === a.id && l.isPosted).length

  const titles: Record<typeof kind, string> = {
    capitalize: 'رسملة الأصل', pause: 'إيقاف الإهلاك', resume: 'استئناف الإهلاك', revalue: 'إعادة تقييم', transfer: 'نقل الأصل',
    sell: 'بيع الأصل', dispose: 'استبعاد بلا مقابل', life: 'تعديل العمر الإنتاجي',
  }
  const submit = () => {
    const ok = run((d) => {
      switch (kind) {
        case 'capitalize': return capitalize(d, a.id, date)
        case 'pause': return pause(d, a.id, date, notes)
        case 'resume': return resume(d, a.id, date, notes)
        case 'revalue': return revalue(d, a.id, date, value, notes)
        case 'transfer': return transfer(d, a.id, date, to, notes)
        case 'sell': return sell(d, a.id, date, value, party, notes)
        case 'dispose': return dispose(d, a.id, date, notes)
        case 'life': {
          const x = d.assets.find((y) => y.id === a.id)!
          if (Math.round(value / MPP[x.periodicity]) <= d.lines.filter((l) => l.assetId === a.id && l.isPosted).length) return 'العمر الجديد لا يتجاوز عدد الأقساط المُرحّلة'
          const old = x.lifeMonths
          x.lifeMonths = value
          generateSchedule(d, x, d.classes.find((k) => k.id === x.classId)!)
          d.txs.push({
            id: `tx-adj-${Date.now()}`, number: nextNo('AAJ', d.txs.map((t) => t.number)),
            assetId: a.id, type: 'adjustment', date, amount: 0, fromValue: old, toValue: value, journal: [], user: 'superadmin',
            notes: `تعديل العمر الإنتاجي من ${old} إلى ${value} شهراً — أُعيد توليد الأقساط غير المُرحّلة فقط${notes ? ` — ${notes}` : ''}`,
          })
          return null
        }
      }
    }, `تم تنفيذ: ${titles[kind]}`)
    if (ok) onClose()
  }

  const gain = value - nbv
  return (
    <Modal
      title={`${titles[kind]} — ${a.code}`}
      onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>إلغاء</button><button type="button" className="btn btn-primary" onClick={submit}>تنفيذ</button></>}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="تاريخ العملية" required><input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="القيمة الدفترية الحالية"><ReadOnly ltr>{money(nbv)}</ReadOnly></Field>
        {kind === 'capitalize' && (
          <div className="col-span-2 space-y-1 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
            <div>• يتحوّل الأصل إلى «قيد الإهلاك» ويُولَّد جدول الإهلاك ({methodLabel[a.method]}، {a.lifeMonths} شهراً، {periodicityLabel[a.periodicity]}).</div>
            <div>• {a.sourceDocRef ? `مرتبط بفاتورة المشتريات ${a.sourceDocRef} — لا يُنشأ قيد رسملة إضافي.` : 'لا توجد وثيقة شراء — يُنشأ قيد رسملة: مدين حساب الأصل / دائن الموردون.'}</div>
            <div>• يُتحقَّق من اكتمال حسابات الفئة وقابليتها للترحيل.</div>
          </div>
        )}
        {kind === 'revalue' && (
          <>
            <Field label="القيمة الجديدة (العادلة)" required><NumInput value={value} onChange={setValue} /></Field>
            <Field label="الفرق"><ReadOnly ltr><span className={value - nbv < 0 ? 'text-red-600' : 'text-emerald-700'}>{money(value - nbv)}</span></ReadOnly></Field>
            <div className="col-span-2 text-xs text-gray-500">الزيادة: مدين حساب الأصل / دائن فائض إعادة التقييم · النقص: مدين خسائر الاستبعاد / دائن حساب الأصل. تُعاد حسبة الأقساط غير المُرحّلة فقط ({posted} قسطاً مُرحّلاً لن يتغيّر).</div>
          </>
        )}
        {kind === 'life' && (
          <>
            <Field label="العمر الإنتاجي الجديد (شهر)" required><NumInput value={value} onChange={setValue} /></Field>
            <Field label="الأقساط المُرحّلة"><ReadOnly ltr>{posted}</ReadOnly></Field>
          </>
        )}
        {kind === 'transfer' && (
          <>
            <Field label="الموقع الجديد" required><Select value={to.locationId} onChange={(v) => setTo({ ...to, locationId: v })} options={L.locOptions} /></Field>
            <Field label="صاحب العهدة الجديد" required><Select value={to.custodianId} onChange={(v) => setTo({ ...to, custodianId: v })} options={L.empOptions} /></Field>
            <Field label="مركز الكلفة" required><Select value={to.costCenterId} onChange={(v) => setTo({ ...to, costCenterId: v })} options={L.ccOptions} /></Field>
            <div className="text-xs text-gray-500">نقل الموقع أو العهدة بلا قيد. تغيير مركز الكلفة يُطبَّق على أقساط الفترة التالية.</div>
          </>
        )}
        {kind === 'sell' && (
          <>
            <Field label="المشتري" required><input className="inp" value={party} onChange={(e) => setParty(e.target.value)} /></Field>
            <Field label="سعر البيع" required><NumInput value={value} onChange={setValue} /></Field>
            <Field label={gain >= 0 ? 'ربح البيع' : 'خسارة البيع'}><ReadOnly ltr><span className={gain < 0 ? 'text-red-600' : 'text-emerald-700'}>{money(Math.abs(gain))}</span></ReadOnly></Field>
          </>
        )}
        {(kind === 'sell' || kind === 'dispose') && (
          <div className="col-span-2 text-xs text-amber-700">تُلغى كل أقساط الإهلاك غير المُرحّلة ويُنشأ قيد الإغلاق.</div>
        )}
        {kind !== 'capitalize' && (
          <Field label="ملاحظات" span={2}><input className="inp" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
        )}
      </div>
    </Modal>
  )
}
