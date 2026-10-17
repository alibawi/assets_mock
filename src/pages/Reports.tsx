import { BookOpenCheck, CalendarRange, Download, Layers3, MapPin, Printer, Scale, Table2, Trash2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { sourceLink, TxModal } from '../components/Shared'
import { Field, Select, Tabs } from '../components/ui'
import { assetLedger, reconciliationAsOf, registerAsOf, rollForward } from '../data/asof'
import { periodLabel, money, stateLabel, txLabel } from '../data/format'
import { TODAY } from '../data/lifecycle'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { Asset, AssetTx } from '../data/types'
import { LedgerTable } from './AssetForm'

type R = 'register' | 'forecast' | 'location' | 'disposals' | 'recon' | 'ledger' | 'roll'

export default function Reports() {
  const { toast } = useStore()
  const [params, setParams] = useSearchParams()
  const r = (params.get('r') as R) || 'register'
  const setR = (v: R) => setParams({ r: v })
  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'التقارير' }]}
        title="تقارير الأصول الثابتة"
        actions={
          <>
            <button type="button" className="btn" onClick={() => toast('تم تصدير التقرير إلى Excel (محاكاة)')}><Download className="h-4 w-4" />Excel</button>
            <button type="button" className="btn" onClick={() => window.print()}><Printer className="h-4 w-4" />طباعة</button>
          </>
        }
      />
      <div className="card">
        <Tabs<R>
          active={r}
          onChange={setR}
          tabs={[
            { id: 'register', label: 'سجل الأصول', icon: Table2 },
            { id: 'roll', label: 'جدول الحركة', icon: Layers3 },
            { id: 'ledger', label: 'بطاقة الأصل', icon: BookOpenCheck },
            { id: 'forecast', label: 'توقّع الإهلاك', icon: CalendarRange },
            { id: 'location', label: 'حسب الموقع / العهدة', icon: MapPin },
            { id: 'disposals', label: 'الاستبعادات', icon: Trash2 },
            { id: 'recon', label: 'مطابقة دفتر الأستاذ', icon: Scale },
          ]}
        />
        <div className="overflow-x-auto p-4">
          {r === 'register' && <Register />}
          {r === 'roll' && <RollForward />}
          {r === 'ledger' && <Ledger />}
          {r === 'forecast' && <Forecast />}
          {r === 'location' && <ByLocation />}
          {r === 'disposals' && <Disposals />}
          {r === 'recon' && <Reconciliation />}
        </div>
      </div>
    </div>
  )
}

const Filters = ({ children }: { children: React.ReactNode }) => <div className="no-print mb-4 flex flex-wrap items-end gap-3">{children}</div>
const Head = ({ text }: { text: string }) => <div className="mb-3 text-xs text-gray-500">شركة إنكي للتجارة العامة — {text} — مجال 01 Local GAAP</div>
const DateField = ({ label, value, set }: { label: string; value: string; set: (s: string) => void }) => (
  <Field label={label}><input type="date" className="inp w-44" value={value} max={TODAY} onChange={(e) => set(e.target.value)} /></Field>
)

