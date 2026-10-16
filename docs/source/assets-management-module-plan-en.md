# Assets Management Module for Enki — Implementation Plan

> **Status:** 🟡 Draft for review — no code written yet. **Rev 2:** closes seven gaps found in review — cost-center transfer (§5.5), state-machine additions (§4.1), run reversal order and overlap checks (§3.8.1, §5.4), missing document types (§3.10), proration/periodicity/rounding definitions (§5.1.1), remaining life of imported assets (§3.5, §5.1, A.8), and as-of-date register values (§7.1). Appendix example A.5 was also corrected. **Rev 3 (SAP B1 comparison):** adds depreciation-to-date on sale/disposal, subsequent additions, acquisition reductions, manual depreciation, per-area asset settings and per-area account determination, asset kinds (incl. low-value), quantity-N purchase lines, and two reports (Asset Ledger, Movement Schedule) — all collected in §5.6, §3.1.1–3.2.1 and §7.2–7.3.
> **Companion draft:** [assets-management-module-plan.md](assets-management-module-plan.md) is an earlier Arabic-language draft of this same module; keep both, this file is the reference going forward.
> **Reads with:** [[planning-folder-convention]] · [[thin-appservice-cqrs-reference]] · [[feature-contracts-folder-structure]] · [[fiscal-year-period-category]] · [[localize-user-facing-messages]] · [[data-authority-query-convention]] · [[global-mapster-config-pattern]] · [[prefer-userfriendlyexception]] · [[entity-ctor-base-id]] · [[no-store-access-in-validators]] · [[primary-constructors-preference]] · [[report-manager-owns-query-logic]] · [[report-per-report-folder-structure]]

---

## 0. How SAP B1 and Odoo actually model this, and what changes when it lands in Enki

I checked both reference systems directly rather than working from memory alone:

- **Odoo / OCA `account_asset_management`** (verified against the source on GitHub, `OCA/account-financial-tools@16.0`): the model set is `account.asset.profile` (the depreciation *template* — asset/depreciation/expense/plus-value/min-value/residual accounts, journal, computation method, useful life, period length), `account.asset` (the asset record, referencing a profile), `account.asset.line` (one row per depreciation installment plus non-depreciation rows for revaluations/removals), and `account.asset.group` (a free-form classification, decoupled from the accounting profile). Computation methods are `linear`, `linear-limit`, `degressive`, `degressive-linear`, `degressive-limit`; time can be driven by "number of years" or "number of depreciations"; there's a `days_calc` flag for day-based proration and a `prorata` flag for a partial first period. Depreciation lines are posted individually or in batch via a wizard or a cron job, and — notably — a posted line is **reversed**, never deleted, when you need to undo it.
- **SAP Business One Fixed Assets** (9.0+): the parallel structure is Asset Master Data (the asset), Asset Classes (the template — depreciation type, useful life, account determination), Depreciation Areas (you can run more than one depreciation "view" per asset — e.g. book vs. tax — and choose which one posts to the G/L), and Account Determination (maps an asset class to the APC account, accumulated-depreciation account, expense account, and gain/loss-on-retirement accounts). Lifecycle transactions are Capitalization, Planned/Unplanned Depreciation Run, Manual Value Correction (revaluation), Transfer, and Retirement (with or without revenue), each producing its own journal entry type. SAP B1 keeps a monthly "Depreciation Forecast" so accountants see the year's schedule before anything posts.

Both systems converge on the same shape Enki needs: a **template layer** (profile/class) that owns the accounting configuration, an **asset record** that inherits from it and can override, a **generated depreciation schedule** that is data, not just a formula, and a strict separation between *simulating* a depreciation run and *posting* it. That convergence is what this plan is built on. What does **not** carry over literally:

| Reference pattern | Enki reality | Consequence |
|---|---|---|
| `account_asset_id` is an FK (`Many2one`) to `account.account` | Every posting in Enki references a GL account by **string code** — `JournalEntryPostLineDto.AccountCode` | The asset class stores account **codes** (`[MaxLength(15)]`), and validity/postability is checked in the **command handler**, not a foreign key constraint |
| `journal_id` — Odoo posts through a named journal | Enki has no `Journal` entity; classification is `DocumentType` + `DocumentNumbering` | No `journal_id` field; instead, dedicated `DocumentType` rows (§3.10) |
| SAP's "Depreciation Run" is a background job with a log | Enki's equivalent must be a first-class, queryable **document** (`AssetDepreciationRun`), because every other recurring process in this codebase (e.g. `SalesRecurringTransactionGenerationJob`) follows that shape | The scheduled Hangfire job only *creates and posts* the document; it is never the source of truth itself |
| One journal entry per (period × journal × cost center) in most SAP/Odoo setups | An Enki `JournalEntry` carries `CostCenterId` **per line**, not per header | One journal entry per depreciation run, with lines grouped by (expense account, cost center) |
| Hard delete after posting is blocked entirely in both reference systems | Every Enki aggregate is `FullAuditedAggregateRoot` (soft delete) with an established reversal pattern (`IsReversal`) | Deletion after posting is rejected with `UserFriendlyException`; correction happens via a reversing entry, matching how the rest of Enki corrects mistakes |
| `company_id` / multi-company fields | `MultiTenantAuditedAggregateRootWithUserAndOrgBase<Guid>` already supplies `TenantId` + `OrganizationId` | No extra fields; every list query goes through `ApplyDataAuthority` |

---

## 1. Executive summary

**Goal:** cover the full fixed-asset lifecycle — acquisition, capitalization, periodic depreciation, revaluation, transfer, pause, sale, disposal — with every event posting through Enki's single approved integration point:

[`IJournalEntryIntegrationAppService.PostAsync(JournalEntryPostDto)`](../../../jasim_api/modules/core/src/Core.Application.Contracts/Integrations/IJournalEntryIntegrationAppService.cs)

**Governing principle:** the system never stores "current asset value" as an editable field. It stores the original cost plus a *generated* depreciation schedule, and book value is always a derived read:

```
Book Value = Original Value − Σ(posted depreciation lines) − imported (legacy) depreciation ± revaluation adjustments
```

**Biggest current gap in Enki — verified against the code, not assumed:**

- [`Item.IsFixedAsset`](../../../jasim_api/modules/inventory/src/Inventory.Domain/Entities/Items/Item.cs:257) (bool) is a classification flag only — no depreciation logic sits behind it.
- `GeneralLedgerAccountType.AccumulatedDepreciation = 4` is a defined enum value in [`FinanceSharedEnums.cs`](../../../jasim_api/modules/finance/src/Finance.Domain.Shared/Entities/FinanceSharedEnums.cs), but **no account in [`GeneralLedgerAccountSeedData.cs`](../../../jasim_api/modules/finance/src/Finance.Domain/Entities/GeneralLedgerAccounts/GeneralLedgerAccountSeedData.cs) is actually classified with it** — confirmed by direct search of the seed file.
- Document type codes **222–229 are unassigned** in [`DocumentType.cs`](../../../jasim_api/modules/core/src/Core.Domain.Shared/Entities/DocumentTypes/DocumentType.cs) (last used: `220`/`221` for Production; next used is `500`) — codes `230`–`242` proposed below are safe to claim.

---

## 2. Architectural placement

### 2.1 Why a standalone module, not a slice of Finance

| Criterion | Verdict |
|---|---|
| Scope size | 10 entities + a calculation engine + 7 reports + 2 document workflows — larger than any existing Finance slice |
| Dependencies | Needs `core` (organization, cost center, numbering, periods) + `finance` (chart of accounts, posting) and later `hr` (custodian) and `procurement` (capitalize-from-bill) — that dependency shape is a standalone module, not a Finance feature |
| Precedent in this repo | `manufacturing` is the most recently added module: 6 projects, its own schema, depends on `core` — copied literally here |
| Tenant on/off | An independent schema means a tenant that doesn't need Fixed Assets can have the module disabled without touching Finance |

### 2.2 The six projects (copied 1:1 from `modules/manufacturing`)

```
jasim_api/modules/assets/
├── Assets.abpmdl · Assets.sln · common.props
└── src/
    ├── Assets.Domain.Shared/         Enums, Localization/Assets/{ar,en}.json, AssetsResource
    ├── Assets.Domain/                Entities, Factories, IRepositories, Managers, JournalStrategies
    ├── Assets.Application.Contracts/ Entities/<Feature>/{Commands,Queries,Dtos} + *Permissions + I*AppService
    ├── Assets.Application/           Api/<Feature>/{Handlers/{Commands,Query},Validations,Managers} + *AppService
    ├── Assets.EntityFrameworkCore/   AssetsDbContext + Entities/<Feature>/{*ModelConfiguration,*Repository}
    └── Assets.HttpApi/               Empty AssetsController — routes are conventional
```

### 2.3 Mandatory host wiring

| File | Change |
|---|---|
| [`JasimERP.sln`](../../../jasim_api/JasimERP.sln) | Add the six projects |
| `src/JasimERP.{Domain,Domain.Shared,Application,Application.Contracts,EntityFrameworkCore,HttpApi}/*.csproj` | `ProjectReference` to each matching layer |
| [`JasimERPDomainModule.cs`](../../../jasim_api/src/JasimERP.Domain/JasimERPDomainModule.cs) | `typeof(AssetsDomainModule)` in `DependsOn` |
| [`JasimERPApplicationModule.cs`](../../../jasim_api/src/JasimERP.Application/JasimERPApplicationModule.cs) | `typeof(AssetsApplicationModule)` |
| [`JasimERPEntityFrameworkCoreModule.cs`](../../../jasim_api/src/JasimERP.EntityFrameworkCore/EntityFrameworkCore/JasimERPEntityFrameworkCoreModule.cs) | `typeof(AssetsEntityFrameworkCoreModule)` |
| [`JasimERPDbContext.cs`](../../../jasim_api/src/JasimERP.EntityFrameworkCore/EntityFrameworkCore/JasimERPDbContext.cs) | `builder.ConfigureAssets();` after `ConfigureFinance()` |
| [`JasimERPHttpApiHostModule.cs`](../../../jasim_api/src/JasimERP.HttpApi.Host/JasimERPHttpApiHostModule.cs) (conventional controllers) | `options.ConventionalControllers.Create(typeof(AssetsApplicationModule).Assembly, s => { s.RootPath = "assets"; });` |
| Same file, `ConfigureRecurringJobs()` | Register `AssetDepreciationRunJob` |

> **Migrations:** the module has no internal Migrations folder. All migrations are generated against the host project [`src/JasimERP.EntityFrameworkCore/Migrations`](../../../jasim_api/src/JasimERP.EntityFrameworkCore/Migrations) targeting `JasimERPDbContext`, exactly like every other module.

---

## 3. Data model

### Rules that apply to every table

- Aggregate roots inherit `MultiTenantAuditedAggregateRootWithUserAndOrgBase<Guid>` from [`Core.Bases.EntityBase`](../../../jasim_api/modules/core/src/Core.Domain/Bases/EntityBase.cs) ⇒ `TenantId` + `OrganizationId` + soft delete + full audit, for free.
- Constructors pass the id through `: base(id)`, never `Id = id;` in the body — [[entity-ctor-base-id]].
- Every `decimal` is `decimal(19,6)` automatically via [`BaseDbContext.cs`](../../../jasim_api/modules/core/src/Core.EntityFrameworkCore/EntityFrameworkCore/BaseDbContext.cs); no `HasPrecision` needed except for percentages (`(5,2)`).
- Every table lives in schema `Assets` via `builder.ToTable("X", AssetsDbProperties.DbSchema)` + `ConfigureByConvention()`.
- Account codes: `[MaxLength(15)]`, matching `GeneralLedgerAccount.AcctCode`.

