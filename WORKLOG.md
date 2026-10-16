# WORKLOG

> Rules: read from the top before any work. Append a new entry at the bottom after every task. Never edit or delete past entries.

---

## 2026-10-16 — Foundation + first module pass (v0.1)

**Module / screen:** whole mock — shell + Fixed Assets.

**Completed**
- Vite/React/TS/Tailwind project, ENKI ERP RTL shell (right sidebar with all ENKI modules, top bar, breadcrumb page header, navy split "حفظ" button, toolbar dropdowns), shared UI kit, ListView.
- First pass of every screen, built before the source documents reached this machine (owner asked to start building).

**Key design decisions**
- Stack: Vite + React instead of the playbook default Next.js + shadcn — the owner asked to start immediately and no project brief was available; state is client-side so it works on any static host. **Open:** confirm or switch if `project-brief.md` requires Next.js.
- HashRouter + `localStorage` store so `dist/` runs from any static host.

**Issues / deferred:** `docs/project-brief.md` and `docs/discovery-ar.md` not received.

**Verification:** `npm run build` passes; dev server opened, dashboard, asset card, depreciation run and disposal pages exercised; post flow tested.

**Next step:** align with the plan once received.

---

## 2026-10-16 — Alignment with `assets-management-module-plan-ar.md`

**Module / screen:** Fixed Assets — all screens.

**Completed**
- Data model per plan §3: AssetClass (method, life, declining factor, periodicity, prorata, six account codes, IsDepreciable), AssetLocation tree, AssetGroup, Asset (legacy + imported accumulated depreciation, source doc ref, tag/serial, cost center), AssetDepreciationLine, AssetTransaction, AssetDepreciationRun.
- Engine per §5.1: SL / DB / DB-then-SL, prorata None / ConstantPeriods / ByDays, rounding difference on the last line, regenerate only unposted lines.
- State machine per §4: Draft → Running (capitalize, with the rule-1 validations) → Paused/Resume, Revalue, Transfer, Sell, Dispose, auto-Closed after the last posted line; delete only Draft, non-legacy, no posted lines.
- Runs per §5.4: Draft (simulation) → Posted (one journal entry grouped by expense account × cost center / accum account, duplicate-period guard, IsPosted re-check) → Reversed (reversal entry, lines back to planned).
- Journal entries per §5.3 for capitalization (only without a purchase bill — §12 decision 3), revaluation ±, sale with gain/loss, disposal; transfers have no entry.
- Reports per §7: register as of date, depreciation forecast (period × class), by location / custodian, disposals with gain/loss, GL reconciliation (difference column).
- Permissions per §6.3: role switcher (cosmetic, gates buttons) + role × permission matrix; document types per §3.10.
- Screens: dashboard (KPIs), asset register (state tabs + filters), asset card (5 tabs incl. depreciation board and event timeline), runs list/document, transactions log, classes, locations tree, groups, permissions & numbering.
- Removed the first-pass maintenance screen and per-document transfer/revaluation/disposal pages: in the plan these are asset actions (§6.2), and maintenance is a phase-5 item without defined fields.

**Key design decisions / assumptions (need confirmation)**
1. Account codes for accumulated depreciation `1190000001..04` and expense `3700000001..04` are from §3.9; gain `4900000001`, loss `3800000001`, revaluation surplus `2500000001`, cash `1200000001`, suppliers `2100000001`, land `1100000009` are **placeholders marked "مقترح"** (plan §12 decision 1).
2. IT equipment class uses the furniture & office equipment accounts (`…04`) — the seeded chart has no separate IT account.
3. Depreciation area is fixed to `01 — Local GAAP` and its UI is hidden (plan §3.2, phase 5).
4. Cost-center change on transfer: plan §5.3 lists an entry "from the next period" but gives no amount; the mock records the change and applies the new cost center to later run lines, without a separate entry.
5. Legacy assets: `lifeMonths` holds the *remaining* life from go-live 2026-01-01 (as in plan example أ.8).
6. Yearly periodicity lines fall on 31 Dec; buildings are yearly in the demo, so no building depreciation is posted before Dec 2026.

**Verification**
- `npm run build` passes; zero console errors after reload.
- Engine checked in the browser against plan examples: 36,000,000/36 → 36 × 1,000,000; 10,000/3 → 3,333/3,333/3,334; salvage 50,000/5,000 → 45,000; prorata by days 15 Mar → 274,194 (17 days) … last 725,806 on 2027-02-28, total 6,000,000; land → no lines; DB 40% → 40/24/14.4/8.64/12.96 M; DB-then-SL → 20/12/7.2/5.4/5.4 M; legacy 80M − 50M over 24 → 1,250,000.
- UI flow: capitalized a draft asset (FA-000023), simulated and posted October run (15 lines, one balanced entry grouped by cost center), reversed it (lines back to planned). GL reconciliation report shows zero differences.

