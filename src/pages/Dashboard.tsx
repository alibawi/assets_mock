import { AlertTriangle, ArrowLeftRight, CalendarClock, FileClock, Package, Plus, ShieldCheck, TrendingDown, Wrench } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Card } from '../components/ui'
import { bookedAccum, grossValue, nbvOf } from '../data/calc'
import { iqd, money, periodLabel, today } from '../data/format'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'

export default function Dashboard() {
  const { db } = useStore()
  const L = useLookups()
  const nav = useNavigate()
  const live = db.assets.filter((a) => a.status === 'active' || a.status === 'maintenance')
  const cost = live.reduce((s, a) => s + grossValue(a), 0)
  const accum = live.reduce((s, a) => s + bookedAccum(db, a.id), 0)
  const nbv = cost - accum

  const byCat = db.categories.map((c) => {
    const as = live.filter((a) => a.categoryId === c.id)
    return { c, n: as.length, cost: as.reduce((s, a) => s + grossValue(a), 0), nbv: as.reduce((s, a) => s + nbvOf(db, a), 0) }
  }).sort((a, b) => b.cost - a.cost)
  const maxCost = Math.max(...byCat.map((x) => x.cost), 1)

  const byBranch = ['بغداد', 'البصرة', 'أربيل'].map((b) => {
    const as = live.filter((a) => L.loc(a.locationId)?.branch === b)
    return { b, n: as.length, nbv: as.reduce((s, a) => s + nbvOf(db, a), 0) }
  })

  const octRun = db.depRuns.find((r) => r.period === '2026-10' && r.status === 'posted')
  const warranty = live.filter((a) => a.warrantyEnd >= today() && a.warrantyEnd <= '2027-01-16')
  const openMaint = db.maintenance.filter((m) => m.status === 'draft')
  const drafts = [...db.transfers, ...db.disposals, ...db.revaluations, ...db.depRuns].filter((d) => d.status === 'draft').length
  const draftAssets = db.assets.filter((a) => a.status === 'draft')

  const alerts = [
    !octRun && { icon: TrendingDown, tone: 'text-amber-600 bg-amber-50', text: `لم يتم ترحيل استهلاك ${periodLabel('2026-10')} بعد`, to: '/depreciation/new' },
    openMaint.length > 0 && { icon: Wrench, tone: 'text-sky-600 bg-sky-50', text: `${openMaint.length} أوامر صيانة مفتوحة`, to: '/maintenance' },
    draftAssets.length > 0 && { icon: Package, tone: 'text-gray-600 bg-gray-100', text: `${draftAssets.length} موجود بحالة مسودة بانتظار التفعيل`, to: '/assets?status=draft' },
    drafts > 0 && { icon: FileClock, tone: 'text-gray-600 bg-gray-100', text: `${drafts} مستندات غير مرحّلة`, to: '/transfers' },
    warranty.length > 0 && { icon: ShieldCheck, tone: 'text-emerald-600 bg-emerald-50', text: `${warranty.length} موجودات ينتهي ضمانها خلال 90 يوماً`, to: '/reports' },
  ].filter(Boolean) as { icon: typeof Package; tone: string; text: string; to: string }[]

  const activity = db.assets
    .flatMap((a) => a.history.map((h) => ({ ...h, a })))
    .sort((x, y) => y.date.localeCompare(x.date))
    .slice(0, 7)

  const kpis = [
    { label: 'الموجودات الفعالة', value: String(live.length), sub: `${db.assets.length} إجمالي السجلات` },
    { label: 'إجمالي التكلفة', value: iqd(cost), sub: 'شاملة إعادة التقييم' },
    { label: 'مجمع الاستهلاك', value: iqd(accum), sub: `${Math.round((accum / (cost || 1)) * 100)}% من التكلفة` },
    { label: 'صافي القيمة الدفترية', value: iqd(nbv), sub: `حتى ${periodLabel(octRun ? '2026-10' : '2026-09')}` },
  ]

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'لوحة المعلومات' }]}
        title="لوحة الموجودات الثابتة"
        actions={
          <>
            <button type="button" className="btn" onClick={() => nav('/transfers/new')}><ArrowLeftRight className="h-4 w-4" />نقل</button>
            <button type="button" className="btn" onClick={() => nav('/depreciation/new')}><TrendingDown className="h-4 w-4" />احتساب الاستهلاك</button>
            <button type="button" className="btn btn-primary" onClick={() => nav('/assets/new')}><Plus className="h-4 w-4" />موجود جديد</button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="card px-4 py-3.5">
            <div className="text-xs text-gray-500">{k.label}</div>
            <div className="mt-1 text-xl font-bold tabular-nums text-gray-900" dir="ltr" style={{ textAlign: 'right' }}>{k.value}</div>
            <div className="mt-0.5 text-[11px] text-gray-400">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="التكلفة وصافي القيمة حسب الفئة" className="lg:col-span-2">
          <div className="space-y-3">
            {byCat.map(({ c, n, cost, nbv }) => (
              <Link key={c.id} to={`/assets?cat=${c.id}`} className="block">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-gray-700">{c.name} <span className="text-gray-400">({n})</span></span>
                  <span className="tabular-nums text-gray-500" dir="ltr">{money(nbv)} / {money(cost)}</span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div className="absolute inset-y-0 start-0 rounded-full bg-navy/20" style={{ width: `${(cost / maxCost) * 100}%` }} />
                  <div className="absolute inset-y-0 start-0 rounded-full bg-navy" style={{ width: `${(nbv / maxCost) * 100}%` }} />
                </div>
              </Link>
            ))}
            <div className="flex gap-4 pt-1 text-[11px] text-gray-500">
              <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-navy" />صافي القيمة الدفترية</span>
              <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-navy/20" />التكلفة</span>
            </div>
          </div>
        </Card>

        <Card title="تنبيهات" actions={<AlertTriangle className="h-4 w-4 text-amber-500" />}>
          <ul className="space-y-2">
            {alerts.map((al) => (
              <li key={al.text}>
                <Link to={al.to} className="flex items-center gap-2.5 rounded-md p-1.5 hover:bg-gray-50">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${al.tone}`}><al.icon className="h-4 w-4" /></span>
                  <span className="text-sm text-gray-700">{al.text}</span>
                </Link>
              </li>
            ))}
            {alerts.length === 0 && <li className="text-sm text-gray-400">لا توجد تنبيهات</li>}
          </ul>
        </Card>

        <Card title="التوزيع حسب الفرع">
          <table className="tbl">
            <thead><tr><th>الفرع</th><th className="!text-end">العدد</th><th className="!text-end">صافي القيمة</th></tr></thead>
            <tbody>
              {byBranch.map((b) => (
                <tr key={b.b}><td>{b.b}</td><td className="num">{b.n}</td><td className="num">{money(b.nbv)}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="آخر النشاطات" className="lg:col-span-2" actions={<CalendarClock className="h-4 w-4 text-gray-400" />}>
          <ul className="divide-y divide-gray-100">
            {activity.map((h, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <Link to={`/assets/${h.a.id}`} className="text-sm font-medium text-navy hover:underline">{h.a.name}</Link>
                  <div className="truncate text-xs text-gray-500">{h.action}</div>
                </div>
                <span className="shrink-0 text-xs text-gray-400" dir="ltr">{h.date}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
