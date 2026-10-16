// Data model follows docs/source/assets-management-module-plan-ar.md §3.

/** §3.1 DepreciationMethod */
export type DepMethod = 'SL' | 'DB' | 'DBSL' | 'NONE'
/** §3.1 Periodicity */
export type Periodicity = 'M' | 'Q' | 'Y'
/** §3.1 ProrataMethod */
export type Prorata = 'NONE' | 'CONST' | 'DAYS'
/** §3.5 / §4 Asset state */
export type AssetState = 'draft' | 'running' | 'paused' | 'closed' | 'sold' | 'disposed'
/** §3.8 run status */
export type RunStatus = 'draft' | 'posted' | 'reversed'
/** §3.7 TransactionType */
export type TxType = 'capitalization' | 'revaluation' | 'transfer' | 'pause' | 'resume' | 'sale' | 'disposal' | 'adjustment'

export type RoleId = 'superadmin' | 'viewer' | 'user' | 'accountant' | 'settings'

export interface JournalLine { account: string; desc: string; debit: number; credit: number; costCenter?: string }

/** §3.1 AssetClass — accounting template */
export interface AssetClass {
  id: string
  code: string
  name: string
  foreignName: string
  method: DepMethod
  lifeMonths: number
  decliningFactor: number | null
  periodicity: Periodicity
  prorata: Prorata
  assetAcct: string
  accumAcct: string
  expenseAcct: string
  gainAcct: string
  lossAcct: string
  revalSurplusAcct: string
  isDepreciable: boolean
  isActive: boolean
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
  acquisitionDate: string
  depStartDate: string
  originalValue: number
  salvage: number
  lifeMonths: number
  method: DepMethod
  periodicity: Periodicity
  prorata: Prorata
  decliningFactor: number | null
  state: AssetState
  isLegacy: boolean
  importedAccum: number
  /** Σ revaluation adjustments (±), derived from posted revaluation transactions */
  revaluationAdj: number
  costCenterId: string
  project: string
}

/** §3.6 AssetDepreciationLine */
export interface DepLine {
  id: string
  assetId: string
  seq: number
  date: string // period end, YYYY-MM-DD
  type: 'depreciation' | 'revaluation' | 'removal'
  days: number | null
  amount: number
  accum: number
  remaining: number
  isPosted: boolean
  runId: string | null
}

/** §3.7 AssetTransaction */
export interface AssetTx {
  id: string
  number: string
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
  party?: string
  journal: JournalLine[]
  notes: string
  user: string
}

/** §3.8 AssetDepreciationRun + lines */
export interface RunLine { assetId: string; lineId: string; amount: number; expenseAcct: string; accumAcct: string; costCenterId: string }
export interface DepRun {
  id: string
  number: string
  periodEnd: string // YYYY-MM
  classId: string // '' = all classes
  status: RunStatus
  lines: RunLine[]
  createdAt: string
  postedAt: string | null
  notes: string
}

export interface DB {
  classes: AssetClass[]
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
  role: RoleId
}
