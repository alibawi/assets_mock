import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { sourceLink, TxModal, txSummary } from '../components/Shared'
import { Badge, Empty, Field, Select } from '../components/ui'
import { money, txLabel, txTone } from '../data/format'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { AssetTx, TxType } from '../data/types'

/** Read-only table of transactions — used by the unified log, the asset card and document pages. */
export function TxTable({ rows, hideAsset }: { rows: AssetTx[]; hideAsset?: boolean }) {
  const { db } = useStore()
  const L = useLookups()
  const [open, setOpen] = useState<AssetTx | null>(null)
  if (!rows.length) return <Empty text="لا توجد حركات مطابقة" />
  return (
    <div className="overflow-x-auto">
      <table className="tbl">
        <thead>
          <tr><th>التاريخ الفعلي</th><th>الحركة</th><th>الرقم</th><th>نوع الوثيقة</th>{!hideAsset && <th>الأصل</th>}<th>التفاصيل</th><th>المستند المصدر</th><th className="!text-end">القيد</th></tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const src = sourceLink(db, t)
            return (
              <tr key={t.id} className={`cursor-pointer ${t.isReversed || t.reversedTxId ? 'text-gray-400' : ''}`} onClick={() => setOpen(t)}>
                <td dir="ltr" className="text-end">{t.date}</td>
                <td><span className="flex items-center gap-1"><Badge tone={txTone[t.type]}>{txLabel[t.type]}</Badge>{t.isReversed && !t.reversedTxId && <Badge tone="amber">معكوس</Badge>}{t.reversedTxId && <Badge tone="amber">عكس</Badge>}</span></td>
                <td dir="ltr" className="text-end font-medium text-navy">{t.number}</td>
                <td dir="ltr" className="text-end text-xs text-gray-500">{t.docType || '—'}</td>
                {!hideAsset && <td><Link to={`/assets/${t.assetId}`} onClick={(e) => e.stopPropagation()} className="hover:text-navy hover:underline">{L.assetLabel(t.assetId)}</Link></td>}
                <td className="max-w-[22rem] truncate text-gray-600">{txSummary(t, L)}</td>
                <td>{src ? <Link to={src.to} onClick={(e) => e.stopPropagation()} className="text-xs text-navy hover:underline" dir="ltr">{src.label}</Link> : <span className="text-xs text-gray-400">—</span>}</td>
                <td className="num text-xs">{t.journal.length ? money(t.journal.reduce((s, j) => s + j.debit, 0)) : t.externalJournal.length ? 'من وحدة أخرى' : '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {open && <TxModal tx={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** «سجل حركات الأصول» — read-only, filter by type, asset and date (plan §8, decision e). */
export default function Transactions() {
  const { db } = useStore()
  const L = useLookups()
  const [type, setType] = useState<TxType | ''>('')
  const [asset, setAsset] = useState('')
  const [from, setFrom] = useState('2025-01-01')
  const [to, setTo] = useState('2026-12-31')
  const types = Object.keys(txLabel) as TxType[]
  const rows = db.txs
    .filter((t) => (!type || t.type === type) && (!asset || t.assetId === asset) && t.date >= from && t.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
  return (
    <div>
      <PageHeader crumbs={[{ label: 'الحركات' }, { label: 'سجل حركات الأصول' }]} title="سجل حركات الأصول" />
      <div className="card">
        <div className="no-print flex flex-wrap items-end gap-3 border-b border-line p-3">
          <Field label="نوع الحركة"><div className="w-48"><Select<TxType> value={type} onChange={setType} placeholder="كل الأنواع" options={types.map((t) => ({ value: t, label: txLabel[t] }))} /></div></Field>
          <Field label="الأصل"><div className="w-72"><Select value={asset} onChange={setAsset} placeholder="كل الأصول" options={db.assets.map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))} /></div></Field>
          <Field label="من"><input type="date" className="inp w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="إلى"><input type="date" className="inp w-40" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <span className="ms-auto text-xs text-gray-500">{rows.length} حركة — قراءة فقط؛ الإدخال والعكس من صفحات الحركات وفاتورة المبيعات</span>
        </div>
        <TxTable rows={rows} />
      </div>
      <p className="mt-2 text-xs text-gray-500">{L.assetLabel(asset) !== '—' ? '' : 'العناصر المعكوسة تظهر بلون باهت مع صف العكس المرتبط بها.'}</p>
    </div>
  )
}
