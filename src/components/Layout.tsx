import {
  Archive, ArrowLeftRight, BarChart3, Bell, BellRing, Boxes, Building2, ChevronDown, ChevronLeft, ClipboardList, Cog, Factory,
  FolderKanban, Globe, Handshake, Landmark, Languages, LayoutDashboard, MapPin, Menu, Monitor, Package, Plus, Search,
  Settings, Shield, ShoppingBag, ShoppingCart, Store, Tags, TrendingDown, TrendingUp, Truck, Users, Layers, UserCog, Wrench, RotateCcw, Dot,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { roleLabel } from '../data/format'
import { DATA_VERSION, useStore } from '../data/store'
import { Confirm } from './ui'
import type { RoleId } from '../data/types'

const otherModules: [string, LucideIcon][] = [
  ['الإدارة', Building2], ['إدارة الشحن', Truck], ['نقاط البيع', Store], ['المبيعات', ShoppingCart], ['السوق', Globe],
  ['إدارة المخزون', Boxes], ['إدارة الموارد البشرية', Users], ['المالية', Landmark], ['أمان', Shield],
  ['المشتريات', ShoppingBag], ['الأرشيف', Archive], ['الاستثمارات', TrendingUp], ['إدارة علاقات العملاء', Handshake],
  ['إدارة المشاريع', FolderKanban], ['التصنيع', Factory],
]

export const assetNav: { to: string; label: string; icon: LucideIcon; section?: string; sub?: boolean }[] = [
  { to: '/', label: 'لوحة المعلومات', icon: LayoutDashboard },
  { to: '/assets', label: 'سجل الأصول', icon: Package },
  { to: '/runs', label: 'دورات الإهلاك', icon: TrendingDown },
  { to: '/transactions', label: 'حركات الأصول', icon: ArrowLeftRight },
  { to: '/maintenance', label: 'الصيانة', icon: Wrench },
  { to: '/reports', label: 'التقارير', icon: BarChart3 },
  { to: '/reports?r=register', label: 'سجل الأصول بتاريخ', icon: Dot, sub: true },
  { to: '/reports?r=roll', label: 'جدول الحركة', icon: Dot, sub: true },
  { to: '/reports?r=ledger', label: 'بطاقة الأصل', icon: Dot, sub: true },
  { to: '/reports?r=forecast', label: 'توقّع الإهلاك', icon: Dot, sub: true },
  { to: '/reports?r=location', label: 'حسب الموقع / العهدة', icon: Dot, sub: true },
  { to: '/reports?r=disposals', label: 'الاستبعادات', icon: Dot, sub: true },
  { to: '/reports?r=recon', label: 'مطابقة دفتر الأستاذ', icon: Dot, sub: true },
  { to: '/classes', label: 'فئات الأصول', icon: Tags, section: 'الإعدادات' },
  { to: '/locations', label: 'المواقع', icon: MapPin },
  { to: '/groups', label: 'المجموعات', icon: Layers },
  { to: '/settings', label: 'الصلاحيات والترقيم', icon: Cog },
]

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const { toast } = useStore()
  const loc = useLocation()
  const [open, setOpen] = useState(true)
  const outOfScope = () => toast('هذه الوحدة خارج نطاق النموذج التجريبي')
  const item = 'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-gray-700 hover:bg-gray-100'

  return (
    <aside className={`flex shrink-0 flex-col border-s border-line bg-white transition-all ${collapsed ? 'w-[60px]' : 'w-[230px]'}`}>
      <div className="flex h-14 items-center justify-between border-b border-line px-3">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-navy to-sky-700 text-xs font-bold text-white ring-2 ring-navy/10">E</div>
            <span className="text-base font-bold tracking-wide text-navy" dir="ltr">ENKI ERP</span>
          </div>
        )}
        <button type="button" onClick={onToggle} className="rounded p-1.5 text-gray-500 hover:bg-gray-100"><Menu className="h-5 w-5" /></button>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
        <div className="rounded-md bg-navy-50">
          <button type="button" onClick={() => setOpen((o) => !o)} className={`${item} font-semibold text-navy hover:bg-navy-50`} title="الموجودات الثابتة">
            <ClipboardList className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <><span className="flex-1 text-start">الموجودات الثابتة</span><ChevronLeft className={`h-3.5 w-3.5 transition ${open ? '-rotate-90' : ''}`} /></>}
          </button>
          {open && (
            <div className="space-y-0.5 pb-1.5">
              {assetNav.map(({ to, label, icon: Icon, section, sub }) => sub ? (
                !collapsed && (
                  <Link
                    key={to}
                    to={to}
                    className={`flex items-center gap-1 rounded-md py-1 pe-2 ps-12 text-[12px] ${
                      loc.pathname === '/reports' && (new URLSearchParams(loc.search).get('r') ?? 'register') === new URLSearchParams(to.split('?')[1]).get('r')
                        ? 'font-semibold text-navy' : 'text-gray-500 hover:text-navy'
                    }`}
                  >
                    <Icon className="h-3 w-3 shrink-0" />{label}
                  </Link>
                )
              ) : (
                <div key={to}>
                {section && !collapsed && <div className="pe-2 ps-7 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{section}</div>}
                <NavLink
                  to={to}
                  end={to === '/'}
                  title={label}
                  className={({ isActive }) =>
                    `flex items-center gap-2 rounded-md py-1.5 text-[13px] ${collapsed ? 'justify-center px-2' : 'pe-2 ps-7'} ${
                      isActive ? 'bg-white font-semibold text-navy shadow-sm' : 'text-gray-600 hover:text-navy'
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {!collapsed && label}
                </NavLink>
                </div>
              ))}
            </div>
          )}
        </div>

        {otherModules.map(([label, Icon]) => (
          <button key={label} type="button" onClick={outOfScope} className={item} title={label}>
            <Icon className="h-[18px] w-[18px] shrink-0 text-gray-500" />
            {!collapsed && <><span className="flex-1 text-start">{label}</span><ChevronLeft className="h-3.5 w-3.5 text-gray-400" /></>}
          </button>
        ))}

        <button type="button" onClick={outOfScope} className={item} title="الإشعارات">
          <Bell className="h-[18px] w-[18px] shrink-0 text-gray-500" />
          {!collapsed && <><span className="flex-1 text-start">الإشعارات</span><ChevronLeft className="h-3.5 w-3.5 text-gray-400" /></>}
        </button>
      </nav>

      <div className="space-y-0.5 border-t border-line p-2">
        {([['الإعدادات', Settings], ['اللغة', Languages], ['الاشعارات', BellRing]] as [string, LucideIcon][]).map(([label, Icon]) => (
          <button key={label} type="button" onClick={outOfScope} className={item} title={label}>
            <Icon className="h-[18px] w-[18px] shrink-0 text-gray-500" />
            {!collapsed && <span className="flex-1 text-start">{label}</span>}
          </button>
        ))}
      </div>
    </aside>
  )
}

function RoleMenu() {
  const { db, run, reset, toast } = useStore()
  const [open, setOpen] = useState(false)
  const [ask, setAsk] = useState(false)
  return (
    <div className="relative ms-2 border-s border-line ps-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-md p-1 hover:bg-gray-50">
        <div className="relative">
          <div className="grid h-8 w-8 place-items-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600">SA</div>
          <span className="absolute bottom-0 end-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
        </div>
        <div className="hidden text-start leading-tight md:block">
          <div className="text-[13px] font-semibold" dir="ltr">Super Admin</div>
          <div className="text-[11px] text-gray-500">{roleLabel[db.role]}</div>
        </div>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      </button>
      {open && (
        <div className="absolute end-0 top-11 z-40 w-60 rounded-md border border-line bg-white py-1 shadow-lg">
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-gray-400"><UserCog className="h-3.5 w-3.5" />تبديل الدور (للعرض)</div>
          {(Object.keys(roleLabel) as RoleId[]).map((r) => (
            <button key={r} type="button" onClick={() => { run((d) => { d.role = r }, `الدور الحالي: ${roleLabel[r]}`); setOpen(false) }}
              className={`block w-full px-3 py-1.5 text-start text-sm hover:bg-gray-50 ${db.role === r ? 'font-semibold text-navy' : 'text-gray-700'}`}>
              {roleLabel[r]}
            </button>
          ))}
          <div className="my-1 border-t border-line" />
          <button type="button" onClick={() => { setOpen(false); setAsk(true) }} className="flex w-full items-center gap-1.5 px-3 py-1.5 text-start text-sm text-red-600 hover:bg-red-50">
            <RotateCcw className="h-3.5 w-3.5" />إعادة تعيين البيانات التجريبية
          </button>
          <div className="px-3 pb-1 text-[10px] text-gray-400" dir="ltr">data v{DATA_VERSION}</div>
        </div>
      )}
      {ask && (
        <Confirm danger title="إعادة تعيين البيانات التجريبية" text="سيتم حذف كل التعديلات وإرجاع بيانات العرض الأصلية." onClose={() => setAsk(false)}
          onYes={() => { reset(); toast('تمت إعادة تعيين البيانات التجريبية'); window.location.hash = '#/' }} />
      )}
    </div>
  )
}

function Topbar() {
  const nav = useNavigate()
  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-2 overflow-hidden border-b border-line bg-white px-4">
      <div className="flex items-center gap-2">
        <button type="button" className="btn h-8 w-8 justify-center px-0" title="موجود جديد" onClick={() => nav('/assets/new')}>
          <Plus className="h-4 w-4" />
        </button>
        <div className="relative hidden lg:block">
          <Search className="absolute start-2.5 top-2 h-4 w-4 text-gray-400" />
          <input className="inp w-72 ps-8" placeholder="بحث..." />
          <kbd className="absolute end-2 top-1.5 rounded border border-line bg-gray-50 px-1.5 text-[10px] text-gray-500" dir="ltr">⌘K</kbd>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {[Monitor, Languages, Bell].map((I, i) => (
          <button key={i} type="button" className="relative rounded-md p-2 text-gray-500 hover:bg-gray-100">
            <I className="h-[18px] w-[18px]" />
            {I === Bell && <span className="absolute end-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />}
          </button>
        ))}
        <RoleMenu />
      </div>
    </header>
  )
}

export function AppLayout({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 900)
  return (
    <div className="flex h-full">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto p-5">{children}</main>
      </div>
    </div>
  )
}

export function PageHeader({ crumbs, title, actions, summary, badge }: {
  crumbs: { label: string; to?: string }[]; title: string; actions?: ReactNode
  summary?: { label: string; value: string }; badge?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <nav className="mb-1 flex items-center gap-1 text-xs text-gray-500">
          {[{ label: 'الموجودات الثابتة', to: '/' }, ...crumbs].map((c, i, arr) => (
            <span key={i} className="flex items-center gap-1">
              {c.to && i < arr.length - 1 ? <Link to={c.to} className="hover:text-navy">{c.label}</Link> : <span className="text-gray-700">{c.label}</span>}
              {i < arr.length - 1 && <ChevronLeft className="h-3 w-3" />}
            </span>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">{title}</h1>
          {badge}
        </div>
      </div>
      <div className="no-print flex flex-wrap items-center gap-2">
        {actions}
        {summary && (
          <div className="ms-2 border-s border-line ps-3 text-end leading-tight">
            <div className="text-[11px] text-gray-500">{summary.label}</div>
            <div className="text-sm font-bold tabular-nums text-navy" dir="ltr">{summary.value}</div>
          </div>
        )}
      </div>
    </div>
  )
}
