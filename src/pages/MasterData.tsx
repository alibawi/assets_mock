import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ListView } from '../components/ListView'
import { Field, Modal, NumInput, Select } from '../components/ui'
import { grossValue, nbvOf } from '../data/calc'
import { methodLabel, money } from '../data/format'
import { uid, useStore } from '../data/store'
import type { Category, DepMethod, Location } from '../data/types'

const blankCat = (): Category => ({
  id: '', code: '', name: '', method: 'SL', lifeYears: 5, salvagePct: 0,
  assetAccount: '', accumAccount: '', expenseAccount: '', gainLossAccount: '4910 - أرباح/خسائر استبعاد موجودات',
})

export function CategoriesPage() {
  const { db, update, toast } = useStore()
  const [edit, setEdit] = useState<Category | null>(null)
  const count = (id: string) => db.assets.filter((a) => a.categoryId === id && a.status !== 'disposed' && a.status !== 'sold')

  const save = () => {
    if (!edit) return
    if (!edit.code.trim() || !edit.name.trim() || !edit.assetAccount || !edit.accumAccount || !edit.expenseAccount) {
      toast('يرجى إكمال الحقول الإلزامية', 'err')
      return
    }
    update((d) => {
      if (edit.id) d.categories = d.categories.map((c) => (c.id === edit.id ? edit : c))
      else d.categories.push({ ...edit, id: uid() })
    })
    toast('تم حفظ الفئة')
    setEdit(null)
  }
  const set = <K extends keyof Category>(k: K, v: Category[K]) => setEdit((p) => (p ? { ...p, [k]: v } : p))

  return (
    <>
      <ListView
        title="فئات الموجودات"
        rows={db.categories}
        onNew={() => setEdit(blankCat())}
        newLabel="فئة جديدة"
        searchText={(c) => `${c.code} ${c.name}`}
        columns={[
          { key: 'code', label: 'الرمز', render: (c) => <button type="button" className="font-medium text-navy hover:underline" dir="ltr" onClick={() => setEdit(structuredClone(c))}>{c.code}</button> },
          { key: 'name', label: 'اسم الفئة', render: (c) => c.name },
          { key: 'm', label: 'طريقة الاستهلاك', render: (c) => methodLabel[c.method] },
          { key: 'l', label: 'العمر (سنة)', num: true, render: (c) => c.lifeYears },
          { key: 's', label: 'نسبة الخردة', num: true, render: (c) => `${c.salvagePct}%` },
          { key: 'acc', label: 'حساب الموجود', render: (c) => <span className="text-xs text-gray-600">{c.assetAccount}</span> },
          { key: 'n', label: 'عدد الموجودات', num: true, render: (c) => <Link className="text-navy hover:underline" to={`/assets?cat=${c.id}`}>{count(c.id).length}</Link> },
          { key: 'v', label: 'القيمة الدفترية', num: true, render: (c) => money(count(c.id).reduce((s, a) => s + nbvOf(db, a), 0)) },
        ]}
      />
      {edit && (
        <Modal
          wide
          title={edit.id ? `تعديل الفئة — ${edit.name}` : 'فئة جديدة'}
          onClose={() => setEdit(null)}
          footer={<><button type="button" className="btn" onClick={() => setEdit(null)}>إلغاء</button><button type="button" className="btn btn-primary" onClick={save}>حفظ</button></>}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Field label="رمز الفئة" required><input className="inp" dir="ltr" value={edit.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></Field>
            <Field label="اسم الفئة" required span={2}><input className="inp" value={edit.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="طريقة الاستهلاك الافتراضية" required>
              <Select<DepMethod> value={edit.method} onChange={(v) => set('method', v)} options={[{ value: 'SL', label: methodLabel.SL }, { value: 'DDB', label: methodLabel.DDB }]} />
            </Field>
            <Field label="العمر الإنتاجي (سنة)" required><NumInput value={edit.lifeYears} onChange={(n) => set('lifeYears', n)} /></Field>
            <Field label="نسبة القيمة التخريدية %"><NumInput value={edit.salvagePct} onChange={(n) => set('salvagePct', n)} /></Field>
            <div className="md:col-span-3 mt-1 border-t border-line pt-3 text-xs font-semibold text-gray-500">الحسابات المحاسبية</div>
            <Field label="حساب الموجود" required><input className="inp" value={edit.assetAccount} onChange={(e) => set('assetAccount', e.target.value)} /></Field>
            <Field label="حساب مجمع الاستهلاك" required><input className="inp" value={edit.accumAccount} onChange={(e) => set('accumAccount', e.target.value)} /></Field>
            <Field label="حساب مصروف الاستهلاك" required><input className="inp" value={edit.expenseAccount} onChange={(e) => set('expenseAccount', e.target.value)} /></Field>
            <Field label="حساب أرباح/خسائر الاستبعاد"><input className="inp" value={edit.gainLossAccount} onChange={(e) => set('gainLossAccount', e.target.value)} /></Field>
          </div>
        </Modal>
      )}
    </>
  )
}

export function LocationsPage() {
  const { db, update, toast } = useStore()
  const [edit, setEdit] = useState<Location | null>(null)
  const at = (id: string) => db.assets.filter((a) => a.locationId === id && a.status !== 'disposed' && a.status !== 'sold')
  const set = <K extends keyof Location>(k: K, v: Location[K]) => setEdit((p) => (p ? { ...p, [k]: v } : p))
  const save = () => {
    if (!edit || !edit.code.trim() || !edit.name.trim() || !edit.branch) { toast('يرجى إكمال الحقول الإلزامية', 'err'); return }
    update((d) => {
      if (edit.id) d.locations = d.locations.map((l) => (l.id === edit.id ? edit : l))
      else d.locations.push({ ...edit, id: uid() })
    })
    toast('تم حفظ الموقع')
    setEdit(null)
  }
  return (
    <>
      <ListView
        title="المواقع"
        rows={db.locations}
        onNew={() => setEdit({ id: '', code: '', name: '', branch: 'بغداد', type: 'فرع' })}
        newLabel="موقع جديد"
        searchText={(l) => `${l.code} ${l.name} ${l.branch}`}
        columns={[
          { key: 'c', label: 'الرمز', render: (l) => <button type="button" className="font-medium text-navy hover:underline" dir="ltr" onClick={() => setEdit({ ...l })}>{l.code}</button> },
          { key: 'n', label: 'اسم الموقع', render: (l) => l.name },
          { key: 'b', label: 'الفرع', render: (l) => l.branch },
          { key: 't', label: 'نوع الموقع', render: (l) => l.type },
          { key: 'a', label: 'عدد الموجودات', num: true, render: (l) => at(l.id).length },
          { key: 'v', label: 'إجمالي التكلفة', num: true, render: (l) => money(at(l.id).reduce((s, a) => s + grossValue(a), 0)) },
        ]}
      />
      {edit && (
        <Modal
          title={edit.id ? 'تعديل الموقع' : 'موقع جديد'}
          onClose={() => setEdit(null)}
          footer={<><button type="button" className="btn" onClick={() => setEdit(null)}>إلغاء</button><button type="button" className="btn btn-primary" onClick={save}>حفظ</button></>}
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="رمز الموقع" required><input className="inp" dir="ltr" value={edit.code} onChange={(e) => set('code', e.target.value.toUpperCase())} /></Field>
            <Field label="الفرع" required>
              <Select value={edit.branch} onChange={(v) => set('branch', v)} options={['بغداد', 'البصرة', 'أربيل', 'النجف', 'الموصل'].map((b) => ({ value: b, label: b }))} />
            </Field>
            <Field label="اسم الموقع" required span={2}><input className="inp" value={edit.name} onChange={(e) => set('name', e.target.value)} /></Field>
            <Field label="نوع الموقع">
              <Select value={edit.type} onChange={(v) => set('type', v)} options={['مبنى إداري', 'فرع', 'مستودع', 'معمل', 'موقع مشروع'].map((b) => ({ value: b, label: b }))} />
            </Field>
          </div>
        </Modal>
      )}
    </>
  )
}
