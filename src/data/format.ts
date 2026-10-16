import type { AssetStatus, DisposalType, DocStatus, MaintType, DepMethod } from './types'

export const money = (n: number) => Math.round(n).toLocaleString('en-US')
export const iqd = (n: number) => `IQD ${money(n)}`

export const assetStatusLabel: Record<AssetStatus, string> = {
  draft: 'مسودة',
  active: 'قيد الاستخدام',
  maintenance: 'تحت الصيانة',
  disposed: 'مستبعد',
  sold: 'مباع',
}
export const assetStatusTone: Record<AssetStatus, Tone> = {
  draft: 'gray',
  active: 'green',
  maintenance: 'amber',
  disposed: 'red',
  sold: 'blue',
}

export const docStatusLabel: Record<DocStatus, string> = { draft: 'مسودة', posted: 'مُرحّل', cancelled: 'ملغى' }
export const docStatusTone: Record<DocStatus, Tone> = { draft: 'gray', posted: 'green', cancelled: 'red' }

export const methodLabel: Record<DepMethod, string> = { SL: 'القسط الثابت', DDB: 'القسط المتناقص المضاعف' }
export const disposalTypeLabel: Record<DisposalType, string> = { sale: 'بيع', scrap: 'إتلاف / شطب', donation: 'تبرع' }
export const maintTypeLabel: Record<MaintType, string> = { preventive: 'وقائية', corrective: 'علاجية', inspection: 'فحص دوري' }

export type Tone = 'gray' | 'green' | 'amber' | 'red' | 'blue'

const months = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول']
export const periodLabel = (p: string) => {
  const [y, m] = p.split('-').map(Number)
  return `${months[m - 1]} ${y}`
}

export const today = () => '2026-10-16'
