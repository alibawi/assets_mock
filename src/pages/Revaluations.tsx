import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AddLine, DocFrame, RemoveBtn, type JournalLine } from '../components/DocFrame'
import { ListView } from '../components/ListView'
import { Badge, Empty, Field, FormGrid, NumInput, ReadOnly } from '../components/ui'
import { nbvOf } from '../data/calc'
import { docStatusLabel, docStatusTone, iqd, money, today } from '../data/format'
import { useLookups } from '../data/lookups'
import { historyEntry, useStore } from '../data/store'
import { useDoc } from '../data/useDoc'
import type { DB, Revaluation } from '../data/types'

const diff = (r: Revaluation) => r.lines.reduce((s, l) => s + l.newValue - l.oldValue, 0)

export function RevaluationsList() {
  const { db } = useStore()
  return (
    <ListView
      title="إعادة التقييم"
      rows={[...db.revaluations].reverse()}
      newTo="/revaluations/new"
      newLabel="مستند إعادة تقييم"
      rowTo={(r) => `/revaluations/${r.id}`}
      searchText={(r) => `${r.number} ${r.appraiser}`}
      columns={[
        { key: 'n', label: 'رقم المستند', render: (r) => <span className="font-medium text-navy" dir="ltr">{r.number}</span> },
        { key: 'd', label: 'التاريخ', render: (r) => <span dir="ltr">{r.date}</span> },
        { key: 'a', label: 'جهة التقييم', render: (r) => r.appraiser || '—' },
        { key: 'c', label: 'عدد الموجودات', num: true, render: (r) => r.lines.length },
        { key: 'v', label: 'فرق التقييم', num: true, render: (r) => money(diff(r)) },
        { key: 's', label: 'الحالة', render: (r) => <Badge tone={docStatusTone[r.status]}>{docStatusLabel[r.status]}</Badge> },
      ]}
    />
  )
}

