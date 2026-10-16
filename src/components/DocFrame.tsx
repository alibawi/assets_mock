import { BookOpen, Ban, List, MoreHorizontal, Paperclip, Plus, Printer, Send, Trash2, Upload } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from './Layout'
import { Badge, Card, Confirm, Dropdown, Empty, SaveSplit, Select, Tabs } from './ui'
import { docStatusLabel, docStatusTone, money } from '../data/format'
import { useStore } from '../data/store'
import type { DocStatus } from '../data/types'

export interface JournalLine { account: string; desc: string; debit: number; credit: number }

type T = 'lines' | 'journal' | 'files'

export function DocFrame({
  title, listLabel, listTo, number, status, isNew, header, lines, linesCount, journal, summary,
  onSave, onPost, onCancelDoc, onDelete, postNote,
}: {
  title: string
  listLabel: string
  listTo: string
  number: string
  status: DocStatus
  isNew: boolean
  header: ReactNode
  lines: ReactNode
  linesCount: number
  journal: JournalLine[]
  summary?: { label: string; value: string }
  onSave: () => boolean
  onPost: () => boolean
  onCancelDoc: () => void
  onDelete: () => void
  postNote?: string
}) {
  const nav = useNavigate()
  const { toast } = useStore()
  const [tab, setTab] = useState<T>('lines')
  const [ask, setAsk] = useState<null | 'post' | 'cancel' | 'delete'>(null)
  const draft = status === 'draft'
  const dr = journal.reduce((s, j) => s + j.debit, 0)
  const cr = journal.reduce((s, j) => s + j.credit, 0)

  return (
    <div>
      <PageHeader
        crumbs={[{ label: listLabel, to: listTo }, { label: isNew ? 'مستند جديد' : number }]}
        title={isNew ? `${title} — مستند جديد` : `${title} ${number}`}
        badge={<Badge tone={docStatusTone[status]}>{docStatusLabel[status]}</Badge>}
        summary={summary}
        actions={
          <>
            <SaveSplit
              disabled={!draft}
              onSave={() => { if (onSave()) toast('تم حفظ المستند كمسودة') }}
              items={[{ label: 'حفظ وترحيل', onClick: () => setAsk('post') }]}
            />
            <button type="button" className="btn" disabled={!draft || linesCount === 0} onClick={() => setAsk('post')}>
              <Send className="h-4 w-4" />ترحيل
            </button>
            <button type="button" className="btn" onClick={() => nav(listTo)}>إلغاء</button>
            <Dropdown
              label="إجراءات"
              icon={MoreHorizontal}
              items={[
                { label: 'طباعة المستند', icon: Printer, onClick: () => window.print() },
                { label: 'إلغاء المستند', icon: Ban, onClick: () => setAsk('cancel'), disabled: status !== 'posted' },
                { label: 'حذف', icon: Trash2, danger: true, onClick: () => setAsk('delete'), disabled: !draft || isNew },
              ]}
            />
          </>
        }
      />

      {status === 'posted' && (
        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          تم ترحيل هذا المستند وإنشاء القيد المحاسبي. لا يمكن تعديله إلا بإلغائه.
        </div>
      )}
      {status === 'cancelled' && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">هذا المستند ملغى وتم عكس أثره.</div>
      )}

      <Card className="mb-4">{header}</Card>

      <div className="card">
        <Tabs<T>
          active={tab}
          onChange={setTab}
          tabs={[
            { id: 'lines', label: 'الأسطر', icon: List, count: linesCount },
            { id: 'journal', label: 'القيد المحاسبي', icon: BookOpen },
            { id: 'files', label: 'المرفقات', icon: Paperclip },
          ]}
        />
        {tab === 'lines' && lines}
        {tab === 'journal' && (
          <div className="p-4">
            {!draft || journal.length ? (
              <>
                {draft && <p className="mb-2 text-xs text-gray-500">معاينة القيد الذي سيُنشأ عند الترحيل.</p>}
                <table className="tbl">
                  <thead><tr><th>الحساب</th><th>البيان</th><th className="!text-end">مدين</th><th className="!text-end">دائن</th></tr></thead>
                  <tbody>
                    {journal.map((j, i) => (
                      <tr key={i}>
                        <td>{j.account}</td><td className="text-gray-600">{j.desc}</td>
                        <td className="num">{j.debit ? money(j.debit) : ''}</td><td className="num">{j.credit ? money(j.credit) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td>المجموع:</td><td /><td className="num">{money(dr)}</td><td className="num">{money(cr)}</td></tr></tfoot>
                </table>
              </>
            ) : <Empty text="لا يوجد قيد لهذا المستند" />}
          </div>
        )}
        {tab === 'files' && (
          <div className="p-4">
            <button type="button" className="flex w-full flex-col items-center gap-1 rounded-md border-2 border-dashed border-line py-6 text-sm text-gray-500 hover:bg-gray-50" onClick={() => toast('تم رفع المرفق (محاكاة)')}>
              <Upload className="h-5 w-5" />اسحب الملفات هنا أو انقر للرفع
            </button>
          </div>
        )}
      </div>

      {ask === 'post' && (
        <Confirm
          title="ترحيل المستند"
          text={postNote ?? 'سيتم ترحيل المستند وإنشاء القيد المحاسبي وتحديث بطاقات الموجودات. هل تريد المتابعة؟'}
          onYes={() => { if (onPost()) toast('تم ترحيل المستند بنجاح') }}
          onClose={() => setAsk(null)}
        />
      )}
      {ask === 'cancel' && <Confirm danger title="إلغاء المستند" text="سيتم عكس القيد وإرجاع أثر المستند على الموجودات. هل تريد المتابعة؟" onYes={() => { onCancelDoc(); toast('تم إلغاء المستند') }} onClose={() => setAsk(null)} />}
      {ask === 'delete' && <Confirm danger title="حذف المستند" text="هل تريد حذف هذه المسودة؟" onYes={() => { onDelete(); toast('تم حذف المسودة'); nav(listTo) }} onClose={() => setAsk(null)} />}
    </div>
  )
}

/** Asset picker + navy "add line" button shown above a lines grid. */
export function AddLine({ options, onAdd, disabled }: { options: { value: string; label: string }[]; onAdd: (id: string) => void; disabled?: boolean }) {
  const [v, setV] = useState('')
  if (disabled) return null
  return (
    <div className="flex items-center gap-2 border-b border-line p-3">
      <div className="w-96"><Select value={v} onChange={setV} options={options} placeholder="اختر موجوداً لإضافته..." /></div>
      <button type="button" className="btn btn-primary" disabled={!v} onClick={() => { onAdd(v); setV('') }}>
        <Plus className="h-4 w-4" />إضافة سطر
      </button>
    </div>
  )
}

export const RemoveBtn = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
)
