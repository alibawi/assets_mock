import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ListView } from '../components/ListView'
import { Badge, Field, Modal, NumInput, Select } from '../components/ui'
import { acctsOf, bookValue, DEFAULT_AREA, lifeError } from '../data/calc'
import { kindLabel, methodLabel, money, periodicityLabel, prorataLabel } from '../data/format'
import { classAccountErrors } from '../data/lifecycle'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { AssetClass, AssetGroup, AssetKind, AssetLocation, ClassAccounts, DepMethod, Periodicity, Prorata } from '../data/types'

const live = (s: string) => s !== 'sold' && s !== 'disposed' && s !== 'cancelled'
const ActiveBadge = ({ on }: { on: boolean }) => <Badge tone={on ? 'green' : 'gray'}>{on ? 'فعّال' : 'غير فعّال'}</Badge>
const footer = (close: () => void, save: () => void) => (
  <><button type="button" className="btn" onClick={close}>إلغاء</button><button type="button" className="btn btn-primary" onClick={save}>حفظ</button></>
)

// ---------- §3.1 Asset classes (+ §3.1.1 default-area accounts) ----------
type Acc = ClassAccounts
type Edit = AssetClass & { acc: Acc }
const blankClass = (): Edit => ({
  id: '', code: '', name: '', foreignName: '', kind: 'tangible', method: 'SL', lifeMonths: 60, decliningFactor: null, periodicity: 'M', prorata: 'NONE',
  isDepreciable: true, isActive: true,
  acc: { assetAcct: '', accumAcct: '', expenseAcct: '', gainAcct: '4900000001', lossAcct: '3800000001', revalSurplusAcct: '2500000001' },
})

