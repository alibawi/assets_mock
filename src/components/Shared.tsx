import { Badge, Empty, Modal } from './ui'
import { money, periodLabel, txLabel, txTone } from '../data/format'
import { useLookups } from '../data/lookups'
import type { AssetTx, JournalLine } from '../data/types'

export function JournalTable({ lines, note }: { lines: JournalLine[]; note?: string }) {
  if (!lines.length) return <Empty text={note ?? 'لا يوجد قيد محاسبي لهذه العملية'} />
  const dr = lines.reduce((s, j) => s + j.debit, 0)
  const cr = lines.reduce((s, j) => s + j.credit, 0)
  const cc = lines.some((l) => l.costCenter)
  return (
    <div className="overflow-x-auto">
      {note && <p className="mb-2 text-xs text-gray-500">{note}</p>}
      <table className="tbl">
        <thead>
          <tr><th>الحساب</th><th>البيان</th>{cc && <th>مركز الكلفة</th>}<th className="!text-end">مدين</th><th className="!text-end">دائن</th></tr>
        </thead>
        <tbody>
          {lines.map((j, i) => (
            <tr key={i}>
              <td className={j.credit ? 'ps-8' : ''}>{j.account}</td>
              <td className="text-gray-600">{j.desc}</td>
              {cc && <td className="text-gray-600">{j.costCenter ?? ''}</td>}
              <td className="num">{j.debit ? money(j.debit) : ''}</td>
              <td className="num">{j.credit ? money(j.credit) : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={cc ? 3 : 2}>المجموع: {dr === cr ? <span className="ms-2 text-xs font-normal text-emerald-700">متوازن ✓</span> : <span className="ms-2 text-xs text-red-600">غير متوازن</span>}</td>
            <td className="num">{money(dr)}</td><td className="num">{money(cr)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export function txSummary(t: AssetTx, L: ReturnType<typeof useLookups>) {
  switch (t.type) {
    case 'revaluation': return `من ${money(t.fromValue ?? 0)} إلى ${money(t.toValue ?? 0)}`
    case 'transfer': {
      const parts: string[] = []
      if (t.fromLocationId !== t.toLocationId) parts.push(`${L.locName(t.fromLocationId ?? '')} ← ${L.locName(t.toLocationId ?? '')}`)
      if (t.fromCustodianId !== t.toCustodianId) parts.push(`العهدة: ${L.empName(t.toCustodianId ?? '')}`)
      if (t.fromCostCenterId !== t.toCostCenterId) parts.push(`مركز الكلفة: ${L.ccName(t.toCostCenterId ?? '')}`)
      return parts.join(' · ')
    }
    case 'sale': return `بيع إلى ${t.party} بمبلغ ${money(t.amount)} — القيمة الدفترية ${money(t.fromValue ?? 0)}`
    case 'disposal': return `القيمة الدفترية المشطوبة ${money(t.fromValue ?? 0)}`
    case 'capitalization': return `القيمة الأصلية ${money(t.amount)}`
    default: return t.notes
  }
}

export function TxModal({ tx, onClose }: { tx: AssetTx; onClose: () => void }) {
  const L = useLookups()
  return (
    <Modal wide title={`${txLabel[tx.type]} — ${tx.number}`} onClose={onClose}>
      <div className="mb-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Info label="الأصل" value={L.assetLabel(tx.assetId)} />
        <Info label="التاريخ" value={tx.date} ltr />
        <Info label="النوع" value={<Badge tone={txTone[tx.type]}>{txLabel[tx.type]}</Badge>} />
        <Info label="المستخدم" value={tx.user} ltr />
        <div className="col-span-2 md:col-span-4"><Info label="التفاصيل" value={txSummary(tx, L) || '—'} /></div>
        {tx.notes && tx.notes !== txSummary(tx, L) && <div className="col-span-2 md:col-span-4"><Info label="ملاحظات" value={tx.notes} /></div>}
      </div>
      <h4 className="mb-2 text-sm font-semibold">القيد المحاسبي</h4>
      <JournalTable lines={tx.journal} note={tx.type === 'transfer' ? 'النقل لا يُنشئ قيداً (§5.3).' : undefined} />
    </Modal>
  )
}

export const Info = ({ label, value, ltr }: { label: string; value: React.ReactNode; ltr?: boolean }) => (
  <div>
    <div className="text-[11px] text-gray-500">{label}</div>
    <div className="mt-0.5 font-medium text-gray-800" dir={ltr ? 'ltr' : undefined} style={ltr ? { textAlign: 'right' } : undefined}>{value}</div>
  </div>
)

export const PeriodText = ({ p }: { p: string }) => <>{periodLabel(p)}</>
