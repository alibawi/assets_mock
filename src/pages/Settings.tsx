import { RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Card, Confirm, Field, FormGrid, NumInput, ReadOnly, SaveSplit, Select } from '../components/ui'
import { methodLabel } from '../data/format'
import { useStore } from '../data/store'
import type { DepMethod, Settings } from '../data/types'

export default function SettingsPage() {
  const { db, update, reset, toast } = useStore()
  const [s, setS] = useState<Settings>(db.settings)
  const [ask, setAsk] = useState(false)
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((p) => ({ ...p, [k]: v }))
  const save = () => { update((d) => { d.settings = s }); toast('تم حفظ الإعدادات') }

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'إعدادات الوحدة' }]}
        title="إعدادات الموجودات الثابتة"
        actions={
          <>
            <SaveSplit onSave={save} items={[{ label: 'استعادة القيم المحفوظة', onClick: () => setS(db.settings) }]} />
            <button type="button" className="btn btn-danger" onClick={() => setAsk(true)}><RotateCcw className="h-4 w-4" />إعادة تعيين بيانات العرض</button>
          </>
        }
      />
      <div className="space-y-4">
        <Card title="عام">
          <FormGrid>
            <Field label="اسم الشركة" required span={2}><input className="inp" value={s.company} onChange={(e) => set('company', e.target.value)} /></Field>
            <Field label="العملة الأساسية"><ReadOnly>{s.currency} — دينار عراقي</ReadOnly></Field>
            <Field label="بداية السنة المالية" required><input type="date" className="inp" value={s.fiscalYearStart} onChange={(e) => set('fiscalYearStart', e.target.value)} /></Field>
            <Field label="بادئة ترميز الموجودات"><input className="inp" dir="ltr" value={s.prefixAsset} onChange={(e) => set('prefixAsset', e.target.value.toUpperCase())} /></Field>
          </FormGrid>
        </Card>
        <Card title="الاستهلاك والرسملة">
          <FormGrid>
            <Field label="طريقة الاستهلاك الافتراضية">
              <Select<DepMethod> value={s.defaultMethod} onChange={(v) => set('defaultMethod', v)} options={[{ value: 'SL', label: methodLabel.SL }, { value: 'DDB', label: methodLabel.DDB }]} />
            </Field>
            <Field label="يوم ترحيل الاستهلاك الشهري" hint="آخر يوم في الشهر = 30"><NumInput value={s.postingDay} onChange={(n) => set('postingDay', n)} /></Field>
            <Field label="حد الرسملة (IQD)" hint="المشتريات الأقل تُحمّل كمصروف"><NumInput value={s.capitalizeThreshold} onChange={(n) => set('capitalizeThreshold', n)} /></Field>
            <Field label="بداية الاستهلاك"><ReadOnly>من شهر بدء الاستخدام</ReadOnly></Field>
            <Field label="الترحيل للمالية"><ReadOnly>تلقائي عند ترحيل المستند</ReadOnly></Field>
          </FormGrid>
        </Card>
        <Card title="ترقيم المستندات">
          <table className="tbl">
            <thead><tr><th>المستند</th><th>البادئة</th><th>الصيغة</th><th>مثال</th></tr></thead>
            <tbody>
              {[['احتساب الاستهلاك', 'DEP'], ['نقل الموجودات', 'TRF'], ['إعادة التقييم', 'RVL'], ['الاستبعاد والبيع', 'DSP'], ['أوامر الصيانة', 'MNT']].map(([n, p]) => (
                <tr key={p}><td>{n}</td><td dir="ltr" className="text-end">{p}</td><td dir="ltr" className="text-end text-gray-500">PREFIX-YYYY-####</td><td dir="ltr" className="text-end">{p}-2026-0001</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      {ask && (
        <Confirm danger title="إعادة تعيين البيانات" text="سيتم حذف كل التعديلات وإرجاع بيانات العرض التجريبية الأصلية." onYes={() => { reset(); toast('تمت إعادة تعيين البيانات'); window.location.hash = '#/' }} onClose={() => setAsk(false)} />
      )}
    </div>
  )
}
