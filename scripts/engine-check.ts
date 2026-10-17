// Engine checks against plan §10 / Appendix A. Run: npm run check
import { generateSchedule } from '../src/data/calc'
import { accumAsOf, assetLedger, costAsOf, reconciliationAsOf, registerAsOf, rollForward } from '../src/data/asof'
import { addCost, capitalize, costCenterTransfer, createRun, postRun, reverseExit, reverseRun, revalue, sellFromInvoice, undoCapitalization } from '../src/data/lifecycle'
import { blankDocLine, cancelInvoice, commitBatch, createSaleInvoiceForAsset, newDoc, postDoc, postInvoice, reverseBatch, reverseDoc, sampleImportRows, batchErrors, syncDocNumber } from '../src/data/documents'
import { seed } from '../src/data/seed'
import type { Asset, AssetClass, DB } from '../src/data/types'

let fails = 0
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) fails++
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`)
}

const blankDb = (): DB => ({ ...seed(), lines: [], txs: [], runs: [] })
const base: Asset = {
  id: 't', code: 'T', name: 'T', description: '', classId: 'x', groupId: '', locationId: '', custodianId: '', serial: '', tagNumber: '', partnerId: '',
  sourceDocRef: '', sourceDocLine: '', sourceLineSeq: null, acquisitionDate: '2026-01-01', depStartDate: '2026-01-01', originalValue: 0, salvage: 0,
  lifeMonths: 0, method: 'SL', periodicity: 'M', prorata: 'NONE', decliningFactor: 2, capitalizationDate: null, state: 'running', isLegacy: false,
  importedAccum: 0, importCutoffDate: null, remainingLifeAtImport: null, revaluationAdj: 0, costCenterId: '', project: '',
}
const cls: AssetClass = { id: 'x', code: 'X', name: 'X', foreignName: '', kind: 'tangible', method: 'SL', lifeMonths: 0, decliningFactor: 2, periodicity: 'M', prorata: 'NONE', isDepreciable: true, isActive: true }
const gen = (o: Partial<Asset>, c: Partial<AssetClass> = {}) => generateSchedule(blankDb(), { ...base, ...o }, { ...cls, ...c })
const sum = (ls: { amount: number }[]) => ls.reduce((s, l) => s + l.amount, 0)

const t1 = gen({ originalValue: 36000000, lifeMonths: 36 })
eq('A.1 36,000,000/36 → 36 × 1,000,000', [t1.length, [...new Set(t1.map((l) => l.amount))], sum(t1)], [36, [1000000], 36000000])
eq('T2 rounding 10,000/3', gen({ originalValue: 10000, lifeMonths: 3 }).map((l) => l.amount), [3333, 3333, 3334])
eq('T3 salvage 50,000/5,000 → 45,000', sum(gen({ originalValue: 50000, salvage: 5000, lifeMonths: 12 })), 45000)
const t4 = gen({ originalValue: 6000000, lifeMonths: 12, prorata: 'DAYS', depStartDate: '2026-03-15' })
eq('A.5 ByDays 15 Mar → 13 lines 274,194 + 11×500,000 + 225,806', [t4.length, t4[0].amount, t4[0].days, t4.slice(1, 12).every((l) => l.amount === 500000), t4[12].amount, t4[12].date, sum(t4)], [13, 274194, 17, true, 225806, '2027-03-31', 6000000])
eq('A.6 land → no lines', gen({ originalValue: 100 }, { kind: 'land', isDepreciable: false }).length, 0)
eq('A.3 DB 40%', gen({ originalValue: 100000000, lifeMonths: 60, periodicity: 'Y', method: 'DB' }).map((l) => l.amount), [40000000, 24000000, 14400000, 8640000, 12960000])
eq('A.4 DB-then-SL', gen({ originalValue: 50000000, lifeMonths: 60, periodicity: 'Y', method: 'DBSL' }).map((l) => l.amount), [20000000, 12000000, 7200000, 5400000, 5400000])
const t8 = gen({ originalValue: 80000000, importedAccum: 50000000, isLegacy: true, importCutoffDate: '2025-12-31', remainingLifeAtImport: 24, depStartDate: '2018-01-01', lifeMonths: 120 })
eq('A.8 legacy 24 × 1,250,000 from Jan 2026', [t8.length, t8[0].amount, t8[0].date, sum(t8)], [24, 1250000, '2026-01-31', 30000000])
const t23 = gen({ originalValue: 12000000, lifeMonths: 60, periodicity: 'Y', prorata: 'CONST', depStartDate: '2026-03-15' })
eq('T23 yearly ConstantPeriods 15 Mar → f = 10/12, N+1 lines', [t23.length, t23[0].amount, t23[0].fraction], [6, 2000000, 10 / 12])
const lv = gen({ originalValue: 450000, lifeMonths: 12, depStartDate: '2026-03-10' }, { kind: 'lowValue' })
eq('T34 LowValue → single 100% line at first period end', [lv.length, lv[0].amount, lv[0].date], [1, 450000, '2026-03-31'])

// A.12 AddCost: 60,000,000 / 60, 12 posted, +12,000,000 → 1,250,000 over the unchanged 48 periods.
{
  const db = blankDb()
  db.classes.push({ ...cls, id: 'x' })
  db.classAreaAccounts.push({ classId: 'x', areaId: 'a01', assetAcct: '1100000002', accumAcct: '1190000002', expenseAcct: '3700000002', gainAcct: '4900000001', lossAcct: '3800000001', revalSurplusAcct: '2500000001', saleClearingAcct: '1300000001' })
  db.assets = [{ ...base, state: 'draft', originalValue: 60000000, lifeMonths: 60, depStartDate: '2025-01-01' }]
  capitalize(db, 't', '2025-01-01')
  db.lines.filter((l) => l.date <= '2025-12-31').forEach((l) => { l.isPosted = true })
  addCost(db, 't', '2026-01-05', 12000000, '', null, '')
  const un = db.lines.filter((l) => !l.isPosted)
  eq('A.12 AddCost → 48 × 1,250,000', [un.length, un[0].amount, sum(un)], [48, 1250000, 60000000])
}

// A.9 / A.10 / A.11 on a fresh vehicle (36,000,000 / 36, ByDays)
{
  const db = blankDb()
  db.classes.push({ ...cls, id: 'x', prorata: 'DAYS' })
  db.classAreaAccounts.push({ classId: 'x', areaId: 'a01', assetAcct: '1100000003', accumAcct: '1190000003', expenseAcct: '3700000003', gainAcct: '4900000001', lossAcct: '3800000001', revalSurplusAcct: '2500000001', saleClearingAcct: '1300000001' })
  db.assets = [{ ...base, state: 'draft', originalValue: 36000000, lifeMonths: 36, depStartDate: '2027-01-01', prorata: 'DAYS', costCenterId: 'cc5' }]
  capitalize(db, 't', '2027-01-01')
  const run = (ym: string) => { const r = createRun(db, ym, ''); if (typeof r !== 'string') postRun(db, r.id, `${ym}-28`) }
  run('2027-01'); run('2027-02')
  eq('§5.6.9 direct sale outside an invoice is refused', (sellFromInvoice(db, 't', '2027-03-20', 1, 'x', '') ?? '').includes('فاتورة'), true)
  const inv = createSaleInvoiceForAsset(db, 't')
  if (typeof inv === 'string') throw new Error(inv)
  eq('Path B: draft invoice with the asset line, qty 1, revenue = clearing', [inv.status, inv.lines[0].qty, inv.lines[0].revenueAcct], ['draft', 1, '1300000001'])
  eq('11a no customer → refused', (postInvoice(db, inv.id) ?? '').length > 0, true)
  inv.customerId = 'cu1'; inv.postingDate = '2027-03-20'; inv.lines[0].price = 20000000
  const err = postInvoice(db, inv.id)
  const tx = db.txs.find((t) => t.type === 'sale')!
  const td = db.lines.find((l) => l.txId === tx.id)!
  const loss = tx.journal.find((j) => j.account.startsWith('3800000001'))?.debit
  eq('A.11 ToDate 645,161, accum 2,645,161, loss 13,354,839', [err, td.amount, tx.accumulatedAtEvent, loss], [null, 645161, 2645161, 13354839])
  eq('A.11 sale entry balances', tx.journal.reduce((s, j) => s + j.debit - j.credit, 0), 0)
  const clearing = [...inv.journal, ...tx.journal].filter((j) => j.account.startsWith('1300000001')).reduce((s, j) => s + j.debit - j.credit, 0)
  eq('T11 sale: invoice entry + exit entry, clearing account nets to zero; Sale carries the invoice', [clearing, tx.sourceDocRef, db.assets[0].state], [0, inv.number, 'sold'])
  const led1 = assetLedger(db, db.assets[0], '2027-01-01', '2027-12-31', (t) => t.type).rows
  eq('T37 ledger after sale ends at zero, ToDate row present', [led1.at(-1)!.runCost, led1.at(-1)!.runAccum, led1.some((r) => r.dep === 645161)], [0, 0, true])
  eq('ReverseSale is not a manual action', (reverseExit(db, tx.id) ?? '').includes('لا يُستدعى يدوياً'), true)
  eq('T30 cancelling the invoice runs ReverseSale: Running and regenerated', [cancelInvoice(db, inv.id), db.assets[0].state, db.lines.filter((l) => !l.isPosted).length, db.lines.some((l) => l.type === 'toDate')], [null, 'running', 34, false])
  const inv2 = createSaleInvoiceForAsset(db, 't')
  eq('11a the same asset in two non-cancelled invoices is refused', typeof createSaleInvoiceForAsset(db, 't') === 'string' && typeof inv2 !== 'string', true)
  if (typeof inv2 !== 'string') cancelInvoice(db, inv2.id)
  const led2 = assetLedger(db, db.assets[0], '2027-01-01', '2027-12-31', (t) => t.type).rows
  eq('T37 ledger after ReverseSale equals the register', [led2.at(-1)!.runCost, led2.at(-1)!.runAccum], [costAsOf(db, db.assets[0], '2027-12-31'), accumAsOf(db, db.assets[0], '2027-12-31')])
  eq('A.9 retroactive cost-center transfer (15 Feb) rejected', (costCenterTransfer(db, 't', '2027-02-15', 'cc6', '') ?? '').includes('بأثر رجعي'), true)
  eq('A.9 transfer 1 Mar accepted', costCenterTransfer(db, 't', '2027-03-01', 'cc6', ''), null)
  run('2027-03')
  const mar = db.runs.find((r) => r.periodEnd === '2027-03')!
  const feb = db.runs.find((r) => r.periodEnd === '2027-02')!
  eq('A.9 March line on the new center, February keeps the old one', [mar.lines[0].costCenterId, feb.lines[0].costCenterId], ['cc6', 'cc5'])
  eq('T20 UndoCapitalization refused after a posted line', (undoCapitalization(db, 't', '') ?? '').includes('مُرحّل'), true)
  revalue(db, 't', '2027-04-01', 36000000, '')
  const r = registerAsOf(db, '2027-03-31').rows[0]
  eq('A.10 register before the revaluation keeps the old cost', [r.cost, r.accum], [36000000, 3000000])
  eq('A.10 register after the revaluation', registerAsOf(db, '2027-04-30').rows[0].cost, 36000000 + 3000000)
}

// Seed integrity
const db = seed()
const today = '2026-10-16'
const rec = reconciliationAsOf(db, today)
eq('Seed: GL reconciliation today = 0', rec.filter((r) => Math.round(r.gl - r.mod) !== 0).map((r) => r.code), [])
const rec2 = reconciliationAsOf(db, '2026-06-30')
eq('Seed: GL reconciliation 2026-06-30 = 0', rec2.filter((r) => Math.round(r.gl - r.mod) !== 0).map((r) => r.code), [])
const rf = rollForward(db, '2026-01-01', today, (a) => ({ key: a.classId, label: a.classId }))
eq('Seed: roll-forward unexplained = 0', rf.filter((r) => Math.round(r.costUnexplained) || Math.round(r.accUnexplained)).map((r) => [r.key, r.costUnexplained, r.accUnexplained]), [])
const rf2 = rollForward(db, '2025-12-01', today, (a) => ({ key: a.classId, label: a.classId }))
eq('Seed: roll-forward across cut-off unexplained = 0', rf2.filter((r) => Math.round(r.costUnexplained) || Math.round(r.accUnexplained)).map((r) => [r.key, r.costUnexplained, r.accUnexplained]), [])
eq('Seed: legacy excluded before cut-off', registerAsOf(db, '2025-12-30').excludedLegacy, 13)
const sale = db.txs.find((t) => t.type === 'sale')!
const td = db.lines.find((l) => l.txId === sale.id)
eq('Seed: sale 20 Aug carries a ToDate line (20/31)', !!td && td.date === '2026-08-20', true)
eq('Seed: 9 runs posted', db.runs.filter((r) => r.status === 'posted').length, 9)

// §3.8.1 rules on a copy
{
  const d = structuredClone(db)
  const r = createRun(d, '2026-11', '')
  eq('Gap: November before October is rejected', typeof r === 'string' && r.includes('لا فجوات'), true)
  const all = createRun(d, '2026-10', '')
  eq('Overlap: second draft for the same period is rejected', typeof createRun(d, '2026-10', 'c4') === 'string', true)
  if (typeof all !== 'string') postRun(d, all.id, today)
  const sep = d.runs.find((x) => x.periodEnd === '2026-09')!
  eq('LIFO: September cannot be reversed while October is posted', (reverseRun(d, sep.id) ?? '').includes('ReverseLaterRunsFirst'), true)
  const oct = d.runs.find((x) => x.periodEnd === '2026-10' && x.status === 'posted')!
  eq('LIFO: October reverses', reverseRun(d, oct.id), null)
  eq('Dependent event: September blocked by the AddCost of 1 Oct', (reverseRun(d, sep.id) ?? '').includes('أحداث تابعة'), true)
  const inv = createSaleInvoiceForAsset(d, 'a6')
  if (typeof inv !== 'string') { inv.customerId = 'cu2'; inv.postingDate = '2026-11-20' }
  eq('11a invoice before October is posted → PostDepreciationFirst', typeof inv !== 'string' && (postInvoice(d, inv.id) ?? '').includes('PostDepreciationFirst'), true)
  const draftAsset = d.assets.find((a) => a.state === 'draft')!
  eq('11a invoice for a Draft asset → refused', typeof createSaleInvoiceForAsset(d, draftAsset.id) === 'string', true)
  if (typeof inv !== 'string') {
    inv.lines[0].assetId = ''
    eq('11a fixed-asset item without an asset → refused', (postInvoice(d, inv.id) ?? '').includes('بلا أصل'), true)
  }
}

// Transaction documents (§8): post and reverse; reversal clears the dependent event before a run reversal
{
  const d = structuredClone(db)
  const doc = { ...newDoc(d, 'reval', '2026-10-05'), direction: 'up' as const }
  doc.lines = [{ ...blankDocLine(), assetId: 'a16', newValue: 40000000 }]
  syncDocNumber(d, doc); d.docs.push(doc)
  eq('Revaluation document posts with its own number (ARV)', [postDoc(d, doc.id), doc.number.startsWith('ARV-'), d.txs.filter((t) => t.sourceDocId === doc.id).length], [null, true, 1])
  eq('Revaluation document reverses', [reverseDoc(d, doc.id), doc.status], [null, 'reversed'])
  const rc = reconciliationAsOf(d, today)
  eq('Reconciliation still zero after post + reverse', rc.filter((r) => Math.round(r.gl - r.mod) !== 0).map((r) => r.code), [])
  const addDoc = d.docs.find((x) => x.kind === 'costAdj')!
  const sep = d.runs.find((x) => x.periodEnd === '2026-09')!
  eq('Run reversal blocked by the AddCost document; reversing the document unblocks it', [(reverseRun(d, sep.id) ?? '').includes('أحداث تابعة'), reverseDoc(d, addDoc.id), reverseRun(d, sep.id)], [true, null, null])
}

// Legacy import batch (§9 phase 4)
{
  const d = structuredClone(db)
  const b = { id: 'obx', number: 'AOB-2026-0001', cutoffDate: '2026-09-30', fileName: 'x.xlsx', status: 'draft' as const, rows: sampleImportRows(), glLoaded: true, assetIds: [], committedAt: null, notes: '' }
  d.batches.push(b)
  eq('Import: sample file has row errors and commit is blocked', [batchErrors(d, b) > 0, (commitBatch(d, b.id) ?? '').includes('خطأ')], [true, true])
  b.rows = b.rows.filter((r) => !['OLD-BLD-005', 'OLD-VEH-131'].includes(r.code))
  eq('Import: clean rows commit as Running/Closed legacy assets', [commitBatch(d, b.id), b.assetIds.length, d.assets.filter((a) => b.assetIds.includes(a.id) && a.isLegacy).length], [null, 4, 4])
  const rc = reconciliationAsOf(d, today)
  eq('Import: reconciliation zero when the ledger opening balances are loaded', rc.filter((r) => Math.round(r.gl - r.mod) !== 0).map((r) => r.code), [])
  eq('Import: reverse before any posting succeeds', reverseBatch(d, b.id), null)
}

console.log(fails ? `\n${fails} check(s) failed` : '\nall checks passed')
process.exit(fails ? 1 : 0)
