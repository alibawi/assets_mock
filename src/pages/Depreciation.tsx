import { Calculator } from 'lucide-react'
import { DocFrame, RemoveBtn, type JournalLine } from '../components/DocFrame'
import { ListView } from '../components/ListView'
import { Badge, Empty, Field, FormGrid, NumInput, ReadOnly, Select } from '../components/ui'
import { bookedAccum, computeRun, grossValue } from '../data/calc'
import { docStatusLabel, docStatusTone, iqd, money, periodLabel, today } from '../data/format'
import { useLookups } from '../data/lookups'
import { historyEntry, useStore } from '../data/store'
import { useDoc } from '../data/useDoc'
import type { DB, DepRun } from '../data/types'

const periods = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)
const total = (r: DepRun) => r.lines.reduce((s, l) => s + l.amount, 0)

export function DepreciationList() {
  const { db } = useStore()
  return (
    <ListView
      title="احتساب الاستهلاك"
      rows={[...db.depRuns].sort((a, b) => b.period.localeCompare(a.period))}
      newTo="/depreciation/new"
      newLabel="احتساب جديد"
      rowTo={(r) => `/depreciation/${r.id}`}
      searchText={(r) => `${r.number} ${periodLabel(r.period)}`}
      columns={[
        { key: 'n', label: 'رقم المستند', render: (r) => <span className="font-medium text-navy" dir="ltr">{r.number}</span> },
        { key: 'p', label: 'الفترة', render: (r) => periodLabel(r.period) },
        { key: 'd', label: 'تاريخ الترحيل', render: (r) => <span dir="ltr">{r.date}</span> },
        { key: 'c', label: 'عدد الموجودات', num: true, render: (r) => r.lines.length },
        { key: 't', label: 'مبلغ الاستهلاك', num: true, render: (r) => money(total(r)), total: (rs) => money(rs.filter((r) => r.status === 'posted').reduce((s, r) => s + total(r), 0)) },
        { key: 's', label: 'الحالة', render: (r) => <Badge tone={docStatusTone[r.status]}>{docStatusLabel[r.status]}</Badge> },
      ]}
    />
  )
}

export function depJournal(db: DB, r: DepRun): JournalLine[] {
  const byCat = new Map<string, number>()
  r.lines.forEach((l) => {
    const a = db.assets.find((x) => x.id === l.assetId)
    if (a) byCat.set(a.categoryId, (byCat.get(a.categoryId) ?? 0) + l.amount)
  })
  const out: JournalLine[] = []
  byCat.forEach((amt, cid) => {
    const c = db.categories.find((x) => x.id === cid)!
    out.push({ account: c.expenseAccount, desc: `استهلاك ${periodLabel(r.period)} — ${c.name}`, debit: amt, credit: 0 })
  })
  byCat.forEach((amt, cid) => {
    const c = db.categories.find((x) => x.id === cid)!
    out.push({ account: c.accumAccount, desc: `استهلاك ${periodLabel(r.period)} — ${c.name}`, debit: 0, credit: amt })
  })
  return out
}