**Issues / deferred:** project brief and discovery notes still missing; phase-4 items (purchase-bill listener, Excel legacy import) and phase-5 items (multiple areas, batch assets, physical count, maintenance) are not in the mock.

**Next step:** owner review; then gap list from the project brief.

---

## 2026-10-16 — Maintenance screen restored (owner request)

**Module / screen:** Fixed Assets — الصيانة (`#/maintenance`, `#/maintenance/:id`, asset card tab).

**Completed**
- Maintenance orders: list with tabs (open, overdue, planned, in progress, done, cancelled, all), type filter, KPIs (open, overdue, due in 30 days, cost done in 2026).
- Order page: asset, type (preventive / corrective / inspection), vendor, planned date, estimated cost, recurrence, work description; actions start, complete (actual date + cost), cancel; journal tab; other orders of the same asset.
- Completing an order books the cost (debit maintenance expense on the asset's cost center / credit suppliers) and, for recurring orders, schedules the next one automatically.
- Asset card: new "الصيانة" tab + "أمر صيانة جديد" action; dashboard alert for overdue orders; 8 seeded orders.
- Store fix: `run()` now builds on the latest state, so two consecutive calls in one event no longer overwrite each other.

**Key design decisions (assumptions — the plan only names "جدولة الصيانة (AssetMaintenance)" in phase 5)**
- Fields, statuses and recurrence are mock assumptions. Maintenance cost is always expensed (no capitalization) and does not change the asset state.
- Expense account `3600000001 — مصروف صيانة الموجودات` is a placeholder marked "مقترح".

**Verification:** `npm run build` passes; zero console errors after reload; completed MNT-2026-0005 (journal created, next order MNT-2026-0009 planned for 2027-01-16); created a new order from `?asset=a8` and saved it; asset card tab lists the orders.

**Next step:** owner review of the maintenance fields.

---

## 2026-10-16 — Capitalization option on maintenance orders (owner request)

**Module / screen:** Fixed Assets — maintenance order, asset card, settings, reports.

**Completed**
- Order field "المعالجة المحاسبية": expense (default) or capitalize onto the asset value. Capitalized orders are one-off (recurrence disabled).
- On completion of a capitalized order: entry debit asset account / credit suppliers; the cost is added to the asset (`capitalizedCost`, part of gross value); only unposted depreciation lines are regenerated over the remaining life; an Adjustment event is logged on the asset.
- Rules: capitalization only for running/paused assets and only when cost ≥ the capitalization threshold (default 5,000,000 IQD, editable in الصيانة والترقيم settings by the settings role).
- Reports: GL reconciliation includes maintenance entries; register-as-of-date includes capitalized costs by completion date. Asset card shows "تكاليف مرسملة"; lists mark capitalized orders.
- Seed: MNT-2026-0009 — replacement of the main filling unit on FA-000004 (18,000,000, capitalized 2026-09-30).

**Key design decisions (assumptions):** IAS 16 subsequent-cost treatment; threshold value and one-off rule are mock choices for the owner to confirm.

**Verification:** `npm run build` passes; no console errors after reload. Seeded overhaul raised FA-000004's next installment 3,175,949 → 3,646,554 with the 9 posted lines unchanged; GL reconciliation still zero. In the UI, capitalizing MNT-2026-0007 at 950,000 was rejected (below threshold); at 6,000,000 it completed and the next installment went 281,525 → 381,525.

**Next step:** owner review.

---

## 2026-10-16 — Owner approval: maintenance capitalization rules

**Module / screen:** Fixed Assets — maintenance.

**Completed:** owner approved the capitalization threshold (5,000,000 IQD default, editable) and the rule that capitalized orders are one-off. Both are no longer open assumptions.

**Verification:** none needed (decision record only).

**Next step:** awaiting further owner feedback; project brief / discovery notes still not received.

---

## 2026-10-16 — Plan addendum (owner request)

**Module / screen:** docs.

**Completed:** `docs/plan-addendum-ar.md` — «ملحق ب»: maintenance entity and capitalization (approved), gaps found while building (cost-center transfer entry, state-machine additions, reversal ordering, run overlap guard, missing document types, prorata/periodicity definitions, legacy remaining life, as-of-date register), the open §12 decisions with the placeholder account codes, and proposed extra tests. Each item references the plan section and carries a status (approved / applied-awaiting / open).

**Key design decisions:** written in the mock repo; the original plan in `docs/source/` and in the JasimERP repo is untouched.

**Verification:** cross-checked every "applied" statement against `src/data/calc.ts` and `src/data/lifecycle.ts`.

**Next step:** owner review; optionally copy into `JasimERP/docs/planning/assets` with approval.

---

## 2026-10-16 — Plan revisions 2 and 3 applied to the mock

**Module / screen:** Fixed Assets — data model, engine, state machine, runs, reports, asset card, classes, settings, maintenance.

**Completed**
- Source: copied the updated plan (`assets-management-module-plan-ar.md` / `-en.md`, status «المراجعة 2 … المراجعة 3») and `assets-decisions-9-11-ar.md` from `JasimERP/docs/planning/assets` into `docs/source/`.
- Data model (§3): `AssetKind` on class; account codes moved to `classAreaAccounts` per (class × area) with the default area 01 (§3.1.1); `areas` and `areaSettings` (§3.2.1) stored, engine reads the denormalized default-area copy; Asset gains `capitalizationDate`, `importCutoffDate`, `remainingLifeAtImport`, bill line/sequence; line types Depreciation / Manual / ToDate with `fraction`; AssetTransaction gains doc type, from/to state, `accumulatedAtEvent`, reversal links, external (other-module) entries.
- Engine (§5.1.1): fiscal-calendar periods (fiscal year starts January, §12.7 default); life must be a multiple of the period; ConstantPeriods/ByDays proration with an N+1 completion line (A.5 corrected); legacy starts the period after the cut-off with the mandatory remaining life; LowValue = one 100 % line; Land = none; Resume never prorates.
- State machine (§4.1): Cancel, UndoCapitalization, Closed → Running on upward revaluation / AddCost / life change, Transfer on Closed, Sell/Dispose from Running/Paused/Closed with PostDepreciationFirst and a ToDate line inside the exit entry (§5.6.1), ReverseSale/ReverseDisposal to FromState dated at the original event.
- New events (§5.6): AddCost 240, ReduceCost 241 (ReductionExceedsBookValue), ManualDepreciation 242, Impair 238 as its own action; revaluation is upward only (233).
- Cost-center transfer (§5.5): separate action 237 with effective date (default = first day of next unposted period, warning otherwise), no retroactive dates, each run line takes the cost center as of its LineDate, no entry; reversible while no later posted line.
- Runs (§3.8.1): no overlap (all-classes vs class, one Draft max), no gaps, LIFO reversal (`Assets:ReverseLaterRunsFirst`), no reversal under later dependent events, reversal entry dated at PeriodEnd.
- Reports (§7): register as of any past date (pending depreciation, salvage column, location/custodian/cost center as of the date, legacy excluded before cut-off with footer count), reconciliation with the same asOfDate, Asset Ledger (report + asset-card tab, ToDate rows separate), Roll-forward with "unexplained" = 0. Seven reports.
- §5.6.6: "من سطر فاتورة شراء" on the register creates N drafts (last one takes rounding; idempotent per bill + line). Seed includes 3 monitors from PB-2026-0140.
- Maintenance: capitalized orders now post an AddCost (240) on the asset; maintenance moved to doc type 243 MNT (marked مقترح) because 237 is ACC.
- Settings: document types 230–242 (+243 proposed), event → type table, capitalization and LowValue thresholds, §12 decisions 1–11 with the applied defaults.
- `npm run check` (`scripts/engine-check.ts`): A.1, A.3–A.6, A.8–A.12, tests 2–3, 20, 23, 30, 34, 37, gap/overlap/LIFO/dependent-event rules, PostDepreciationFirst, seed reconciliation (today and 2026-06-30) and roll-forward (incl. across the cut-off).

**Key design decisions / interpretations**
1. §7.1 lists Capitalization, OpeningBalance, Revaluation, Impairment as value-changing; the mock also counts Addition and AcquisitionReduction (they change the value per §5.6.2–5.6.3).
2. Paused assets: Sell/Dispose skip PostDepreciationFirst and the ToDate line (no depreciation while paused) — the plan does not say.
3. Reversal actions exist for Sale, Disposal, CostCenterTransfer and Capitalization (UndoCapitalization). The plan names dependent events (revaluation, impairment, AddCost…) as "reverse them first" but defines no reverse action for them — not built.
4. UndoCapitalization of a bill-linked asset keeps the purchase-bill entry, so reconciliation would show a difference until purchasing reverses the bill — shown truthfully.
5. Pause / Resume / Adjustment / Cancel have no document type; the mock numbers them `TRX-YYYY-####` internally.
6. Projects: plan §5.5 applies the same effective-date mechanism to projects; the mock has no project master list, so only cost centers are effective-dated.
7. Multi-area: tables exist with the single default area; no second-area UI (phase 5 per plan).
8. Low-value threshold default is null (disabled) per §5.6.5; decision 11 recommends enabling it — setting available.

**Verification:** `npm run build` passes; `npm run check` all passed; browser (1366×850): every route renders, zero console errors after reload; sold FA-000006 on 2026-10-16 (ToDate 640,000 = 16/31, gain 9,800,000, balanced entry) then reversed it (back to Running, 11 lines regenerated); cost-center transfer default 2026-10-01, 2026-09-15 rejected as retroactive; October run posted with the new cost center on FA-000016; reversing September rejected by LIFO; purchase-line modal created 3 drafts 3,333,333/3,333,333/3,333,334 and refused a repeat.

**Next step:** owner review; open decisions §12.1 (accounts), §12.6–12.11 confirmations.
