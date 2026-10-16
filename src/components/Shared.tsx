import { useState } from 'react'
import { Badge, Confirm, Empty, Modal } from './ui'
import { money, txLabel, txTone } from '../data/format'
import { reverseCostCenterTransfer, reverseExit } from '../data/lifecycle'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { AssetTx, JournalLine } from '../data/types'

export function JournalTable({ lines, note, date }: { lines: JournalLine[]; note?: string; date?: string }) {
  if (!lines.length) return <Empty text={note ?? 'لا يوجد قيد محاسبي لهذه العملية'} />
  const dr = lines.reduce((s, j) => s + j.debit, 0)
  const cr = lines.reduce((s, j) => s + j.credit, 0)
  const cc = lines.some((l) => l.costCenter)
  return (
    <div className="overflow-x-auto">
      {(note || date) && <p className="mb-2 text-xs text-gray-500">{date && <span className="me-2">تاريخ القيد: <b dir="ltr">{date}</b></span>}{note}</p>}
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
    case 'revaluation':
    case 'impairment':
    case 'addition':
    case 'acquisitionReduction': return `القيمة من ${money(t.fromValue ?? 0)} إلى ${money(t.toValue ?? 0)}${t.sourceDocRef ? ` — ${t.sourceDocRef}` : ''}`
    case 'transfer': {
      const parts: string[] = []
      if (t.fromLocationId !== t.toLocationId) parts.push(`${L.locName(t.fromLocationId ?? '')} ← ${L.locName(t.toLocationId ?? '')}`)
      if (t.fromCustodianId !== t.toCustodianId) parts.push(`العهدة: ${L.empName(t.toCustodianId ?? '')}`)
      return parts.join(' · ')
    }
    case 'costCenterTransfer': return `${L.ccName(t.fromCostCenterId ?? '')} ← ${L.ccName(t.toCostCenterId ?? '')} — سريان ${t.date}`
    case 'sale': return `بيع إلى ${t.party} بمبلغ ${money(t.amount)} — التكلفة ${money(t.fromValue ?? 0)}، المجمّع ${money(t.accumulatedAtEvent ?? 0)}`
    case 'disposal': return `التكلفة ${money(t.fromValue ?? 0)}، المجمّع ${money(t.accumulatedAtEvent ?? 0)}، المشطوب ${money((t.fromValue ?? 0) - (t.accumulatedAtEvent ?? 0))}`
    case 'capitalization': return `القيمة الأصلية ${money(t.amount)}`
    case 'manualDepreciation': return `إهلاك يدوي ${money(t.amount)}${t.notes ? ` — ${t.notes}` : ''}`
    case 'openingBalance': return t.notes
    default: return t.notes
  }
}

const REVERSIBLE = ['sale', 'disposal', 'costCenterTransfer']

export function TxModal({ tx, onClose }: { tx: AssetTx; onClose: () => void }) {
  const L = useLookups()
  const { db, run, can } = useStore()
  const [ask, setAsk] = useState(false)
  const live = db.txs.find((t) => t.id === tx.id) ?? tx
  const original = live.reversedTxId ? db.txs.find((t) => t.id === live.reversedTxId) : undefined
  const reversal = db.txs.find((t) => t.reversedTxId === live.id)
  const canReverse = REVERSIBLE.includes(live.type) && !live.isReversed && !live.reversedTxId && can('reverse')
  const reverse = () => run((d) => (live.type === 'costCenterTransfer' ? reverseCostCenterTransfer(d, live.id) : reverseExit(d, live.id)), `تم عكس ${live.number}`)
  return (
    <Modal wide title={`${txLabel[live.type]} — ${live.number}`} onClose={onClose}
      footer={canReverse ? <button type="button" className="btn btn-danger" onClick={() => setAsk(true)}>{live.type === 'sale' ? 'عكس البيع' : live.type === 'disposal' ? 'عكس الاستبعاد' : 'عكس النقل'}</button> : undefined}>
      <div className="mb-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Info label="الأصل" value={L.assetLabel(live.assetId)} />
        <Info label="التاريخ الفعلي" value={live.date} ltr />
        <Info label="النوع / نوع الوثيقة" value={<span className="flex items-center gap-1.5"><Badge tone={txTone[live.type]}>{txLabel[live.type]}</Badge><span className="text-xs text-gray-500" dir="ltr">{live.docType || '—'}</span></span>} />
        <Info label="المستخدم" value={live.user} ltr />
        <div className="col-span-2 md:col-span-4"><Info label="التفاصيل" value={txSummary(live, L) || '—'} /></div>
        {live.notes && live.notes !== txSummary(live, L) && <div className="col-span-2 md:col-span-4"><Info label="ملاحظات" value={live.notes} /></div>}
        {(live.isReversed || original) && (
          <div className="col-span-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 md:col-span-4">
            {live.isReversed && reversal && <>هذه الحركة معكوسة بـ <b dir="ltr">{reversal.number}</b>. </>}
            {original && <>هذه حركة عكس لـ <b dir="ltr">{original.number}</b>، مؤرَّخة بتاريخ الحركة الأصلية. </>}
            العناصر المعكوسة تُعامل في التقارير كأنها لم تحدث.
          </div>
        )}
      </div>
      <h4 className="mb-2 text-sm font-semibold">قيد الوحدة</h4>
      <JournalTable lines={live.journal} date={live.journal.length ? live.date : undefined}
        note={live.type === 'transfer' ? 'النقل لا يُنشئ قيداً (§5.3).' : live.type === 'costCenterTransfer' ? 'بلا قيد افتراضياً — الأقساط من تاريخ السريان تُحمَّل على المركز الجديد (§5.5، §12.6).' : undefined} />
      {live.externalJournal.length > 0 && (
        <div className="mt-4">
          <h4 className="mb-2 text-sm font-semibold text-gray-600">{live.externalNote ?? 'قيد من وحدة أخرى'} <span className="text-xs font-normal text-gray-400">(للمطابقة — لا تُرحّله الوحدة)</span></h4>
          <JournalTable lines={live.externalJournal} />
        </div>
      )}
      {ask && <Confirm danger title="تأكيد العكس" text="يُضاف صف عكس مؤرَّخ بتاريخ الحركة الأصلية مع قيد عكسي، ولا يُعدَّل الصف الأصلي. هل تريد المتابعة؟" onClose={() => setAsk(false)} onYes={() => { if (reverse()) onClose() }} />}
    </Modal>
  )
}

export const Info = ({ label, value, ltr }: { label: string; value: React.ReactNode; ltr?: boolean }) => (
  <div>
    <div className="text-[11px] text-gray-500">{label}</div>
    <div className="mt-0.5 font-medium text-gray-800" dir={ltr ? 'ltr' : undefined} style={ltr ? { textAlign: 'right' } : undefined}>{value}</div>
  </div>
)