export function DepreciationForm() {
  const { toast } = useStore()
  const L = useLookups()
  const { db, doc, setDoc, persist, remove, isNew } = useDoc('depRuns', 'DEP', '/depreciation', () => ({
    date: today(), status: 'draft', notes: '', period: '2026-10', lines: [],
  }))
  const draft = doc.status === 'draft'

  const calc = () => {
    const lines = computeRun(db, doc.period, doc.id)
    setDoc({ ...doc, lines })
    toast(lines.length ? `تم احتساب ${lines.length} سطر` : 'لا توجد موجودات مستحقة للاستهلاك في هذه الفترة', lines.length ? 'ok' : 'err')
  }

  const save = () => { persist(doc); return true }
  const post = () => {
    if (!doc.lines.length) { toast('لا توجد أسطر للترحيل', 'err'); return false }
    const clash = db.depRuns.some((r) => r.id !== doc.id && r.status === 'posted' && r.period === doc.period && r.lines.some((l) => doc.lines.some((x) => x.assetId === l.assetId)))
    if (clash) { toast('يوجد استهلاك مرحّل لنفس الفترة لبعض الموجودات', 'err'); return false }
    persist({ ...doc, status: 'posted' }, (d, s) => {
      s.lines.forEach((l) => d.assets.find((a) => a.id === l.assetId)?.history.push(historyEntry(`ترحيل استهلاك ${periodLabel(s.period)} بمبلغ ${money(l.amount)}`, s.number)))
    })
    return true
  }
  const cancel = () => persist({ ...doc, status: 'cancelled' })

  return (
    <DocFrame
      title="احتساب الاستهلاك"
      listLabel="احتساب الاستهلاك"
      listTo="/depreciation"
      number={doc.number}
      status={doc.status}
      isNew={isNew}
      linesCount={doc.lines.length}
      summary={{ label: 'إجمالي الاستهلاك', value: iqd(total(doc)) }}
      journal={depJournal(db, doc)}
      onSave={save}
      onPost={post}
      onCancelDoc={cancel}
      onDelete={remove}
      postNote={`سيتم ترحيل استهلاك ${periodLabel(doc.period)} لعدد ${doc.lines.length} موجود بمبلغ ${iqd(total(doc))}. هل تريد المتابعة؟`}
      header={
        <FormGrid>
          <Field label="رقم المستند"><ReadOnly ltr>{doc.number}</ReadOnly></Field>
          <Field label="الفترة المحاسبية" required>
            <Select value={doc.period} disabled={!draft} onChange={(p) => setDoc({ ...doc, period: p, lines: [] })} options={periods.map((p) => ({ value: p, label: periodLabel(p) }))} />
          </Field>
          <Field label="تاريخ الترحيل" required><input type="date" className="inp" disabled={!draft} value={doc.date} onChange={(e) => setDoc({ ...doc, date: e.target.value })} /></Field>
          <Field label="ملاحظات" span={2}><input className="inp" disabled={!draft} value={doc.notes} onChange={(e) => setDoc({ ...doc, notes: e.target.value })} /></Field>
        </FormGrid>
      }
      lines={
        <>
          {draft && (
            <div className="flex items-center gap-2 border-b border-line p-3">
              <button type="button" className="btn btn-primary" onClick={calc}><Calculator className="h-4 w-4" />احتساب الأسطر</button>
              <span className="text-xs text-gray-500">يشمل جميع الموجودات الفعالة التي لم يُحتسب استهلاكها لهذه الفترة.</span>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr><th>#</th><th>رمز الموجود</th><th>اسم الموجود</th><th>الفئة</th><th className="!text-end">التكلفة</th><th className="!text-end">المجمع السابق</th><th className="!text-end w-40">قسط الفترة</th><th className="!text-end">القيمة بعد الاستهلاك</th>{draft && <th />}</tr>
              </thead>
              <tbody>
                {doc.lines.map((l, i) => {
                  const a = L.asset(l.assetId)
                  if (!a) return null
                  const prev = bookedAccum(db, a.id) - (doc.status === 'posted' ? l.amount : 0)
                  return (
                    <tr key={l.assetId}>
                      <td className="text-gray-400">{i + 1}</td>
                      <td dir="ltr" className="text-end text-navy">{a.code}</td>
                      <td>{a.name}</td>
                      <td>{L.catName(a.categoryId)}</td>
                      <td className="num">{money(grossValue(a))}</td>
                      <td className="num">{money(prev)}</td>
                      <td className="num">
                        {draft ? <NumInput value={l.amount} onChange={(n) => setDoc({ ...doc, lines: doc.lines.map((x) => (x.assetId === l.assetId ? { ...x, amount: n } : x)) })} /> : money(l.amount)}
                      </td>
                      <td className="num">{money(grossValue(a) - prev - l.amount)}</td>
                      {draft && <td><RemoveBtn onClick={() => setDoc({ ...doc, lines: doc.lines.filter((x) => x.assetId !== l.assetId) })} /></td>}
                    </tr>
                  )
                })}
              </tbody>
              {doc.lines.length > 0 && (
                <tfoot><tr><td colSpan={6}>المجموع:</td><td className="num">{money(total(doc))}</td><td />{draft && <td />}</tr></tfoot>
              )}
            </table>
            {doc.lines.length === 0 && <Empty text="اضغط «احتساب الأسطر» لتوليد أقساط الاستهلاك" />}
          </div>
        </>
      }
    />
  )
}