export function RevaluationForm() {
  const { toast } = useStore()
  const L = useLookups()
  const [params] = useSearchParams()
  const { db, doc, setDoc, persist, remove, isNew } = useDoc('revaluations', 'RVL', '/revaluations', () => ({
    date: today(), status: 'draft', notes: '', appraiser: '', lines: [],
  }))
  const draft = doc.status === 'draft'
  const live = (id: string, stored: number) => {
    const a = L.asset(id)
    return draft && a ? nbvOf(db, a) : stored
  }

  const add = (assetId: string) => {
    const a = L.asset(assetId)!
    const v = nbvOf(db, a)
    setDoc((d) => ({ ...d, lines: [...d.lines, { assetId, oldValue: v, newValue: v }] }))
  }
  useEffect(() => {
    const pre = params.get('asset')
    if (isNew && pre && !doc.lines.length) add(pre)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const post = () => {
    if (!doc.appraiser.trim()) { toast('يرجى إدخال جهة التقييم', 'err'); return false }
    if (!doc.lines.length || doc.lines.every((l) => l.newValue === live(l.assetId, l.oldValue))) { toast('لا يوجد فرق تقييم للترحيل', 'err'); return false }
    const frozen = { ...doc, status: 'posted' as const, lines: doc.lines.map((l) => ({ ...l, oldValue: live(l.assetId, l.oldValue) })) }
    persist(frozen, (d, s) => {
      s.lines.forEach((l) => {
        const a = d.assets.find((x) => x.id === l.assetId)!
        a.revaluation += l.newValue - l.oldValue
        a.history.push(historyEntry(`إعادة تقييم من ${money(l.oldValue)} إلى ${money(l.newValue)}`, s.number))
      })
    })
    return true
  }
  const cancel = () =>
    persist({ ...doc, status: 'cancelled' }, (d, s) => {
      s.lines.forEach((l) => {
        const a = d.assets.find((x) => x.id === l.assetId)!
        a.revaluation -= l.newValue - l.oldValue
        a.history.push(historyEntry('إلغاء إعادة التقييم', s.number))
      })
    })

  const used = new Set(doc.lines.map((l) => l.assetId))
  const options = db.assets.filter((a) => a.status === 'active' && !used.has(a.id)).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))
  const total = doc.lines.reduce((s, l) => s + l.newValue - live(l.assetId, l.oldValue), 0)

  return (
    <DocFrame
      title="إعادة تقييم"
      listLabel="إعادة التقييم"
      listTo="/revaluations"
      number={doc.number}
      status={doc.status}
      isNew={isNew}
      linesCount={doc.lines.length}
      journal={revalJournal(db, doc, live)}
      summary={{ label: 'صافي فرق التقييم', value: iqd(total) }}
      onSave={() => { persist(doc); return true }}
      onPost={post}
      onCancelDoc={cancel}
      onDelete={remove}
      header={
        <FormGrid>
          <Field label="رقم المستند"><ReadOnly ltr>{doc.number}</ReadOnly></Field>
          <Field label="تاريخ التقييم" required><input type="date" className="inp" disabled={!draft} value={doc.date} onChange={(e) => setDoc({ ...doc, date: e.target.value })} /></Field>
          <Field label="جهة التقييم" required span={2}><input className="inp" disabled={!draft} value={doc.appraiser} onChange={(e) => setDoc({ ...doc, appraiser: e.target.value })} /></Field>
          <Field label="ملاحظات"><input className="inp" disabled={!draft} value={doc.notes} onChange={(e) => setDoc({ ...doc, notes: e.target.value })} /></Field>
        </FormGrid>
      }
      lines={
        <>
          <AddLine options={options} onAdd={add} disabled={!draft} />
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>#</th><th>الموجود</th><th>الفئة</th><th className="!text-end">القيمة الدفترية الحالية</th><th className="!text-end w-44">القيمة العادلة</th><th className="!text-end">الفرق</th>{draft && <th />}</tr></thead>
              <tbody>
                {doc.lines.map((l, i) => {
                  const old = live(l.assetId, l.oldValue)
                  const d = l.newValue - old
                  return (
                    <tr key={l.assetId}>
                      <td className="text-gray-400">{i + 1}</td>
                      <td>{L.assetLabel(l.assetId)}</td>
                      <td>{L.catName(L.asset(l.assetId)?.categoryId ?? '')}</td>
                      <td className="num">{money(old)}</td>
                      <td className="num">{draft ? <NumInput value={l.newValue} onChange={(n) => setDoc({ ...doc, lines: doc.lines.map((x) => (x.assetId === l.assetId ? { ...x, newValue: n } : x)) })} /> : money(l.newValue)}</td>
                      <td className={`num ${d < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{money(d)}</td>
                      {draft && <td><RemoveBtn onClick={() => setDoc({ ...doc, lines: doc.lines.filter((x) => x.assetId !== l.assetId) })} /></td>}
                    </tr>
                  )
                })}
              </tbody>
              {doc.lines.length > 0 && <tfoot><tr><td colSpan={5}>المجموع:</td><td className="num">{money(total)}</td>{draft && <td />}</tr></tfoot>}
            </table>
            {doc.lines.length === 0 && <Empty text="أضف الموجودات المراد إعادة تقييمها" />}
          </div>
        </>
      }
    />
  )
}

function revalJournal(db: DB, r: Revaluation, live: (id: string, v: number) => number): JournalLine[] {
  const out: JournalLine[] = []
  r.lines.forEach((l) => {
    const a = db.assets.find((x) => x.id === l.assetId)
    if (!a) return
    const c = db.categories.find((x) => x.id === a.categoryId)!
    const d = l.newValue - live(l.assetId, l.oldValue)
    if (!d) return
    const desc = `إعادة تقييم ${a.code}`
    if (d > 0) {
      out.push({ account: c.assetAccount, desc, debit: d, credit: 0 })
      out.push({ account: '3310 - فائض إعادة التقييم', desc, debit: 0, credit: d })
    } else {
      out.push({ account: '5390 - خسائر انخفاض قيمة الموجودات', desc, debit: -d, credit: 0 })
      out.push({ account: c.assetAccount, desc, debit: 0, credit: -d })
    }
  })
  return out
}
