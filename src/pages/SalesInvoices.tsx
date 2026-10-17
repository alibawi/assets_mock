import { Ban, BookOpen, List, MoreHorizontal, Plus, Printer, Send, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '../components/Layout'
import { ListView } from '../components/ListView'
import { JournalTable } from '../components/Shared'
import { Badge, Card, Confirm, Dropdown, Empty, Field, FormGrid, NumInput, ReadOnly, SaveSplit, Select, Tabs } from '../components/ui'
import { acctsOf, bookValue } from '../data/calc'
import { assetInOtherInvoice, cancelInvoice, eligibleForSale, invoiceJournal, invoiceLineError, invoiceTotal, newInvoice, postInvoice } from '../data/documents'
import { iqd, money } from '../data/format'
import { useLookups } from '../data/lookups'
import { useStore } from '../data/store'
import type { InvoiceStatus, SaleInvoice, SaleInvoiceLine } from '../data/types'

const statusLabel: Record<InvoiceStatus, string> = { draft: 'مسودة', posted: 'مُرحّلة', cancelled: 'ملغاة' }
const statusTone = { draft: 'gray', posted: 'green', cancelled: 'red' } as const

export function InvoicesList() {
  const { db, can } = useStore()
  const L = useLookups()
  const cust = (id: string) => db.customers.find((c) => c.id === id)?.name ?? '—'
  return (
    <ListView
      title="فواتير المبيعات"
      crumbs={[{ label: 'المبيعات' }, { label: 'فواتير المبيعات' }]}
      rows={[...db.invoices].sort((a, b) => b.number.localeCompare(a.number))}
      newTo="/sales-invoices/new"
      newLabel="فاتورة جديدة"
      canNew={can('create')}
      rowTo={(i) => `/sales-invoices/${i.id}`}
      searchText={(i) => `${i.number} ${cust(i.customerId)} ${i.lines.map((l) => L.assetLabel(l.assetId)).join(' ')}`}
      columns={[
        { key: 'n', label: 'رقم الفاتورة', render: (i) => <span className="font-medium text-navy" dir="ltr">{i.number}</span> },
        { key: 'c', label: 'الشريك التجاري', render: (i) => cust(i.customerId) },
        { key: 'd', label: 'تاريخ الترحيل', render: (i) => <span dir="ltr">{i.postingDate}</span> },
        { key: 'a', label: 'أسطر أصول', render: (i) => <span className="text-gray-600">{i.lines.filter((l) => l.assetId).map((l) => L.asset(l.assetId)?.code).join('، ') || '—'}</span> },
        { key: 't', label: 'صافي المبلغ', num: true, render: (i) => money(invoiceTotal(i)), total: (rs) => money(rs.filter((i) => i.status === 'posted').reduce((s, i) => s + invoiceTotal(i), 0)) },
        { key: 's', label: 'الحالة', render: (i) => <Badge tone={statusTone[i.status]}>{statusLabel[i.status]}</Badge> },
      ]}
    />
  )
}

type T = 'lines' | 'journal'

export function InvoiceForm() {
  const { id } = useParams()
  const nav = useNavigate()
  const { db, run, can } = useStore()
  const L = useLookups()
  const stored = db.invoices.find((i) => i.id === id)
  const isNew = !stored
  const [inv, setInv] = useState<SaleInvoice>(() => (stored ? structuredClone(stored) : newInvoice(db)))
  const [tab, setTab] = useState<T>('lines')
  const [ask, setAsk] = useState<null | 'post' | 'cancel'>(null)
  useEffect(() => { if (stored && stored.status !== inv.status) setInv(structuredClone(stored)) }, [stored, inv.status])

  const draft = inv.status === 'draft'
  const editable = draft && can(isNew ? 'create' : 'update')
  const set = (patch: Partial<SaleInvoice>) => setInv((p) => ({ ...p, ...patch }))
  const setLine = (lid: string, patch: Partial<SaleInvoiceLine>) => setInv((p) => ({ ...p, lines: p.lines.map((l) => (l.id === lid ? { ...l, ...patch } : l)) }))
  const addLine = () => setInv((p) => ({ ...p, lines: [...p.lines, { id: `il${Date.now().toString(36)}`, itemId: '', assetId: '', qty: 1, price: 0, revenueAcct: '', description: '' }] }))

  const onItem = (l: SaleInvoiceLine, itemId: string) => {
    const it = db.items.find((x) => x.id === itemId)!
    setLine(l.id, it.isFixedAsset
      ? { itemId, assetId: '', qty: 1, price: 0, revenueAcct: '', description: '' }
      : { itemId, assetId: '', qty: l.qty || 1, price: it.price, revenueAcct: it.revenueAcct, description: it.name })
  }
  const onAsset = (l: SaleInvoiceLine, assetId: string) => {
    const a = db.assets.find((x) => x.id === assetId)!
    setLine(l.id, { assetId, qty: 1, price: Math.max(0, Math.round(bookValue(db, a))), revenueAcct: acctsOf(db, a.classId).saleClearingAcct, description: a.name })
  }

  const save = (thenPost = false) => {
    let savedId = inv.id
    const ok = run((d) => {
      for (const l of inv.lines.filter((x) => x.assetId)) {
        const other = assetInOtherInvoice(d, l.assetId, inv.id)
        if (other) return `Assets:AssetAlreadyInSaleInvoice — ${d.assets.find((a) => a.id === l.assetId)?.code} مرتبط بالفاتورة ${other.number}`
      }
      const copy = structuredClone(inv)
      const i = d.invoices.findIndex((x) => x.id === copy.id)
      if (i >= 0) d.invoices[i] = copy
      else d.invoices.push(copy)
      savedId = inv.id
      if (thenPost) return postInvoice(d, inv.id)
    }, thenPost ? 'تم ترحيل الفاتورة — وخرجت الأصول المباعة من السجل' : 'تم حفظ الفاتورة كمسودة')
    if (ok && isNew) nav(`/sales-invoices/${savedId}`, { replace: true })
  }

  const total = invoiceTotal(inv)
  const saleTxs = inv.saleTxIds.map((t) => db.txs.find((x) => x.id === t)!).filter(Boolean)
  const reversals = db.txs.filter((t) => t.sourceDocId === inv.id && t.reversedTxId)
  const assetOptions = (l: SaleInvoiceLine) => {
    const list = eligibleForSale(db, inv.id).filter((a) => a.id === l.assetId || !inv.lines.some((x) => x.assetId === a.id))
    const cur = l.assetId && !list.some((a) => a.id === l.assetId) ? [db.assets.find((a) => a.id === l.assetId)!] : []
    return [...cur, ...list].map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }))
  }

  return (
    <div>
      <PageHeader
        crumbs={[{ label: 'المبيعات' }, { label: 'فاتورة المبيعات', to: '/sales-invoices' }, { label: isNew ? 'مستند جديد' : inv.number }]}
        title={isNew ? 'فاتورة مبيعات — مستند جديد' : `فاتورة مبيعات ${inv.number}`}
        badge={<Badge tone={statusTone[inv.status]}>{statusLabel[inv.status]}</Badge>}
        summary={{ label: 'صافي المبلغ', value: iqd(total) }}
        actions={
          <>
            <SaveSplit disabled={!editable} onSave={() => save()} items={[{ label: 'حفظ وترحيل', onClick: () => setAsk('post') }]} />
            <button type="button" className="btn" disabled={!draft || !can('post') || !inv.lines.length} onClick={() => setAsk('post')}><Send className="h-4 w-4" />ترحيل</button>
            <button type="button" className="btn" onClick={() => nav('/sales-invoices')}>إلغاء</button>
            <Dropdown label="إجراءات" icon={MoreHorizontal} items={[
              { label: 'إلغاء الفاتورة', icon: Ban, danger: true, disabled: inv.status === 'cancelled' || isNew || !can('reverse'), onClick: () => setAsk('cancel') },
              { label: 'طباعة', icon: Printer, onClick: () => window.print() },
            ]} />
          </>
        }
      />
      {inv.status === 'posted' && saleTxs.length > 0 && (
        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          مُرحّلة. أُنشئت حركة بيع لكل سطر أصل ({saleTxs.map((t) => t.number).join('، ')}) مع قيد الإخراج (236)، وتغيّرت حالة الأصول إلى «مباع». إلغاء الفاتورة يعكس البيع تلقائياً.
        </div>
      )}
      {inv.status === 'cancelled' && <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">ملغاة.{reversals.length ? ` عُكس البيع تلقائياً (${reversals.map((t) => t.number).join('، ')}) وعادت الأصول إلى حالتها السابقة.` : ''}</div>}

      <Card className="mb-4">
        <FormGrid>
          <Field label="الشريك التجاري" required>
            <Select value={inv.customerId} disabled={!editable} onChange={(v) => set({ customerId: v })} placeholder="اختر العميل" options={db.customers.map((c) => ({ value: c.id, label: c.name }))} />
          </Field>
          <Field label="المؤسسة" required><ReadOnly>{inv.organization}</ReadOnly></Field>
          <Field label="العملة"><ReadOnly>IQD — دينار عراقي</ReadOnly></Field>
          <Field label="تاريخ الفاتورة" required><input type="date" className="inp" disabled={!editable} value={inv.invoiceDate} onChange={(e) => set({ invoiceDate: e.target.value })} /></Field>
          <Field label="تاريخ الترحيل" required hint="تاريخ البيع للأصول"><input type="date" className="inp" disabled={!editable} value={inv.postingDate} onChange={(e) => set({ postingDate: e.target.value })} /></Field>
          <Field label="رقم الفاتورة"><ReadOnly ltr>{inv.number}</ReadOnly></Field>
          <Field label="ملاحظات" span={2}><input className="inp" disabled={!editable} value={inv.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
        </FormGrid>
      </Card>

      <div className="card">
        <Tabs<T> active={tab} onChange={setTab} tabs={[{ id: 'lines', label: 'الأسطر', icon: List, count: inv.lines.length }, { id: 'journal', label: 'القيد المحاسبي', icon: BookOpen }]} />
        {tab === 'lines' && (
          <>
            {editable && (
              <div className="border-b border-line p-3">
                <button type="button" className="btn btn-primary" onClick={addLine}><Plus className="h-4 w-4" />إضافة سطر</button>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead><tr><th>#</th><th className="w-52">المادة</th><th className="w-72">الأصل</th><th>الوصف</th><th className="!text-end w-24">الكمية</th><th className="!text-end w-40">السعر</th><th className="!text-end">الإجمالي</th><th>حساب الإيراد</th>{editable && <th />}</tr></thead>
                <tbody>
                  {inv.lines.map((l, i) => {
                    const item = db.items.find((x) => x.id === l.itemId)
                    const err = !draft || editable ? null : invoiceLineError(db, inv, i)
                    return (
                      <tr key={l.id}>
                        <td className="text-gray-400">{i + 1}</td>
                        <td>{editable ? <Select value={l.itemId} onChange={(v) => onItem(l, v)} placeholder="اختر المادة" options={db.items.map((x) => ({ value: x.id, label: `${x.code} — ${x.name}` }))} /> : item?.name}</td>
                        <td>
                          {item?.isFixedAsset
                            ? editable
                              ? <Select value={l.assetId} onChange={(v) => onAsset(l, v)} placeholder="اختر الأصل المؤهل" options={assetOptions(l)} />
                              : <Link className="text-navy hover:underline" to={`/assets/${l.assetId}`}>{L.assetLabel(l.assetId)}</Link>
                            : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td>{editable && !item?.isFixedAsset ? <input className="inp" value={l.description} onChange={(e) => setLine(l.id, { description: e.target.value })} /> : <span className="text-gray-600">{l.description}</span>}</td>
                        <td className="num">{editable && !item?.isFixedAsset ? <NumInput value={l.qty} onChange={(n) => setLine(l.id, { qty: n })} /> : <span title={item?.isFixedAsset ? 'مقفلة على 1 لسطر الأصل' : ''}>{l.qty}</span>}</td>
                        <td className="num">
                          {editable ? <NumInput value={l.price} onChange={(n) => setLine(l.id, { price: n })} /> : money(l.price)}
                          {item?.isFixedAsset && l.assetId && editable && <div className="mt-0.5 text-[10px] text-gray-400">المقترح = القيمة الدفترية {money(bookValue(db, L.asset(l.assetId)!))}</div>}
                        </td>
                        <td className="num font-semibold">{money(l.qty * l.price)}</td>
                        <td className="text-xs text-gray-600">{l.revenueAcct ? L.acctName(l.revenueAcct) : '—'}{item?.isFixedAsset && <div className="text-[10px] text-sky-700">آلي: حساب تسوية بيع الأصول للفئة</div>}{err && <div className="text-[10px] text-red-600">{err}</div>}</td>
                        {editable && <td><button type="button" className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" onClick={() => set({ lines: inv.lines.filter((x) => x.id !== l.id) })}><Trash2 className="h-4 w-4" /></button></td>}
                      </tr>
                    )
                  })}
                </tbody>
                {inv.lines.length > 0 && <tfoot><tr><td colSpan={6}>المجموع:</td><td className="num">{money(total)}</td><td colSpan={editable ? 2 : 1} /></tr></tfoot>}
              </table>
              {inv.lines.length === 0 && <Empty text="أضف سطراً — عند اختيار مادة «بيع أصل ثابت» يظهر حقل «الأصل»" />}
            </div>
          </>
        )}
        {tab === 'journal' && (
          <div className="space-y-5 p-4">
            <div>
              <h4 className="mb-2 text-sm font-semibold">قيد فاتورة المبيعات {draft && <span className="text-xs font-normal text-amber-600">(معاينة)</span>}</h4>
              <JournalTable lines={draft ? invoiceJournal(db, inv) : inv.journal} date={inv.postingDate} />
            </div>
            {saleTxs.map((t) => (
              <div key={t.id}>
                <h4 className="mb-2 text-sm font-semibold">قيد الإخراج من الأصول — <span dir="ltr">{t.number}</span> (236) — {L.assetLabel(t.assetId)}</h4>
                <JournalTable lines={t.journal} date={t.date} note="حساب «تسوية بيع الأصول» مدين هنا ودائن في قيد الفاتورة، فيُصفَّر بعد القيدين (§5.6.9)." />
              </div>
            ))}
            {draft && inv.lines.some((l) => l.assetId) && <p className="text-xs text-gray-500">عند الترحيل: يُرحَّل الإهلاك حتى تاريخ الترحيل لكل أصل، ثم قيد الإخراج (مدين تسوية بيع الأصول + المجمّع [+ الخسارة] / دائن حساب الأصل [+ الربح]).</p>}
          </div>
        )}
      </div>

      {ask === 'post' && <Confirm title="ترحيل الفاتورة" text={`يُرحَّل قيد الفاتورة بمبلغ ${iqd(total)}، ولكل سطر أصل: إهلاك حتى التاريخ وقيد إخراج وحالة «مباع». هل تريد المتابعة؟`} onClose={() => setAsk(null)} onYes={() => save(true)} />}
      {ask === 'cancel' && <Confirm danger title="إلغاء الفاتورة" text={inv.status === 'posted' ? 'تُلغى الفاتورة ويُعكس البيع تلقائياً لكل أصل (بتاريخ البيع الأصلي) فتعود الأصول إلى حالتها السابقة.' : 'تُلغى المسودة.'} onClose={() => setAsk(null)}
        onYes={() => run((d) => cancelInvoice(d, inv.id), 'تم إلغاء الفاتورة')} />}
    </div>
  )
}
