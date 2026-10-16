import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AddLine, DocFrame, RemoveBtn, type JournalLine } from '../components/DocFrame'
import { ListView } from '../components/ListView'
import { Badge, Empty, Field, FormGrid, NumInput, ReadOnly, Select } from '../components/ui'
import { bookedAccum, grossValue, nbvOf } from '../data/calc'
import { disposalTypeLabel, docStatusLabel, docStatusTone, iqd, money, today } from '../data/format'
import { useLookups } from '../data/lookups'
import { historyEntry, useStore } from '../data/store'
import { useDoc } from '../data/useDoc'
import type { DB, Disposal, DisposalType } from '../data/types'

const price = (d: Disposal) => d.lines.reduce((s, l) => s + l.price, 0)

export function DisposalsList() {
  const { db } = useStore()
  return (
    <ListView
      title="الاستبعاد والبيع"
      rows={[...db.disposals].reverse()}
      newTo="/disposals/new"
      newLabel="مستند استبعاد"
      rowTo={(r) => `/disposals/${r.id}`}
      searchText={(r) => `${r.number} ${r.party}`}
      columns={[
        { key: 'n', label: 'رقم المستند', render: (r) => <span className="font-medium text-navy" dir="ltr">{r.number}</span> },
        { key: 'd', label: 'التاريخ', render: (r) => <span dir="ltr">{r.date}</span> },
        { key: 't', label: 'نوع الاستبعاد', render: (r) => disposalTypeLabel[r.type] },
        { key: 'p', label: 'الجهة / المشتري', render: (r) => r.party || '—' },
        { key: 'c', label: 'عدد الموجودات', num: true, render: (r) => r.lines.length },
        { key: 'v', label: 'قيمة البيع', num: true, render: (r) => money(price(r)) },
        { key: 's', label: 'الحالة', render: (r) => <Badge tone={docStatusTone[r.status]}>{docStatusLabel[r.status]}</Badge> },
      ]}
    />
  )
}

