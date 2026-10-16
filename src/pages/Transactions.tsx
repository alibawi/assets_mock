import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ListView } from '../components/ListView'
import { TxModal, txSummary } from '../components/Shared'
import { Badge, Tabs } from '../components/ui'
import { money, txLabel, txTone } from '../data/format'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { AssetTx, TxType } from '../data/types'

type TabId = 'all' | 'value' | 'moves' | 'exits' | 'depr' | 'state' | 'reversed'
const groups: Record<Exclude<TabId, 'all' | 'reversed'>, { label: string; types: TxType[] }> = {
  value: { label: 'القيمة', types: ['capitalization', 'capitalizationReversal', 'openingBalance', 'addition', 'acquisitionReduction', 'revaluation', 'impairment'] },
  depr: { label: 'إهلاك يدوي', types: ['manualDepreciation'] },
  moves: { label: 'النقل', types: ['transfer', 'costCenterTransfer'] },
  exits: { label: 'البيع والاستبعاد', types: ['sale', 'saleReversal', 'disposal', 'disposalReversal'] },
  state: { label: 'الحالة والتسويات', types: ['pause', 'resume', 'adjustment', 'cancellation'] },
}

/** Activity log across all assets — plan §3.7 AssetTransaction. */
export default function Transactions() {
  const { db } = useStore()
  const L = useLookups()
  const [tab, setTab] = useState<TabId>('all')
  const [open, setOpen] = useState<AssetTx | null>(null)
  const match = (t: AssetTx, id: TabId) => id === 'all' || (id === 'reversed' ? t.isReversed || !!t.reversedTxId : groups[id].types.includes(t.type))
  const rows = db.txs.filter((t) => match(t, tab)).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
  const count = (id: TabId) => db.txs.filter((t) => match(t, id)).length

  return (
    <>
      <ListView
        title="حركات الأصول"
        rows={rows}
        onRowClick={setOpen}
        searchText={(t) => `${t.number} ${L.assetLabel(t.assetId)} ${t.notes} ${t.party ?? ''} ${t.sourceDocRef ?? ''}`}
        tabs={
          <Tabs<TabId>
            active={tab}
            onChange={setTab}
            tabs={[
              { id: 'all', label: 'الكل', count: count('all') },
              ...(Object.keys(groups) as (keyof typeof groups)[]).map((k) => ({ id: k, label: groups[k].label, count: count(k) })),
              { id: 'reversed', label: 'معكوسة / عكس', count: count('reversed') },
            ]}
          />
        }
        columns={[
          { key: 'n', label: 'رقم الحركة', render: (t) => <span className="font-medium text-navy" dir="ltr">{t.number}</span> },
          { key: 'dt', label: 'نوع الوثيقة', render: (t) => <span dir="ltr" className="text-xs text-gray-500">{t.docType || '—'}</span> },
          { key: 'd', label: 'التاريخ الفعلي', render: (t) => <span dir="ltr">{t.date}</span> },
          { key: 't', label: 'النوع', render: (t) => <span className="flex items-center gap-1"><Badge tone={txTone[t.type]}>{txLabel[t.type]}</Badge>{t.isReversed && <Badge tone="amber">معكوس</Badge>}</span> },
          { key: 'a', label: 'الأصل', render: (t) => <Link to={`/assets/${t.assetId}`} onClick={(e) => e.stopPropagation()} className="hover:text-navy hover:underline">{L.assetLabel(t.assetId)}</Link> },
          { key: 's', label: 'التفاصيل', render: (t) => <span className="text-gray-600">{txSummary(t, L)}</span> },
          { key: 'j', label: 'القيد', render: (t) => (t.journal.length ? <span className="text-xs text-emerald-700">{money(t.journal.reduce((s, j) => s + j.debit, 0))}</span> : t.externalJournal.length ? <span className="text-xs text-gray-500">من وحدة أخرى</span> : <span className="text-xs text-gray-400">بلا قيد</span>) },
        ]}
      />
      {open && <TxModal tx={open} onClose={() => setOpen(null)} />}
    </>
  )
}