### 3.1 `AssetClass` — the depreciation template (≈ SAP's Asset Class / Odoo's `account.asset.profile`)

| Field | Type | Notes |
|---|---|---|
| `Code` | string(20) | unique per `OrganizationId` + `TenantId` |
| `Name` / `ForeignName` | string(100) | |
| `DepreciationMethod` | enum | `StraightLine` / `DecliningBalance` / `DecliningThenStraight` / `None` |
| `UsefulLifeMonths` | int | |
| `DecliningFactor` | decimal? | declining-balance only |
| `Periodicity` | enum | `Monthly` / `Quarterly` / `Yearly` |
| `ProrataMethod` | enum | `None` / `ConstantPeriods` / `ByDays` |
| `AssetAcctCode` | string(15) | asset (APC) account, e.g. `1100000003` for vehicles |
| `AccumDeprAcctCode` | string(15) | accumulated-depreciation account — **does not exist in the seeded chart yet, see §3.9** |
| `DeprExpenseAcctCode` | string(15) | depreciation expense, e.g. `3700000003` |
| `GainOnDisposalAcctCode` | string(15) | |
| `LossOnDisposalAcctCode` | string(15) | |
| `RevaluationSurplusAcctCode` | string(15)? | equity account for an upward revaluation |
| `AssetKind` | enum | `Tangible` / `Intangible` / `Land` / `LowValue` (§5.6.5). `Land` forces `IsDepreciable = false`; `Intangible` is labelled "amortization" in UI and reports but uses the same accounts and engine |
| `IsDepreciable` | bool | `false` for land |
| `IsActive` | bool | |

> **Enforced rule:** creating/updating a class with any required account blank, non-existent, or `Postable == false` is rejected. That check lives in `AssetClassCreateCommandHandler` via `IGeneralLedgerAccountRepository` — **never in the Validator** ([[no-store-access-in-validators]]) — and raises `UserFriendlyException` sourced from `IStringLocalizer<AssetsResource>`.

### 3.1.1 `AssetClassAreaAccounts` — account determination per (class × area)

SAP B1 determines accounts per class **and** depreciation area; a single set of account fields on the class (as in Odoo) would force a migration the day a second area appears. So the six account codes of §3.1 (`AssetAcctCode`, `AccumDeprAcctCode`, `DeprExpenseAcctCode`, `GainOnDisposalAcctCode`, `LossOnDisposalAcctCode`, `RevaluationSurplusAcctCode?`) physically live in this table: `ClassId` · `AreaId` · the six codes, `UNIQUE(ClassId, AreaId)`.

- The class screen edits the **default area's** row, so Phase 1–4 users never see the table.
- A row is required only for areas with `PostsToGl = true`; the completeness/postability rule of §3.1 applies per row. Non-GL areas need no accounts: their runs mark lines posted without a journal entry (§5.6.8).
- Runs and strategies read accounts by the run's area (§5.4).

### 3.2 `DepreciationArea` — depreciation area (SAP concept; Odoo has no equivalent — see §12.2)

Seeded on day one with a single row, `01 — Local GAAP` (`PostsToGl = true`, `IsDefault = true`); its UI stays hidden until Phase 5.

Fields: `Code` string(2) · `Name` string(100) · `PostsToGl` bool · `IsDefault` bool · `IsActive` bool.

#### 3.2.1 `AssetAreaSetting` — per-asset settings per area

SAP stores method, life and start date per asset *per area*. The schedule (`AssetDepreciationLine`) already carries `DepreciationAreaId`, so the settings must too:

`AssetId` · `AreaId` · `DepreciationMethod` · `UsefulLifeMonths` · `DecliningFactor?` · `Periodicity` · `ProrataMethod` · `SalvageValue` · `DepreciationStartDate` · `ImportedAccumulatedDepreciation` · `RemainingLifeMonthsAtImport?` — `UNIQUE(AssetId, AreaId)`.

- `Capitalize` creates the default-area row from the class defaults (plus any asset-level overrides). The generator (§5.1) and every rule that mentions these fields read the row **for the area being generated**.
- The same-named columns on `Asset` (§3.5) are denormalized read copies of the default-area row, written only by `AssetStateManager`, kept for list filters and reports.
- `OriginalValue` stays single across areas in v1 (areas differ in method, life, salvage and start date only). Phase 5 only adds the UI and the second area's row.

### 3.3 `AssetLocation` — location (tree)

`Code`, `Name`, `ParentId` (self FK, `DeleteBehavior.Restrict`), `Levels` int, `IsActive` — same tree pattern as `GeneralLedgerAccount` (`FatherNum` + `Levels`) but keyed by Guid since there's no need for a hierarchical code here.

### 3.4 `AssetGroup` — free classification (≈ Odoo's `account.asset.group`)

`Code`, `Name`, `IsActive`. Independent of the accounting class; filtering/reporting only.

### 3.5 `Asset` — the master record (aggregate root)

| Field | Type | Notes |
|---|---|---|
| `AssetCode` | string(25) | from `DocumentNumberingManager.GenerateNumberAsync("Assets", "FA")` |
| `Name` / `Description` | string | |
| `AssetClassId` | Guid FK | settings are **copied**, not referenced, at creation time |
| `AssetGroupId` / `LocationId` | Guid? FK | |
| `CustodianEmployeeId` | Guid? | points at `HR.Employee` — **no cross-module FK**, enriched on read |
| `ItemId` | Guid? | optional link to an `Item.IsFixedAsset == true` |
| `SerialNumber` / `TagNumber` | string(50) | `TagNumber` is partially unique (`WHERE TagNumber IS NOT NULL`) |
| `PartnerId` | Guid? | vendor — `Core.BusinessPartner` |
| `SourceDocLineId` / `SourceLineSequence` | Guid? / int? | the purchase-bill line and the 1..N ordinal within it (§5.6.6); `UNIQUE(SourceDocType, SourceDocLineId, SourceLineSequence) WHERE SourceDocLineId IS NOT NULL` makes the bill listener idempotent |
| `SourceDocType` / `SourceDocId` / `SourceDocRef` | string / Guid? / string | traceability to the originating purchase document, same convention as `BaseType`/`BaseEntry`/`BaseRef` in `JournalEntryPostDto` |
| `AcquisitionDate` | DateTime | |
| `DepreciationStartDate` | DateTime | in-service date |
| `OriginalValue` | decimal | APC |
| `SalvageValue` | decimal | |
| `DepreciationBase` | decimal | stored, computed as `OriginalValue − SalvageValue` |
| `UsefulLifeMonths` / `DepreciationMethod` / `Periodicity` / `ProrataMethod` | | inherited from the class, overridable per asset; denormalized copy of the default-area `AssetAreaSetting` (§3.2.1) |
| `CapitalizationDate` | DateTime? | set by `Capitalize` (= `ImportCutoffDate` for legacy assets); drives as-of inclusion in the register (§7.1) |
| `State` | enum | `Draft` / `Running` / `Paused` / `Closed` / `Sold` / `Disposed` / `Cancelled` (see §4.1) |
| `IsLegacy` | bool | imported as an opening balance |
| `ImportedAccumulatedDepreciation` | decimal | pre-go-live depreciation, as of `ImportCutoffDate` |
| `ImportCutoffDate` | DateTime? | legacy only: go-live date. **Must be a period-end date** (§5.1.1); the first Enki installment falls in the next period |
| `RemainingLifeMonthsAtImport` | int? | legacy only, **required**: months of useful life left at the cutoff. Defaulted on the import screen as `UsefulLifeMonths − months(DepreciationStartDate → ImportCutoffDate)` (floor 0) and user-overridable, because the prior system may have revised the estimate. Must be a multiple of `monthsPerPeriod` |
| `CurrencyCode` | string(3) | v1: system currency only (§12.2) |
| `CostCenterId` / `ProjectId` | Guid? | **current** value, passed onto the depreciation journal line; effective-dated history lives in `AssetTransaction` (§5.5) |
| `FiscalPeriodId` | Guid? | `Core.PostingPeriod` at capitalization time |

**Book value is never stored.** It's computed in the read layer (`AssetGetByIdQueryHandler` / `AssetsRegisterReportManager`).

**Indexes:** `(AssetCode, OrganizationId, TenantId) UNIQUE` · `(State)` · `(AssetClassId)` · `(LocationId)` · `(CustodianEmployeeId)` · `(TagNumber) UNIQUE FILTERED`.

### 3.6 `AssetDepreciationLine` — the schedule (≈ `account.asset.line`)

`AssetId` (cascade) · `DepreciationAreaId` · `Sequence` int · `LineDate` date · `LineType` enum (`Depreciation` / `Manual` / `ToDate` / `Revaluation` / `Removal`) — `Manual` and `ToDate` are created already posted by their own events (§5.6.1, §5.6.4), never by the generator · `Days` int? · `Amount` · `AccumulatedAmount` · `RemainingValue` · `IsPosted` bool · `DepreciationRunId` Guid? · `JournalEntryId` Guid? · `PostedAt` / `PostedBy`.

Unique constraint: `UNIQUE(AssetId, DepreciationAreaId, Sequence)`. Operational indexes: `(IsPosted, LineDate)` — queried on every depreciation run — and `(AssetId, IsPosted, LineDate)` INCLUDE `Amount` — used by the as-of register (§7.1).

> **Critical rule:** when the schedule is regenerated (revaluation, useful-life change, resume), only **unposted** lines are deleted and the remainder recomputed from the current remaining value. A posted line is never touched — this mirrors OCA's "reverse, never delete" stance on posted lines.

### 3.7 `AssetTransaction` — event log

`AssetId` · `TransactionType` enum (`Capitalization` / `CapitalizationReversal` / `OpeningBalance` / `Addition` / `AcquisitionReduction` / `ManualDepreciation` / `Revaluation` / `Impairment` / `Transfer` / `CostCenterTransfer` / `Pause` / `Resume` / `Sale` / `SaleReversal` / `Disposal` / `DisposalReversal` / `Adjustment`) · `TransactionDate` · `Amount` · `FromValue` / `ToValue` · `FromLocationId` / `ToLocationId` · `FromCustodianId` / `ToCustodianId` · `FromCostCenterId` / `ToCostCenterId` · `FromProjectId` / `ToProjectId` · `FromState` / `ToState` · `AccumulatedAtEvent` decimal? (accumulated depreciation at a `Sale`/`Disposal`, frozen so the Movement Schedule §7.3 needs no recomputation) · `ReversedTransactionId` Guid? · `IsReversed` bool · `JournalEntryId` Guid? · `PostingPeriodId` · `Notes`.

