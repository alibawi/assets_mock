export type DepMethod = 'SL' | 'DDB'
export type AssetStatus = 'draft' | 'active' | 'maintenance' | 'disposed' | 'sold'
export type DocStatus = 'draft' | 'posted' | 'cancelled'

export interface Category {
  id: string
  code: string
  name: string
  method: DepMethod
  lifeYears: number
  salvagePct: number
  assetAccount: string
  accumAccount: string
  expenseAccount: string
  gainLossAccount: string
}

export interface Location {
  id: string
  code: string
  name: string
  branch: string
  type: string
}

export interface Employee {
  id: string
  name: string
  department: string
}

export interface HistoryEntry {
  date: string
  action: string
  ref?: string
  user: string
}

export interface Asset {
  id: string
  code: string
  name: string
  categoryId: string
  locationId: string
  custodianId: string
  costCenter: string
  status: AssetStatus
  acquisitionDate: string
  inServiceDate: string
  cost: number
  salvage: number
  lifeMonths: number
  method: DepMethod
  openingAccum: number
  revaluation: number
  supplier: string
  invoiceNo: string
  serial: string
  brand: string
  model: string
  warrantyEnd: string
  notes: string
  history: HistoryEntry[]
}

interface DocBase {
  id: string
  number: string
  date: string
  status: DocStatus
  notes: string
}

export interface DepLine { assetId: string; amount: number }
export interface DepRun extends DocBase { period: string; lines: DepLine[] }

export interface TransferLine {
  assetId: string
  fromLocationId: string
  toLocationId: string
  fromCustodianId: string
  toCustodianId: string
}
export interface Transfer extends DocBase { reason: string; lines: TransferLine[] }

export type DisposalType = 'sale' | 'scrap' | 'donation'
export interface DisposalLine { assetId: string; nbv: number; price: number }
export interface Disposal extends DocBase { type: DisposalType; party: string; lines: DisposalLine[] }

export interface RevalLine { assetId: string; oldValue: number; newValue: number }
export interface Revaluation extends DocBase { appraiser: string; lines: RevalLine[] }

export type MaintType = 'preventive' | 'corrective' | 'inspection'
export interface Maintenance extends DocBase {
  assetId: string
  type: MaintType
  vendor: string
  cost: number
  dueDate: string
  capitalize: boolean
}

export interface Settings {
  company: string
  currency: string
  fiscalYearStart: string
  defaultMethod: DepMethod
  postingDay: number
  capitalizeThreshold: number
  prefixAsset: string
}

export interface DB {
  categories: Category[]
  locations: Location[]
  employees: Employee[]
  assets: Asset[]
  depRuns: DepRun[]
  transfers: Transfer[]
  disposals: Disposal[]
  revaluations: Revaluation[]
  maintenance: Maintenance[]
  settings: Settings
}
