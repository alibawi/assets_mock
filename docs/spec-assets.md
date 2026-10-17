# Spec — Fixed Assets (الموجودات الثابتة)

Derived from `docs/source/assets-management-module-plan-ar.md` **revision 3** (§ numbers refer to it). Mock-only
decisions are in `WORKLOG.md` and `docs/plan-addendum-ar.md` (ب.0 maps each addendum item to the plan section that now covers it).

## 1. Scope and relationships
Full lifecycle: acquisition, capitalization, periodic depreciation, revaluation / impairment, additions and reductions,
manual depreciation, transfers (location / custodian / cost center), pause, sale, disposal, reversals (§1, §4.1, §5.6).
Core / Finance / HR / Procurement appear as seeded lookup lists; postings by other modules (purchase bills, opening
balances) are shown as "external" entries for reconciliation only.

## 2. Data model (§3)
| Entity | Mock |
|---|---|
| AssetClass §3.1 | code, name, foreignName, **kind** (Tangible / Intangible «إطفاء» / Land / LowValue), method, life, factor, periodicity, prorata, isDepreciable, isActive |
| AssetClassAreaAccounts §3.1.1 | six account codes per (class × area); class screen edits the default area 01 |
| DepreciationArea §3.2 / AssetAreaSetting §3.2.1 | one seeded area `01 Local GAAP`; per-asset area rows written at capitalization; engine reads the denormalized copy on Asset |
| AssetLocation §3.3 / AssetGroup §3.4 | tree / flat |
| Asset §3.5 | + capitalizationDate, importCutoffDate, remainingLifeAtImport (mandatory for legacy), bill ref / line / sequence (§5.6.6) |
| AssetDepreciationLine §3.6 | type Depreciation / Manual / ToDate, fraction (1, f, or completion), days, isPosted, run / tx link |
| AssetTransaction §3.7 | 18 types incl. reversals, docType, from/to state, accumulatedAtEvent, toDateAmount, isReversed / reversedTxId, module + external entries |
| AssetDepreciationRun §3.8 | periodStart/End, area, class scope, Draft / Posted / Reversed, reversedAt = PeriodEnd |
| AssetMaintenance (§9 ph. 5) | mock fields; capitalized orders post an AddCost |

## 3. Status lifecycle (§4.1)
Draft → Running (Capitalize) · Draft → Cancelled · Running → Draft (UndoCapitalization, nothing posted) ·
Running ⇄ Paused · Running → Closed (last line) · Closed → Running (run reversal, upward revaluation, AddCost, life change) ·
Running/Paused/Closed → Sold/Disposed · Sold/Disposed → FromState (ReverseSale / ReverseDisposal) · Sold/Disposed/Cancelled final.
Runs: Draft (simulation) → Posted → Reversed.

## 4. Business rules (validations)
| # | Rule | Where |
|---|---|---|
| R1 | Capitalize: class, original > 0, salvage < original, start date, accounts complete & postable, life % period = 0, LowValue threshold | `capitalize` |
| R2 | Delete only Draft, non-legacy, no posted line, no transaction — else Cancel | `canDelete` |
| R3 | Legacy: cut-off is a period end; remaining life mandatory, multiple of the period; accum ≤ base; 0 life with value > salvage rejected | asset form |
| R4 | Event dates must be after the last posted line (no retroactive events) | `notBefore` |
| R5 | Cost-center transfer is effective-dated; run lines take the center as of LineDate; reversible while no later posted line | §5.5 |
| R6 | Runs: no overlap (all-classes overlaps any class, one Draft max), no gaps, LIFO reversal, no reversal under later dependent events, reversal dated PeriodEnd | §3.8.1 |
| R7 | Sell/Dispose: prior periods posted (PostDepreciationFirst), ToDate line per class proration inside the exit entry, remaining lines cancelled | §5.6.1 |
| R8 | AddCost / ReduceCost / Manual regenerate unposted lines over the unchanged remaining periods; ReduceCost below accumulated rejected; Manual ≤ remaining depreciable | §5.6.2–5.6.4 |
| R9 | Revaluation upward only (233); impairment (238) separate | §5.3 |
| R10 | Purchase line with quantity N → N drafts, integer N, last takes rounding, idempotent per bill + line | §5.6.6 |
| R11 | Maintenance capitalization ≥ threshold (5,000,000) → AddCost; capitalized orders are one-off | owner-approved |

## 5. Permissions (§6.3)
viewer · user · accountant (+ post, reverse) · settings admin · super admin — role switcher in the user menu gates buttons.

## 6. KPIs
Assets in books, original value, accumulated depreciation, book value, 2026 depreciation posted; value by class; assets by state; alerts.

## 7. Integrations (placeholders)
Purchase bill / credit-note references (no module entry when present), opening-balance batch (239, external entry), Excel export, print, attachments.

## 8. Screen list
| Route | Screen |
|---|---|
| `#/` | Dashboard |
| `#/assets` | Register — state tabs incl. Cancelled, filters, "from a purchase-bill line" (N drafts) |
| `#/assets/:id` | Asset card — tabs Basic / Value & schedule / Location & custody (+ cost-center history) / **Asset ledger** / Maintenance / Events / Attachments; all §4.1 and §5.6 actions |
| `#/runs`, `#/runs/new`, `#/runs/:id` | Depreciation runs with §3.8.1 checks |
| `#/transactions` | Audit trail grouped by event family, reversal tags, reverse actions in the detail modal |
| `#/maintenance`, `#/maintenance/:id` | Maintenance orders |
| `#/reports` | Register (asOf), Roll-forward, Asset ledger, Forecast, By location / custody, Disposals, GL reconciliation (asOf) |
| `#/classes`, `#/locations`, `#/groups` | Settings masters |
| `#/settings` | Thresholds, §12 decisions, permissions, document types and event mapping |

## 8a. Additions — decisions of 2026-10-17
| Route | Screen |
|---|---|
| `#/sales-invoices`, `#/sales-invoices/:id` | Sales invoice (mock Sales module): conditional «الأصل» field for fixed-asset items, qty 1, price = book value, revenue = sale clearing account; post → ToDate + Sale (SourceDoc = invoice) + exit entry 236; cancel → automatic ReverseSale (§5.6.9) |
| `#/revaluations`, `#/cost-adjustments`, `#/manual-depreciation`, `#/transfers`, `#/disposals` (+ `/:id`) | Type A transaction documents with own number, post, reverse (§8, §6.2) |
| `#/transactions` | Read-only unified log, filters type / asset / date (decision e) |
| `#/opening-balances` (+ `/:id`) | Legacy import batch 239 — the only entry for legacy assets (§9 phase 4) |

Rules added: R12 sale only via invoice (no manual ReverseSale); R13 clearing account nets to zero; R14 document reversal refused while later depreciation is posted; R15 import commit blocked by any row error, reverse blocked once posted; GL totals mismatch is a warning.

## 9. Build order
Done — see `docs/roadmap.md`. Next: owner review and the open §12 decisions.