- **`TransactionDate` is the effective date**, not the keying date (keying time is already in the audit columns). It may be back-dated only into an open posting period and never before the last posted depreciation line (§5.5).
- `FromState` / `ToState` let a reversal restore the exact prior state (§4.1).
- A reversal never edits the original row: it adds a `*Reversal` row pointing at it via `ReversedTransactionId` and sets `IsReversed = true` on the original. Every as-of calculation (§7.1) ignores rows with `IsReversed = true`.
- Index `(AssetId, TransactionDate)` — used by the as-of register.

This is what the posting strategies (§5.2) consume.

### 3.8 `AssetDepreciationRun` + `AssetDepreciationRunLine` — the depreciation-run document

The key departure from both reference systems: in Enki, a periodic depreciation run is a **document**, not a side effect of a scheduled job.

| `AssetDepreciationRun` | |
|---|---|
| `RunNumber` string(25) | from `DocumentNumberingManager`, prefix `DPR` |
| `PeriodStart` date · `PeriodEnd` date · `PostingPeriodId` Guid | target accounting period — one run = exactly one period |
| `DepreciationAreaId` · `AssetClassId?` | scope (all, or a single class) |
| `Status` enum | `Draft` (simulation) / `Posted` / `Reversed` |
| `TotalAmount` decimal · `AssetCount` int | |
| `JournalEntryId` Guid? | the run's single journal entry |

`AssetDepreciationRunLine`: `RunId` · `AssetId` · `DepreciationLineId` · `Amount` · `DeprExpenseAcctCode` · `AccumDeprAcctCode` · `CostCenterId?`.

Filtered unique index on `(PostingPeriodId, DepreciationAreaId, AssetClassId) WHERE Status = Posted` — the database-level idempotency guard, on top of the per-line `IsPosted` check. A `Reversed` run does not occupy the slot, so the period can be re-run after a reversal; the reversed run stays as history.

#### 3.8.1 Ordering and overlap rules

A run's **scope** is `(DepreciationAreaId, AssetClassId?)`, where `AssetClassId = null` means every class. The unique index alone cannot express overlap (`null` vs a specific class), so the handler enforces these rules at `simulate` **and** again at `post`, under an ABP distributed lock keyed by `(TenantId, DepreciationAreaId)`:

1. **No overlap.** Two non-reversed runs may not target the same `PostingPeriodId` in overlapping scopes. Same area: all-classes overlaps every class-specific run; class A and class B do not overlap. At most one `Draft` per period and scope.
2. **No gaps.** A run for period P can be posted only if no due, unposted line with `LineDate` before `PeriodStart` exists in its scope. Catch-up after missed months means one run per month, oldest first; the scheduled job (§5.4) does exactly that.
3. **Reverse in reverse order (LIFO).** A `Posted` run can be reversed only if no `Posted` run with a later `PeriodEnd` exists in an overlapping scope. Otherwise: `Assets:ReverseLaterRunsFirst`, naming the blocking run.
4. **No reversal under dependent events.** A run cannot be reversed if any asset in it has a non-reversed `Revaluation`, `Impairment`, `Addition`, `AcquisitionReduction`, `ManualDepreciation`, `Sale`, `Disposal` or life-changing `Adjustment` with `TransactionDate > PeriodEnd` — those events were computed on top of the run's posted lines. The user reverses them first.
5. **Open period.** Both posting and reversing require the target `PostingPeriod` to be open (§5.4).

### 3.9 Chart-of-accounts gap — a mandatory prerequisite

[`GeneralLedgerAccountSeedData.cs`](../../../jasim_api/modules/finance/src/Finance.Domain/Entities/GeneralLedgerAccounts/GeneralLedgerAccountSeedData.cs) today has:

- ✅ Fixed assets `1100000000` and children: `…01` buildings · `…02` machinery & equipment · `…03` vehicles · `…04` furniture & office equipment · `…06` power/telephone lines · `…08` formation expenses.
- ✅ Depreciation expense `3700000000` and children: `…01` buildings & roads · `…02` machinery & equipment · `…03` vehicles · `…04` furniture & office equipment · `…05` amortization of deferred revenue expenditure.
- ❌ **No accumulated-depreciation account exists at all** (a credit contra-account under fixed assets), and no gain/loss-on-disposal account either — confirmed by grepping the seed file directly.

**Required in Phase 1, before any other code:** add to the seed:

| Proposed code | Name | Type |
|---|---|---|
| `1190000000` | Accumulated depreciation | non-postable parent, `AcctType = AccumulatedDepreciation` |
| `1190000001..04` | Accum. depr. — buildings / machinery & equipment / vehicles / furniture & office equipment | postable, `BalDirect = Credit` |
| `4xxxxxxxxx` | Gain on disposal of fixed assets | revenue |
| `3xxxxxxxxx` | Loss on sale/disposal of fixed assets | expense |

