# Spec — Fixed Assets (الموجودات الثابتة)

Derived from `docs/source/assets-management-module-plan-ar.md` (§ numbers below refer to it). Anything the plan
does not define is listed under *Open points* and in `WORKLOG.md`.

## 1. Scope and relationships
Full asset lifecycle: acquisition, capitalization, periodic depreciation, revaluation, transfer, pause, sale, disposal (§1).
Depends on Core (organization, cost center, numbering, periods), Finance (chart of accounts, posting), later HR (custodian) and Procurement (capitalization from bill) (§2.1). In the mock these appear as seeded lookup lists.

## 2. Data model (§3)
| Entity | Key fields (mock) |
|---|---|
| AssetClass §3.1 | code, name, foreignName, method (SL / DB / DBSL / None), lifeMonths, decliningFactor, periodicity (M/Q/Y), prorata (None / ConstantPeriods / ByDays), assetAcct, accumAcct, expenseAcct, gainAcct, lossAcct, revalSurplusAcct, isDepreciable, isActive |
| DepreciationArea §3.2 | single seeded row `01 — Local GAAP`, UI hidden |
| AssetLocation §3.3 | code, name, parentId (tree), isActive |
| AssetGroup §3.4 | code, name, isActive |
| Asset §3.5 | code (FA-######), name, description, class, group, location, custodian, serial, tag (unique), partner, sourceDocRef, acquisitionDate, depStartDate, originalValue, salvage, method/life/periodicity/prorata/factor (copied from class, overridable), state, isLegacy, importedAccum, costCenter, project. Book value is derived, never stored. |
| DepLine §3.6 | seq, date, amount, accum, remaining, isPosted, runId, days |
| AssetTransaction §3.7 | number, type (Capitalization / Revaluation / Transfer / Pause / Resume / Sale / Disposal / Adjustment), date, amount, from/to value, from/to location/custodian/cost center, journal |
| DepreciationRun §3.8 | number (DPR), periodEnd, class scope, status (Draft / Posted / Reversed), lines |

## 3. Status lifecycle (§4)
Asset: `Draft → Running` (capitalize) · `Running ⇄ Paused` · `Running → Running` (revalue, transfer, life change) · `Running/Paused → Sold | Disposed` · `Running → Closed` (last line posted; Closed can still be disposed).
Run: `Draft (simulation) → Posted → Reversed`.

## 4. Business rules (implemented as validations)
| # | Rule | Where |
|---|---|---|
| R1 | Capitalize requires class, original > 0, salvage < original, start date, class accounts present and postable | `lifecycle.capitalize` |
| R2 | Delete only Draft, non-legacy, without posted lines | `lifecycle.canDelete` |
| R3 | Sale / disposal remove all unposted lines and create the closing entry | `sell`, `dispose` |
| R4 | Paused assets are excluded from runs; resume regenerates from the resume date | `simulateRun`, `resume` |
| R5 | Regeneration never touches posted lines | `generateSchedule` |
| R6 | Rounding difference goes to the last line; Σ lines = base − posted − imported | `generateSchedule` |
| R7 | A period/scope can be posted once (guard on period × class) and lines are re-checked at posting | `postRun` |
| R8 | Reversal creates a reversing entry and returns lines to planned; later runs must be reversed first | `reverseRun` |
| R9 | Class save rejects missing / non-existent / non-postable accounts | `classAccountErrors` |
| R10 | Tag number unique when filled | asset form |
| R11 | After capitalization, value and depreciation settings change only through actions | asset form |

## 5. Permissions (§6.3)
Roles: viewer (view) · user (view + create/update) · accountant (+ post, reverse) · settings admin (classes, locations, groups) · super admin (all). Switchable from the user menu; gates the buttons.

## 6. Dashboard KPIs
Assets in books, total original value, accumulated depreciation, book value, depreciation posted this year; value by class; assets by state; alerts (current period not posted, drafts awaiting capitalization, paused assets, unposted simulations); latest transactions.

## 7. Integrations (placeholders)
Journal posting (shown as journal tables), purchase bill reference (`sourceDocRef`), Excel export / print buttons, attachments.

## 8. Screen list
| Route | Screen | Plan |
|---|---|---|
| `#/` | Dashboard | §9 phase 5 |
| `#/assets` | Asset register — state tabs, class/group/branch filters, totals | §3.5 |
| `#/assets/new`, `#/assets/:id` | Asset card (Type A): header, tabs Basic / Value & depreciation board / Location & custody / Event log / Attachments; actions Capitalize, Pause, Resume, Revalue, Life change, Transfer, Sell, Dispose, Tag label, Delete | §3.5–3.7, §4, §6.2 |
| `#/runs`, `#/runs/new`, `#/runs/:id` | Depreciation runs: simulate, re-simulate, post, reverse, delete draft; lines + journal | §3.8, §5.4 |
| `#/transactions` | Asset transactions (audit trail) with type tabs and journal modal | §3.7 |
| `#/reports` | Register, Forecast, By location/custody, Disposals, GL reconciliation | §7 |
| `#/classes` | Asset classes (Type B) | §3.1 |
| `#/locations` | Locations tree (Type B) | §3.3 |
| `#/groups` | Asset groups (Type B) | §3.4 |
| `#/settings` | Permissions matrix + document types/numbering | §6.3, §3.10 |

## 9. Open points
See `WORKLOG.md` (second entry): proposed account codes, IT class accounts, cost-center transfer entry amount, legacy life convention, and the missing project brief / discovery decisions.
