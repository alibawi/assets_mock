import { Wrench } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { DocFrame, type JournalLine } from '../components/DocFrame'
import { ListView } from '../components/ListView'
import { Badge, Empty, Field, FormGrid, NumInput, ReadOnly, Select } from '../components/ui'
import { docStatusLabel, docStatusTone, iqd, maintTypeLabel, money, today } from '../data/format'
import { useLookups } from '../data/lookups'
import { historyEntry, useStore } from '../data/store'
import { useDoc } from '../data/useDoc'
import type { MaintType } from '../data/types'

export function MaintenanceList() {
  const { db } = useStore()
  const L = useLookups()
  const open = db.maintenance.filter((m) => m.status === 'draft')
  return (
    <ListView
      title="الصيانة"
      rows={[...db.maintenance].sort((a, b) => b.date.localeCompare(a.date))}
      newTo="/maintenance/new"
      newLabel="أمر صيانة"
      rowTo={(r) => `/maintenance/${r.id}`}
      searchText={(r) => `${r.number} ${r.vendor} ${L.assetLabel(r.assetId)}`}
      kpis={[
        { label: 'أوامر مفتوحة', value: String(open.length) },
        { label: 'مستحقة خلال 14 يوماً', value: String(open.filter((m) => m.dueDate <= '2026-10-30').length) },
        { label: 'تكلفة الصيانة المنجزة', value: iqd(db.maintenance.filter((m) => m.status === 'posted').reduce((s, m) => s + m.cost, 0)) },
        { label: 'موجودات تحت الصيانة', value: String(db.assets.filter((a) => a.status === 'maintenance').length) },
      ]}
      columns={[
        { key: 'n', label: 'رقم الأمر', render: (r) => <span className="font-medium text-navy" dir="ltr">{r.number}</span> },
        { key: 'a', label: 'الموجود', render: (r) => L.assetLabel(r.assetId) },
        { key: 't', label: 'نوع الصيانة', render: (r) => maintTypeLabel[r.type] },
        { key: 'v', label: 'الجهة المنفذة', render: (r) => r.vendor },
        { key: 'd', label: 'تاريخ الاستحقاق', render: (r) => <span dir="ltr" className={r.status === 'draft' && r.dueDate < today() ? 'font-semibold text-red-600' : ''}>{r.dueDate}</span> },
        { key: 'c', label: 'التكلفة', num: true, render: (r) => money(r.cost), total: (rs) => money(rs.reduce((s, r) => s + r.cost, 0)) },
        { key: 's', label: 'الحالة', render: (r) => <Badge tone={r.status === 'draft' ? 'amber' : docStatusTone[r.status]}>{r.status === 'draft' ? 'مفتوح' : r.status === 'posted' ? 'منجز' : docStatusLabel[r.status]}</Badge> },
      ]}
    />
  )
}