export function ClassesPage() {
  const { db, run, can } = useStore()
  const L = useLookups()
  const [edit, setEdit] = useState<Edit | null>(null)
  const [errs, setErrs] = useState<string[]>([])
  const assetsOf = (id: string) => db.assets.filter((a) => a.classId === id && live(a.state))
  const set = <K extends keyof AssetClass>(k: K, v: AssetClass[K]) => setEdit((p) => (p ? { ...p, [k]: v } : p))
  const setAcc = (k: keyof Acc, v: string) => setEdit((p) => (p ? { ...p, acc: { ...p.acc, [k]: v } } : p))
  const acct = (k: keyof Acc) => <Select value={edit!.acc[k]} onChange={(v) => setAcc(k, v)} options={L.acctOptions} placeholder="اختر الحساب" />
  const setKind = (k: AssetKind) => setEdit((p) => (p ? { ...p, kind: k, isDepreciable: k !== 'land', method: k === 'land' ? 'NONE' : p.method === 'NONE' ? 'SL' : p.method } : p))

  const save = () => {
    if (!edit) return
    const e: string[] = []
    if (!edit.code.trim()) e.push('رمز الفئة مطلوب')
    if (!edit.name.trim()) e.push('اسم الفئة مطلوب')
    if (db.classes.some((c) => c.id !== edit.id && c.code === edit.code)) e.push('رمز الفئة مستخدم')
    const depreciable = edit.kind !== 'land' && edit.isDepreciable
    if (depreciable && edit.kind !== 'lowValue') {
      if (edit.lifeMonths <= 0) e.push('العمر الإنتاجي مطلوب')
      const le = lifeError(edit.lifeMonths, edit.periodicity)
      if (le) e.push(le)
    }
    e.push(...classAccountErrors(db, edit.acc, depreciable))
    setErrs(e)
    if (e.length) return
    const { acc, ...cls } = edit
    const c: AssetClass = { ...cls, isDepreciable: depreciable }
    if (run((d) => {
      const id = c.id || `c${d.classes.length + 1}-${Date.now().toString(36)}`
      if (c.id) d.classes = d.classes.map((x) => (x.id === c.id ? c : x))
      else d.classes.push({ ...c, id })
      const row = { classId: id, areaId: DEFAULT_AREA, ...acc }
      const i = d.classAreaAccounts.findIndex((x) => x.classId === id && x.areaId === DEFAULT_AREA)
      if (i >= 0) d.classAreaAccounts[i] = row
      else d.classAreaAccounts.push(row)
    }, 'تم حفظ الفئة')) setEdit(null)
  }

  return (
    <>
      <ListView
        title="فئات الأصول"
        crumbs={[{ label: 'الإعدادات' }, { label: 'فئات الأصول' }]}
        rows={db.classes}
        onNew={() => { setErrs([]); setEdit(blankClass()) }}
        canNew={can('settings')}
        newLabel="فئة جديدة"
        onRowClick={(c) => { if (can('settings')) { setErrs([]); setEdit({ ...structuredClone(c), acc: { ...acctsOf(db, c.id) } }) } }}
        searchText={(c) => `${c.code} ${c.name} ${c.foreignName}`}
        columns={[
          { key: 'code', label: 'الرمز', render: (c) => <span className="font-medium text-navy" dir="ltr">{c.code}</span> },
          { key: 'name', label: 'اسم الفئة', render: (c) => <span>{c.name} <span className="text-xs text-gray-400" dir="ltr">{c.foreignName}</span></span> },
          { key: 'k', label: 'النوع', render: (c) => kindLabel[c.kind] },
          { key: 'm', label: 'الطريقة', render: (c) => (c.kind === 'land' ? 'غير قابلة للإهلاك' : c.kind === 'lowValue' ? '100% في أول فترة' : methodLabel[c.method]) },
          { key: 'l', label: 'العمر (شهر)', num: true, render: (c) => (c.isDepreciable && c.kind !== 'lowValue' ? c.lifeMonths : '—') },
          { key: 'p', label: 'الدورية', render: (c) => periodicityLabel[c.periodicity] },
          { key: 'acc', label: 'حساب الأصل / المجمّع (مجال 01)', render: (c) => <span className="text-xs text-gray-600" dir="ltr">{acctsOf(db, c.id).assetAcct} / {acctsOf(db, c.id).accumAcct || '—'}</span> },
          { key: 'n', label: 'الأصول', num: true, render: (c) => <Link className="text-navy hover:underline" onClick={(e) => e.stopPropagation()} to={`/assets?class=${c.id}`}>{assetsOf(c.id).length}</Link> },
          { key: 'v', label: 'القيمة الدفترية', num: true, render: (c) => money(assetsOf(c.id).reduce((s, a) => s + bookValue(db, a), 0)) },
          { key: 's', label: 'الحالة', render: (c) => <ActiveBadge on={c.isActive} /> },
        ]}
      />
      {edit && (
        <Modal wide title={edit.id ? `تعديل الفئة — ${edit.name}` : 'فئة أصول جديدة'} onClose={() => setEdit(null)} footer={footer(() => setEdit(null), save)}>
          {errs.length > 0 && <ul className="mb-3 list-inside list-disc rounded-md border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{errs.map((x) => <li key={x}>{x}</li>)}</ul>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="رمز الفئة" required><input className="inp" dir="ltr" maxLength={20} value={edit.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></Field>
            <Field label="الاسم" required><input className="inp" value={edit.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="الاسم الأجنبي"><input className="inp" dir="ltr" value={edit.foreignName} onChange={(e) => set('foreignName', e.target.value)} /></Field>
            <Field label="نوع الأصل" required hint="أرض ⇒ بلا إهلاك · غير ملموس ⇒ «إطفاء» · منخفض القيمة ⇒ 100% في أول دورة">
              <Select<AssetKind> value={edit.kind} onChange={setKind} options={(Object.keys(kindLabel) as AssetKind[]).map((k) => ({ value: k, label: kindLabel[k] }))} />
            </Field>
            <Field label="طريقة الإهلاك" required>
              <Select<DepMethod> value={edit.method} disabled={edit.kind === 'land' || edit.kind === 'lowValue'} onChange={(v) => set('method', v)} options={(Object.keys(methodLabel) as DepMethod[]).map((k) => ({ value: k, label: methodLabel[k] }))} />
            </Field>
            <Field label="العمر الإنتاجي (شهر)" required hint="من مضاعفات أشهر الفترة"><NumInput value={edit.lifeMonths} disabled={edit.kind === 'land' || edit.kind === 'lowValue'} onChange={(n) => set('lifeMonths', n)} /></Field>
            {(edit.method === 'DB' || edit.method === 'DBSL') && (
              <Field label="معامل التناقص"><NumInput value={edit.decliningFactor ?? 2} onChange={(n) => set('decliningFactor', n)} /></Field>
            )}
            <Field label="الدورية" hint="بالتقويم المالي"><Select<Periodicity> value={edit.periodicity} onChange={(v) => set('periodicity', v)} options={(Object.keys(periodicityLabel) as Periodicity[]).map((k) => ({ value: k, label: periodicityLabel[k] }))} /></Field>
            <Field label="التحاصص (البدء والإخراج)"><Select<Prorata> value={edit.prorata} onChange={(v) => set('prorata', v)} options={(Object.keys(prorataLabel) as Prorata[]).map((k) => ({ value: k, label: prorataLabel[k] }))} /></Field>
            <Field label="فعّالة"><label className="flex h-8 items-center gap-2 text-sm"><input type="checkbox" checked={edit.isActive} onChange={(e) => set('isActive', e.target.checked)} />فعّالة</label></Field>
            <div className="mt-1 border-t border-line pt-3 text-xs font-semibold text-gray-500 md:col-span-3">
              تحديد الحسابات — المجال الافتراضي 01 Local GAAP (§3.1.1) · يُتحقَّق من وجودها وقابليتها للترحيل
            </div>
            <Field label="حساب الأصل" required>{acct('assetAcct')}</Field>
            <Field label={edit.kind === 'intangible' ? 'حساب مجمّع الإطفاء' : 'حساب مجمّع الاندثار'} required={edit.kind !== 'land'}>{acct('accumAcct')}</Field>
            <Field label={edit.kind === 'intangible' ? 'حساب مصروف الإطفاء' : 'حساب مصروف الاندثار'} required={edit.kind !== 'land'}>{acct('expenseAcct')}</Field>
            <Field label="حساب أرباح الاستبعاد" required>{acct('gainAcct')}</Field>
            <Field label="حساب خسائر الاستبعاد" required>{acct('lossAcct')}</Field>
            <Field label="حساب فائض إعادة التقييم">{acct('revalSurplusAcct')}</Field>
          </div>
        </Modal>
      )}
    </>
  )
}

// ---------- §3.3 Locations (tree) ----------
export function LocationsPage() {
  const { db, run, can } = useStore()
  const L = useLookups()
  const [edit, setEdit] = useState<AssetLocation | null>(null)
  const depth = (l: AssetLocation): number => (l.parentId ? 1 + depth(db.locations.find((x) => x.id === l.parentId)!) : 0)
  const subtree = (id: string): string[] => [id, ...db.locations.filter((x) => x.parentId === id).flatMap((x) => subtree(x.id))]
  const ordered: AssetLocation[] = []
  const walk = (parent: string | null) => db.locations.filter((l) => l.parentId === parent).forEach((l) => { ordered.push(l); walk(l.id) })
  walk(null)
  const at = (id: string) => db.assets.filter((a) => subtree(id).includes(a.locationId) && live(a.state))
  const set = <K extends keyof AssetLocation>(k: K, v: AssetLocation[K]) => setEdit((p) => (p ? { ...p, [k]: v } : p))
  const save = () => {
    if (!edit) return
    if (!edit.code.trim() || !edit.name.trim()) return run(() => 'الرمز والاسم مطلوبان')
    if (edit.parentId && subtree(edit.id || '-').includes(edit.parentId)) return run(() => 'لا يمكن جعل الموقع تابعاً لنفسه أو لأحد فروعه')
    if (run((d) => {
      if (edit.id) d.locations = d.locations.map((l) => (l.id === edit.id ? edit : l))
      else d.locations.push({ ...edit, id: `l${Date.now().toString(36)}` })
    }, 'تم حفظ الموقع')) setEdit(null)
  }
  return (
    <>
      <ListView
        title="المواقع"
        crumbs={[{ label: 'الإعدادات' }, { label: 'المواقع' }]}
        rows={ordered}
        onNew={() => setEdit({ id: '', code: '', name: '', parentId: null, isActive: true })}
        canNew={can('settings')}
        newLabel="موقع جديد"
        onRowClick={(l) => can('settings') && setEdit({ ...l })}
        searchText={(l) => `${l.code} ${l.name}`}
        columns={[
          { key: 'n', label: 'الموقع', render: (l) => (
            <span className="flex items-center gap-1" style={{ paddingInlineStart: depth(l) * 20 }}>
              {depth(l) > 0 && <ChevronLeft className="h-3.5 w-3.5 text-gray-300" />}
              <span className={depth(l) === 0 ? 'font-semibold' : ''}>{l.name}</span>
            </span>
          ) },
          { key: 'c', label: 'الرمز', render: (l) => <span dir="ltr" className="text-navy">{l.code}</span> },
          { key: 'lv', label: 'المستوى', num: true, render: (l) => depth(l) + 1 },
          { key: 'a', label: 'عدد الأصول', num: true, render: (l) => at(l.id).length },
          { key: 'v', label: 'القيمة الدفترية', num: true, render: (l) => money(at(l.id).reduce((s, a) => s + bookValue(db, a), 0)) },
          { key: 's', label: 'الحالة', render: (l) => <ActiveBadge on={l.isActive} /> },
        ]}
      />
      {edit && (
        <Modal title={edit.id ? 'تعديل الموقع' : 'موقع جديد'} onClose={() => setEdit(null)} footer={footer(() => setEdit(null), save)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الرمز" required><input className="inp" dir="ltr" value={edit.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></Field>
            <Field label="الاسم" required><input className="inp" value={edit.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="الموقع الأب" span={2}>
              <Select value={edit.parentId ?? ''} onChange={(v) => set('parentId', v || null)} options={L.locOptions.filter((o) => o.value !== edit.id)} placeholder="— مستوى أعلى —" />
            </Field>
            <Field label="فعّال"><label className="flex h-8 items-center gap-2 text-sm"><input type="checkbox" checked={edit.isActive} onChange={(e) => set('isActive', e.target.checked)} />فعّال</label></Field>
          </div>
        </Modal>
      )}
    </>
  )
}

// ---------- §3.4 Groups ----------
export function GroupsPage() {
  const { db, run, can } = useStore()
  const [edit, setEdit] = useState<AssetGroup | null>(null)
  const of = (id: string) => db.assets.filter((a) => a.groupId === id && live(a.state))
  const save = () => {
    if (!edit) return
    if (!edit.code.trim() || !edit.name.trim()) return run(() => 'الرمز والاسم مطلوبان')
    if (run((d) => {
      if (edit.id) d.groups = d.groups.map((g) => (g.id === edit.id ? edit : g))
      else d.groups.push({ ...edit, id: `g${Date.now().toString(36)}` })
    }, 'تم حفظ المجموعة')) setEdit(null)
  }
  return (
    <>
      <ListView
        title="مجموعات الأصول"
        crumbs={[{ label: 'الإعدادات' }, { label: 'المجموعات' }]}
        rows={db.groups}
        onNew={() => setEdit({ id: '', code: '', name: '', isActive: true })}
        canNew={can('settings')}
        newLabel="مجموعة جديدة"
        onRowClick={(g) => can('settings') && setEdit({ ...g })}
        searchText={(g) => `${g.code} ${g.name}`}
        columns={[
          { key: 'c', label: 'الرمز', render: (g) => <span dir="ltr" className="font-medium text-navy">{g.code}</span> },
          { key: 'n', label: 'الاسم', render: (g) => g.name },
          { key: 'a', label: 'عدد الأصول', num: true, render: (g) => of(g.id).length },
          { key: 'v', label: 'القيمة الدفترية', num: true, render: (g) => money(of(g.id).reduce((s, a) => s + bookValue(db, a), 0)) },
          { key: 's', label: 'الحالة', render: (g) => <ActiveBadge on={g.isActive} /> },
        ]}
      />
      <p className="mt-2 text-xs text-gray-500">المجموعة تصنيف تنظيمي حرّ مستقل عن الفئة المحاسبية — للتصفية والتقارير فقط.</p>
      {edit && (
        <Modal title={edit.id ? 'تعديل المجموعة' : 'مجموعة جديدة'} onClose={() => setEdit(null)} footer={footer(() => setEdit(null), save)}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الرمز" required><input className="inp" dir="ltr" value={edit.code} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} /></Field>
            <Field label="الاسم" required><input className="inp" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <Field label="فعّالة"><label className="flex h-8 items-center gap-2 text-sm"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} />فعّالة</label></Field>
          </div>
        </Modal>
      )}
    </>
  )
}
