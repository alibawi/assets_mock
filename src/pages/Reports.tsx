import { BarChart3, Download, Printer, Shield, Table2, Users } from 'lucide-react'
import { Fragment, useState } from 'react'
import { PageHeader } from '../components/Layout'
import { Select, Tabs } from '../components/ui'
import { bookedAccum, grossValue, monthIndex, nbvOf } from '../data/calc'
import { assetStatusLabel, money, periodLabel, today } from '../data/format'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'

type R = 'register' | 'rollforward' | 'custody' | 'warranty'

export default function Reports() {
  const { db, toast } = useStore()
  const L = useLookups()
  const [r, setR] = useState<R>('register')
  const [branch, setBranch] = useState('')

  const inBranch = (locId: string) => !branch || L.loc(locId)?.branch === branch
  const live = db.assets.filter((a) => (a.status === 'active' || a.status === 'maintenance') && inBranch(a.locationId))

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'التقارير' }]}
        title="تقارير الموجودات الثابتة"
        actions={
          <>
            <div className="w-40"><Select value={branch} onChange={setBranch} placeholder="كل الفروع" options={['بغداد', 'البصرة', 'أربيل'].map((b) => ({ value: b, label: b }))} /></div>
            <button type="button" className="btn" onClick={() => toast('تم تصدير التقرير إلى Excel (محاكاة)')}><Download className="h-4 w-4" />تصدير</button>
            <button type="button" className="btn" onClick={() => window.print()}><Printer className="h-4 w-4" />طباعة</button>
          </>
        }
      />
      <div className="card">
        <Tabs<R>
          active={r}
          onChange={setR}
          tabs={[
            { id: 'register', label: 'سجل الموجودات حسب الفئة', icon: Table2 },
            { id: 'rollforward', label: 'حركة الموجودات والاستهلاك', icon: BarChart3 },
            { id: 'custody', label: 'العهد حسب الموظف', icon: Users },
            { id: 'warranty', label: 'الضمان والتأمين', icon: Shield },
          ]}
        />
        <div className="overflow-x-auto p-4">
          <div className="mb-3 text-xs text-gray-500">{db.settings.company} — بتاريخ {today()} {branch && `— فرع ${branch}`}</div>

          {r === 'register' && (
            <table className="tbl">
              <thead><tr><th>رمز الموجود</th><th>الاسم</th><th>الموقع</th><th>تاريخ الاستخدام</th><th className="!text-end">التكلفة</th><th className="!text-end">مجمع الاستهلاك</th><th className="!text-end">صافي القيمة</th></tr></thead>
              <tbody>
                {db.categories.map((c) => {
                  const as = live.filter((a) => a.categoryId === c.id)
                  if (!as.length) return null
                  const sum = (f: (a: typeof as[number]) => number) => money(as.reduce((s, a) => s + f(a), 0))
                  return (
                    <Fragment key={c.id}>
                      <tr className="bg-navy-50/60"><td colSpan={7} className="font-semibold text-navy">{c.name}</td></tr>
                      {as.map((a) => (
                        <tr key={a.id}>
                          <td dir="ltr" className="text-end">{a.code}</td><td>{a.name}</td><td>{L.locName(a.locationId)}</td><td dir="ltr" className="text-end">{a.inServiceDate}</td>
                          <td className="num">{money(grossValue(a))}</td><td className="num">{money(bookedAccum(db, a.id))}</td><td className="num">{money(nbvOf(db, a))}</td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50 font-semibold">
                        <td colSpan={4}>إجمالي {c.name}</td>
                        <td className="num">{sum(grossValue)}</td><td className="num">{sum((a) => bookedAccum(db, a.id))}</td><td className="num">{sum((a) => nbvOf(db, a))}</td>
                      </tr>
                    </Fragment>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>المجموع الكلي:</td>
                  <td className="num">{money(live.reduce((s, a) => s + grossValue(a), 0))}</td>
                  <td className="num">{money(live.reduce((s, a) => s + bookedAccum(db, a.id), 0))}</td>
                  <td className="num">{money(live.reduce((s, a) => s + nbvOf(db, a), 0))}</td>
                </tr>
              </tfoot>
            </table>
          )}

          {r === 'rollforward' && <RollForward branchFilter={inBranch} />}

          {r === 'custody' && (
            <table className="tbl">
              <thead><tr><th>الموظف</th><th>القسم</th><th>الموجود</th><th>الموقع</th><th>الحالة</th><th className="!text-end">صافي القيمة</th></tr></thead>
              <tbody>
                {db.employees.map((e) => {
                  const as = live.filter((a) => a.custodianId === e.id)
                  return as.map((a, i) => (
                    <tr key={a.id}>
                      {i === 0 && <td rowSpan={as.length} className="border-e border-gray-100 align-top font-semibold">{e.name}<div className="text-xs font-normal text-gray-500">{as.length} موجود</div></td>}
                      {i === 0 && <td rowSpan={as.length} className="border-e border-gray-100 align-top">{e.department}</td>}
                      <td>{L.assetLabel(a.id)}</td><td>{L.locName(a.locationId)}</td><td>{assetStatusLabel[a.status]}</td><td className="num">{money(nbvOf(db, a))}</td>
                    </tr>
                  ))
                })}
              </tbody>
            </table>
          )}

          {r === 'warranty' && (
            <table className="tbl">
              <thead><tr><th>الموجود</th><th>المورد</th><th>الرقم التسلسلي</th><th>نهاية الضمان</th><th>المتبقي</th></tr></thead>
              <tbody>
                {[...live].sort((a, b) => a.warrantyEnd.localeCompare(b.warrantyEnd)).map((a) => {
                  const days = Math.round((new Date(a.warrantyEnd).getTime() - new Date(today()).getTime()) / 864e5)
                  return (
                    <tr key={a.id}>
                      <td>{L.assetLabel(a.id)}</td><td>{a.supplier}</td><td dir="ltr" className="text-end">{a.serial}</td><td dir="ltr" className="text-end">{a.warrantyEnd}</td>
                      <td className={days < 0 ? 'text-gray-400' : days <= 90 ? 'font-semibold text-amber-600' : 'text-emerald-700'}>{days < 0 ? 'منتهي' : `${days} يوم`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

function RollForward({ branchFilter }: { branchFilter: (locId: string) => boolean }) {
  const { db } = useStore()
  const yStart = monthIndex(db.settings.fiscalYearStart)
  const rows = db.categories.map((c) => {
    const all = db.assets.filter((a) => a.categoryId === c.id && a.status !== 'draft' && branchFilter(a.locationId))
    const isNewThisYear = (a: typeof all[number]) => monthIndex(a.inServiceDate) >= yStart
    const disposedIds = new Set(db.disposals.filter((d) => d.status === 'posted').flatMap((d) => d.lines.map((l) => l.assetId)))
    const opening = all.filter((a) => !isNewThisYear(a)).reduce((s, a) => s + a.cost, 0)
    const additions = all.filter(isNewThisYear).reduce((s, a) => s + a.cost, 0)
    const reval = all.reduce((s, a) => s + a.revaluation, 0)
    const disposals = all.filter((a) => disposedIds.has(a.id)).reduce((s, a) => s + grossValue(a), 0)
    const dep = db.depRuns.filter((r) => r.status === 'posted').flatMap((r) => r.lines).filter((l) => all.some((a) => a.id === l.assetId)).reduce((s, l) => s + l.amount, 0)
    const accum = all.filter((a) => !disposedIds.has(a.id)).reduce((s, a) => s + bookedAccum(db, a.id), 0)
    const closing = opening + additions + reval - disposals
    return { c, opening, additions, reval, disposals, closing, dep, accum, nbv: closing - accum }
  })
  const t = (k: keyof (typeof rows)[number]) => money(rows.reduce((s, r) => s + (r[k] as number), 0))
  return (
    <>
      <div className="mb-2 text-xs text-gray-500">السنة المالية 2026 — الاستهلاك المرحّل حتى {periodLabel([...db.depRuns].filter((r) => r.status === 'posted').map((r) => r.period).sort().pop() ?? '2026-09')}</div>
      <table className="tbl">
        <thead><tr><th>الفئة</th><th className="!text-end">رصيد أول المدة</th><th className="!text-end">الإضافات</th><th className="!text-end">إعادة التقييم</th><th className="!text-end">الاستبعادات</th><th className="!text-end">رصيد آخر المدة</th><th className="!text-end">استهلاك السنة</th><th className="!text-end">مجمع الاستهلاك</th><th className="!text-end">صافي القيمة</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.c.id}>
              <td>{r.c.name}</td><td className="num">{money(r.opening)}</td><td className="num">{money(r.additions)}</td><td className="num">{money(r.reval)}</td>
              <td className="num">{r.disposals ? `(${money(r.disposals)})` : '0'}</td><td className="num font-semibold">{money(r.closing)}</td>
              <td className="num">{money(r.dep)}</td><td className="num">{money(r.accum)}</td><td className="num font-semibold">{money(r.nbv)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td>المجموع:</td><td className="num">{t('opening')}</td><td className="num">{t('additions')}</td><td className="num">{t('reval')}</td><td className="num">{t('disposals')}</td><td className="num">{t('closing')}</td><td className="num">{t('dep')}</td><td className="num">{t('accum')}</td><td className="num">{t('nbv')}</td></tr>
        </tfoot>
      </table>
    </>
  )
}
