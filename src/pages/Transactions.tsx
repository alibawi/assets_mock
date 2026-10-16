import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ListView } from '../components/ListView'
import { TxModal, txSummary } from '../components/Shared'
import { Badge, Tabs } from '../components/ui'
import { money, txLabel, txTone } from '../data/format'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { AssetTx, TxType } from '../data/types'

type TabId = 'all' | TxType

/** Activity log across all assets — plan §3.7 AssetTransaction. */
export default function Transactions() {
  const { db } = useStore()
  const L = useLookups()
  const [tab, setTab] = useState<TabId>('all')
  const [open, setOpen] = useState<AssetTx | null>(null)
  const rows = [...db.txs].filter((t) => tab === 'all' || t.type === tab).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number))
  const count = (t: TabId) => db.txs.filter((x) => t === 'all' || x.type === t).length
  const types: TxType[] = ['capitalization', 'revaluation', 'transfer', 'pause', 'resume', 'sale', 'disposal', 'adjustment']

  return (
    <>
      <ListView
        title="حركات الأصول"
        rows={rows}
        onRowClick={setOpen}
        searchText={(t) => `${t.number} ${L.assetLabel(t.assetId)} ${t.notes} ${t.party ?? ''}`}
        tabs={<Tabs<TabId> active={tab} onChange={setTab} tabs={[{ id: 'all', label: 'الكل', count: count('all') }, ...types.map((t) => ({ id: t, label: txLabel[t], count: count(t) }))]} />}
        columns={[
          { key: 'n', label: 'رقم الحركة', render: (t) => <span className="font-medium text-navy" dir="ltr">{t.number}</span> },
          { key: 'd', label: 'التاريخ', render: (t) => <span dir="ltr">{t.date}</span> },
          { key: 't', label: 'النوع', render: (t) => <Badge tone={txTone[t.type]}>{txLabel[t.type]}</Badge> },
          { key: 'a', label: 'الأصل', render: (t) => <Link to={`/assets/${t.assetId}`} onClick={(e) => e.stopPropagation()} className="hover:text-navy hover:underline">{L.assetLabel(t.assetId)}</Link> },
          { key: 's', label: 'التفاصيل', render: (t) => <span className="text-gray-600">{txSummary(t, L)}</span> },
          { key: 'j', label: 'القيد', render: (t) => (t.journal.length ? <span className="text-xs text-emerald-700">{money(t.journal.reduce((s, j) => s + j.debit, 0))}</span> : <span className="text-xs text-gray-400">بلا قيد</span>) },
          { key: 'u', label: 'المستخدم', render: (t) => <span dir="ltr" className="text-xs text-gray-500">{t.user}</span> },
        ]}
      />
      {open && <TxModal tx={open} onClose={() => setOpen(null)} />}
    </>
  )
}