export function DisposalForm() {
  const { toast } = useStore()
  const L = useLookups()
  const [params] = useSearchParams()
  const { db, doc, setDoc, persist, remove, isNew } = useDoc('disposals', 'DSP', '/disposals', () => ({
    date: today(), status: 'draft', notes: '', type: 'sale' as const, party: '', lines: [],
  }))
  const draft = doc.status === 'draft'

  // Draft lines always show the live book value; posted lines keep the value frozen at posting.
  const nbvLine = (assetId: string, stored: number) => {
    const a = L.asset(assetId)
    return draft && a ? nbvOf(db, a) : stored
  }
  const add = (assetId: string) => setDoc((d) => ({ ...d, lines: [...d.lines, { assetId, nbv: 0, price: 0 }] }))
  useEffect(() => {
    const pre = params.get('asset')
    if (isNew && pre && !doc.lines.length) add(pre)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const post = () => {
    if (!doc.lines.length) { toast('أضف موجوداً واحداً على الأقل', 'err'); return false }
    if (doc.type === 'sale' && !doc.party.trim()) { toast('يرجى إدخال اسم المشتري', 'err'); return false }
    const frozen = { ...doc, status: 'posted' as const, lines: doc.lines.map((l) => ({ ...l, nbv: nbvLine(l.assetId, l.nbv), price: doc.type === 'sale' ? l.price : 0 })) }
    persist(frozen, (d, s) => {
      s.lines.forEach((l) => {
        const a = d.assets.find((x) => x.id === l.assetId)!
        a.status = s.type === 'sale' ? 'sold' : 'disposed'
        a.history.push(historyEntry(`${disposalTypeLabel[s.type]} الموجود — صافي القيمة ${money(l.nbv)}`, s.number))
      })
    })
    return true
  }
  const cancel = () =>
    persist({ ...doc, status: 'cancelled' }, (d, s) => {
      s.lines.forEach((l) => {
        const a = d.assets.find((x) => x.id === l.assetId)!
        a.status = 'active'
        a.history.push(historyEntry('إلغاء الاستبعاد وإرجاع الموجود للخدمة', s.number))
      })
    })

  const used = new Set(doc.lines.map((l) => l.assetId))
  const options = db.assets.filter((a) => (a.status === 'active' || a.status === 'maintenance') && !used.has(a.id)).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))
  const totNbv = doc.lines.reduce((s, l) => s + nbvLine(l.assetId, l.nbv), 0)
  const totPrice = doc.type === 'sale' ? price(doc) : 0

  return (
    <DocFrame
      title="استبعاد موجودات"
      listLabel="الاستبعاد والبيع"
      listTo="/disposals"
      number={doc.number}
      status={doc.status}
      isNew={isNew}
      linesCount={doc.lines.length}
      journal={disposalJournal(db, doc, nbvLine)}
      summary={{ label: totPrice - totNbv >= 0 ? 'ربح الاستبعاد' : 'خسارة الاستبعاد', value: iqd(Math.abs(totPrice - totNbv)) }}
      onSave={() => { persist(doc); return true }}
      onPost={post}
      onCancelDoc={cancel}
      onDelete={remove}
      postNote="سيتم إخراج الموجودات من الخدمة وإيقاف استهلاكها وإنشاء قيد الاستبعاد. هل تريد المتابعة؟"
      header={
        <FormGrid>
          <Field label="رقم المستند"><ReadOnly ltr>{doc.number}</ReadOnly></Field>
          <Field label="تاريخ الاستبعاد" required><input type="date" className="inp" disabled={!draft} value={doc.date} onChange={(e) => setDoc({ ...doc, date: e.target.value })} /></Field>
          <Field label="نوع الاستبعاد" required>
            <Select<DisposalType> value={doc.type} disabled={!draft} onChange={(v) => setDoc({ ...doc, type: v })} options={(Object.keys(disposalTypeLabel) as DisposalType[]).map((k) => ({ value: k, label: disposalTypeLabel[k] }))} />
          </Field>
          <Field label={doc.type === 'sale' ? 'المشتري' : 'الجهة'} required={doc.type === 'sale'} span={2}>
            <input className="inp" disabled={!draft} value={doc.party} onChange={(e) => setDoc({ ...doc, party: e.target.value })} />
          </Field>
        </FormGrid>
      }
      lines={
        <>
          <AddLine options={options} onAdd={add} disabled={!draft} />
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>#</th><th>الموجود</th><th className="!text-end">التكلفة</th><th className="!text-end">مجمع الاستهلاك</th><th className="!text-end">صافي القيمة</th><th className="!text-end w-40">سعر البيع</th><th className="!text-end">ربح / (خسارة)</th>{draft && <th />}</tr></thead>
              <tbody>
                {doc.lines.map((l, i) => {
                  const a = L.asset(l.assetId)!
                  const nbv = nbvLine(l.assetId, l.nbv)
                  const p = doc.type === 'sale' ? l.price : 0
                  return (
                    <tr key={l.assetId}>
                      <td className="text-gray-400">{i + 1}</td>
                      <td>{L.assetLabel(l.assetId)}</td>
                      <td className="num">{money(grossValue(a))}</td>
                      <td className="num">{money(grossValue(a) - nbv)}</td>
                      <td className="num">{money(nbv)}</td>
                      <td className="num">
                        {draft && doc.type === 'sale'
                          ? <NumInput value={l.price} onChange={(n) => setDoc({ ...doc, lines: doc.lines.map((x) => (x.assetId === l.assetId ? { ...x, price: n } : x)) })} />
                          : money(p)}
                      </td>
                      <td className={`num ${p - nbv < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{p - nbv < 0 ? `(${money(nbv - p)})` : money(p - nbv)}</td>
                      {draft && <td><RemoveBtn onClick={() => setDoc({ ...doc, lines: doc.lines.filter((x) => x.assetId !== l.assetId) })} /></td>}
                    </tr>
                  )
                })}
              </tbody>
              {doc.lines.length > 0 && (
                <tfoot><tr><td colSpan={4}>المجموع:</td><td className="num">{money(totNbv)}</td><td className="num">{money(totPrice)}</td><td className="num">{money(totPrice - totNbv)}</td>{draft && <td />}</tr></tfoot>
              )}
            </table>
            {doc.lines.length === 0 && <Empty text="أضف الموجودات المراد استبعادها" />}
          </div>
        </>
      }
    />
  )
}

function disposalJournal(db: DB, d: Disposal, nbvLine: (id: string, stored: number) => number): JournalLine[] {
  const out: JournalLine[] = []
  d.lines.forEach((l) => {
    const a = db.assets.find((x) => x.id === l.assetId)
    if (!a) return
    const c = db.categories.find((x) => x.id === a.categoryId)!
    const nbv = nbvLine(l.assetId, l.nbv)
    const gross = grossValue(a)
    const p = d.type === 'sale' ? l.price : 0
    const desc = `${disposalTypeLabel[d.type]} ${a.code}`
    out.push({ account: c.accumAccount, desc, debit: d.status === 'draft' ? bookedAccum(db, a.id) : gross - nbv, credit: 0 })
    if (p) out.push({ account: '1121 - ذمم مدينة - بيع موجودات', desc, debit: p, credit: 0 })
    if (p - nbv < 0) out.push({ account: c.gainLossAccount, desc: `خسارة ${desc}`, debit: nbv - p, credit: 0 })
    out.push({ account: c.assetAccount, desc, debit: 0, credit: gross })
    if (p - nbv > 0) out.push({ account: c.gainLossAccount, desc: `ربح ${desc}`, debit: 0, credit: p - nbv })
  })
  return out
}
