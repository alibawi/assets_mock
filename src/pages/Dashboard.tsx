import { AlertTriangle, CirclePause, FileClock, History, Package, Plus, TrendingDown, Wrench } from 'lucide-react'
import { TODAY } from '../data/lifecycle'
import { Link, useNavigate } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { txSummary } from '../components/Shared'
import { Badge, Card } from '../components/ui'
import { accumOf, bookValue, grossOf, runTotal } from '../data/calc'
import { iqd, money, periodLabel, stateLabel, stateTone, txLabel, txTone } from '../data/format'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { AssetState } from '../data/types'

export default function Dashboard() {
  const { db, can } = useStore()
  const L = useLookups()
  const nav = useNavigate()
  const books = db.assets.filter((a) => a.state === 'running' || a.state === 'paused' || a.state === 'closed')
  const gross = books.reduce((s, a) => s + grossOf(a), 0)
  const accum = books.reduce((s, a) => s + accumOf(db, a), 0)
  const posted = db.runs.filter((r) => r.status === 'posted')
  const lastRun = [...posted].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd))[0]
  const ytd = posted.filter((r) => r.periodEnd.startsWith('2026')).reduce((s, r) => s + runTotal(r), 0)

  const byClass = db.classes.map((c) => {
    const as = books.filter((a) => a.classId === c.id)
    return { c, n: as.length, gross: as.reduce((s, a) => s + grossOf(a), 0), nbv: as.reduce((s, a) => s + bookValue(db, a), 0) }
  }).filter((x) => x.n).sort((a, b) => b.gross - a.gross)
  const max = Math.max(...byClass.map((x) => x.gross), 1)

  const states: AssetState[] = ['draft', 'running', 'paused', 'closed', 'sold', 'disposed', 'cancelled']
  const octPosted = posted.some((r) => r.periodEnd === '2026-10')
  const drafts = db.assets.filter((a) => a.state === 'draft')
  const paused = db.assets.filter((a) => a.state === 'paused')
  const draftRuns = db.runs.filter((r) => r.status === 'draft')
  const overdue = db.maintenance.filter((m) => (m.status === 'planned' || m.status === 'inProgress') && m.plannedDate < TODAY)

  const alerts = [
    !octPosted && { icon: TrendingDown, tone: 'text-amber-600 bg-amber-50', text: `لم تُرحَّل دورة إهلاك ${periodLabel('2026-10')} بعد`, to: '/runs/new' },
    drafts.length > 0 && { icon: Package, tone: 'text-gray-600 bg-gray-100', text: `${drafts.length} أصول بحالة مسودة بانتظار الرسملة`, to: '/assets?state=draft' },
    paused.length > 0 && { icon: CirclePause, tone: 'text-amber-600 bg-amber-50', text: `${paused.length} أصول موقوف إهلاكها`, to: '/assets?state=paused' },
    overdue.length > 0 && { icon: Wrench, tone: 'text-red-600 bg-red-50', text: `${overdue.length} أوامر صيانة متأخرة عن موعدها`, to: '/maintenance?tab=overdue' },
    draftRuns.length > 0 && { icon: FileClock, tone: 'text-sky-600 bg-sky-50', text: `${draftRuns.length} دورة إهلاك محاكاة غير مُرحّلة`, to: '/runs' },
  ].filter(Boolean) as { icon: typeof Package; tone: string; text: string; to: string }[]

  const recent = [...db.txs].sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)).slice(0, 7)

  const kpis = [
    { label: 'أصول في الدفاتر', value: String(books.length), sub: `${db.assets.length} سجل إجمالاً` },
    { label: 'إجمالي القيمة الأصلية', value: iqd(gross), sub: 'شاملة إعادة التقييم' },
    { label: 'مجمّع الاندثار', value: iqd(accum), sub: `${Math.round((accum / (gross || 1)) * 100)}% من القيمة الأصلية` },
    { label: 'القيمة الدفترية', value: iqd(gross - accum), sub: lastRun ? `حتى ${periodLabel(lastRun.periodEnd)}` : '' },
    { label: 'إهلاك 2026 المُرحّل', value: iqd(ytd), sub: `${posted.filter((r) => r.periodEnd.startsWith('2026')).length} دورات` },
  ]

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'لوحة المعلومات' }]}
        title="لوحة الأصول الثابتة"
        actions={
          <>
            {can('post') && <button type="button" className="btn" onClick={() => nav('/runs/new')}><TrendingDown className="h-4 w-4" />دورة إهلاك</button>}
            {can('create') && <button type="button" className="btn btn-primary" onClick={() => nav('/assets/new')}><Plus className="h-4 w-4" />أصل جديد</button>}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className="card px-4 py-3.5">
            <div className="text-xs text-gray-500">{k.label}</div>
            <div className="mt-1 break-all text-base font-bold tabular-nums text-gray-900 xl:text-lg" dir="ltr" style={{ textAlign: 'right' }}>{k.value}</div>
            <div className="mt-0.5 text-[11px] text-gray-400">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="القيمة الأصلية والدفترية حسب الفئة" className="lg:col-span-2">
          <div className="space-y-3">
            {byClass.map(({ c, n, gross, nbv }) => (
              <Link key={c.id} to={`/assets?class=${c.id}`} className="block">
                <div className="mb-1 flex justify-between text-xs">
                  <span className="font-medium text-gray-700">{c.name} <span className="text-gray-400">({n})</span></span>
                  <span className="tabular-nums text-gray-500" dir="ltr">{money(nbv)} / {money(gross)}</span>
                </div>
                <div className="relative h-2.5 overflow-hidden rounded-full bg-gray-100">
                  <div className="absolute inset-y-0 start-0 rounded-full bg-navy/20" style={{ width: `${(gross / max) * 100}%` }} />
                  <div className="absolute inset-y-0 start-0 rounded-full bg-navy" style={{ width: `${(nbv / max) * 100}%` }} />
                </div>
              </Link>
            ))}
            <div className="flex gap-4 pt-1 text-[11px] text-gray-500">
              <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-navy" />القيمة الدفترية</span>
              <span className="flex items-center gap-1"><span className="h-2 w-3 rounded bg-navy/20" />القيمة الأصلية</span>
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

        <Card title="الأصول حسب الحالة">
          <ul className="space-y-2">
            {states.map((s) => (
              <li key={s}>
                <Link to={`/assets?state=${s === 'sold' || s === 'disposed' ? 'out' : s}`} className="flex items-center justify-between rounded-md p-1 hover:bg-gray-50">
                  <Badge tone={stateTone[s]}>{stateLabel[s]}</Badge>
                  <span className="text-sm font-semibold tabular-nums">{db.assets.filter((a) => a.state === s).length}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="آخر الحركات" className="lg:col-span-2" actions={<Link to="/transactions" className="flex items-center gap-1 text-xs text-navy hover:underline"><History className="h-3.5 w-3.5" />كل الحركات</Link>}>
          <ul className="divide-y divide-gray-100">
            {recent.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge tone={txTone[t.type]}>{txLabel[t.type]}</Badge>
                  <div className="min-w-0">
                    <Link to={`/assets/${t.assetId}`} className="text-sm font-medium text-navy hover:underline">{L.asset(t.assetId)?.name}</Link>
                    <div className="truncate text-xs text-gray-500">{txSummary(t, L) || t.notes}</div>
                  </div>
                </div>
                <span className="shrink-0 text-xs text-gray-400" dir="ltr">{t.date}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
