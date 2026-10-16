import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AddLine, DocFrame, RemoveBtn } from '../components/DocFrame'
import { ListView } from '../components/ListView'
import { Badge, Empty, Field, FormGrid, ReadOnly, Select } from '../components/ui'
import { docStatusLabel, docStatusTone, today } from '../data/format'
import { useLookups } from '../data/lookups'
import { historyEntry, useStore } from '../data/store'
import { useDoc } from '../data/useDoc'
import type { Transfer } from '../data/types'

export function TransfersList() {
  const { db } = useStore()
  const L = useLookups()
  return (
    <ListView
      title="نقل الموجودات"
      rows={[...db.transfers].reverse()}
      newTo="/transfers/new"
      newLabel="مستند نقل"
      rowTo={(r) => `/transfers/${r.id}`}
      searchText={(r) => `${r.number} ${r.reason}`}
      columns={[
        { key: 'n', label: 'رقم المستند', render: (r) => <span className="font-medium text-navy" dir="ltr">{r.number}</span> },
        { key: 'd', label: 'التاريخ', render: (r) => <span dir="ltr">{r.date}</span> },
        { key: 'r', label: 'سبب النقل', render: (r) => r.reason },
        { key: 'f', label: 'من', render: (r) => L.locName(r.lines[0]?.fromLocationId ?? '') },
        { key: 't', label: 'إلى', render: (r) => L.locName(r.lines[0]?.toLocationId ?? '') },
        { key: 'c', label: 'عدد الموجودات', num: true, render: (r) => r.lines.length },
        { key: 's', label: 'الحالة', render: (r) => <Badge tone={docStatusTone[r.status]}>{docStatusLabel[r.status]}</Badge> },
      ]}
    />
  )
}

export function TransferForm() {
  const { toast } = useStore()
  const L = useLookups()
  const [params] = useSearchParams()
  const { db, doc, setDoc, persist, remove, isNew } = useDoc('transfers', 'TRF', '/transfers', () => ({
    date: today(), status: 'draft', notes: '', reason: '', lines: [],
  }))
  const draft = doc.status === 'draft'

  const add = (assetId: string) => {
    const a = L.asset(assetId)!
    setDoc((d) => ({ ...d, lines: [...d.lines, { assetId, fromLocationId: a.locationId, toLocationId: '', fromCustodianId: a.custodianId, toCustodianId: a.custodianId }] }))
  }
  useEffect(() => {
    const pre = params.get('asset')
    if (isNew && pre && !doc.lines.length) add(pre)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setLine = (assetId: string, patch: Partial<Transfer['lines'][number]>) =>
    setDoc({ ...doc, lines: doc.lines.map((l) => (l.assetId === assetId ? { ...l, ...patch } : l)) })

  const valid = () => {
    if (!doc.reason.trim()) { toast('يرجى إدخال سبب النقل', 'err'); return false }
    if (doc.lines.some((l) => !l.toLocationId)) { toast('حدد الموقع الجديد لكل سطر', 'err'); return false }
    if (doc.lines.some((l) => l.toLocationId === l.fromLocationId && l.toCustodianId === l.fromCustodianId)) { toast('بعض الأسطر لا تتضمن أي تغيير', 'err'); return false }
    return true
  }
  const post = () => {
    if (!valid()) return false
    persist({ ...doc, status: 'posted' }, (d, s) => {
      s.lines.forEach((l) => {
        const a = d.assets.find((x) => x.id === l.assetId)!
        a.locationId = l.toLocationId
        a.custodianId = l.toCustodianId
        a.costCenter = d.employees.find((e) => e.id === l.toCustodianId)?.department ?? a.costCenter
        a.history.push(historyEntry(`نقل إلى ${d.locations.find((x) => x.id === l.toLocationId)?.name}`, s.number))
      })
    })
    return true
  }
  const cancel = () =>
    persist({ ...doc, status: 'cancelled' }, (d, s) => {
      s.lines.forEach((l) => {
        const a = d.assets.find((x) => x.id === l.assetId)!
        a.locationId = l.fromLocationId
        a.custodianId = l.fromCustodianId
        a.history.push(historyEntry('إلغاء النقل وإرجاع الموقع السابق', s.number))
      })
    })

  const used = new Set(doc.lines.map((l) => l.assetId))
  const options = db.assets.filter((a) => (a.status === 'active' || a.status === 'maintenance') && !used.has(a.id)).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))

  return (
    <DocFrame
      title="نقل موجودات"
      listLabel="نقل الموجودات"
      listTo="/transfers"
      number={doc.number}
      status={doc.status}
      isNew={isNew}
      linesCount={doc.lines.length}
      journal={[]}
      summary={{ label: 'عدد الموجودات', value: String(doc.lines.length) }}
      onSave={() => { persist(doc); return true }}
      onPost={post}
      onCancelDoc={cancel}
      onDelete={remove}
      postNote="سيتم تحديث موقع وصاحب عهدة الموجودات المحددة. النقل بين المواقع لا يُنشئ قيداً محاسبياً."
      header={
        <FormGrid>
          <Field label="رقم المستند"><ReadOnly ltr>{doc.number}</ReadOnly></Field>
          <Field label="تاريخ النقل" required><input type="date" className="inp" disabled={!draft} value={doc.date} onChange={(e) => setDoc({ ...doc, date: e.target.value })} /></Field>
          <Field label="سبب النقل" required span={2}><input className="inp" disabled={!draft} value={doc.reason} onChange={(e) => setDoc({ ...doc, reason: e.target.value })} /></Field>
          <Field label="المعتمد"><ReadOnly>Super Admin</ReadOnly></Field>
        </FormGrid>
      }
      lines={
        <>
          <AddLine options={options} onAdd={add} disabled={!draft} />
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>#</th><th>الموجود</th><th>الموقع الحالي</th><th className="w-56">الموقع الجديد *</th><th>العهدة الحالية</th><th className="w-56">العهدة الجديدة</th>{draft && <th />}</tr></thead>
              <tbody>
                {doc.lines.map((l, i) => (
                  <tr key={l.assetId}>
                    <td className="text-gray-400">{i + 1}</td>
                    <td>{L.assetLabel(l.assetId)}</td>
                    <td className="text-gray-600">{L.locName(l.fromLocationId)}</td>
                    <td>{draft ? <Select value={l.toLocationId} onChange={(v) => setLine(l.assetId, { toLocationId: v })} options={L.locOptions} placeholder="اختر..." /> : L.locName(l.toLocationId)}</td>
                    <td className="text-gray-600">{L.empName(l.fromCustodianId)}</td>
                    <td>{draft ? <Select value={l.toCustodianId} onChange={(v) => setLine(l.assetId, { toCustodianId: v })} options={L.empOptions} /> : L.empName(l.toCustodianId)}</td>
                    {draft && <td><RemoveBtn onClick={() => setDoc({ ...doc, lines: doc.lines.filter((x) => x.assetId !== l.assetId) })} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {doc.lines.length === 0 && <Empty text="أضف الموجودات المراد نقلها" />}
          </div>
        </>
      }
    />
  )
}
