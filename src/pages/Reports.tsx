import { BarChart3, CalendarRange, Download, MapPin, Printer, Scale, Table2, Trash2 } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { Field, Select, Tabs } from '../components/ui'
import { accumOf, runJournal } from '../data/calc'
import { money, periodLabel, stateLabel, txLabel } from '../data/format'
import { TODAY } from '../data/lifecycle'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { Asset, DB } from '../data/types'

type R = 'register' | 'forecast' | 'location' | 'disposals' | 'recon'

export default function Reports() {
  const { toast } = useStore()
  const [r, setR] = useState<R>('register')
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
            { id: 'forecast', label: 'توقّع الإهلاك', icon: CalendarRange },
            { id: 'location', label: 'حسب الموقع / العهدة', icon: MapPin },
            { id: 'disposals', label: 'الاستبعادات', icon: Trash2 },
            { id: 'recon', label: 'مطابقة دفتر الأستاذ', icon: Scale },
          ]}
        />
        <div className="overflow-x-auto p-4">
          {r === 'register' && <Register />}
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
const Head = ({ text }: { text: string }) => <div className="mb-3 text-xs text-gray-500">شركة إنكي للتجارة العامة — {text}</div>

/** Value of an asset as of a date: revaluations dated ≤ date, posted lines dated ≤ date. */
function asOfValues(db: DB, a: Asset, date: string) {
  const reval = db.txs.filter((t) => t.assetId === a.id && t.type === 'revaluation' && t.date <= date).reduce((s, t) => s + t.amount, 0)
  const gross = a.originalValue + reval
  const accum = accumOf(db, a, date)
  return { gross, accum, nbv: gross - accum }
}
function inBooksAt(db: DB, a: Asset, date: string) {
  if (a.state === 'draft') return false
  const start = db.txs.find((t) => t.assetId === a.id && (t.type === 'capitalization' || (t.type === 'adjustment' && a.isLegacy)))
  if (!start || start.date > date) return false
  const out = db.txs.find((t) => t.assetId === a.id && (t.type === 'sale' || t.type === 'disposal'))
  return !out || out.date > date
}