> Final numbers are approved by the accountant before the seed is coded — not invented in code (§12, open decision #1).

### 3.10 New document types

Added to [`DocumentTypeData`](../../../jasim_api/modules/core/src/Core.Domain.Shared/Entities/DocumentTypes/DocumentType.cs) — codes `230`–`242` are confirmed unused (thirteen types):

```csharp
public static readonly DocumentType FixedAsset           = new("Fixed Asset",            "230", "FA",  "Fixed Asset");
public static readonly DocumentType AssetCapitalization  = new("Asset Capitalization",   "231", "ACP", "Asset Capitalization");
public static readonly DocumentType AssetDepreciationRun = new("Asset Depreciation Run", "232", "DPR", "Asset Depreciation Run");
public static readonly DocumentType AssetRevaluation     = new("Asset Revaluation",      "233", "ARV", "Asset Revaluation");
public static readonly DocumentType AssetTransfer        = new("Asset Transfer",         "234", "ATR", "Asset Transfer");
public static readonly DocumentType AssetDisposal        = new("Asset Disposal",         "235", "ADS", "Asset Disposal");
public static readonly DocumentType AssetSale            = new("Asset Sale",             "236", "ASL", "Asset Sale");
public static readonly DocumentType AssetCostCenterTransfer = new("Asset Cost Center Transfer", "237", "ACC", "Asset Cost Center Transfer");
public static readonly DocumentType AssetImpairment      = new("Asset Impairment",       "238", "AIM", "Asset Impairment");
public static readonly DocumentType AssetOpeningBalance  = new("Asset Opening Balance",  "239", "AOB", "Asset Opening Balance");
public static readonly DocumentType AssetAddition        = new("Asset Addition",         "240", "AAD", "Asset Addition");
public static readonly DocumentType AssetAcquisitionReduction = new("Asset Acquisition Reduction", "241", "ACR", "Asset Acquisition Reduction");
public static readonly DocumentType AssetManualDepreciation = new("Asset Manual Depreciation", "242", "AMD", "Asset Manual Depreciation");
```

Each gets a `DocumentNumbering` row (`ModuleName = "Assets"`) and an entry in `_documentTypesByCode`.

**Which event uses which type** (reversals reuse the original type with `IsReversal = true`, matching Enki's convention — no separate "reversal" types):

| Event / `TransactionType` | Document type | Journal entry? |
|---|---|---|
| Asset record itself | `230` | no |
| `Capitalization` / `CapitalizationReversal` | `231` | only if the module posts capitalization (§12.3) |
| Periodic run + its reversal | `232` | yes |
| `Revaluation` (upward) | `233` | yes |
| `Transfer` (location / custodian) | `234` | no — number only, for traceability |
| `Disposal` / `DisposalReversal` | `235` | yes |
| `Sale` / `SaleReversal` | `236` | yes |
| `CostCenterTransfer` | `237` | only for the optional year-to-date reclassification (§5.5, §12.6) |
| `Impairment` (downward revaluation) | `238` | yes |
| `OpeningBalance` (legacy import batch) | `239` | no — GL opening balances come from the GL's own opening process; this batch is the traceability anchor and the import audit |
| `Addition` (subsequent acquisition, §5.6.2) | `240` | only if the module posts it (§12.3); none when a purchase bill already posted the cost |
| `AcquisitionReduction` (credit memo on capitalization, §5.6.3) | `241` | only if the module posts it (§12.3); none when the AP credit memo self-posts |
| `ManualDepreciation` (§5.6.4) | `242` | yes |
| `Pause` / `Resume` / `Adjustment` / cancel | none | no — logged in `AssetTransaction` only |

---

## 4. State machine

```
                  ┌──────────┐
                  │  Draft   │  ← manual entry, or from a purchase bill
                  └────┬─────┘
                       │ Capitalize (generate schedule + capitalization entry if needed)
                       ▼
     ┌───────────► ┌──────────┐ ◄──── Resume
     │             │ Running  │
     │  Pause      └────┬─────┘
     │                  ├─── Revaluate ──► Running (regenerate unposted only)
  ┌──┴────┐             ├─── Transfer ───► Running (schedule untouched)
  │Paused │             │
  └───────┘             ├─── Sell ──────► Sold
                        ├─── Dispose ───► Disposed
                        │ last installment posted
                        ▼
                     Closed
```

The diagram shows the happy path only; the complete transition set, including every backward move and `Cancelled`, is the matrix in §4.1.

### 4.1 Complete transition matrix

| From | Action | To | Conditions |
|---|---|---|---|
| `Draft` | `Capitalize` | `Running` | rule 1 below |
| `Draft` | `Cancel` | `Cancelled` | no journal entries; terminal; `AssetCode` is never reused; record kept for audit. Replaces hard delete for assets that were once referenced |
| `Running` | `UndoCapitalization` | `Draft` | no posted line, no `Revaluation`/`Impairment`; reverses the capitalization entry if the module posted one (`IsReversal`, same date, open period); soft-deletes the schedule |
| `Running` | `Pause` | `Paused` | — |
| `Paused` | `Resume` | `Running` | regenerates from the resume date; **pause does not consume useful life** — `periodsLeft` is unchanged and the first resumed installment is a full one (no proration on resume, to avoid fractional-period bookkeeping) |
| `Running` / `Paused` | `Revaluate` / `Impair` / `AddCost` / `ReduceCost` / `ManualDepreciation` / `Transfer` / `CostCenterTransfer` | same state | `Transfer` of location/custodian is also allowed on `Closed`; none are allowed on `Sold`/`Disposed`/`Cancelled` |
| `Running` | (automatic, last line posted) | `Closed` | `Adjustment` transaction |
| `Closed` | (automatic, a run reversal un-posts a line) | `Running` | — |
| `Closed` | `Revaluate` up / `AddCost` / change of estimate | `Running` | only if the resulting remaining depreciable value is `> 0`; regenerates a new schedule |
| `Running` / `Paused` / `Closed` | `Sell` / `Dispose` | `Sold` / `Disposed` | **first** requires every earlier period to be posted (`Assets:PostDepreciationFirst`), **then** posts depreciation up to the retirement date as a `ToDate` line (§5.6.1), cancels the remaining unposted lines (soft delete), posts the closing entry; records `FromState` and `AccumulatedAtEvent`. Always the whole asset — partial retirement is out of v1 (§5.6.7) |
| `Sold` / `Disposed` | `ReverseSale` / `ReverseDisposal` | `FromState` of the original transaction | `IsReversal` entry **dated the original sale date**, period open; if the sale is linked to a customer invoice (`SourceDocId`) that invoice must be cancelled first; the restored schedule is regenerated, not undeleted |
| `Sold` / `Disposed` / `Cancelled` | anything else | — | rejected: terminal |

Backward moves are only possible through an explicit reversal action that leaves both the original and the reversing rows in `AssetTransaction`; no state is ever overwritten silently.

**Transition rules enforced in `AssetStateManager` (Domain Service):**

1. `Draft → Running` requires: a class assigned, `OriginalValue > 0`, `SalvageValue < OriginalValue`, `DepreciationStartDate` set, the class's accounts complete and postable, and the accounting period for the start date not closed.
2. `DeleteAsync` is allowed only in `Draft` with `IsLegacy == false`, no `AssetDepreciationLine.IsPosted == true`, and no `AssetTransaction` rows; otherwise `UserFriendlyException("Assets:CannotDeletePostedAsset")` — use `Cancel` instead.
3. `Sold` / `Disposed` cancel every unposted depreciation line (soft delete) and create the closing entry.
4. `Paused` excludes the asset from depreciation runs without touching existing lines; `Resume` regenerates from the resume date.
5. No transition happens outside a command handler (`*CommandHandler`) — the AppService is a thin `mediator.Send` wrapper only ([[thin-appservice-cqrs-reference]]).

---

## 5. Depreciation engine and posting

### 5.1 `DepreciationScheduleGenerator` (Domain Service, primary constructor)

```
GenerateAsync(asset, area, cancellationToken):
    1. Soft-delete lines where IsPosted == false
    2. postedTotal  = Σ(posted.Amount) + asset.ImportedAccumulatedDepreciation
       remaining    = asset.DepreciationBase − postedTotal
       startDate    = lastPostedDate ?? (asset.IsLegacy ? nextPeriodStart(asset.ImportCutoffDate)
                                                         : asset.DepreciationStartDate)
       plannedLife  = asset.IsLegacy ? asset.RemainingLifeMonthsAtImport : asset.UsefulLifeMonths
       periodsLeft  = (plannedLife / monthsPerPeriod) − postedCount   // postedCount = Enki-posted lines only
       firstFraction = (postedCount == 0 && !asset.IsLegacy) ? ProrataFraction(startDate, period) : 1   // §5.1.1
       // when firstFraction < 1 the schedule has periodsLeft + 1 lines (partial first + completion line)
    3. if (!class.IsDepreciable || remaining <= 0 || periodsLeft <= 0) return []
    4. for i in 1..periodsLeft (+1 when firstFraction < 1):
           amount = ComputeByMethod(method, remaining, periodsLeft, i, i == 1 ? firstFraction : 1)
           amount = Math.Round(amount, currencyDecimals, MidpointRounding.AwayFromZero)
           if (i == periodsLeft) amount = remaining   // all rounding drift lands on the final installment
           lines.Add(...); remaining -= amount
    5. Assert: Σ(lines.Amount) == asset.DepreciationBase − postedTotal
```

**Methods:**

- `StraightLine`: `DepreciationBase ÷ number of periods` (Odoo's `linear`; SAP's default).
- `DecliningBalance`: `remaining × (DecliningFactor ÷ total periods)` (Odoo's `degressive`).
- `DecliningThenStraight`: the larger of the two installments each period — guarantees full depreciation by the end of useful life (Odoo's `degressive-linear`).
- `Prorata`: `None` — full first installment · `ConstantPeriods` — whole months remaining in the first period · `ByDays` — actual days (Odoo's `days_calc`). Exact formulas in §5.1.1.

> The assertion in step 5 is not a comment — it's a `Debug.Assert` in the generator **and** a mandatory unit test per method (§10).

### 5.1.1 Definitions: periodicity, proration, rounding

These three terms were previously only named; they are defined here so the generator, the tests and the accountant all mean the same thing.

**Periodicity.** `monthsPerPeriod` = 1 (`Monthly`) / 3 (`Quarterly`) / 12 (`Yearly`).
- Period boundaries follow the **fiscal calendar** ([[fiscal-year-period-category]]): monthly = month ends; quarterly = fiscal quarter ends (fiscal months 3, 6, 9, 12); yearly = fiscal year end. With a calendar fiscal year these coincide with calendar quarters/years (see §12.7).
- `LineDate` = the last day of its period. A quarterly or yearly line is therefore posted by the run of the posting period that contains it; monthly runs in between simply find nothing due for such classes.
- Validation on class and asset save: `UsefulLifeMonths % monthsPerPeriod == 0`, else rejected. `N = UsefulLifeMonths / monthsPerPeriod` is the number of regular installments.
- Periodicity cannot change once any line is posted.

**Proration** applies only to the *first* period — the one containing `DepreciationStartDate` `S`, with bounds `[Ps, Pe]` — and is skipped for legacy assets (their start is a period boundary) and on resume (§4.1). Let `f` be the first-period fraction:

| `ProrataMethod` | `f` | Lines |
|---|---|---|
| `None` | `1` — depreciation starts with the period containing `S`, as a full installment | `N` |
| `ConstantPeriods` | `(whole months from S's month to Pe's month, S's month counted fully) ÷ monthsPerPeriod`. For `Monthly` this is always `1`, i.e. identical to `None`; it matters for `Quarterly`/`Yearly` | `N` if `f = 1`, else `N + 1` |
| `ByDays` | `(Pe − S + 1) ÷ (Pe − Ps + 1)` — actual calendar days, leap years included | `N` if `f = 1`, else `N + 1` |

When `f < 1`: line 1 = `regular × f`; lines 2..N are regular; line `N + 1` is the **completion line** and equals whatever remains (for straight-line that is exactly `regular × (1 − f)` up to rounding). The asset's life still ends exactly `UsefulLifeMonths` after `S`. For declining methods, line 1 = `remaining × rate × f`, and the final line again absorbs the remainder.

**Rounding.**
- Decimals come from the system currency (`SysCurrencyCode`) minor-unit setting, read once per generation. Mode: `MidpointRounding.AwayFromZero`.
- Each installment is rounded **individually, once**, after all math (rate, fraction, remaining) is done at full `decimal` precision — never round a rate or a fraction first.
- The last line absorbs all drift (step 4). For straight-line and prorata the generator asserts `|last − regular| ≤ ⌈N/2⌉ × 10^−decimals` (plus the completion-line allowance when `f < 1`); a larger gap means a bug, not rounding. Declining methods are exempt from the bound by design (A.3) but must satisfy `last ≥ 0`.
- Run totals, run lines and journal lines are plain sums of already-rounded line amounts and are **never re-rounded**, so debits equal credits to the last unit by construction.
- `DecliningFactor` is stored `decimal(5,2)`; the per-period rate is `DecliningFactor ÷ N`, independent of periodicity.

### 5.2 Posting strategies

Written as classes inheriting `JournalPostingStrategyBase<T>` from [`Core.Bases.JournalPostingStrategyBase`](../../../jasim_api/modules/core/src/Core.Domain/Bases/JournalPostingStrategyBase.cs), registered in `AssetsDomainModule` exactly as [`InventoryDomainModule.cs`](../../../jasim_api/modules/inventory/src/Inventory.Domain/InventoryDomainModule.cs) does:

```csharp
JournalPostingStrategyFactory.RegisterStrategy<AssetTransaction>(
    DocumentTypeData.AssetCapitalization.Code, () => new AssetCapitalizationJournalStrategy());
// … ARV / AIM / ADS / ASL / ACC follow the same shape (reversals reuse the original strategy with IsReversal = true)
JournalPostingStrategyFactory.RegisterStrategy<AssetDepreciationRun>(
    DocumentTypeData.AssetDepreciationRun.Code, () => new AssetDepreciationRunJournalStrategy());
```

> The `CreateAccountGroups` helpers on the base class are built around `DocBase`/`DocLineBase` and don't fit here; asset strategies build `Lines` manually — the same approach `LandedCostJournalStrategy` already takes, just more of it.

Every strategy returns a `JournalEntryPostDto` with: `OrganizationId`, `PostingDate`, `DocumentType`, `SysCurrencyCode`, `FiscalPeriodId`, and `BaseType`/`BaseEntry`/`BaseRef` (document type + the asset's or run's id + its code), and `IsAutoGenerated = true` — confirmed against the actual [`JournalEntryPostDto.cs`](../../../jasim_api/modules/core/src/Core.Domain.Shared/Integrations/FinancePosting/JournalEntryPostDto.cs) shape, including the `AccountCode`-as-string field on [`JournalEntryPostLineDto.cs`](../../../jasim_api/modules/core/src/Core.Domain.Shared/Integrations/FinancePosting/JournalEntryPostLineDto.cs) that drives the string-code decision in §0.

### 5.3 Journal entries generated

| Event | Debit | Credit |
|---|---|---|
| **Capitalization** (only when there's no self-posting purchase bill) | `AssetAcctCode` | vendor / cash account |
| **Periodic depreciation** | `DeprExpenseAcctCode` (+ `CostCenterId` on the line) | `AccumDeprAcctCode` |
| **Subsequent addition** (doc type `240`, §5.6.2) | `AssetAcctCode` | vendor / cash account (no entry if the purchase bill posted it) |
| **Acquisition reduction** (doc type `241`, §5.6.3) | vendor / cash account (no entry if the AP credit memo self-posts) | `AssetAcctCode` |
| **Manual depreciation** (doc type `242`, §5.6.4) and **depreciation to date on retirement** (§5.6.1) | `DeprExpenseAcctCode` (+ cost center as of the date) | `AccumDeprAcctCode` |
| **Upward revaluation** | `AssetAcctCode` | `RevaluationSurplusAcctCode` |
| **Downward revaluation / impairment** (doc type `238`) | `LossOnDisposalAcctCode` until a dedicated impairment-loss account is approved (§12.1) | `AssetAcctCode` |
| **Sale at a gain** | cash/receivable + `AccumDeprAcctCode` | `AssetAcctCode` + `GainOnDisposalAcctCode` |
| **Sale at a loss** | cash/receivable + `AccumDeprAcctCode` + `LossOnDisposalAcctCode` | `AssetAcctCode` |
| **Disposal with no consideration** | `AccumDeprAcctCode` + `LossOnDisposalAcctCode` | `AssetAcctCode` |
| **Transfer** (location/custodian only) | — no entry — | — |
| **Transfer between cost centers / projects** | — no entry by default; future installments simply post to the new center (§5.5) — | — |
| **Optional year-to-date reclassification** (only if §12.6 says yes; doc type `237`) | `DeprExpenseAcctCode` (new center) | `DeprExpenseAcctCode` (old center) |

Sale and disposal entries use accumulated depreciation **after** the to-date installment of §5.6.1 has been added (that extra Dr expense / Cr accumulated pair belongs to the same entry); the example below assumes it is already included in the 60,000. Sale example (asset 100,000 / accumulated depreciation 60,000 / sold for 50,000 ⇒ 10,000 loss):

```
Dr  Cash                              50,000
Dr  Accumulated depreciation — vehicles 60,000
Dr  Loss on disposal of fixed assets   10,000
  Cr  Vehicles                                100,000
```

### 5.4 The depreciation-run cycle (`AssetDepreciationRun`)

**Creation in `Draft` status (simulation — no journal entry, nothing marked posted):**

1. Fetch `AssetDepreciationLine` where `LineDate <= PeriodEnd && !IsPosted && !IsDeleted`, asset `State == Running`, with `ApplyDataAuthority(currentUser)`.
2. Verify the target `PostingPeriod.PeriodStat` isn't `Y` (closed) or `C` (closing in progress) via `IPostingPeriodRepository`; otherwise `UserFriendlyException`.
3. Build the run's lines and totals.

**Posting (`AssetDepreciationRunPostCommandHandler`) inside one unit of work:**

0. Take the distributed lock `(TenantId, DepreciationAreaId)` and enforce the overlap and no-gap rules of §3.8.1.
1. Re-check `IsPosted` per line (the concurrency guard) plus the filtered unique index on `(PostingPeriodId, AreaId, ClassId)`.
1b. Read the account codes from `AssetClassAreaAccounts` for the run's `DepreciationAreaId` (§3.1.1). If the area has `PostsToGl = false`, skip steps 2–3: mark lines posted with no `JournalEntryId` (§5.6.8).
1a. Resolve each line's `CostCenterId`/`ProjectId` **as of its `LineDate`** from the asset's `CostCenterTransfer` history (§5.5), not from the asset's current value.
2. Group lines by `(DeprExpenseAcctCode, CostCenterId)` for the debit side and by `AccumDeprAcctCode` for the credit side ⇒ **one journal entry per run**.
3. `await jeIntegration.PostAsync(dto)` ⇒ `Guid journalEntryId`.
4. Mark `IsPosted = true` + `JournalEntryId` + `DepreciationRunId` on every line; `Run.Status = Posted`.
5. Any asset whose schedule is now exhausted ⇒ `State = Closed` + an `Adjustment`-type `AssetTransaction`.

**Reversing a run:** a `IsReversal = true` entry + `Run.Status = Reversed` + `IsPosted = false` restored on the lines. No deletion — mirroring OCA's "reverse the posting" changelog entry, and Enki's own reversal convention elsewhere. Additionally:
- Allowed only under the **LIFO and dependent-event rules** of §3.8.1 (items 3–4).
- The reversing entry is **dated the original run's `PeriodEnd`**, not today, so the GL balance at any historical date nets out exactly like the module's as-of register (§7.1). The target period must therefore be open; if it is closed, reversal is rejected and the accountant must post a correcting run in the current period instead.
- Assets that were `Closed` by this run return to `Running` (automatic transition, §4.1).

**Scheduled job** (Hangfire, in `ConfigureRecurringJobs()`): creates and posts one run per outstanding month, **oldest first**, up to the last day of the previous month (so a missed month is caught up in order, as §3.8.1 rule 2 requires). Re-running it for the same period produces no second entry — blocked by the unique index and the `IsPosted` check. Pattern mirrors [`SalesRecurringTransactionGenerationJob`](../../../jasim_api/modules/sales/src/Sales.Application/BackgroundJobs/SalesRecurringTransactionGenerationJob.cs): no thrown exceptions, errors are logged, processing moves to the next class.

### 5.5 Transfer between cost centers (and projects)

The cost center is **effective-dated**, because installments are posted per period and must land on the center that owned the asset during that period.

1. `Asset.CostCenterId` holds the current center. Changing it is only possible through the `CostCenterTransfer` action, which writes an `AssetTransaction` with `FromCostCenterId`, `ToCostCenterId` and `TransactionDate` (the effective date). Direct edits of the field after capitalization are rejected. Projects follow the same mechanism (`FromProjectId`/`ToProjectId`).
2. **No retroactive transfers:** `TransactionDate` must be later than the `LineDate` of the last posted depreciation line, and its posting period must be open. This means every already-posted installment keeps its center, and nothing in the past needs correcting.
3. When a run builds its lines (§5.4 step 1a), each line takes the center from the latest non-reversed `CostCenterTransfer` with `TransactionDate <= LineDate`, falling back to the asset's initial center. Granularity is the period: a transfer dated mid-period moves that period's whole installment (its `LineDate` is the period end), so the UI defaults the effective date to the first day of the next unposted period and warns on any other date.
4. **No journal entry by default.** Accumulated depreciation lives on a balance-sheet account that carries no cost center, and past expense stays where it was posted. The only entry that ever arises is the *optional* year-to-date reclassification (Dr expense / new center, Cr expense / old center, doc type `237`), enabled per tenant only if §12.6 is answered "yes".
5. A `CostCenterTransfer` does not change values, so it does not block reversing a run (§3.8.1 item 4); but it can only be reversed itself while no line dated on/after its `TransactionDate` is posted.

### 5.6 Lifecycle events added after the SAP Business One comparison

All are `AssetTransaction` types (§3.7), follow the open-period and reversal rules of §3.8.1/§4.1, and regenerate **unposted lines only** (§3.6).

**5.6.1 Depreciation up to the retirement date (`Sell` / `Dispose`).** Without it, selling mid-month leaves accumulated depreciation short and the gain/loss wrong. Rules, for retirement date `D` in period `[Ps, Pe]`:
1. All earlier periods must already be posted; otherwise `Assets:PostDepreciationFirst`.
2. A `ToDate` line is created already posted, dated `D`, with amount = the regular installment of that period × `g`: `ByDays` → `g = (D − Ps + 1) ÷ (Pe − Ps + 1)`; `ConstantPeriods` → whole months from the period start through `D`'s month (counted fully) ÷ `monthsPerPeriod`; `None` → `g = 0` (no depreciation in the retirement period, mirroring "no proration at start"). Rounded per §5.1.1. Skipped for non-depreciable assets and when the period's regular line is already posted.
3. The `ToDate` pair (Dr `DeprExpenseAcctCode` with the cost center as of `D` / Cr `AccumDeprAcctCode`) is part of the **sale or disposal entry** and is reversed with it by `ReverseSale`/`ReverseDisposal`.
4. All later unposted lines are cancelled. The final accumulated figure is stored in `AccumulatedAtEvent`.

**5.6.2 Subsequent addition (`AddCost`, doc type `240`).** Adds capex to an existing asset (upgrade, extension). Allowed on `Running`, `Paused`, `Closed` (→ `Running`). `OriginalValue += Amount`; `DepreciationBase` recomputed; unposted lines regenerated from the new remaining depreciable value over the **unchanged remaining periods** (no retroactive catch-up — posted periods are never restated). Optionally the user also supplies a new remaining life, recorded as an `Adjustment`. Entry: Dr `AssetAcctCode` / Cr vendor or cash; none when `SourceDoc*` points at a purchase bill that posted the cost itself (§12.3).

**5.6.3 Acquisition reduction (`ReduceCost`, doc type `241`).** The counterpart for an AP credit memo or purchase return after capitalization, linked through `SourceDoc*`. `OriginalValue −= Amount`; regenerate as in 5.6.2. Rejected (`Assets:ReductionExceedsBookValue`) if the new `OriginalValue` would fall below posted + imported accumulated depreciation — the user then disposes or adjusts instead. Entry: Dr vendor or cash / Cr `AssetAcctCode`; none when the credit memo self-posts.

**5.6.4 Manual (unplanned) depreciation (`ManualDepreciation`, doc type `242`).** A one-off charge (extra shifts, partial damage) in a chosen open period. Amount must be `> 0` and `≤` the remaining depreciable value; the asset must be depreciable. Creates a posted `Manual` line (no run; its own journal entry, Dr expense / Cr accumulated) and regenerates the unposted lines from the reduced remainder over the unchanged remaining periods. It counts as a dependent event for run reversal (§3.8.1 item 4).

**5.6.5 Asset kinds and low-value assets.** `AssetKind` on the class (§3.1): `Land` ⇒ `IsDepreciable = false`; `Intangible` ⇒ same engine, UI/report label "amortization"; `LowValue` ⇒ on `Capitalize` the generator produces **one** line for 100% of the base, dated the end of the in-service period (so the first run expenses it), regardless of life/method. An optional tenant setting `Assets:LowValueThreshold` (null = off) rejects `LowValue` assets whose `OriginalValue` exceeds it. Low-value assets stay in the register and the physical count until disposed.

**5.6.6 Purchase-bill lines with quantity N.** The Phase 4 listener creates **N `Draft` assets** for a line of quantity N (each quantity 1, as in SAP), cost per asset = `round(lineNet ÷ N)` with the last asset taking the rounding remainder, each with `SourceDocLineId` and `SourceLineSequence = 1..N`. Re-posting the same bill is idempotent through the unique index of §3.5. Fractional quantities are rejected for fixed-asset items.

**5.6.7 Partial retirement — out of v1.** `Sell` and `Dispose` always retire the whole asset. Pooled holdings must be created as N assets (5.6.6) so each unit can be retired separately. Revisit in Phase 5 (§12.9).

**5.6.8 Non-GL areas.** A run for a `PostsToGl = false` area computes and marks lines posted but creates no journal entry and has no `JournalEntryId`; GL reconciliation covers `PostsToGl = true` areas only.

---

## 6. Application layer — slices and routes

### 6.1 Mandatory shape per slice

```
Assets.Application.Contracts/Entities/<Feature>/
    ├── Commands/   <Feature>CreateCommand.cs · UpdateCommand · DeleteCommand · <actions>
    ├── Queries/    GetByIdQuery · GetListQuery · GetDxListQuery · AutocompleteQuery
    ├── Dtos/       <Feature>Dto · <Feature>BasicDto
    ├── I<Feature>AppService.cs
    └── <Feature>Permissions.cs      ← inherits PermissionDefinitionProvider
Assets.Application/Api/<Feature>/
    ├── Handlers/Commands/ · Handlers/Query/ · Validations/ · Managers/
    └── <Feature>AppService.cs       ← thin mediator delegate + [Authorize]
```

Literal reference template: the [`PaymentTerms`](../../../jasim_api/modules/finance/src/Finance.Application/Api/PaymentTerms/PaymentTermAppService.cs) slice in Finance — verified to have the full Commands/Query/Validations split this plan assumes ([[thin-appservice-cqrs-reference]] · [[feature-contracts-folder-structure]]).

**Non-negotiable rules:**

- No query logic inside the `AppService` — even `GetDxListAsync` just forwards `new XGetDxListQuery(options)` to a handler ([[data-authority-query-convention]]).
- Every list handler calls `.AsNoTracking().Where(x => !x.IsDeleted).ApplyDataAuthority(_currentUser)` then `ProjectToType<TDto>()` ([[autocomplete-byterm-conventions]]).
- All mapping via `TypeAdapterConfig.GlobalSettings` configured in `AssetsApplicationModule.ConfigureMapster()` ([[global-mapster-config-pattern]]); any nullable enum on the entity mapping to `int?` on the DTO needs an explicit `.Map()` ([[mapster-nullable-enum-cast]]).
- Every user-facing message via `IStringLocalizer<AssetsResource>` with keys in `ar.json` and `en.json` ([[localize-user-facing-messages]]).
- `UserFriendlyException`, never `BusinessException` ([[prefer-userfriendlyexception]]).
- Handlers, services, and repositories use primary constructors ([[primary-constructors-preference]]).

### 6.2 Generated routes (reference — never hand-written)

| AppService | Route |
|---|---|
| `AssetClassAppService` | `/api/assets/asset-class` · `/dx-list` · `/autocomplete` |
| `AssetLocationAppService` | `/api/assets/asset-location` · `/tree` |
| `AssetGroupAppService` | `/api/assets/asset-group` |
| `DepreciationAreaAppService` | `/api/assets/depreciation-area` |
| `AssetAppService` | `/api/assets/asset` + actions `capitalize` · `undo-capitalization` · `cancel` · `pause` · `resume` · `revaluate` · `impair` · `add-cost` · `reduce-cost` · `manual-depreciation` · `transfer` · `transfer-cost-center` · `sell` · `reverse-sale` · `dispose` · `reverse-disposal` · `depreciation-schedule` · `recompute-schedule` |
| `AssetDepreciationRunAppService` | `/api/assets/asset-depreciation-run` + `simulate` · `post` · `reverse` |
| `AssetReportAppService` | `/api/assets/asset-report/register` · `forecast` · `by-location` · `disposals` · `gl-reconciliation` · `ledger` · `movement-schedule` (each with an `/excel` companion) |

> `simulate` isn't a nicety — the accountant needs to see what a run will post before it posts. In Enki that's a viewable, deletable `Draft` document, not a `dry_run` query parameter — matching how SAP B1's forecast and OCA's wizard both work, but expressed as a first-class Enki document.

### 6.3 Permissions

`AssetPermissions` inherits `PermissionDefinitionProvider` exactly like [`PaymentTermPermissions`](../../../jasim_api/modules/finance/src/Finance.Application.Contracts/Entities/PaymentTerms/PaymentTermPermissions.cs):

```csharp
public const string View    = AssetsPermissions.GroupName + ".Asset";   // "Assets.Asset"
public const string Create  = View + ".Create";
public const string Update  = View + ".Update";
public const string Delete  = View + ".Delete";
public const string Post    = View + ".Post";       // capitalize / post depreciation / sell / dispose
public const string Reverse = View + ".Reverse";
```

Suggested roles, composed from these permissions in the Roles screen — never hardcoded as fixed roles:

| Role | Permissions |
|---|---|
| Asset viewer | `Assets.*` (View only) |
| Asset user | View + Create/Update on `Asset` while `Draft` |
| Asset accountant | above + `Post` + `Reverse` on `Asset` and `AssetDepreciationRun` |
| Asset settings admin | full `AssetClass` / `AssetLocation` / `AssetGroup` / `DepreciationArea` |

---

## 7. Reports

Built on the "Account Statement" pattern in Finance, one folder per report ([[report-per-report-folder-structure]]):

```
Assets.Application/Api/Reports/<ReportName>/
    ├── <ReportName>Manager.cs                ← all query logic lives here
    ├── Handlers/<ReportName>GetHandler.cs    ← one-line delegate to the Manager
    ├── <ReportName>ExcelHandler.cs
    └── Dtos/
```

([[report-manager-owns-query-logic]])

| Report | Content |
|---|---|
| **Asset Register** | every asset **as of any past date** (`asOfDate` parameter): original value, accumulated depreciation, book value, pending depreciation, class, location, custodian, cost center — computed per §7.1 |
| **Depreciation Forecast** | unposted installments between two dates, grouped by period and class (matches SAP B1's Depreciation Forecast) |
| **Assets by Location/Custodian** | organizational inventory, not accounting |
| **Disposals** | sales and disposals between two dates with gain/loss and each entry's journal reference |
| **GL Reconciliation** | `AssetAcctCode` GL balance vs. Σ original values · `AccumDeprAcctCode` balance vs. Σ posted installments — with a difference column that must read zero; takes the same `asOfDate` as the Register (§7.1) |
| **Asset Ledger** (asset card) | one asset, every event in order with running balances — the audit trail an auditor opens first (§7.2) |
| **Movement Schedule** (roll-forward) | per class and period: opening cost + additions − reductions ± revaluations − disposals = closing cost, and the same walk for accumulated depreciation and book value (§7.3) |

### 7.1 Register values as of a given date

"Book value is derived" (§1) needs a precise as-of definition, because `Asset.State`, `OriginalValue`, location and custodian are *current* values. For `asOfDate` (any date up to today; future dates belong to the Forecast report), per asset:

| Column | Rule |
|---|---|
| **Included?** | `CapitalizationDate <= asOfDate` **and** no non-reversed `Sale`/`Disposal` with `TransactionDate <= asOfDate`. An asset sold *after* `asOfDate` is included with its pre-sale values; `Draft`/`Cancelled` assets never are. |
| **Original value** | `ToValue` of the latest non-reversed value-changing transaction (`Capitalization`, `OpeningBalance`, `Revaluation`, `Impairment`) with `TransactionDate <= asOfDate`. Later revaluations are ignored. |
| **Accumulated depreciation** | `ImportedAccumulatedDepreciation` (only if `asOfDate >= ImportCutoffDate`) + Σ `Amount` of **posted** lines with `LineDate <= asOfDate`. |
| **Book value** | original value − accumulated depreciation (salvage is *not* deducted; it is shown as its own column). |
| **Pending depreciation** | Σ `Amount` of **unposted** lines with `LineDate <= asOfDate`, so a register that differs from expectation explains itself. Not part of book value. |
| **Location / custodian / cost center / project** | `ToX` of the latest non-reversed `Transfer`/`CostCenterTransfer` with `TransactionDate <= asOfDate`; if none, the `FromX` of the earliest later transfer; if there is no transfer at all, the current value. |

Rules that keep the register equal to the GL at the same date:
- **Reversed items count as never having happened** (`IsPosted = false` / `IsReversed = true`), and because reversal entries are dated at the original document date (§4.1, §5.4), the GL at any historical date nets out identically. The GL Reconciliation report takes the same `asOfDate` and compares against GL balances by `PostingDate <= asOfDate`.
- **Legacy assets** have a single imported accumulated figure, so for `asOfDate < ImportCutoffDate` they are excluded and the report footer states the count ("N legacy assets excluded — as-of date precedes import cutoff") rather than showing a wrong number.
- Data authority applies (`ApplyDataAuthority`); the report is one set-based query in `AssetsRegisterReportManager` over the `(AssetId, IsPosted, LineDate)` and `(AssetId, TransactionDate)` indexes — no per-asset round trips. A year-end snapshot table is a Phase 5 optimization only if volume demands it.

### 7.2 Asset Ledger (asset card)

Filters: asset (required), `fromDate`, `toDate`, area (default area by default). One row per event, ordered by date then creation:

| Source of the row | Shown as |
|---|---|
| each non-reversed `AssetTransaction` (all types, including `OpeningBalance`) | type, document no. (`DocumentNumbering`), journal-entry reference, cost movement (`ToValue − FromValue`), notes; a reversed original and its reversal both appear, the original marked "reversed" |
| posted `AssetDepreciationLine`s | one row **per run** (not per line), plus `Manual` and `ToDate` rows as their own events, with the journal-entry reference |
| transfers | no amount; from/to location, custodian, cost center in the notes column |

Columns: date · event · document · journal entry · cost movement · depreciation movement · **running cost · running accumulated depreciation · running book value**. The running balances open at the values of §7.1 as of `fromDate − 1`, so a filtered ledger still starts from the correct balance, and the last row equals the Register for that asset at `toDate`. Data authority and the `Assets.Asset` View permission apply; the page offers it as a tab on the asset card as well.

### 7.3 Movement Schedule (roll-forward)

Filters: `fromDate`, `toDate`, area, grouping (class — default — / group / location). Per group, three blocks:

| Block | Opening | Movements in `[fromDate, toDate]` | Closing |
|---|---|---|---|
| **Cost** | Register cost as of `fromDate − 1` | + `Capitalization`, `OpeningBalance`, `Addition` · − `AcquisitionReduction` · ± `Revaluation`/`Impairment` · − cost of `Sale`/`Disposal` (`FromValue`) | Register cost as of `toDate` |
| **Accumulated depreciation** | Register accumulated as of `fromDate − 1` | + posted depreciation (`Depreciation`, `Manual`, `ToDate` lines) · − accumulated removed by `Sale`/`Disposal` (`AccumulatedAtEvent`) | Register accumulated as of `toDate` |
| **Book value** | opening cost − opening accumulated | net of the two blocks | closing cost − closing accumulated |

The report **self-checks**: opening + movements must equal the Register closing for every group; any residual is shown in a "unexplained" column that must be zero, exactly as the GL Reconciliation difference column. Reversed transactions are excluded from both sides (§7.1). Legacy imports whose `ImportCutoffDate` falls inside the range appear under "opening balances imported" so they do not masquerade as additions. Totals tie to the GL movement for `AssetAcctCode`/`AccumDeprAcctCode` over the same dates, and the report is the basis of the fixed-assets note in the financial statements.

All seven reports get a `.repx` file registered in `ReportDataSeeder`. Frontend report pages hide the save/post/close/add/copy/attach/delete/print-zip buttons on `XView` and pass `:hide-audit-columns="true"` to `BaseGrid` ([[report-page-xview-hide-actions]]).

---

## 8. Frontend (`jasim_web`)

```
src/modules/assets/{components,services,stores,types,enums}/
src/pages/assets/{asset-class,asset-location,asset-group,asset,depreciation-run,reports}/
src/navigation/modules/assets.ts
src/locales/assets.json   (+ keys in ar.json / en.json)
```

| Page | Pattern |
|---|---|
| Asset classes · locations · groups · depreciation areas | **Type B** (simple CRUD) — `TYPE_B_PAGE_PATTERN.md` |
| Asset (header + depreciation board + event log) | **Type A** (master-detail) — `TYPE_A_PAGE_PATTERN.md` |
| Depreciation run (header + lines + simulate/post/reverse buttons) | **Type A** |
| The seven reports | report page (filters + `BaseGrid` + print) |

Rules enforced from [`jasim_web/CLAUDE.md`](../../../jasim_web/CLAUDE.md): every page inside `XView`, every grid `BaseGrid`, services inherit `CrudService` and define `urls` + `permission`, Pinia stores follow the journal-entry shape (`init` / `saveAsync` / `getListSource` / `service` / `permission`), and visibility is gated through `$can(action, store.permission)`. No bespoke UI components.

Navigation: an `assets` entry in `src/navigation/modules/assets.ts`, same shape as `manufacturing.ts` — `subject: useAssetStore().permission`, `action: 'read'`.

---

## 9. Phased rollout

### Phase 1 — Structure and setup (2–3 weeks)

- [ ] Scaffold the six projects and wire them into the solution and host (§2.3)
- [ ] `AssetsDbContext` + `AssetsDbProperties` (schema `Assets`) + `ConfigureAssets()` in `JasimERPDbContext`
- [ ] Entities: `AssetClass`, `DepreciationArea`, `AssetLocation`, `AssetGroup`, `Asset`, `AssetDepreciationLine`, `AssetTransaction`, `AssetDepreciationRun(+Line)`, `AssetAreaSetting`, `AssetClassAreaAccounts` — all tables from day one, including depreciation areas and their per-area settings/accounts
- [ ] One EF migration on the host project
- [ ] **Seed accumulated-depreciation and gain/loss-on-sale accounts** (§3.9) + the thirteen document types (§3.10) + `DocumentNumbering` rows
- [ ] Full CRUD slices for `AssetClass` / `AssetLocation` / `AssetGroup`, validating account completeness and postability
- [ ] `Asset` in `Draft` state only + `AssetCode` generation
- [ ] Permissions + `ar.json` / `en.json`
- [ ] Frontend: three Type B pages + the Asset Type A page (no depreciation board yet)

**Acceptance:** create a class with valid accounts; a class referencing a non-postable account is rejected with a localized message; create an asset in `Draft` and see it in the list, gated by `ApplyDataAuthority`.

### Phase 2 — Depreciation engine and posting (3–4 weeks)

- [ ] `DepreciationScheduleGenerator` — straight-line + prorata + periodicity + the rounding rule, exactly as defined in §5.1.1
- [ ] Run overlap / no-gap / LIFO-reversal rules with the distributed lock (§3.8.1)
- [ ] `AssetCapitalizeCommandHandler`: `Draft → Running` + schedule generation + `AssetTransaction`
- [ ] `AssetDepreciationRun`: `Draft` (simulation) / `Post` / `Reverse`
- [ ] Posting strategies + registration in `AssetsDomainModule`
- [ ] Accounting-period validation via `IPostingPeriodRepository`
- [ ] Monthly Hangfire job
- [ ] Frontend: depreciation board + depreciation-run page

**Acceptance:** an asset worth 36,000 over 36 months ⇒ 36 installments × 1,000 summing to exactly 36,000.000000; the first month's run produces one entry visible in `JournalEntries` with `BaseType = "232"`; re-running the same period is rejected.

### Phase 3 — Full lifecycle (2–3 weeks)

- [ ] Revaluation (up/down) + regeneration of unposted lines only
- [ ] Transfer (location / custodian) and effective-dated cost-center / project transfer (§5.5) — no entry by default
- [ ] Full state matrix (§4.1): `Cancel`, `UndoCapitalization`, `ReverseSale`, `ReverseDisposal`, `Closed → Running`
- [ ] `Impair` (doc type `238`)
- [ ] Depreciation to the retirement date on `Sell`/`Dispose` (§5.6.1)
- [ ] `AddCost` (`240`), `ReduceCost` (`241`), `ManualDepreciation` (`242`) — §5.6.2–5.6.4
- [ ] Asset kinds incl. `LowValue` (§5.6.5)
- [ ] Pause and resume
- [ ] Sale (gain/loss) and disposal with no consideration
- [ ] Complete `AssetTransaction` log tied to journal entry ids
- [ ] Declining-balance and declining-then-straight methods

**Acceptance:** an end-to-end scenario — create, capitalize, 6 depreciation runs, revaluation, transfer, sale — every entry balanced and correct, and the first six installments unchanged after the revaluation.

### Phase 4 — Integration and migration (2–3 weeks)

- [ ] **From Procurement:** posting a `PurchaseBill` line for an `IsFixedAsset == true` item creates an `Asset` in `Draft` with `SourceDocType`/`SourceDocId`/`SourceDocRef` set — implemented as an event listener in `Assets.Application`, not a change to the Procurement handler
- [ ] **To Sales:** link a sale to an existing customer invoice (`SourceDocId`) instead of a direct cash entry
- [ ] **Legacy asset import** from Excel, following the existing `ConfigurationExcels` pattern in Finance: preview + balance check before commit + `IsLegacy = true` + `ImportedAccumulatedDepreciation` + `ImportCutoffDate` + `RemainingLifeMonthsAtImport`, tracked under one `OpeningBalance` batch (doc type `239`). Row-level errors in the preview: cutoff not a period end; remaining life not a multiple of `monthsPerPeriod`; accumulated > depreciation base; remaining life 0 while book value exceeds salvage; remaining life > 0 while fully depreciated (warning — imported as `Closed`)
- [ ] The seven reports (incl. Asset Ledger and Movement Schedule, §7.2–7.3) + `.repx` files + `ReportDataSeeder`
- [ ] **Purchase-bill lines with quantity N create N asset records** (§5.6.6) — pulled forward from Phase 5

**Acceptance:** the reconciliation report shows a zero difference between the GL and the module after 12 depreciation runs and a 50-asset legacy import.

### Phase 5 — Extensions (3–4 weeks)

- [ ] Multiple depreciation areas (book + tax) and exposing that in the UI
- [ ] Template-based manual batch creation UI (the quantity-N rule from purchase bills already ships in Phase 4)
- [ ] Cost-center allocation percentages for shared assets (`AssetCostCenterAllocation`)
- [ ] Partial retirement (pending decision §12.9)
- [ ] Barcode and physical count
- [ ] Maintenance scheduling (`AssetMaintenance`)
- [ ] Asset dashboard

---

## 10. Mandatory tests

**Unit** (xUnit + Moq on `DepreciationScheduleGenerator` and `AssetStateManager`):

1. Straight-line 36,000 / 36 ⇒ 36 × 1,000, summing exactly to the base.
2. Rounding case 10,000 / 3 ⇒ all drift lands on the last installment, total = 10,000.
3. Salvage value: 50,000 with 5,000 salvage ⇒ depreciation runs on 45,000 only.
4. Day-based prorata: start March 15 ⇒ correct partial first installment.
5. `IsDepreciable == false` class (land) ⇒ empty schedule.
6. Regeneration after 6 posted installments ⇒ the first six unchanged in count and amount.
7. `Draft → Running` with a non-postable class account ⇒ `UserFriendlyException`.
8. Deleting an asset after one posted installment ⇒ `UserFriendlyException`.

**Integration** (ABP integration tests):

9. Running the depreciation run twice for the same period ⇒ only one entry.
10. Posting in a period with `PeriodStat == 'Y'` ⇒ rejected with a clear message.
11. Sale at a gain and at a loss ⇒ two correct, balanced entries.
12. Reversing a depreciation run ⇒ an `IsReversal` entry + `IsPosted = false` restored.
13. GL reconciliation after 12 runs.
14. A user with `DataAuthorityLevel.Org` cannot see another organization's assets.
15. Overlap: an all-classes run and a class-specific run for the same period and area ⇒ second rejected; different classes ⇒ both allowed.
16. Gap: posting March while February is unposted ⇒ rejected; the scheduled job catches up Feb then March in order.
17. LIFO: reversing February while March is `Posted` ⇒ rejected; reversing March then February succeeds; reversal entry is dated each run's `PeriodEnd`.
18. Reversing a run after a later `Sale` of one of its assets ⇒ rejected until `ReverseSale`.
19. Cost-center transfer: back-dated before the last posted line ⇒ rejected; valid transfer ⇒ no journal entry, next run's lines carry the new center, earlier lines keep the old one.
20. State matrix: `UndoCapitalization` blocked after one posted line; `ReverseSale` restores `FromState` and a regenerated schedule; `Cancel` on `Draft` keeps the code reserved.
21. As-of register: asset sold after `asOfDate` is included at pre-sale values; a revaluation after `asOfDate` is ignored; location at date follows transfer history; legacy asset with `asOfDate < ImportCutoffDate` is excluded and counted in the footer.
22. As-of register equals GL Reconciliation at the same past date, including after a run reversal.

**SAP-comparison additions (§5.6, §7.2–7.3):**

29. Sale on March 20 of a `ByDays` monthly asset ⇒ a `ToDate` line of 20/31 of the installment inside the sale entry, accumulated includes it, gain/loss computed on the result; sale blocked while February is unposted.
30. `ReverseSale` also reverses the `ToDate` pair and regenerates the schedule.
31. `AddCost` on an asset with 6 posted installments ⇒ posted lines untouched; unposted lines re-spread over the unchanged remaining periods; total depreciated = new base.
32. `ReduceCost` below posted + imported accumulated ⇒ `Assets:ReductionExceedsBookValue`.
33. `ManualDepreciation` above the remaining depreciable value ⇒ rejected; valid one ⇒ own entry, remainder re-spread, counts as a dependent event for run reversal.
34. `LowValue` asset ⇒ single line for 100% in the first period; `Land` ⇒ empty schedule; threshold exceeded ⇒ rejected.
35. Bill line with quantity 5 ⇒ 5 `Draft` assets, cost split with remainder on the last; re-posting the bill creates none.
36. Non-GL area run ⇒ lines marked posted, no journal entry, excluded from GL reconciliation.
37. Asset Ledger: running balances after a filtered range equal the Register at `toDate`; a reversed transaction shows both rows.
38. Movement Schedule: opening + movements = closing for every class, "unexplained" column zero after a sale, an addition, a revaluation and a legacy import in the range.

**Unit — definitions (§5.1.1):**

23. Yearly + `ConstantPeriods`, start March 15 ⇒ `f = 10/12`; quarterly start in the middle of a quarter ⇒ whole months counted.
24. `ByDays` across a leap February ⇒ day counts use actual days.
25. Appendix A.5 verbatim: 13 lines, 274,194 + 11 × 500,000 + 225,806 = 6,000,000.000000.
26. Rounding with 0 and 3 currency decimals ⇒ each line rounded once, `|last − regular|` within the §5.1.1 bound; a deliberately corrupted generator trips the assertion.
27. `UsefulLifeMonths % monthsPerPeriod != 0` ⇒ `UserFriendlyException`; periodicity change after a posted line ⇒ rejected.
28. Legacy import: remaining life 24, accumulated 50,000,000 of 80,000,000 ⇒ 24 lines × 1,250,000 starting the period after cutoff; cutoff mid-period ⇒ error; remaining life 0 with book value above salvage ⇒ error; fully depreciated ⇒ `Closed`, empty schedule.

---

## 11. Risks

| Risk | Impact | Mitigation in Enki |
|---|---|---|
| Drift between the module and the GL | Severe — corrupts financial statements | Mandatory reconciliation report in Phase 4 + no direct edits to values after posting |
| Cumulative rounding errors | Medium | All drift on the last installment + `Debug.Assert` + two mandatory tests |
| Duplicate posting on a partial scheduled-job failure | Severe | Unique constraint on `(PostingPeriodId, AreaId, ClassId)` + `IsPosted` check + single unit of work |
| Useful-life edits after posting | Medium | Regenerate unposted only + an `Adjustment`-type `AssetTransaction` documents the event |
| Legacy assets with wrong balances | Severe | Import screen with preview and balance validation before commit |
| Slowness with thousands of assets | Medium | One entry per run + `(IsPosted, LineDate)` index + batch runs by class |
| Out-of-order or overlapping runs, or reversing a run beneath later events | Severe — schedule and GL diverge | Distributed lock, no-gap / no-overlap / LIFO / dependent-event rules (§3.8.1), reversals dated at the original date |
| Register as-of figure disagrees with GL at a past date | Severe | One as-of definition shared by Register and GL Reconciliation (§7.1); test 22 |
| Imported asset with inconsistent remaining life | Severe — wrong future expense | Mandatory `RemainingLifeMonthsAtImport`, derived default shown for override, row-level import errors |
| Accumulated-depreciation accounts missing from the chart | **Phase-1 blocker** | Seeded before any other code (§3.9), once the accountant signs off on the numbers |

---

## 12. Open decisions needing sign-off before starting

1. **Accumulated-depreciation and gain/loss-on-sale account numbers** — the numbers in §3.9 are proposed; the accountant approves them.
2. **Asset currency** — v1 assumes system currency only. Are there foreign-currency assets that need dual-currency depreciation (`Amount` + `AmountFc`)? The fields already exist on `JournalEntryPostLineDto`, so adding this later needs no data migration.
3. **Capitalization entry** — does the module post capitalization (Dr asset / Cr vendor), or does the purchase bill post the asset itself and the asset record is purely a reference link? The second option is safer accounting-wise and avoids double-posting; it's the assumption in §5.3.
4. **Custodian source** — `HR.Employee` or `IdentityUser`? The plan assumes `Employee`, enriched on read with no cross-module FK.
5. **Default depreciation periodicity** — monthly for every class, or left as a per-class choice from Phase 1? The field exists on the model regardless.
6. **Year-to-date reclassification on a cost-center transfer** (§5.5) — default is no entry (future installments only). Does the accountant also want the current fiscal year's already-posted expense moved to the new center (doc type `237`)? Needed only if cost-center P&L must follow the asset retroactively.
7. **Period alignment for quarterly/yearly classes** (§5.1.1) — plan assumes fiscal quarters/years from the fiscal calendar. Confirm, or choose calendar quarters/years.
8. **Impairment loss account** — §5.3 reuses `LossOnDisposalAcctCode` for downward revaluation until a dedicated account is approved with the other new accounts in decision 1.
9. **Partial retirement** (§5.6.7) — v1 retires whole assets only and pooled holdings are created as N assets. Confirm this is acceptable, or schedule partial retirement (split cost and accumulated proportionally) for Phase 5.
10. **Retirement-period depreciation policy** (§5.6.1) — the `ToDate` installment follows the class's proration method (`None` ⇒ no depreciation in the month of sale). Confirm, or require a full-month charge.
11. **Low-value threshold** (§5.6.5) — the tenant-level amount (or "off") under which `LowValue` assets may be created.

---

## 13. References

- Odoo `account_asset` and OCA `account_asset_management` — verified directly against [`OCA/account-financial-tools@16.0/account_asset_management`](https://github.com/OCA/account-financial-tools/tree/16.0/account_asset_management): models `account.asset.profile` / `account.asset` / `account.asset.line` / `account.asset.group`; computation methods `linear` / `linear-limit` / `degressive` / `degressive-linear` / `degressive-limit`; `days_calc` and `prorata` flags; reversal-not-deletion of posted lines.
- SAP Business One 9.0+ Fixed Assets — Asset Master Data, Asset Classes, Depreciation Areas & Types, Account Determination, Capitalization / Retirement / Transfer, Depreciation Forecast.
- Reference code inside Enki:
  - [`Finance/PaymentTerms`](../../../jasim_api/modules/finance/src/Finance.Application/Api/PaymentTerms) — the slice pattern (thin AppService + CQRS).
  - [`Procurement/LandedCosts`](../../../jasim_api/modules/procurement/src/Procurement.Application/Api/LandedCosts/Handlers/Commands/LandedCostCreateCommandHandler.cs) — posting via `JournalPostingStrategyFactory`.
  - [`Sales/BackgroundJobs`](../../../jasim_api/modules/sales/src/Sales.Application/BackgroundJobs/SalesRecurringTransactionGenerationJob.cs) — the idempotent scheduled-job pattern.
  - [`modules/manufacturing`](../../../jasim_api/modules/manufacturing) — the full new-module pattern.
  - [`Core.Integrations.FinancePosting.JournalEntryPostDto` / `JournalEntryPostLineDto`](../../../jasim_api/modules/core/src/Core.Domain.Shared/Integrations/FinancePosting) — the single posting contract every strategy in this plan targets.

---

## 14. Appendix A — Worked depreciation examples

Concrete numbers exercising every method and event defined in §5, using the account codes from §3.9.

### A.1 Straight-line — company vehicle

| Field | Value |
|---|---|
| Class | Vehicles (`1100000003`) |
| Original value | 36,000,000 |
| Salvage value | 0 |
| Useful life | 36 months |
| Monthly installment | 36,000,000 ÷ 36 = **1,000,000** |

All 36 months are exactly 1,000,000, summing to 36,000,000.000000 — this is acceptance test #1 in §10.

Monthly entry:
```
Dr  Depreciation expense — vehicles (3700000003)   1,000,000
  Cr  Accumulated depreciation — vehicles (1190000003)     1,000,000
```

### A.2 Straight-line with a salvage value — office furniture

| Field | Value |
|---|---|
| Original value | 12,500,000 |
| Salvage value | 500,000 |
| Depreciation base | 12,000,000 |
| Useful life | 5 years (annual) |
| Annual installment | 12,000,000 ÷ 5 = **2,400,000** |

The salvage value is never depreciated — it remains as the final book value of 500,000 until disposal.

### A.3 Declining balance — CNC production equipment

Declining factor = 2 (a constant rate of 2 ÷ 5 years = 40% of the remaining balance per year):

| Year | Opening balance | Installment (40%) | Closing balance |
|---|---|---|---|
| 1 | 100,000,000 | 40,000,000 | 60,000,000 |
| 2 | 60,000,000 | 24,000,000 | 36,000,000 |
| 3 | 36,000,000 | 14,400,000 | 21,600,000 |
| 4 | 21,600,000 | 8,640,000 | 12,960,000 |
| 5 | 12,960,000 | **12,960,000** ← the "last installment absorbs the remainder" rule | 0 |

Pure declining balance never reaches zero on its own, so the §5.1 rule forces the final installment to take the entire remaining balance so the asset closes out completely.

### A.4 Declining-then-straight — equipment (the fairest hybrid)

Same equipment, 40% factor, but each period compares declining vs. straight-line-on-the-remainder and takes the larger:

| Year | Declining | Straight (remaining ÷ periods left) | Chosen |
|---|---|---|---|
| 1 (remaining 50,000,000) | 20,000,000 | 50,000,000÷5=10,000,000 | **20,000,000** (declining) |
| 2 (remaining 30,000,000) | 12,000,000 | 30,000,000÷4=7,500,000 | **12,000,000** (declining) |
| 3 (remaining 18,000,000) | 7,200,000 | 18,000,000÷3=6,000,000 | **7,200,000** (declining) |
| 4 (remaining 10,800,000) | 4,320,000 | 10,800,000÷2=5,400,000 | **5,400,000** (straight — the switch happens here) |
| 5 (remaining 5,400,000) | — | — | **5,400,000** (last installment = full remainder) |

This shows the "switch" mechanism that guarantees full depreciation by the end of useful life without an oversized final installment.

### A.5 Day-based prorata — industrial printer put into service mid-month

| Field | Value |
|---|---|
| Original value | 6,000,000 |
| Useful life | 12 months, full monthly installment = 500,000 |
| In-service date | March 15 |

- **March (partial):** 17 of 31 days ⇒ 500,000 × 17/31 = 274,193.55 ⇒ **274,194**
- **April → February:** 11 full months × 500,000 = 5,500,000
- **Completion line (the following March):** the remainder, 6,000,000 − 274,194 − 5,500,000 = **225,806** (≈ 500,000 × 14/31), so the total is exactly 6,000,000.000000 and depreciation ends 12 months after the in-service date. That is 13 lines (`N + 1`, §5.1.1).

> *Correction (Rev 2):* the earlier version of this example showed 10 full months and a February "final installment" that would have been 725,806 — larger than a regular installment, which is wrong.

### A.6 Non-depreciable asset — land

Main warehouse land, `IsDepreciable = false`: the schedule is empty from day one (acceptance test #5); book value stays equal to original value forever unless manually revalued.

### A.7 Sale at a loss (repeated from §5.3) and at a gain

**Loss** — vehicle (original 100,000,000 / accumulated depreciation 60,000,000 / sold for 50,000,000 ⇒ 10,000,000 loss):
```
Dr  Cash                                   50,000,000
Dr  Accumulated depreciation — vehicles    60,000,000
Dr  Loss on disposal of fixed assets       10,000,000
  Cr  Vehicles                                    100,000,000
```

**Gain** — old delivery vehicle (original 30,000,000 / accumulated depreciation 28,000,000 / sold for 5,000,000 ⇒ 3,000,000 gain):
```
Dr  Cash                                    5,000,000
Dr  Accumulated depreciation — vehicles    28,000,000
  Cr  Vehicles                                    30,000,000
  Cr  Gain on disposal of fixed assets              3,000,000
```

### A.8 Legacy asset imported at go-live

Old production line: original value 80,000,000, no salvage, monthly periodicity, `ImportedAccumulatedDepreciation = 50,000,000` (depreciation from the prior system, never posted in Enki), `ImportCutoffDate` = the go-live month end, `RemainingLifeMonthsAtImport = 24` ⇒ future monthly installment = (80,000,000 − 50,000,000) ÷ 24 = **1,250,000**, 24 lines, the first dated at the end of the month after the cutoff. The first real Enki entry starts from this point only — prior depreciation is never re-posted, and no proration applies because the cutoff is a period end.

The remaining life is an explicit input, not inferred from dates: if the original life was 120 months from 2018-01-01 and the cutoff is 2026-12-31, the screen proposes 120 − 108 = 12 months. The user may override that with 24 if the prior system had extended the asset's life; the override is what is stored and what the schedule uses. Variants: remaining life 0 with book value above salvage ⇒ import error; accumulated = depreciable base ⇒ imported as `Closed` with an empty schedule.

### A.9 Cost-center transfer

Vehicle depreciating 1,000,000 monthly, charged to cost center *Sales*. Run for March is posted. On April 1 the vehicle moves to *Logistics* (`CostCenterTransfer`, effective 2027-04-01). No journal entry is created. March's line stays on *Sales*; the April run's line for this asset resolves to *Logistics* (latest transfer with `TransactionDate <= LineDate`). Attempting to date the transfer March 15 is rejected: it precedes the last posted line.

### A.10 Register as of a past date

Vehicle: capitalized 2026-01-01 at 36,000,000 over 36 months; revalued up by 3,000,000 on 2026-07-01; sold 2026-11-30. Register as of 2026-06-30: original value 36,000,000 (the revaluation is ignored), accumulated 6,000,000 (six posted lines), book value 30,000,000, asset included although it was sold later. Register as of 2026-12-31: asset excluded. As of 2026-08-31 original value is 39,000,000.

### A.11 Sale mid-month with depreciation to date

Vehicle, cost 36,000,000, monthly installment 1,000,000, `ByDays`. February is posted (accumulated 2,000,000); sold on March 20 for 20,000,000. To-date installment = 1,000,000 × 20/31 = 645,161, so accumulated becomes 2,645,161, book value 33,354,839, loss 13,354,839.
```
Dr  Depreciation expense — vehicles    645,161
  Cr  Accumulated depreciation — vehicles      645,161
Dr  Cash                            20,000,000
Dr  Accumulated depreciation — vehicles  2,645,161
Dr  Loss on disposal of fixed assets 13,354,839
  Cr  Vehicles                                36,000,000
```
Selling before February is posted is rejected with `Assets:PostDepreciationFirst`.

### A.12 Subsequent addition

Machine: cost 60,000,000 over 60 months (1,000,000 monthly), 12 installments posted, 48 remaining. A 12,000,000 upgrade is capitalized (`AddCost`). New base 72,000,000; remaining depreciable value 72,000,000 − 12,000,000 = 60,000,000; over the unchanged 48 months ⇒ **1,250,000** monthly from the next unposted period. The 12 posted installments are not restated.
