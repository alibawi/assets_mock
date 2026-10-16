import { Check, Minus, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Badge, Card, Confirm, Field, NumInput } from '../components/ui'
import { money, months, roleLabel, txLabel } from '../data/format'
import { txDocType } from '../data/lifecycle'
import { permLabel, rolePerms, type Perm } from '../data/permissions'
import { useStore } from '../data/store'
import type { RoleId, TxType } from '../data/types'

// Plan §3.10 — thirteen document types 230–242; 243 is a mock proposal for maintenance.
const docTypes: [string, string, string, string, boolean?][] = [
  ['230', 'FA', 'Fixed Asset', 'الأصل الثابت'],
  ['231', 'ACP', 'Asset Capitalization', 'رسملة أصل'],
  ['232', 'DPR', 'Asset Depreciation Run', 'دورة إهلاك'],
  ['233', 'ARV', 'Asset Revaluation', 'إعادة تقييم (بالزيادة)'],
  ['234', 'ATR', 'Asset Transfer', 'نقل موقع / عهدة'],
  ['235', 'ADS', 'Asset Disposal', 'استبعاد أصل'],
  ['236', 'ASL', 'Asset Sale', 'بيع أصل'],
  ['237', 'ACC', 'Asset Cost Center Transfer', 'نقل مركز كلفة'],
  ['238', 'AIM', 'Asset Impairment', 'هبوط قيمة'],
  ['239', 'AOB', 'Asset Opening Balance', 'رصيد افتتاحي (استيراد)'],
  ['240', 'AAD', 'Asset Addition', 'إضافة لاحقة'],
  ['241', 'ACR', 'Asset Acquisition Reduction', 'تخفيض اقتناء'],
  ['242', 'AMD', 'Asset Manual Depreciation', 'إهلاك يدوي'],
  ['243', 'MNT', 'Asset Maintenance', 'أمر صيانة', true],
]
const journalBy: Record<string, string> = {
  '230': 'لا', '231': 'فقط إذا رحّلت الوحدة الرسملة (§12.3)', '232': 'نعم', '233': 'نعم', '234': 'لا — رقم للتتبّع', '235': 'نعم', '236': 'نعم',
  '237': 'فقط لإعادة التصنيف الاختيارية (§12.6) — معطّلة', '238': 'نعم', '239': 'لا — الأرصدة الافتتاحية عملية مستقلة', '240': 'إلا إذا رحّلتها فاتورة الشراء',
  '241': 'إلا إذا رُحِّلت مذكرة الدائن بذاتها', '242': 'نعم', '243': 'نعم (مصروف) — أو إضافة لاحقة 240 عند الرسملة',
}

// Plan §12 — open decisions and the default the mock applies.
const decisions: [number, string, string][] = [
  [1, 'أرقام حسابات المجمّع وأرباح/خسائر البيع', 'رموز مؤقتة معلَّمة «مقترح» في الدليل'],
  [2, 'عملة الأصل', 'عملة النظام فقط (IQD)'],
  [3, 'قيد الرسملة', 'فاتورة المشتريات تُرحّل الأصل؛ الوحدة ترحّل فقط عند غياب الفاتورة'],
  [4, 'مصدر العهدة', 'قائمة الموظفين (HR.Employee)'],
  [5, 'دورية الإهلاك الافتراضية', 'حقل على مستوى الفئة (المباني سنوية، والبقية شهرية)'],
  [6, 'إعادة تصنيف مصروف السنة عند نقل مركز الكلفة', 'لا قيد — الأقساط المستقبلية فقط'],
  [7, 'محاذاة الفترات الفصلية/السنوية', 'التقويم المالي (يبدأ في كانون الثاني، فيطابق الميلادي)'],
  [8, 'حساب خسارة هبوط القيمة', 'حساب خسائر الاستبعاد إلى حين اعتماد حساب مخصّص'],
  [9, 'الاستبعاد الجزئي', 'غير مدعوم — كل وحدة أصل مستقل (سطر الفاتورة بكمية N ⇒ N أصلاً)'],
  [10, 'سياسة إهلاك فترة الإخراج', 'تتبع تحاصص الفئة (بلا تحاصص ⇒ لا إهلاك في شهر البيع)'],
  [11, 'حدّ الأصول منخفضة القيمة', 'معطّل (null) — قابل للتفعيل أدناه'],
]

