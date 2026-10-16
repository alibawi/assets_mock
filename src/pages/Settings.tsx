import { Check, Minus, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Card, Confirm } from '../components/ui'
import { roleLabel } from '../data/format'
import { permLabel, rolePerms, type Perm } from '../data/permissions'
import { useStore } from '../data/store'
import type { RoleId } from '../data/types'

// Plan §3.10 document types.
const docTypes = [
  ['230', 'FA', 'Fixed Asset', 'الأصل الثابت'],
  ['231', 'ACP', 'Asset Capitalization', 'رسملة أصل'],
  ['232', 'DPR', 'Asset Depreciation Run', 'دورة إهلاك'],
  ['233', 'ARV', 'Asset Revaluation', 'إعادة تقييم'],
  ['234', 'ATR', 'Asset Transfer', 'نقل أصل'],
  ['235', 'ADS', 'Asset Disposal', 'استبعاد أصل'],
  ['236', 'ASL', 'Asset Sale', 'بيع أصل'],
]

export default function SettingsPage() {
  const { db, reset, toast } = useStore()
  const [ask, setAsk] = useState(false)
  const roles = Object.keys(roleLabel) as RoleId[]
  const perms = Object.keys(permLabel) as Perm[]

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'الإعدادات' }, { label: 'الصلاحيات والترقيم' }]}
        title="الصلاحيات والترقيم"
        actions={<button type="button" className="btn btn-danger" onClick={() => setAsk(true)}><RotateCcw className="h-4 w-4" />إعادة تعيين بيانات العرض</button>}
      />
      <div className="space-y-4">
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

        <Card title="أنواع الوثائق والترقيم" pad={false}>
          <table className="tbl">
            <thead><tr><th>الرمز</th><th>البادئة</th><th>النوع</th><th>الاسم</th><th>الوحدة</th><th>مثال</th></tr></thead>
            <tbody>
              {docTypes.map(([code, pfx, en, ar]) => (
                <tr key={code}>
                  <td dir="ltr" className="text-end">{code}</td><td dir="ltr" className="text-end font-medium text-navy">{pfx}</td>
                  <td dir="ltr" className="text-end text-gray-600">{en}</td><td>{ar}</td><td dir="ltr" className="text-end">Assets</td>
                  <td dir="ltr" className="text-end text-gray-500">{pfx === 'FA' ? 'FA-000025' : `${pfx}-2026-0001`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
      {ask && (
        <Confirm danger title="إعادة تعيين البيانات" text="سيتم حذف كل التعديلات وإرجاع بيانات العرض التجريبية الأصلية." onClose={() => setAsk(false)}
          onYes={() => { reset(); toast('تمت إعادة تعيين البيانات'); window.location.hash = '#/' }} />
      )}
    </div>
  )
}
