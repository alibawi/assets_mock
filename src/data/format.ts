import type { AssetState, DepMethod, Periodicity, Prorata, RoleId, RunStatus, TxType } from './types'

export type Tone = 'gray' | 'green' | 'amber' | 'red' | 'blue'

export const money = (n: number) => Math.round(n).toLocaleString('en-US')
export const iqd = (n: number) => `IQD ${money(n)}`

export const stateLabel: Record<AssetState, string> = {
  draft: 'مسودة', running: 'قيد الإهلاك', paused: 'موقوف', closed: 'مكتمل الإهلاك', sold: 'مباع', disposed: 'مستبعد',
}
export const stateTone: Record<AssetState, Tone> = {
  draft: 'gray', running: 'green', paused: 'amber', closed: 'blue', sold: 'red', disposed: 'red',
}

export const runStatusLabel: Record<RunStatus, string> = { draft: 'مسودة (محاكاة)', posted: 'مُرحّلة', reversed: 'معكوسة' }
export const runStatusTone: Record<RunStatus, Tone> = { draft: 'gray', posted: 'green', reversed: 'red' }

export const methodLabel: Record<DepMethod, string> = {
  SL: 'القسط الثابت', DB: 'القسط المتناقص', DBSL: 'المتناقص ثم الثابت', NONE: 'بلا إهلاك',
}
export const periodicityLabel: Record<Periodicity, string> = { M: 'شهري', Q: 'ربع سنوي', Y: 'سنوي' }
export const prorataLabel: Record<Prorata, string> = { NONE: 'بلا تحاصص (قسط أول كامل)', CONST: 'بنسبة الفترات المتبقية', DAYS: 'بالأيام الفعلية' }

export const txLabel: Record<TxType, string> = {
  capitalization: 'رسملة', revaluation: 'إعادة تقييم', transfer: 'نقل', pause: 'إيقاف', resume: 'استئناف',
  sale: 'بيع', disposal: 'استبعاد', adjustment: 'تسوية',
}
export const txTone: Record<TxType, Tone> = {
  capitalization: 'green', revaluation: 'blue', transfer: 'gray', pause: 'amber', resume: 'green', sale: 'red', disposal: 'red', adjustment: 'gray',
}

export const roleLabel: Record<RoleId, string> = {
  superadmin: 'مدير النظام',
  viewer: 'مُطّلع على الأصول',
  user: 'مستخدم الأصول',
  accountant: 'محاسب الأصول',
  settings: 'مدير إعدادات الأصول',
}

const months = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول']
export const periodLabel = (p: string) => {
  const [y, m] = p.split('-').map(Number)
  return `${months[m - 1]} ${y}`
}