function Register() {
  const { db } = useStore()
  const L = useLookups()
  const [date, setDate] = useState(TODAY)
  const assets = db.assets.filter((a) => inBooksAt(db, a, date))
  const tot = { gross: 0, accum: 0, nbv: 0 }
  return (
    <>
      <Filters><Field label="بتاريخ"><input type="date" className="inp w-44" value={date} onChange={(e) => setDate(e.target.value)} /></Field></Filters>
      <Head text={`سجل الأصول بتاريخ ${date}`} />
      <table className="tbl">
        <thead><tr><th>رمز الأصل</th><th>الاسم</th><th>الموقع</th><th>العهدة</th><th>الحالة الحالية</th><th className="!text-end">القيمة الأصلية</th><th className="!text-end">المجمّع</th><th className="!text-end">الدفترية</th></tr></thead>
        <tbody>
          {db.classes.map((c) => {
            const as = assets.filter((a) => a.classId === c.id)
            if (!as.length) return null
            const v = as.map((a) => asOfValues(db, a, date))
            const s = (k: 'gross' | 'accum' | 'nbv') => v.reduce((x, y) => x + y[k], 0)
            tot.gross += s('gross'); tot.accum += s('accum'); tot.nbv += s('nbv')
            return (
              <Fragment key={c.id}>
                <tr className="bg-navy-50/60"><td colSpan={8} className="font-semibold text-navy">{c.code} — {c.name}</td></tr>
                {as.map((a, i) => (
                  <tr key={a.id}>
                    <td dir="ltr" className="text-end"><Link className="text-navy hover:underline" to={`/assets/${a.id}`}>{a.code}</Link></td>
                    <td>{a.name}</td><td>{L.locName(a.locationId)}</td><td>{L.empName(a.custodianId)}</td><td className="text-xs">{stateLabel[a.state]}</td>
                    <td className="num">{money(v[i].gross)}</td><td className="num">{money(v[i].accum)}</td><td className="num">{money(v[i].nbv)}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold"><td colSpan={5}>إجمالي {c.name}</td><td className="num">{money(s('gross'))}</td><td className="num">{money(s('accum'))}</td><td className="num">{money(s('nbv'))}</td></tr>
              </Fragment>
            )
          })}
        </tbody>
        <tfoot><tr><td colSpan={5}>المجموع الكلي ({assets.length} أصل):</td><td className="num">{money(tot.gross)}</td><td className="num">{money(tot.accum)}</td><td className="num">{money(tot.nbv)}</td></tr></tfoot>
      </table>
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
  const assets = db.assets.filter((a) => a.state !== 'sold' && a.state !== 'disposed' && a.state !== 'draft')
  const keys = by === 'location' ? db.locations.filter((l) => assets.some((a) => a.locationId === l.id)).map((l) => ({ id: l.id, label: L.locPath(l.id) })) : db.employees.map((e) => ({ id: e.id, label: `${e.name} — ${e.department}` }))
  return (
    <>
      <Filters>
        <Field label="التجميع حسب">
          <div className="w-44"><Select value={by} onChange={(v) => setBy(v)} options={[{ value: 'location', label: 'الموقع' }, { value: 'custodian', label: 'صاحب العهدة' }]} /></div>
        </Field>
      </Filters>
      <Head text={`جرد الأصول حسب ${by === 'location' ? 'الموقع' : 'العهدة'} — جرد تنظيمي لا محاسبي`} />
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
  const txs = db.txs.filter((t) => (t.type === 'sale' || t.type === 'disposal') && t.date >= from && t.date <= to)
  return (
    <>
      <Filters>
        <Field label="من"><input type="date" className="inp w-44" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label="إلى"><input type="date" className="inp w-44" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </Filters>
      <Head text={`المبيعات والاستبعادات من ${from} إلى ${to}`} />
      <table className="tbl">
        <thead><tr><th>رقم الحركة</th><th>التاريخ</th><th>النوع</th><th>الأصل</th><th>الجهة</th><th className="!text-end">القيمة الدفترية</th><th className="!text-end">المتحصّل</th><th className="!text-end">ربح / (خسارة)</th></tr></thead>
        <tbody>
          {txs.map((t) => {
            const gl = (t.type === 'sale' ? t.amount : 0) - (t.fromValue ?? 0)
            return (
              <tr key={t.id}>
                <td dir="ltr" className="text-end text-navy">{t.number}</td><td dir="ltr" className="text-end">{t.date}</td><td>{txLabel[t.type]}</td>
                <td>{L.assetLabel(t.assetId)}</td><td>{t.party ?? '—'}</td>
                <td className="num">{money(t.fromValue ?? 0)}</td><td className="num">{money(t.type === 'sale' ? t.amount : 0)}</td>
                <td className={`num ${gl < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{gl < 0 ? `(${money(-gl)})` : money(gl)}</td>
              </tr>
            )
          })}
        </tbody>
        {txs.length > 0 && (
          <tfoot><tr><td colSpan={5}>المجموع:</td><td className="num">{money(txs.reduce((s, t) => s + (t.fromValue ?? 0), 0))}</td><td className="num">{money(txs.reduce((s, t) => s + (t.type === 'sale' ? t.amount : 0), 0))}</td><td className="num">{money(txs.reduce((s, t) => s + (t.type === 'sale' ? t.amount : 0) - (t.fromValue ?? 0), 0))}</td></tr></tfoot>
        )}
      </table>
    </>
  )
}

/** GL balances rebuilt from every journal the module produced plus opening balances and purchase bills. */
function Reconciliation() {
  const { db } = useStore()
  const L = useLookups()
  const gl = new Map<string, number>()
  const add = (code: string, amt: number) => gl.set(code, (gl.get(code) ?? 0) + amt)
  const codeOf = (account: string) => account.split(' — ')[0]
  db.assets.forEach((a) => {
    const c = db.classes.find((x) => x.id === a.classId)!
    if (a.isLegacy) { add(c.assetAcct, a.originalValue); if (c.accumAcct) add(c.accumAcct, -a.importedAccum) } // opening balances
    else if (a.state !== 'draft' && a.sourceDocRef) add(c.assetAcct, a.originalValue) // posted by the purchase bill
  })
  const journals = [...db.txs.flatMap((t) => t.journal), ...db.runs.filter((r) => r.status === 'posted').flatMap((r) => runJournal(db, r))]
  journals.forEach((j) => add(codeOf(j.account), j.debit - j.credit))

  const books = db.assets.filter((a) => a.state === 'running' || a.state === 'paused' || a.state === 'closed')
  const rows: { code: string; kind: string; gl: number; mod: number }[] = []
  ;[...new Set(db.classes.map((c) => c.assetAcct))].forEach((code) => {
    const mod = books.filter((a) => db.classes.find((c) => c.id === a.classId)!.assetAcct === code).reduce((s, a) => s + a.originalValue + a.revaluationAdj, 0)
    rows.push({ code, kind: 'القيمة الأصلية', gl: gl.get(code) ?? 0, mod })
  })
  ;[...new Set(db.classes.map((c) => c.accumAcct).filter(Boolean))].forEach((code) => {
    const mod = books.filter((a) => db.classes.find((c) => c.id === a.classId)!.accumAcct === code).reduce((s, a) => s + accumOf(db, a), 0)
    rows.push({ code, kind: 'مجمّع الاندثار', gl: -(gl.get(code) ?? 0), mod })
  })
  const allZero = rows.every((r) => Math.round(r.gl - r.mod) === 0)
  return (
    <>
      <Head text={`مطابقة أرصدة دفتر الأستاذ مع الوحدة بتاريخ ${TODAY}`} />
      <div className={`mb-3 rounded-md px-3 py-2 text-sm ${allZero ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
        {allZero ? '✓ لا فروقات — أرصدة الأستاذ العام مطابقة لسجل الأصول.' : '⚠ توجد فروقات تحتاج مراجعة.'}
      </div>
      <table className="tbl">
        <thead><tr><th>الحساب</th><th>البند</th><th className="!text-end">رصيد الأستاذ العام</th><th className="!text-end">رصيد الوحدة</th><th className="!text-end">الفرق</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.code + r.kind}>
              <td>{L.acctName(r.code)}</td><td>{r.kind}</td><td className="num">{money(r.gl)}</td><td className="num">{money(r.mod)}</td>
              <td className={`num font-semibold ${Math.round(r.gl - r.mod) ? 'text-red-600' : 'text-emerald-700'}`}>{money(r.gl - r.mod)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 flex items-center gap-1 text-xs text-gray-500"><BarChart3 className="h-3.5 w-3.5" />رصيد الأستاذ = الأرصدة الافتتاحية + فواتير المشتريات + كل قيود الوحدة المُرحّلة.</p>
    </>
  )
}
