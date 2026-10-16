import { Download, Plus, Printer, Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from './Layout'
import { Empty } from './ui'
import { useStore } from '../data/store'

export interface Column<T> {
  key: string
  label: string
  render: (row: T) => ReactNode
  num?: boolean
  total?: (rows: T[]) => ReactNode
}

export function ListView<T extends { id: string }>({
  title, crumbs, rows, columns, newTo, newLabel = 'جديد', rowTo, searchText, filters, kpis, onNew,
}: {
  title: string
  crumbs?: { label: string; to?: string }[]
  rows: T[]
  columns: Column<T>[]
  newTo?: string
  newLabel?: string
  onNew?: () => void
  rowTo?: (r: T) => string
  searchText: (r: T) => string
  filters?: ReactNode
  kpis?: { label: string; value: string }[]
}) {
  const nav = useNavigate()
  const { toast } = useStore()
  const [q, setQ] = useState('')
  const shown = useMemo(() => rows.filter((r) => !q || searchText(r).toLowerCase().includes(q.toLowerCase())), [rows, q, searchText])
  const hasTotals = columns.some((c) => c.total)

  return (
    <div>
      <PageHeader
        crumbs={crumbs ?? [{ label: title }]}
        title={title}
        actions={
          <>
            <button type="button" className="btn" onClick={() => toast('تم تصدير القائمة إلى Excel (محاكاة)')}><Download className="h-4 w-4" />تصدير</button>
            <button type="button" className="btn" onClick={() => window.print()}><Printer className="h-4 w-4" />طباعة</button>
            {(newTo || onNew) && (
              <button type="button" className="btn btn-primary" onClick={() => (onNew ? onNew() : nav(newTo!))}>
                <Plus className="h-4 w-4" />{newLabel}
              </button>
            )}
          </>
        }
      />

      {kpis && (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="card px-4 py-3">
              <div className="text-xs text-gray-500">{k.label}</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-gray-900" dir="ltr" style={{ textAlign: 'right' }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-line p-3">
          <div className="relative w-64">
            <Search className="absolute start-2.5 top-2 h-4 w-4 text-gray-400" />
            <input className="inp ps-8" placeholder="بحث في القائمة..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {filters}
          <span className="ms-auto text-xs text-gray-500">{shown.length} سجل</span>
        </div>
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead>
              <tr>{columns.map((c) => <th key={c.key} className={c.num ? '!text-end' : ''}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className={rowTo ? 'cursor-pointer' : ''} onClick={() => rowTo && nav(rowTo(r))}>
                  {columns.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.render(r)}</td>)}
                </tr>
              ))}
            </tbody>
            {hasTotals && shown.length > 0 && (
              <tfoot>
                <tr>
                  {columns.map((c, i) => (
                    <td key={c.key} className={c.num ? 'num' : ''}>{i === 0 ? 'المجموع:' : c.total?.(shown)}</td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
          {shown.length === 0 && <Empty text="لا توجد سجلات مطابقة" />}
        </div>
      </div>
    </div>
  )
}
