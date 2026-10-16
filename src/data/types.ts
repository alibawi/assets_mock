// Data model follows docs/source/assets-management-module-plan-ar.md §3 (revision 3).

/** §3.1 DepreciationMethod */
export type DepMethod = 'SL' | 'DB' | 'DBSL' | 'NONE'
/** §3.1 Periodicity */
export type Periodicity = 'M' | 'Q' | 'Y'
/** §3.1 ProrataMethod */
export type Prorata = 'NONE' | 'CONST' | 'DAYS'
/** §3.1 / §5.6.5 AssetKind */
export type AssetKind = 'tangible' | 'intangible' | 'land' | 'lowValue'
/** §3.5 / §4.1 Asset state */
export type AssetState = 'draft' | 'running' | 'paused' | 'closed' | 'sold' | 'disposed' | 'cancelled'
/** §3.8 run status */
export type RunStatus = 'draft' | 'posted' | 'reversed'
/** §3.7 TransactionType */
export type TxType =
  | 'capitalization' | 'capitalizationReversal' | 'openingBalance' | 'addition' | 'acquisitionReduction'
  | 'manualDepreciation' | 'revaluation' | 'impairment' | 'transfer' | 'costCenterTransfer' | 'pause' | 'resume'
  | 'sale' | 'saleReversal' | 'disposal' | 'disposalReversal' | 'adjustment' | 'cancellation'

export type RoleId = 'superadmin' | 'viewer' | 'user' | 'accountant' | 'settings'

export interface JournalLine { account: string; desc: string; debit: number; credit: number; costCenter?: string }

/** The six account codes of a class — §3.1.1 stores them per (class × area). */
export interface ClassAccounts {
  assetAcct: string
  accumAcct: string
  expenseAcct: string
  gainAcct: string
  lossAcct: string
  revalSurplusAcct: string
}

/** §3.1 AssetClass — accounting template. Account codes live in `classAreaAccounts` (§3.1.1). */
export interface AssetClass {
  id: string
  code: string
  name: string
  foreignName: string
  kind: AssetKind
  method: DepMethod
  lifeMonths: number
  decliningFactor: number | null
  periodicity: Periodicity
  prorata: Prorata
  isDepreciable: boolean
  isActive: boolean
}

/** §3.1.1 AssetClassAreaAccounts */
export interface ClassAreaAccounts extends ClassAccounts { classId: string; areaId: string }

/** §3.2 DepreciationArea */
export interface DepArea { id: string; code: string; name: string; postsToGl: boolean; isDefault: boolean; isActive: boolean }

/** §3.2.1 AssetAreaSetting — per asset × area. The same-named Asset columns are a denormalized copy of the default row. */
export interface AssetAreaSetting {
  assetId: string
  areaId: string
  method: DepMethod
  lifeMonths: number
  decliningFactor: number | null
  periodicity: Periodicity
  prorata: Prorata
  salvage: number
  depStartDate: string
  importedAccum: number
  remainingLifeAtImport: number | null
}

/** §3.3 AssetLocation — tree */
export interface AssetLocation { id: string; code: string; name: string; parentId: string | null; isActive: boolean }

/** §3.4 AssetGroup */
export interface AssetGroup { id: string; code: string; name: string; isActive: boolean }

export interface Employee { id: string; name: string; department: string }
export interface Partner { id: string; name: string }
export interface CostCenter { id: string; code: string; name: string }
export interface Account { code: string; name: string; postable: boolean }

/** §3.5 Asset */
export interface Asset {
  id: string
  code: string
  name: string
  description: string
  classId: string
  groupId: string
  locationId: string
  custodianId: string
  serial: string
  tagNumber: string
  partnerId: string
  sourceDocRef: string
  /** §5.6.6 purchase-bill line and its 1..N sequence */
  sourceDocLine: string
  sourceLineSeq: number | null
  acquisitionDate: string
  depStartDate: string
  /** Original value (APC) — changed only by AddCost / ReduceCost (§5.6.2–5.6.3) */
  originalValue: number
  salvage: number
  lifeMonths: number
  method: DepMethod
  periodicity: Periodicity
  prorata: Prorata
  decliningFactor: number | null
  capitalizationDate: string | null
  state: AssetState
  isLegacy: boolean
  importedAccum: number
  /** Legacy only: period-end date of the go-live cut-off (§3.5) */
  importCutoffDate: string | null
  /** Legacy only, mandatory: remaining life in months at the cut-off (§3.5) */
  remainingLifeAtImport: number | null
  /** Σ revaluation (+) and impairment (−) adjustments */
  revaluationAdj: number
  /** Current cost center; history is in CostCenterTransfer transactions (§5.5) */
  costCenterId: string
  project: string
}

