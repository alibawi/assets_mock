import {
  ArrowLeftRight, Ban, Barcode, BookOpenCheck, CheckCircle2, CirclePause, CirclePlay, Clock3, FileText, History, Info, Landmark, MapPin,
  MinusCircle, MoreHorizontal, Paperclip, PenLine, Plus, PlusCircle, Trash2, TrendingDown, TrendingUp, Undo2, Upload, Wallet, Wrench,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { sourceLink, TxModal } from '../components/Shared'
import { Badge, Card, Confirm, Dropdown, Empty, Field, FormGrid, Modal, NumInput, ReadOnly, SaveSplit, Select, Tabs } from '../components/ui'
import { assetLedger } from '../data/asof'
import { accumOf, bookValue, depBase, generateSchedule, lifeError, monthsIncl, MPP, periodEndOf, remainingDepreciable } from '../data/calc'
import {
  accumWord, depWord, iqd, kindLabel, maintStatusLabel, maintStatusTone, maintTypeLabel, methodLabel, money, periodicityLabel, prorataLabel, stateLabel,
  stateTone, txLabel,
} from '../data/format'
import { createSaleInvoiceForAsset } from '../data/documents'
import { cancelAsset, canDelete, capitalize, changeLife, lowValueError, nextAssetCode, pause, resume, TODAY, undoCapitalization } from '../data/lifecycle'
import { TxTable } from './Transactions'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { Asset, AssetTx, DB, DepLine, DepMethod, Periodicity, Prorata } from '../data/types'

type Tab = 'general' | 'dep' | 'location' | 'ledger' | 'maint' | 'events' | 'files'
// Capitalize, pause, resume and the adjustment (life change) stay dialogs on the card; every other transaction is a
// document page (§8, decisions a–e) and the sale goes through a sales invoice (§5.6.9).
type Action = 'capitalize' | 'cancel' | 'undo' | 'pause' | 'resume' | 'life' | 'delete' | 'tag'

const blank = (): Asset => ({
  id: '', code: '', name: '', description: '', classId: '', groupId: '', locationId: '', custodianId: '', serial: '', tagNumber: '',
  partnerId: '', sourceDocRef: '', sourceDocLine: '', sourceLineSeq: null, acquisitionDate: TODAY, depStartDate: TODAY, originalValue: 0,
  salvage: 0, lifeMonths: 60, method: 'SL', periodicity: 'M', prorata: 'NONE', decliningFactor: null, capitalizationDate: null, state: 'draft',
  isLegacy: false, importedAccum: 0, importCutoffDate: null, remainingLifeAtImport: null, revaluationAdj: 0, costCenterId: '', project: '',
})

const lineType: Record<DepLine['type'], string> = { depreciation: 'قسط', manual: 'يدوي', toDate: 'حتى تاريخ الإخراج' }

/** Draft validation incl. §3.5 legacy rules and §5.1.1 life rule. */
function draftErrors(db: DB, a: Asset): string | null {
  const c = db.classes.find((x) => x.id === a.classId)
  if (a.salvage >= a.originalValue) return 'القيمة التخريدية يجب أن تكون أقل من القيمة الأصلية'
  if (c && c.isDepreciable && c.kind !== 'lowValue') {
    const le = lifeError(a.lifeMonths, a.periodicity)
    if (le) return le
  }
  const lv = lowValueError(db, a)
  if (lv) return lv
  if (a.tagNumber && db.assets.some((x) => x.id !== a.id && x.tagNumber === a.tagNumber)) return 'رقم الملصق مستخدم لأصل آخر'
  if (a.isLegacy) {
    if (!a.importCutoffDate) return 'تاريخ قطع الاستيراد مطلوب للأصل المستورد'
    if (periodEndOf(a.importCutoffDate, a.periodicity, db.settings.fiscalStartMonth) !== a.importCutoffDate) return 'تاريخ قطع الاستيراد يجب أن يكون نهاية فترة'
    if (a.remainingLifeAtImport === null || a.remainingLifeAtImport < 0) return 'العمر المتبقي عند الاستيراد إلزامي'
    if (a.remainingLifeAtImport % MPP[a.periodicity] !== 0) return 'العمر المتبقي يجب أن يكون من مضاعفات أشهر الفترة'
    if (a.importedAccum > depBase(a)) return 'الإهلاك المستورد أكبر من قاعدة الإهلاك'
    if (c?.isDepreciable && a.remainingLifeAtImport === 0 && a.originalValue - a.importedAccum > a.salvage) return 'عمر متبقٍّ 0 بينما القيمة الدفترية أعلى من التخريدية'
  }
  return null
}

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

  // Actions change the stored asset; refresh the local copy from it.
  useEffect(() => {
    if (existing && existing.state !== 'draft') setA(structuredClone(existing))
    if (existing && existing.state === 'draft' && a.state !== 'draft') setA(structuredClone(existing))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing])

  const draft = a.state === 'draft'
  const final = a.state === 'sold' || a.state === 'disposed' || a.state === 'cancelled'
  const editable = draft && can(isNew ? 'create' : 'update')
  const c = L.cls(a.classId)
  const dep = depWord(c?.kind)
  const set = <K extends keyof Asset>(k: K, v: Asset[K]) => setA((p) => ({ ...p, [k]: v }))

  // Class settings are copied (not referenced) onto the asset — plan §3.5.
  const onClass = (cid: string) => {
    const k = L.cls(cid)
    if (!k) return
    setA((p) => ({ ...p, classId: cid, method: k.method, lifeMonths: k.lifeMonths, periodicity: k.periodicity, prorata: k.prorata, decliningFactor: k.decliningFactor }))
  }
  const suggestedRemaining = a.importCutoffDate ? Math.max(0, a.lifeMonths - monthsIncl(a.depStartDate, a.importCutoffDate)) : null

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
    const de = draftErrors(db, a)
    if (de) { toast(de, 'err'); return false }
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
        // After capitalization only descriptive fields are editable (§5.5 — no direct cost-center edit).
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
  const exitTx = txs.find((t) => (t.type === 'sale' || t.type === 'disposal') && !t.isReversed)
  const cctHistory = txs.filter((t) => t.type === 'costCenterTransfer').reverse()

  const board: DepLine[] = useMemo(() => {
    if (!draft) return db.lines.filter((l) => l.assetId === a.id).sort((x, y) => x.date.localeCompare(y.date) || x.seq - y.seq)
    const k = db.classes.find((x) => x.id === a.classId)
    if (!k || a.originalValue <= 0) return []
    return generateSchedule({ ...db, lines: [] }, a, k)
  }, [db, a, draft])
  const runNo = (rid: string | null) => db.runs.find((r) => r.id === rid)?.number
  const maint = db.maintenance.filter((x) => x.assetId === a.id).sort((x, y) => y.plannedDate.localeCompare(x.plannedDate))

  const err = (f: string) => (errors.includes(f) ? 'ring-1 ring-red-400 rounded-md' : '')
  const active = a.state === 'running' || a.state === 'paused'
  const booked = active || a.state === 'closed'
  const methods = (Object.keys(methodLabel) as DepMethod[]).map((k) => ({ value: k, label: methodLabel[k] }))

  /** Path B — «بيع» creates a draft sales invoice with the asset line and opens it (§5.6.9). */
  const sellAsset = () => {
    let invId = ''
    if (run((d) => {
      const inv = createSaleInvoiceForAsset(d, a.id)
      if (typeof inv === 'string') return inv
      invId = inv.id
    }, 'أُنشئت فاتورة مبيعات مسودة بسطر الأصل — أكمل العميل والسعر ثم رحّلها')) nav(`/sales-invoices/${invId}`)
  }

  const items = draft
    ? [
        { label: 'إلغاء الأصل', icon: Ban, onClick: () => setAction('cancel'), disabled: isNew || !can('update') },
        { label: 'طباعة ملصق الأصل', icon: Barcode, onClick: () => setAction('tag') },
        { label: 'حذف', icon: Trash2, danger: true, onClick: () => setAction('delete'), disabled: !!canDelete(db, a) || !can('delete') },
      ]
    : final
      ? [
          ...(exitTx ? [{ label: exitTx.type === 'sale' ? `فاتورة البيع ${exitTx.sourceDocRef} (الإلغاء يعكس البيع)` : `مستند الاستبعاد ${exitTx.number}`, icon: Undo2, onClick: () => { const s = sourceLink(db, exitTx); if (s) nav(s.to) } }] : []),
          { label: 'طباعة ملصق الأصل', icon: Barcode, onClick: () => setAction('tag') },
        ]
      : [
          { label: 'إيقاف الإهلاك', icon: CirclePause, onClick: () => setAction('pause'), disabled: a.state !== 'running' || !can('post') },
          { label: 'استئناف الإهلاك', icon: CirclePlay, onClick: () => setAction('resume'), disabled: a.state !== 'paused' || !can('post') },
          { label: 'تراجع عن الرسملة', icon: Undo2, onClick: () => setAction('undo'), disabled: a.state !== 'running' || !can('reverse') },
          { label: 'تسوية — تعديل العمر الإنتاجي', icon: Clock3, onClick: () => setAction('life'), disabled: !booked || !can('post') || !c?.isDepreciable || c.kind === 'lowValue' },
          { label: 'مستند إعادة تقييم (زيادة)', icon: TrendingUp, onClick: () => nav(`/revaluations/new?asset=${a.id}`), disabled: !booked || !can('post') },
          { label: 'مستند هبوط قيمة (نقص)', icon: TrendingDown, onClick: () => nav(`/revaluations/new?asset=${a.id}&dir=down`), disabled: !active || !can('post') },
          { label: 'مستند إضافة لاحقة', icon: PlusCircle, onClick: () => nav(`/cost-adjustments/new?asset=${a.id}`), disabled: !booked || !can('post') },
          { label: 'مستند تخفيض اقتناء', icon: MinusCircle, onClick: () => nav(`/cost-adjustments/new?asset=${a.id}&adj=reduction`), disabled: !active || !can('post') },
          { label: `مستند ${dep} يدوي`, icon: PenLine, onClick: () => nav(`/manual-depreciation/new?asset=${a.id}`), disabled: !active || !can('post') || !c?.isDepreciable || c.kind === 'land' },
          { label: 'مستند نقل موقع / عهدة', icon: ArrowLeftRight, onClick: () => nav(`/transfers/new?asset=${a.id}`), disabled: !booked || !can('update') },
          { label: 'مستند نقل مركز كلفة', icon: Landmark, onClick: () => nav(`/transfers/new?asset=${a.id}&tt=costCenter`), disabled: !booked || !can('update') },
          { label: 'بيع — إنشاء فاتورة مبيعات', icon: Wallet, onClick: sellAsset, disabled: !booked || !can('create') },
          { label: 'مستند استبعاد بلا مقابل', icon: Trash2, onClick: () => nav(`/disposals/new?asset=${a.id}`), disabled: !booked || !can('post') },
          { label: 'أمر صيانة جديد', icon: Wrench, onClick: () => nav(`/maintenance/new?asset=${a.id}`), disabled: !can('create') },
          { label: 'طباعة ملصق الأصل', icon: Barcode, onClick: () => setAction('tag') },
        ]

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'سجل الأصول', to: '/assets' }, { label: isNew ? 'أصل جديد' : a.code }]}
        title={isNew ? 'أصل جديد' : a.name}
        badge={<><Badge tone={stateTone[a.state]}>{stateLabel[a.state]}</Badge>{a.isLegacy && <Badge tone="gray">مستورد (Legacy)</Badge>}{c && c.kind !== 'tangible' && <Badge tone="blue">{kindLabel[c.kind]}</Badge>}</>}
        summary={{ label: 'القيمة الدفترية', value: iqd(nbv) }}
        actions={
          <>
            <SaveSplit disabled={!can(isNew ? 'create' : 'update') || final} onSave={() => save()} items={[{ label: 'حفظ وإنشاء جديد', onClick: () => save(true) }]} />
            {draft && !isNew && can('post') && <button type="button" className="btn" onClick={() => setAction('capitalize')}><CheckCircle2 className="h-4 w-4" />رسملة</button>}
            {booked && can('create') && <button type="button" className="btn" onClick={sellAsset} title="ينشئ فاتورة مبيعات مسودة بسطر هذا الأصل (§5.6.9)"><Wallet className="h-4 w-4" />بيع</button>}
            <button type="button" className="btn" onClick={() => nav('/assets')}>إلغاء</button>
            {!isNew && <Dropdown label="إجراءات" icon={MoreHorizontal} items={items} />}
          </>
        }
      />

      {errors.length > 0 && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">الحقول التالية مطلوبة: {errors.join('، ')}</div>}
      {!draft && (
        <div className="mb-3 rounded-md border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm text-sky-800">
          {final
            ? `هذا الأصل ${stateLabel[a.state]} — حالة نهائية، السجل للقراءة فقط${a.state !== 'cancelled' ? ' (يمكن عكس البيع / الاستبعاد من «إجراءات»)' : ''}.`
            : 'بعد الرسملة لا تُعدَّل القيمة أو إعدادات الإهلاك أو مركز الكلفة مباشرة؛ استخدم «إجراءات» ليُسجَّل الحدث بتاريخه الفعلي ويُعاد توليد الأقساط غير المُرحّلة فقط.'}
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
            { id: 'dep', label: `القيمة وجدول ${dep}`, icon: TrendingDown, count: board.length || undefined },
            { id: 'location', label: 'الموقع والعهدة', icon: MapPin },
            { id: 'ledger', label: 'بطاقة الأصل', icon: BookOpenCheck },
            { id: 'maint', label: 'الصيانة', icon: Wrench, count: maint.length || undefined },
            { id: 'events', label: 'سجل الحركات', icon: History, count: txs.length },
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
              <Field label="تاريخ الرسملة"><ReadOnly ltr>{a.capitalizationDate ?? '—'}</ReadOnly></Field>
              <Field label="المورّد"><Select value={a.partnerId} onChange={(v) => set('partnerId', v)} options={L.partnerOptions} placeholder="—" disabled={!editable} /></Field>
              <Field label="مرجع وثيقة الشراء" hint="مع فاتورة مشتريات مُرحّلة لا يُنشأ قيد رسملة">
                <input className="inp" dir="ltr" placeholder="PB-2026-0000" value={a.sourceDocRef} disabled={!editable} onChange={(e) => set('sourceDocRef', e.target.value)} />
              </Field>
              <Field label="سطر الفاتورة / التسلسل" hint="§5.6.6"><ReadOnly ltr>{a.sourceDocLine ? `${a.sourceDocLine}${a.sourceLineSeq ? ` · ${a.sourceLineSeq}` : ''}` : '—'}</ReadOnly></Field>
              <Field label="المشروع"><input className="inp" value={a.project} disabled={final} onChange={(e) => set('project', e.target.value)} /></Field>
              <Field label="الرقم التسلسلي"><input className="inp" dir="ltr" value={a.serial} disabled={final} onChange={(e) => set('serial', e.target.value)} /></Field>
              <Field label="رقم الملصق (Tag)" hint="فريد إن أُدخل"><input className="inp" dir="ltr" value={a.tagNumber} disabled={final} onChange={(e) => set('tagNumber', e.target.value)} /></Field>
              <Field label="العملة"><ReadOnly>IQD — عملة النظام</ReadOnly></Field>
              <Field label="الوصف" span={5}><input className="inp" value={a.description} disabled={final} onChange={(e) => set('description', e.target.value)} /></Field>
            </FormGrid>
          )}

          {tab === 'dep' && (
            <div className="space-y-4">
              <FormGrid>
                <Field label="القيمة الأصلية (IQD)" required hint="تتغيّر فقط بالإضافة اللاحقة أو تخفيض الاقتناء">
                  <div className={err('القيمة الأصلية')}><NumInput value={a.originalValue} disabled={!editable} onChange={(n) => set('originalValue', n)} /></div>
                </Field>
                <Field label="القيمة التخريدية"><NumInput value={a.salvage} disabled={!editable} onChange={(n) => set('salvage', n)} /></Field>
                <Field label={`قاعدة ${dep}`} hint="القيمة الأصلية − التخريدية"><ReadOnly ltr>{money(depBase(a))}</ReadOnly></Field>
                <Field label={`طريقة ${dep}`} hint="مُورَّثة من الفئة وقابلة للتجاوز">
                  <Select value={a.method} onChange={(v) => set('method', v)} options={methods} disabled={!editable || !c?.isDepreciable || c.kind === 'lowValue'} />
                </Field>
                <Field label="العمر الإنتاجي (شهر)" required hint={`من مضاعفات ${MPP[a.periodicity]} أشهر`}>
                  <NumInput value={a.lifeMonths} disabled={!editable || !c?.isDepreciable || c.kind === 'lowValue'} onChange={(n) => set('lifeMonths', n)} />
                </Field>
                <Field label="الدورية" hint="حدود الفترات بالتقويم المالي">
                  <Select<Periodicity> value={a.periodicity} onChange={(v) => set('periodicity', v)} options={(Object.keys(periodicityLabel) as Periodicity[]).map((k) => ({ value: k, label: periodicityLabel[k] }))} disabled={!editable || !c?.isDepreciable} />
                </Field>
                <Field label="التحاصص (البدء والإخراج)">
                  <Select<Prorata> value={a.prorata} onChange={(v) => set('prorata', v)} options={(Object.keys(prorataLabel) as Prorata[]).map((k) => ({ value: k, label: prorataLabel[k] }))} disabled={!editable || !c?.isDepreciable} />
                </Field>
                {(a.method === 'DB' || a.method === 'DBSL') && (
                  <Field label="معامل التناقص"><NumInput value={a.decliningFactor ?? 2} disabled={!editable} onChange={(n) => set('decliningFactor', n)} /></Field>
                )}
                <Field label="مجال الإهلاك"><ReadOnly>01 — Local GAAP</ReadOnly></Field>
                <Field label="أصل مستورد (رصيد افتتاحي)">
                  <label className="flex h-8 items-center gap-2 text-sm">
                    <input type="checkbox" checked={a.isLegacy} disabled />
                    {a.isLegacy ? 'مستورد بدفعة الاستيراد' : 'لا — الأصول القديمة تُدخل فقط من «استيراد الأصول القديمة»'}
                  </label>
                </Field>
                {a.isLegacy && (
                  <>
                    <Field label="تاريخ قطع الاستيراد" required hint="نهاية فترة — أول قسط في الفترة التالية">
                      <input type="date" className="inp" value={a.importCutoffDate ?? ''} disabled onChange={(e) => set('importCutoffDate', e.target.value)} />
                    </Field>
                    <Field label="الإهلاك المستورد" required><NumInput value={a.importedAccum} disabled onChange={(n) => set('importedAccum', n)} /></Field>
                    <Field label="العمر المتبقي عند الاستيراد (شهر)" required hint={suggestedRemaining !== null ? `المقترح: ${suggestedRemaining} = العمر − الأشهر حتى القطع` : undefined}>
                      <div className="flex gap-1">
                        <NumInput value={a.remainingLifeAtImport ?? 0} disabled onChange={(n) => set('remainingLifeAtImport', n)} />
                        {false && suggestedRemaining !== null && <button type="button" className="btn shrink-0 px-2 text-xs" onClick={() => set('remainingLifeAtImport', suggestedRemaining)}>المقترح</button>}
                      </div>
                    </Field>
                  </>
                )}
                <Field label="إعادة تقييم / هبوط قيمة"><ReadOnly ltr>{money(a.revaluationAdj)}</ReadOnly></Field>
                <Field label={accumWord(c?.kind)}><ReadOnly ltr>{money(accum)}</ReadOnly></Field>
                <Field label="القيمة الدفترية" hint="التخريدية لا تُخصم"><ReadOnly ltr><b>{money(nbv)}</b></ReadOnly></Field>
                <Field label="المتبقي القابل للإهلاك"><ReadOnly ltr>{existing ? money(remainingDepreciable(db, a)) : '—'}</ReadOnly></Field>
              </FormGrid>
              {c && c.kind === 'land' && <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">فئة «{c.name}» أرض — غير قابلة للإهلاك؛ الجدول فارغ والقيمة الدفترية تساوي القيمة الأصلية إلا بإعادة تقييم.</div>}
              {c && c.kind === 'lowValue' && <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">أصل منخفض القيمة (§5.6.5): سطر واحد بـ 100% من القاعدة بنهاية فترة دخول الخدمة، فتحمّله أول دورة مصروفاً؛ ويبقى الأصل في السجل والجرد حتى الاستبعاد.{db.settings.lowValueThreshold !== null ? ` الحد الأقصى: ${money(db.settings.lowValueThreshold)}.` : ' حدّ القيمة معطّل.'}</div>}

              <div className="rounded-md border border-line">
                <div className="flex items-center justify-between border-b border-line px-3 py-2">
                  <span className="text-sm font-semibold">جدول {dep} {draft && <span className="ms-1 text-xs font-normal text-amber-600">(معاينة — يُولَّد فعلياً عند الرسملة)</span>}</span>
                  <span className="text-xs text-gray-500">{board.length} سطر — {methodLabel[a.method]} — {periodicityLabel[a.periodicity]} · مُرحّل {board.filter((l) => l.isPosted).length}</span>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="tbl">
                    <thead className="sticky top-0">
                      <tr><th>#</th><th>التاريخ</th><th>النوع</th><th>النسبة</th><th className="!text-end">القسط</th><th className="!text-end">المجمّع</th><th className="!text-end">المتبقي</th><th>الحالة</th><th>المرجع</th></tr>
                    </thead>
                    <tbody>
                      {board.map((l) => (
                        <tr key={l.id} className={l.isPosted ? 'bg-emerald-50/40' : ''}>
                          <td className="text-gray-400">{l.seq}</td>
                          <td dir="ltr" className="text-end">{l.date}</td>
                          <td className="text-xs">{l.type === 'depreciation' && l.fraction === null ? 'سطر إتمام' : lineType[l.type]}</td>
                          <td className="text-xs text-gray-500">{l.days ? `${l.days} يوم` : l.fraction !== null && l.fraction > 0 && l.fraction < 1 ? `${Math.round(l.fraction * 100)}%` : ''}</td>
                          <td className="num">{money(l.amount)}</td>
                          <td className="num">{money(l.accum)}</td>
                          <td className="num">{money(l.remaining)}</td>
                          <td>{l.isPosted ? <Badge tone="green">مُرحّل</Badge> : <Badge tone="gray">مخطَّط</Badge>}</td>
                          <td dir="ltr" className="text-end text-navy">
                            {l.runId && <Link to={`/runs/${l.runId}`}>{runNo(l.runId)}</Link>}
                            {l.txId && <button type="button" className="hover:underline" onClick={() => setOpenTx(db.txs.find((t) => t.id === l.txId) ?? null)}>{db.txs.find((t) => t.id === l.txId)?.number}</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {board.length > 0 && <tfoot><tr><td colSpan={4}>المجموع:</td><td className="num">{money(board.reduce((s, l) => s + l.amount, 0))}</td><td colSpan={4} /></tr></tfoot>}
                  </table>
                  {board.length === 0 && <Empty text={c?.kind === 'land' ? 'لا أقساط — أرض' : final ? 'أُلغيت الأقساط غير المُرحّلة عند الإغلاق' : 'أدخل الفئة والقيمة الأصلية لعرض الجدول'} />}
                </div>
              </div>
            </div>
          )}

          {tab === 'location' && (
            <div className="space-y-4">
              <FormGrid>
                <Field label="الموقع" required>
                  <div className={err('الموقع')}><Select value={a.locationId} onChange={(v) => set('locationId', v)} options={L.locOptions} placeholder="اختر الموقع" disabled={!editable} /></div>
                </Field>
                <Field label="صاحب العهدة" required>
                  <div className={err('صاحب العهدة')}><Select value={a.custodianId} onChange={(v) => set('custodianId', v)} options={L.empOptions} placeholder="اختر الموظف" disabled={!editable} /></div>
                </Field>
                <Field label="القسم"><ReadOnly>{L.emp(a.custodianId)?.department ?? '—'}</ReadOnly></Field>
                <Field label="مركز الكلفة الحالي" required hint="يُغيَّر بعد الرسملة عبر «نقل مركز الكلفة» فقط">
                  <div className={err('مركز الكلفة')}><Select value={a.costCenterId} onChange={(v) => set('costCenterId', v)} options={L.ccOptions} placeholder="اختر" disabled={!editable} /></div>
                </Field>
                <Field label="المسار"><ReadOnly>{L.locPath(a.locationId)}</ReadOnly></Field>
              </FormGrid>
              {!draft && booked && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn" onClick={() => nav(`/transfers/new?asset=${a.id}`)}><ArrowLeftRight className="h-4 w-4" />مستند نقل موقع / عهدة</button>
                  <button type="button" className="btn" onClick={() => nav(`/transfers/new?asset=${a.id}&tt=costCenter`)}><Landmark className="h-4 w-4" />مستند نقل مركز كلفة</button>
                </div>
              )}
              {cctHistory.length > 0 && (
                <div>
                  <h4 className="mb-2 text-sm font-semibold">سجل مراكز الكلفة (بتاريخ السريان)</h4>
                  <table className="tbl">
                    <thead><tr><th>تاريخ السريان</th><th>من</th><th>إلى</th><th>الحركة</th><th>الحالة</th></tr></thead>
                    <tbody>
                      {cctHistory.map((t) => (
                        <tr key={t.id} className="cursor-pointer" onClick={() => setOpenTx(t)}>
                          <td dir="ltr" className="text-end">{t.date}</td><td>{L.ccName(t.fromCostCenterId ?? '')}</td><td>{L.ccName(t.toCostCenterId ?? '')}</td>
                          <td dir="ltr" className="text-end text-navy">{t.number}</td><td>{t.isReversed ? <Badge tone="amber">معكوس</Badge> : <Badge tone="green">ساري</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'ledger' && (existing ? <LedgerTab asset={existing} onOpen={(t) => setOpenTx(t)} /> : <Empty text="احفظ الأصل أولاً" />)}

          {tab === 'maint' && (
            <div>
              {booked && can('create') && <div className="mb-3"><button type="button" className="btn btn-primary" onClick={() => nav(`/maintenance/new?asset=${a.id}`)}><Plus className="h-4 w-4" />أمر صيانة</button></div>}
              {maint.length ? (
                <table className="tbl">
                  <thead><tr><th>رقم الأمر</th><th>النوع</th><th>الجهة المنفذة</th><th>الموعد</th><th>الإنجاز</th><th className="!text-end">التكلفة</th><th>الحالة</th></tr></thead>
                  <tbody>
                    {maint.map((x) => (
                      <tr key={x.id} className="cursor-pointer" onClick={() => nav(`/maintenance/${x.id}`)}>
                        <td dir="ltr" className="text-end text-navy">{x.number}</td>
                        <td>{maintTypeLabel[x.type]}{x.capitalize && <span className="ms-1.5 rounded bg-sky-50 px-1 text-[10px] text-sky-700">مرسملة</span>}</td>
                        <td>{L.partnerName(x.partnerId)}</td><td dir="ltr" className="text-end">{x.plannedDate}</td><td dir="ltr" className="text-end">{x.doneDate ?? '—'}</td>
                        <td className="num">{money(x.cost)}</td><td><Badge tone={maintStatusTone[x.status]}>{maintStatusLabel[x.status]}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <Empty text="لا توجد أوامر صيانة لهذا الأصل" />}
            </div>
          )}

          {tab === 'events' && <TxTable rows={txs} hideAsset />}

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

/** §7.2 Asset ledger as a tab of the asset card. */
function LedgerTab({ asset, onOpen }: { asset: Asset; onOpen: (t: AssetTx) => void }) {
  const { db } = useStore()
  const [from, setFrom] = useState('2025-01-01')
  const [to, setTo] = useState(TODAY)
  const { opening, rows } = assetLedger(db, asset, from, to, (t) => txLabel[t.type])
  return <LedgerTable db={db} from={from} to={to} setFrom={setFrom} setTo={setTo} opening={opening} rows={rows} onOpen={onOpen} />
}

export function LedgerTable({ db, from, to, setFrom, setTo, opening, rows, onOpen }: {
  db: DB; from: string; to: string; setFrom: (s: string) => void; setTo: (s: string) => void
  opening: { cost: number; accum: number }; rows: ReturnType<typeof assetLedger>['rows']; onOpen: (t: AssetTx) => void
}) {
  const nav = useNavigate()
  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-end gap-3">
        <Field label="من"><input type="date" className="inp w-44" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="إلى"><input type="date" className="inp w-44" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <span className="text-xs text-gray-500">الأرصدة الجارية تبدأ بقيم السجل كما في اليوم السابق لـ «من»، وآخر صف يساوي سجل الأصول عند «إلى».</span>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl">
          <thead>
            <tr><th>التاريخ</th><th>الحدث</th><th>الوثيقة</th><th>قيد</th><th className="!text-end">حركة التكلفة</th><th className="!text-end">حركة الإهلاك</th><th className="!text-end">التكلفة الجارية</th><th className="!text-end">المجمّع الجاري</th><th className="!text-end">الدفترية الجارية</th><th>ملاحظات</th></tr>
          </thead>
          <tbody>
            <tr className="bg-gray-50 text-gray-600"><td colSpan={6}>الرصيد الافتتاحي</td><td className="num">{money(opening.cost)}</td><td className="num">{money(opening.accum)}</td><td className="num">{money(opening.cost - opening.accum)}</td><td /></tr>
            {rows.map((r, i) => (
              <tr key={i} className={`${r.txId || r.runId ? 'cursor-pointer' : ''} ${r.reversed ? 'text-gray-400' : ''}`}
                onClick={() => (r.runId ? nav(`/runs/${r.runId}`) : r.txId && onOpen(db.txs.find((t) => t.id === r.txId)!))}>
                <td dir="ltr" className="text-end">{r.date}</td>
                <td>{r.event}{r.reversed && <span className="ms-1.5 rounded bg-amber-50 px-1 text-[10px] text-amber-700">معكوس</span>}</td>
                <td dir="ltr" className="text-end text-navy">{r.doc}</td>
                <td>{r.je ? '✓' : ''}</td>
                <td className="num">{r.cost ? money(r.cost) : ''}</td>
                <td className="num">{r.dep ? money(r.dep) : ''}</td>
                <td className="num">{money(r.runCost)}</td>
                <td className="num">{money(r.runAccum)}</td>
                <td className="num font-semibold">{money(r.runNbv)}</td>
                <td className="max-w-[16rem] truncate text-xs text-gray-500">{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty text="لا حركات في المدى المحدد" />}
      </div>
    </div>
  )
}

function ActionModal({ kind, asset: a, onClose }: { kind: Exclude<Action, 'delete' | 'tag'>; asset: Asset; onClose: () => void }) {
  const { db, run } = useStore()
  const stored = db.assets.find((x) => x.id === a.id) ?? a
  const [date, setDate] = useState(() => (kind === 'capitalize' ? (a.depStartDate > TODAY ? a.depStartDate : TODAY) : TODAY))
  const [notes, setNotes] = useState('')
  const [value, setValue] = useState(() => (a.isLegacy ? a.remainingLifeAtImport ?? 0 : a.lifeMonths))
  const posted = db.lines.filter((l) => l.assetId === a.id && l.isPosted && l.type === 'depreciation').length
  const titles: Record<typeof kind, string> = {
    capitalize: 'رسملة الأصل', cancel: 'إلغاء الأصل', undo: 'تراجع عن الرسملة', pause: 'إيقاف الإهلاك', resume: 'استئناف الإهلاك', life: 'تسوية — تعديل العمر الإنتاجي',
  }
  const submit = () => {
    const ok = run((d) => {
      switch (kind) {
        case 'capitalize': return capitalize(d, a.id, date)
        case 'cancel': return cancelAsset(d, a.id, date, notes)
        case 'undo': return undoCapitalization(d, a.id, notes)
        case 'pause': return pause(d, a.id, date, notes)
        case 'resume': return resume(d, a.id, date, notes)
        case 'life': return changeLife(d, a.id, date, value, notes)
      }
    }, `تم تنفيذ: ${titles[kind]}`)
    if (ok) onClose()
  }
  return (
    <Modal title={`${titles[kind]} — ${a.code}`} onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>إلغاء</button><button type="button" className="btn btn-primary" onClick={submit}>تنفيذ</button></>}>
      <div className="grid grid-cols-2 gap-3">
        {kind !== 'undo' && <Field label="التاريخ الفعلي" required><input type="date" className="inp" value={date} onChange={(e) => setDate(e.target.value)} /></Field>}
        <Field label="القيمة الدفترية الحالية"><ReadOnly ltr>{money(bookValue(db, stored))}</ReadOnly></Field>
        {kind === 'capitalize' && (
          <div className="col-span-2 space-y-1 rounded-md bg-gray-50 p-3 text-xs text-gray-600">
            <div>• يتحوّل الأصل إلى «قيد الإهلاك» ويُولَّد الجدول ({methodLabel[a.method]}، {a.lifeMonths} شهراً، {periodicityLabel[a.periodicity]}، {prorataLabel[a.prorata]}).</div>
            <div>• {a.sourceDocRef ? `مرتبط بفاتورة المشتريات ${a.sourceDocRef} — لا قيد رسملة من الوحدة.` : 'لا وثيقة شراء — قيد رسملة: مدين حساب الأصل / دائن الموردون.'}</div>
            <div>• للرسملة الجماعية: حدّد عدة مسودات من سجل الأصول.</div>
          </div>
        )}
        {kind === 'cancel' && <div className="col-span-2 text-xs text-gray-500">حالة نهائية بلا قيود؛ يبقى الرمز {a.code} محجوزاً والسجل للتدقيق.</div>}
        {kind === 'undo' && <div className="col-span-2 text-xs text-gray-500">مسموح فقط قبل ترحيل أي قسط وقبل أي إعادة تقييم. يُعكس قيد الرسملة (إن رحّلته الوحدة) ويُحذف الجدول ويعود الأصل مسودة.</div>}
        {kind === 'resume' && <div className="col-span-2 text-xs text-gray-500">الإيقاف لا يستهلك العمر: الفترات المتبقية بلا تغيير، وأول قسط بعد الاستئناف كامل.</div>}
        {kind === 'life' && (
          <>
            <Field label={a.isLegacy ? 'العمر المتبقي عند الاستيراد الجديد (شهر)' : 'العمر الإنتاجي الجديد (شهر)'} required hint={`من مضاعفات ${MPP[a.periodicity]}`}><NumInput value={value} onChange={setValue} /></Field>
            <Field label="الأقساط المُرحّلة"><ReadOnly ltr>{posted}</ReadOnly></Field>
            <div className="col-span-2 text-xs text-gray-500">التسوية إجراء على الأصل بلا وثيقة ولا قيد (القرار ب): تُسجَّل حركة «تسوية» ويُعاد توليد الأقساط غير المُرحّلة فقط.</div>
          </>
        )}
        <Field label="ملاحظات" span={2}><input className="inp" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