export function MaintenanceForm() {
  const { toast } = useStore()
  const L = useLookups()
  const [params] = useSearchParams()
  const { db, doc, setDoc, persist, remove, isNew } = useDoc('maintenance', 'MNT', '/maintenance', () => ({
    date: today(), status: 'draft', notes: '', assetId: params.get('asset') ?? '', type: 'corrective' as const, vendor: '', cost: 0, dueDate: today(), capitalize: false,
  }))
  const draft = doc.status === 'draft'
  const a = L.asset(doc.assetId)
  const c = a && L.cat(a.categoryId)

  const valid = () => {
    if (!doc.assetId) { toast('اختر الموجود', 'err'); return false }
    if (!doc.vendor.trim()) { toast('أدخل الجهة المنفذة', 'err'); return false }
    return true
  }
  const save = () => {
    if (!valid()) return false
    persist(doc, (d, s) => {
      const x = d.assets.find((y) => y.id === s.assetId)
      if (x && x.status === 'active' && s.type === 'corrective') {
        x.status = 'maintenance'
        x.history.push(historyEntry('دخول الموجود للصيانة', s.number))
      }
    })
    return true
  }
  const post = () => {
    if (!valid()) return false
    if (doc.capitalize && doc.cost < db.settings.capitalizeThreshold) { toast(`لا يمكن رسملة مبلغ أقل من حد الرسملة ${money(db.settings.capitalizeThreshold)}`, 'err'); return false }
    persist({ ...doc, status: 'posted' }, (d, s) => {
      const x = d.assets.find((y) => y.id === s.assetId)!
      if (x.status === 'maintenance') x.status = 'active'
      if (s.capitalize) x.revaluation += s.cost
      x.history.push(historyEntry(`إنجاز ${maintTypeLabel[s.type]} بتكلفة ${money(s.cost)}${s.capitalize ? ' (مرسملة)' : ''}`, s.number))
    })
    return true
  }
  const cancel = () =>
    persist({ ...doc, status: 'cancelled' }, (d, s) => {
      const x = d.assets.find((y) => y.id === s.assetId)!
      if (s.capitalize) x.revaluation -= s.cost
      x.history.push(historyEntry('إلغاء أمر الصيانة', s.number))
    })

  const journal: JournalLine[] = a && c && doc.cost
    ? [
        { account: doc.capitalize ? c.assetAccount : '5420 - مصروف صيانة الموجودات', desc: `${maintTypeLabel[doc.type]} ${a.code}`, debit: doc.cost, credit: 0 },
        { account: '2110 - ذمم دائنة - الموردون', desc: doc.vendor, debit: 0, credit: doc.cost },
      ]
    : []

  return (
    <DocFrame
      title="أمر صيانة"
      listLabel="الصيانة"
      listTo="/maintenance"
      number={doc.number}
      status={doc.status}
      isNew={isNew}
      linesCount={doc.assetId ? 1 : 0}
      journal={journal}
      summary={{ label: 'تكلفة الصيانة', value: iqd(doc.cost) }}
      onSave={save}
      onPost={post}
      onCancelDoc={cancel}
      onDelete={remove}
      postNote="سيتم إغلاق أمر الصيانة، وإرجاع الموجود إلى الخدمة، وإنشاء قيد التكلفة. هل تريد المتابعة؟"
      header={
        <FormGrid>
          <Field label="رقم الأمر"><ReadOnly ltr>{doc.number}</ReadOnly></Field>
          <Field label="الموجود" required span={2}>
            <Select value={doc.assetId} disabled={!draft || !isNew} onChange={(v) => setDoc({ ...doc, assetId: v })} placeholder="اختر الموجود" options={db.assets.filter((x) => x.status !== 'disposed' && x.status !== 'sold').map((x) => ({ value: x.id, label: `${x.code} — ${x.name}` }))} />
          </Field>
          <Field label="نوع الصيانة" required>
            <Select<MaintType> value={doc.type} disabled={!draft} onChange={(v) => setDoc({ ...doc, type: v })} options={(Object.keys(maintTypeLabel) as MaintType[]).map((k) => ({ value: k, label: maintTypeLabel[k] }))} />
          </Field>
          <Field label="تاريخ الأمر" required><input type="date" className="inp" disabled={!draft} value={doc.date} onChange={(e) => setDoc({ ...doc, date: e.target.value })} /></Field>
          <Field label="الجهة المنفذة" required><input className="inp" disabled={!draft} value={doc.vendor} onChange={(e) => setDoc({ ...doc, vendor: e.target.value })} /></Field>
          <Field label="تاريخ الاستحقاق"><input type="date" className="inp" disabled={!draft} value={doc.dueDate} onChange={(e) => setDoc({ ...doc, dueDate: e.target.value })} /></Field>
          <Field label="التكلفة (IQD)" required><NumInput value={doc.cost} disabled={!draft} onChange={(n) => setDoc({ ...doc, cost: n })} /></Field>
          <Field label="المعالجة المحاسبية">
            <label className="flex h-8 items-center gap-2 text-sm">
              <input type="checkbox" disabled={!draft} checked={doc.capitalize} onChange={(e) => setDoc({ ...doc, capitalize: e.target.checked })} />
              رسملة على قيمة الموجود
            </label>
          </Field>
          <Field label="وصف العمل"><input className="inp" disabled={!draft} value={doc.notes} onChange={(e) => setDoc({ ...doc, notes: e.target.value })} /></Field>
        </FormGrid>
      }
      lines={
        a ? (
          <table className="tbl">
            <thead><tr><th>الموجود</th><th>الموقع</th><th>صاحب العهدة</th><th>نهاية الضمان</th><th>البيان</th><th className="!text-end">التكلفة</th></tr></thead>
            <tbody>
              <tr>
                <td className="flex items-center gap-2"><Wrench className="h-4 w-4 text-gray-400" />{L.assetLabel(a.id)}</td>
                <td>{L.locName(a.locationId)}</td>
                <td>{L.empName(a.custodianId)}</td>
                <td dir="ltr" className={`text-end ${a.warrantyEnd >= doc.date ? 'text-emerald-700' : 'text-gray-500'}`}>{a.warrantyEnd}{a.warrantyEnd >= doc.date ? ' ✓' : ''}</td>
                <td>{doc.notes || '—'}</td>
                <td className="num">{money(doc.cost)}</td>
              </tr>
            </tbody>
            <tfoot><tr><td colSpan={5}>المجموع:</td><td className="num">{money(doc.cost)}</td></tr></tfoot>
          </table>
        ) : <Empty text="اختر الموجود في رأس المستند" />
      }
    />
  )
}