/** §7.1 — register as of any past date. */
function Register() {
  const { db } = useStore()
  const L = useLookups()
  const [date, setDate] = useState(TODAY)
  const { rows, excludedLegacy } = registerAsOf(db, date)
  const tot = (k: 'cost' | 'accum' | 'nbv' | 'pending' | 'salvage') => rows.reduce((s, r) => s + r[k], 0)
  return (
    <>
      <Filters>
        <DateField label="بتاريخ (asOfDate)" value={date} set={setDate} />
        <span className="text-xs text-gray-500">القيم والموقع والعهدة ومركز الكلفة كما كانت في هذا التاريخ؛ العناصر المعكوسة كأنها لم تحدث.</span>
      </Filters>
      <Head text={`سجل الأصول بتاريخ ${date}`} />
      <table className="tbl">
        <thead><tr><th>رمز الأصل</th><th>الاسم</th><th>الموقع</th><th>العهدة</th><th>مركز الكلفة</th><th className="!text-end">القيمة الأصلية</th><th className="!text-end">المجمّع</th><th className="!text-end">الدفترية</th><th className="!text-end">الإهلاك المعلّق</th><th className="!text-end">التخريدية</th></tr></thead>
        <tbody>
          {db.classes.map((c) => {
            const rs = rows.filter((r) => r.a.classId === c.id)
            if (!rs.length) return null
            const s = (k: 'cost' | 'accum' | 'nbv' | 'pending') => money(rs.reduce((x, r) => x + r[k], 0))
            return (
              <Fragment key={c.id}>
                <tr className="bg-navy-50/60"><td colSpan={10} className="font-semibold text-navy">{c.code} — {c.name}</td></tr>
                {rs.map((r) => (
                  <tr key={r.a.id}>
                    <td dir="ltr" className="text-end"><Link className="text-navy hover:underline" to={`/assets/${r.a.id}`}>{r.a.code}</Link></td>
                    <td>{r.a.name}</td><td>{L.locName(r.locationId)}</td><td>{L.empName(r.custodianId)}</td><td>{L.ccName(r.costCenterId)}</td>
                    <td className="num">{money(r.cost)}</td><td className="num">{money(r.accum)}</td><td className="num">{money(r.nbv)}</td>
                    <td className={`num ${r.pending ? 'text-amber-600' : 'text-gray-300'}`}>{money(r.pending)}</td><td className="num text-gray-500">{money(r.salvage)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold"><td colSpan={5}>إجمالي {c.name}</td><td className="num">{s('cost')}</td><td className="num">{s('accum')}</td><td className="num">{s('nbv')}</td><td className="num">{s('pending')}</td><td /></tr>
              </Fragment>
            )
          })}
        </tbody>
        <tfoot><tr><td colSpan={5}>المجموع الكلي ({rows.length} أصل):</td><td className="num">{money(tot('cost'))}</td><td className="num">{money(tot('accum'))}</td><td className="num">{money(tot('nbv'))}</td><td className="num">{money(tot('pending'))}</td><td className="num">{money(tot('salvage'))}</td></tr></tfoot>
      </table>
      <p className="mt-2 text-xs text-gray-500">
        الإهلاك المعلّق = أقساط غير مُرحّلة بتاريخ ≤ {date} — ليس جزءاً من القيمة الدفترية. القيمة التخريدية لا تُخصم من الدفترية.
        {excludedLegacy > 0 && <b className="ms-1 text-amber-700">{excludedLegacy} أصل قديم مستبعد — تاريخ التقرير يسبق تاريخ قطع الاستيراد.</b>}
      </p>
    </>
  )
}

/** §7.3 — roll-forward with a self-checking "unexplained" column. */
function RollForward() {
  const { db } = useStore()
  const L = useLookups()
  const [from, setFrom] = useState('2026-01-01')
  const [to, setTo] = useState(TODAY)
  const [by, setBy] = useState<'class' | 'group' | 'location'>('class')
  const groupOf = (a: Asset) =>
    by === 'class' ? { key: a.classId, label: L.clsName(a.classId) }
    : by === 'group' ? { key: a.groupId || '-', label: L.groupName(a.groupId) }
    : { key: L.branchOf(a.locationId), label: L.locName(L.branchOf(a.locationId)) }
  const rows = rollForward(db, from, to, groupOf)
  const t = (k: keyof (typeof rows)[number]) => money(rows.reduce((s, r) => s + (r[k] as number), 0))
  const bad = (n: number) => (Math.round(n) ? 'text-red-600 font-bold' : 'text-emerald-700')
  return (
    <>
      <Filters>
        <DateField label="من" value={from} set={setFrom} />
        <DateField label="إلى" value={to} set={setTo} />
        <Field label="التجميع"><div className="w-36"><Select value={by} onChange={(v) => setBy(v)} options={[{ value: 'class', label: 'الفئة' }, { value: 'group', label: 'المجموعة' }, { value: 'location', label: 'الفرع' }]} /></div></Field>
      </Filters>
      <Head text={`جدول حركة الأصول من ${from} إلى ${to}`} />
      <h4 className="mb-1 text-sm font-semibold">التكلفة</h4>
      <table className="tbl mb-5">
        <thead><tr><th>المجموعة</th><th className="!text-end">أول المدة</th><th className="!text-end">إضافات</th><th className="!text-end">تخفيضات</th><th className="!text-end">إعادة تقييم ± هبوط</th><th className="!text-end">أرصدة افتتاحية مستوردة</th><th className="!text-end">استبعادات</th><th className="!text-end">آخر المدة</th><th className="!text-end">غير مفسَّر</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td><td className="num">{money(r.costOpen)}</td><td className="num">{money(r.additions)}</td><td className="num">{money(r.reductions)}</td>
              <td className="num">{money(r.reval)}</td><td className="num">{money(r.opening)}</td><td className="num">{money(r.exits)}</td>
              <td className="num font-semibold">{money(r.costClose)}</td><td className={`num ${bad(r.costUnexplained)}`}>{money(r.costUnexplained)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td>المجموع:</td><td className="num">{t('costOpen')}</td><td className="num">{t('additions')}</td><td className="num">{t('reductions')}</td><td className="num">{t('reval')}</td><td className="num">{t('opening')}</td><td className="num">{t('exits')}</td><td className="num">{t('costClose')}</td><td className="num">{t('costUnexplained')}</td></tr></tfoot>
      </table>
      <h4 className="mb-1 text-sm font-semibold">مجمّع الاندثار</h4>
      <table className="tbl mb-5">
        <thead><tr><th>المجموعة</th><th className="!text-end">أول المدة</th><th className="!text-end">الإهلاك المُرحّل</th><th className="!text-end">مستورد افتتاحي</th><th className="!text-end">المُخرَج بالبيع/الاستبعاد</th><th className="!text-end">آخر المدة</th><th className="!text-end">غير مفسَّر</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.label}</td><td className="num">{money(r.accOpen)}</td><td className="num">{money(r.dep)}</td><td className="num">{money(r.accImported)}</td>
              <td className="num">{money(r.accExits)}</td><td className="num font-semibold">{money(r.accClose)}</td><td className={`num ${bad(r.accUnexplained)}`}>{money(r.accUnexplained)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td>المجموع:</td><td className="num">{t('accOpen')}</td><td className="num">{t('dep')}</td><td className="num">{t('accImported')}</td><td className="num">{t('accExits')}</td><td className="num">{t('accClose')}</td><td className="num">{t('accUnexplained')}</td></tr></tfoot>
      </table>
      <h4 className="mb-1 text-sm font-semibold">القيمة الدفترية</h4>
      <table className="tbl">
        <thead><tr><th>المجموعة</th><th className="!text-end">أول المدة</th><th className="!text-end">صافي الحركة</th><th className="!text-end">آخر المدة</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}><td>{r.label}</td><td className="num">{money(r.costOpen - r.accOpen)}</td><td className="num">{money(r.costClose - r.accClose - (r.costOpen - r.accOpen))}</td><td className="num font-semibold">{money(r.costClose - r.accClose)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-gray-500">التقرير يتحقق من نفسه: أول المدة + الحركات = آخر المدة (من سجل الأصول)، وعمود «غير مفسَّر» يجب أن يكون صفراً. العناصر المعكوسة مستبعدة من الطرفين.</p>
    </>
  )
}

/** §7.2 — asset ledger. */
function Ledger() {
  const { db } = useStore()
  const [id, setId] = useState(db.assets.find((a) => a.id === 'a4')?.id ?? db.assets[0].id)
  const [from, setFrom] = useState('2025-01-01')
  const [to, setTo] = useState(TODAY)
  const [open, setOpen] = useState<AssetTx | null>(null)
  const a = db.assets.find((x) => x.id === id)!
  const { opening, rows } = assetLedger(db, a, from, to, (t) => txLabel[t.type])
  return (
    <>
      <Filters>
        <Field label="الأصل" required><div className="w-96"><Select value={id} onChange={setId} options={db.assets.filter((x) => x.state !== 'draft' && x.state !== 'cancelled').map((x) => ({ value: x.id, label: `${x.code} — ${x.name}` }))} /></div></Field>
      </Filters>
      <Head text={`بطاقة الأصل ${a.code} — ${a.name} (${stateLabel[a.state]})`} />
      <LedgerTable db={db} from={from} to={to} setFrom={setFrom} setTo={setTo} opening={opening} rows={rows} onOpen={setOpen} />
      {open && <TxModal tx={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function Forecast() {
  const { db } = useStore()
  const [from, setFrom] = useState('2026-10-01')
  const [to, setTo] = useState('2027-09-30')
  const running = new Set(db.assets.filter((a) => a.state === 'running').map((a) => a.id))
  const lines = db.lines.filter((l) => !l.isPosted && running.has(l.assetId) && l.date >= from && l.date <= to)
  const clsOf = (aid: string) => db.assets.find((a) => a.id === aid)!.classId
  const periods = [...new Set(lines.map((l) => l.date.slice(0, 7)))].sort()
  const cls = db.classes.filter((c) => lines.some((l) => clsOf(l.assetId) === c.id))
  const cell = (p: string, cid: string) => lines.filter((l) => l.date.startsWith(p) && clsOf(l.assetId) === cid).reduce((s, l) => s + l.amount, 0)
  const rowTot = (p: string) => lines.filter((l) => l.date.startsWith(p)).reduce((s, l) => s + l.amount, 0)
  const colTot = (cid: string) => lines.filter((l) => clsOf(l.assetId) === cid).reduce((s, l) => s + l.amount, 0)
  return (
    <>
      <Filters>
        <Field label="من"><input type="date" className="inp w-44" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="إلى"><input type="date" className="inp w-44" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </Filters>
      <Head text={`توقّع الإهلاك (أقساط غير مُرحّلة للأصول قيد الإهلاك) من ${from} إلى ${to}`} />
      <table className="tbl">
        <thead><tr><th>الفترة</th>{cls.map((c) => <th key={c.id} className="!text-end">{c.name}</th>)}<th className="!text-end">الإجمالي</th></tr></thead>
        <tbody>
          {periods.map((p) => (
            <tr key={p}><td>{periodLabel(p)}</td>{cls.map((c) => <td key={c.id} className="num">{cell(p, c.id) ? money(cell(p, c.id)) : '—'}</td>)}<td className="num font-semibold">{money(rowTot(p))}</td></tr>
          ))}
        </tbody>
        {periods.length > 0 && <tfoot><tr><td>المجموع:</td>{cls.map((c) => <td key={c.id} className="num">{money(colTot(c.id))}</td>)}<td className="num">{money(lines.reduce((s, l) => s + l.amount, 0))}</td></tr></tfoot>}
      </table>
    </>
  )
}

function ByLocation() {
  const { db } = useStore()
  const L = useLookups()
  const [by, setBy] = useState<'location' | 'custodian'>('location')
  const assets = db.assets.filter((a) => ['running', 'paused', 'closed'].includes(a.state))
  const keys = by === 'location'
    ? db.locations.filter((l) => assets.some((a) => a.locationId === l.id)).map((l) => ({ id: l.id, label: L.locPath(l.id) }))
    : db.employees.map((e) => ({ id: e.id, label: `${e.name} — ${e.department}` }))
  return (
    <>
      <Filters>
        <Field label="التجميع حسب"><div className="w-44"><Select value={by} onChange={(v) => setBy(v)} options={[{ value: 'location', label: 'الموقع' }, { value: 'custodian', label: 'صاحب العهدة' }]} /></div></Field>
      </Filters>
      <Head text={`جرد الأصول حسب ${by === 'location' ? 'الموقع' : 'العهدة'} — جرد تنظيمي لا محاسبي (يشمل منخفضة القيمة ومكتملة الإهلاك)`} />
      <table className="tbl">
        <thead><tr><th>رمز الأصل</th><th>الاسم</th><th>رقم الملصق</th><th>الرقم التسلسلي</th><th>{by === 'location' ? 'صاحب العهدة' : 'الموقع'}</th><th>الحالة</th></tr></thead>
        <tbody>
          {keys.map((k) => {
            const as = assets.filter((a) => (by === 'location' ? a.locationId : a.custodianId) === k.id)
            if (!as.length) return null
            return (
              <Fragment key={k.id}>
                <tr className="bg-navy-50/60"><td colSpan={6} className="font-semibold text-navy">{k.label} <span className="font-normal text-gray-500">({as.length})</span></td></tr>
                {as.map((a) => (
                  <tr key={a.id}>
                    <td dir="ltr" className="text-end">{a.code}</td><td>{a.name}</td><td dir="ltr" className="text-end">{a.tagNumber}</td><td dir="ltr" className="text-end">{a.serial}</td>
                    <td>{by === 'location' ? L.empName(a.custodianId) : L.locName(a.locationId)}</td><td className="text-xs">{stateLabel[a.state]}</td>
                  </tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </>
  )
}

function Disposals() {
  const { db } = useStore()
  const L = useLookups()
  const [from, setFrom] = useState('2026-01-01')
  const [to, setTo] = useState(TODAY)
  const [open, setOpen] = useState<AssetTx | null>(null)
  const txs = db.txs.filter((t) => (t.type === 'sale' || t.type === 'disposal') && !t.isReversed && t.date >= from && t.date <= to)
  const nbv = (t: AssetTx) => (t.fromValue ?? 0) - (t.accumulatedAtEvent ?? 0)
  const toDate = (t: AssetTx) => db.lines.find((l) => l.txId === t.id)?.amount ?? 0
  return (
    <>
      <Filters>
        <Field label="من"><input type="date" className="inp w-44" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="إلى"><input type="date" className="inp w-44" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </Filters>
      <Head text={`المبيعات والاستبعادات من ${from} إلى ${to} (المعكوسة مستبعدة)`} />
      <table className="tbl">
        <thead><tr><th>رقم الحركة</th><th>المستند المصدر</th><th>التاريخ</th><th>النوع</th><th>الأصل</th><th>الجهة</th><th className="!text-end">التكلفة</th><th className="!text-end">إهلاك حتى التاريخ</th><th className="!text-end">المجمّع</th><th className="!text-end">الدفترية</th><th className="!text-end">المتحصّل</th><th className="!text-end">ربح / (خسارة)</th></tr></thead>
        <tbody>
          {txs.map((t) => {
            const gl = (t.type === 'sale' ? t.amount : 0) - nbv(t)
            return (
              <tr key={t.id} className="cursor-pointer" onClick={() => setOpen(t)}>
                <td dir="ltr" className="text-end text-navy">{t.number}</td>
                <td dir="ltr" className="text-end">{(() => { const src = sourceLink(db, t); return src ? <Link to={src.to} onClick={(e) => e.stopPropagation()} className="text-navy hover:underline">{src.label}</Link> : '—' })()}</td>
                <td dir="ltr" className="text-end">{t.date}</td><td>{txLabel[t.type]}</td>
                <td>{L.assetLabel(t.assetId)}</td><td>{t.party ?? '—'}</td>
                <td className="num">{money(t.fromValue ?? 0)}</td><td className="num">{money(toDate(t))}</td><td className="num">{money(t.accumulatedAtEvent ?? 0)}</td>
                <td className="num">{money(nbv(t))}</td><td className="num">{money(t.type === 'sale' ? t.amount : 0)}</td>
                <td className={`num ${gl < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{gl < 0 ? `(${money(-gl)})` : money(gl)}</td>
              </tr>
            )
          })}
        </tbody>
        {txs.length > 0 && (
          <tfoot><tr><td colSpan={9}>المجموع:</td><td className="num">{money(txs.reduce((s, t) => s + nbv(t), 0))}</td><td className="num">{money(txs.reduce((s, t) => s + (t.type === 'sale' ? t.amount : 0), 0))}</td><td className="num">{money(txs.reduce((s, t) => s + (t.type === 'sale' ? t.amount : 0) - nbv(t), 0))}</td></tr></tfoot>
        )}
      </table>
      {open && <TxModal tx={open} onClose={() => setOpen(null)} />}
    </>
  )
}

/** Reconciliation with the same asOfDate as the register (§7.1). */
function Reconciliation() {
  const { db } = useStore()
  const L = useLookups()
  const [date, setDate] = useState(TODAY)
  const rows = reconciliationAsOf(db, date)
  const allZero = rows.every((r) => Math.round(r.gl - r.mod) === 0)
  return (
    <>
      <Filters><DateField label="بتاريخ (asOfDate)" value={date} set={setDate} /></Filters>
      <Head text={`مطابقة أرصدة دفتر الأستاذ مع سجل الأصول بتاريخ ${date}`} />
      <div className={`mb-3 rounded-md px-3 py-2 text-sm ${allZero ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
        {allZero ? '✓ لا فروقات — أرصدة الأستاذ العام مطابقة لسجل الأصول بنفس التاريخ.' : '⚠ توجد فروقات تحتاج مراجعة.'}
      </div>
      <table className="tbl">
        <thead><tr><th>الحساب</th><th>البند</th><th className="!text-end">رصيد الأستاذ (PostingDate ≤ التاريخ)</th><th className="!text-end">رصيد السجل</th><th className="!text-end">الفرق</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code + r.kind}>
              <td>{L.acctName(r.code)}</td><td>{r.kind}</td><td className="num">{money(r.gl)}</td><td className="num">{money(r.mod)}</td>
              <td className={`num font-semibold ${Math.round(r.gl - r.mod) ? 'text-red-600' : 'text-emerald-700'}`}>{money(r.gl - r.mod)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-gray-500">رصيد الأستاذ = الأرصدة الافتتاحية + فواتير المشتريات / مذكرات الدائن + كل قيود الوحدة المُرحّلة حتى التاريخ. قيود العكس مؤرَّخة بتاريخ الوثيقة الأصلية فتتصافى بأي تاريخ تاريخي.</p>
    </>
  )
}