export default function SettingsPage() {
  const { db, reset, toast, run, can } = useStore()
  const [ask, setAsk] = useState(false)
  const [threshold, setThreshold] = useState(db.settings.capThreshold)
  const [lv, setLv] = useState(db.settings.lowValueThreshold ?? 1000000)
  const [lvOn, setLvOn] = useState(db.settings.lowValueThreshold !== null)
  const roles = Object.keys(roleLabel) as RoleId[]
  const perms = Object.keys(permLabel) as Perm[]
  const events = Object.keys(txDocType) as TxType[]

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'الإعدادات' }, { label: 'الصلاحيات والترقيم' }]}
        title="الإعدادات والصلاحيات والترقيم"
        actions={<button type="button" className="btn btn-danger" onClick={() => setAsk(true)}><RotateCcw className="h-4 w-4" />إعادة تعيين بيانات العرض</button>}
      />
      <div className="space-y-4">
        <Card title="إعدادات الوحدة">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Field label="بداية السنة المالية" hint="الأرباع والسنوات تتبع التقويم المالي (§5.1.1، §12.7)">
                <div className="inp-ro">{months[db.settings.fiscalStartMonth - 1]} — مجال الإهلاك 01 Local GAAP</div>
              </Field>
            </div>
            <div className="flex items-end gap-2">
              <Field label="حد رسملة تكاليف الصيانة (IQD)" hint="الأقل منه يُحمَّل مصروفاً">
                <div className="w-44"><NumInput value={threshold} disabled={!can('settings')} onChange={setThreshold} /></div>
              </Field>
              <button type="button" className="btn btn-primary" disabled={!can('settings') || threshold === db.settings.capThreshold}
                onClick={() => run((d) => (threshold < 0 ? 'قيمة غير صحيحة' : void (d.settings.capThreshold = threshold)), `حد الرسملة: ${money(threshold)}`)}>حفظ</button>
            </div>
            <div className="flex items-end gap-2">
              <Field label="حدّ الأصول منخفضة القيمة — Assets:LowValueThreshold" hint="يرفض أصول LowValue التي تتجاوزه (§5.6.5)">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={lvOn} disabled={!can('settings')} onChange={(e) => setLvOn(e.target.checked)} />مفعّل</label>
                  <div className="w-36"><NumInput value={lv} disabled={!can('settings') || !lvOn} onChange={setLv} /></div>
                </div>
              </Field>
              <button type="button" className="btn btn-primary" disabled={!can('settings')}
                onClick={() => run((d) => { d.settings.lowValueThreshold = lvOn ? lv : null }, lvOn ? `حد الأصول منخفضة القيمة: ${money(lv)}` : 'تم تعطيل حد الأصول منخفضة القيمة')}>حفظ</button>
            </div>
          </div>
        </Card>

        <Card title="القرارات المفتوحة (§12) — الافتراضي المطبَّق في النموذج" pad={false}>
          <table className="tbl">
            <thead><tr><th>#</th><th>القرار</th><th>الافتراضي في النموذج</th></tr></thead>
            <tbody>{decisions.map(([n, q, d]) => <tr key={n}><td className="text-gray-400">{n}</td><td>{q}</td><td className="text-gray-700">{d}</td></tr>)}</tbody>
          </table>
        </Card>

        <Card title="مصفوفة الصلاحيات (الدور × الصلاحية)" actions={<span className="text-xs text-gray-500">الدور الحالي: <b className="text-navy">{roleLabel[db.role]}</b> — يُبدَّل من قائمة المستخدم أعلى الشاشة</span>} pad={false}>
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>الصلاحية</th>{roles.map((r) => <th key={r} className={`!text-center ${db.role === r ? '!bg-navy-50 !text-navy' : ''}`}>{roleLabel[r]}</th>)}</tr></thead>
              <tbody>
                {perms.map((p) => (
                  <tr key={p}>
                    <td>{permLabel[p]}</td>
                    {roles.map((r) => (
                      <td key={r} className={`text-center ${db.role === r ? 'bg-navy-50/50' : ''}`}>
                        {rolePerms[r].includes(p) ? <Check className="mx-auto h-4 w-4 text-emerald-600" /> : <Minus className="mx-auto h-4 w-4 text-gray-300" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-gray-500">الأدوار تُركَّب من الصلاحيات في شاشة الأدوار ولا تُبرمج كأدوار ثابتة. في النموذج يغيّر تبديل الدور الأزرار المتاحة فقط.</p>
        </Card>

        <Card title="أنواع الوثائق والترقيم (§3.10)" pad={false}>
          <table className="tbl">
            <thead><tr><th>الرمز</th><th>البادئة</th><th>النوع</th><th>الاسم</th><th>قيد يومية؟</th><th>مثال</th></tr></thead>
            <tbody>
              {docTypes.map(([code, pfx, en, ar, proposed]) => (
                <tr key={code}>
                  <td dir="ltr" className="text-end">{code}</td><td dir="ltr" className="text-end font-medium text-navy">{pfx}</td>
                  <td dir="ltr" className="text-end text-gray-600">{en}</td><td>{ar}{proposed && <span className="ms-1.5"><Badge tone="amber">مقترح — خارج الخطة</Badge></span>}</td>
                  <td className="text-xs text-gray-600">{journalBy[code]}</td>
                  <td dir="ltr" className="text-end text-gray-500">{pfx === 'FA' ? 'FA-000031' : `${pfx}-2026-0001`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-gray-500">العكس يعيد استخدام النوع الأصلي (IsReversal) — لا أنواع «عكس» منفصلة. الإيقاف والاستئناف والتسوية والإلغاء بلا نوع وثيقة، تُسجَّل في سجل الأحداث فقط برقم داخلي TRX.</p>
        </Card>

        <Card title="أي حدث يستخدم أي نوع" pad={false}>
          <div className="grid grid-cols-1 gap-x-6 p-4 text-sm md:grid-cols-3">
            {events.map((e) => (
              <div key={e} className="flex justify-between border-b border-gray-100 py-1">
                <span>{txLabel[e]}</span><span dir="ltr" className="text-gray-500">{txDocType[e] || '—'}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      {ask && (
        <Confirm danger title="إعادة تعيين البيانات" text="سيتم حذف كل التعديلات وإرجاع بيانات العرض التجريبية الأصلية." onClose={() => setAsk(false)}
          onYes={() => { reset(); toast('تمت إعادة تعيين البيانات'); window.location.hash = '#/' }} />
      )}
    </div>
  )
}