/** §3.6 AssetDepreciationLine */
export interface DepLine {
  id: string
  assetId: string
  areaId: string
  seq: number
  date: string // period end (or event date for ToDate), YYYY-MM-DD
  type: 'depreciation' | 'manual' | 'toDate'
  days: number | null
  /** Share of a full period this line represents (1 = full; f for a prorated first line; null = completion line) */
  fraction: number | null
  amount: number
  accum: number
  remaining: number
  isPosted: boolean
  runId: string | null
  /** Transaction that created a Manual / ToDate line */
  txId: string | null
}

/** §3.7 AssetTransaction */
export interface AssetTx {
  id: string
  number: string
  /** §3.10 document type code, '' when the event has none */
  docType: string
  assetId: string
  type: TxType
  date: string
  amount: number
  fromValue: number | null
  toValue: number | null
  fromLocationId?: string
  toLocationId?: string
  fromCustodianId?: string
  toCustodianId?: string
  fromCostCenterId?: string
  toCostCenterId?: string
  fromState?: AssetState
  toState?: AssetState
  /** Accumulated depreciation removed by a Sale / Disposal (frozen for the roll-forward) */
  accumulatedAtEvent?: number
  /** Depreciation to date posted inside a Sale / Disposal (§5.6.1) */
  toDateAmount?: number
  party?: string
  sourceDocRef?: string
  reversedTxId?: string
  isReversed: boolean
  /** Adjustment that changed the useful life (a dependent event for run reversal, §3.8.1 rule 4) */
  changesLife?: boolean
  /** Entry posted by the module for this event */
  journal: JournalLine[]
  /** Entry posted by another module for the same event (purchase bill, opening-balance import) — shown for reconciliation */
  externalJournal: JournalLine[]
  externalNote?: string
  notes: string
  user: string
}

/** §3.8 AssetDepreciationRun + lines */
export interface RunLine { assetId: string; lineId: string; amount: number; expenseAcct: string; accumAcct: string; costCenterId: string }
export interface DepRun {
  id: string
  number: string
  periodStart: string // YYYY-MM-DD
  periodEnd: string // YYYY-MM (monthly accounting period)
  areaId: string
  classId: string // '' = all classes
  status: RunStatus
  lines: RunLine[]
  createdAt: string
  postedAt: string | null
  reversedAt: string | null
  notes: string
}

/** Maintenance scheduling — plan §9 phase 5 (AssetMaintenance). Fields are mock assumptions. */
export type MaintType = 'preventive' | 'corrective' | 'inspection'
export type MaintStatus = 'planned' | 'inProgress' | 'done' | 'cancelled'
export interface Maintenance {
  id: string
  number: string
  assetId: string
  type: MaintType
  partnerId: string
  plannedDate: string
  doneDate: string | null
  cost: number
  intervalMonths: number // 0 = one-off; otherwise the next order is scheduled on completion
  capitalize: boolean // post the cost as an AddCost (240) on the asset instead of expensing it
  addCostTxId: string | null
  status: MaintStatus
  notes: string
  journal: JournalLine[]
}

export interface Settings {
  /** First month of the fiscal year (1–12); quarters/years follow it (§5.1.1, §12.7) */
  fiscalStartMonth: number
  /** Minimum maintenance cost that may be capitalized (IQD) */
  capThreshold: number
  /** §5.6.5 Assets:LowValueThreshold — null = disabled */
  lowValueThreshold: number | null
}

export interface DB {
  classes: AssetClass[]
  classAreaAccounts: ClassAreaAccounts[]
  areas: DepArea[]
  areaSettings: AssetAreaSetting[]
  groups: AssetGroup[]
  locations: AssetLocation[]
  employees: Employee[]
  partners: Partner[]
  costCenters: CostCenter[]
  accounts: Account[]
  assets: Asset[]
  lines: DepLine[]
  txs: AssetTx[]
  runs: DepRun[]
  maintenance: Maintenance[]
  settings: Settings
  role: RoleId
}
