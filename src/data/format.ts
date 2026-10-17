import type { AssetKind, AssetState, DepMethod, MaintStatus, MaintType, Periodicity, Prorata, RoleId, RunStatus, TxType } from './types'

export type Tone = 'gray' | 'green' | 'amber' | 'red' | 'blue'

export const money = (n: number) => (Math.round(n) || 0).toLocaleString('en-US')
export const iqd = (n: number) => `IQD ${money(n)}`

export const stateLabel: Record<AssetState, string> = {
  draft: 'مسودة', running: 'قيد الإهلاك', paused: 'موقوف', closed: 'مكتمل الإهلاك', sold: 'مباع', disposed: 'مستبعد', cancelled: 'ملغى',
}
export const stateTone: Record<AssetState, Tone> = {
  draft: 'gray', running: 'green', paused: 'amber', closed: 'blue', sold: 'red', disposed: 'red', cancelled: 'gray',
}

export const runStatusLabel: Record<RunStatus, string> = { draft: 'مسودة (محاكاة)', posted: 'مُرحّلة', reversed: 'معكوسة' }
export const runStatusTone: Record<RunStatus, Tone> = { draft: 'gray', posted: 'green', reversed: 'red' }

export const methodLabel: Record<DepMethod, string> = {
  SL: 'القسط الثابت', DB: 'القسط المتناقص', DBSL: 'المتناقص ثم الثابت', NONE: 'بلا إهلاك',
}
export const periodicityLabel: Record<Periodicity, string> = { M: 'شهري', Q: 'ربع سنوي', Y: 'سنوي' }
export const prorataLabel: Record<Prorata, string> = { NONE: 'بلا تحاصص (قسط أول كامل)', CONST: 'بالأشهر الكاملة', DAYS: 'بالأيام الفعلية' }
export const kindLabel: Record<AssetKind, string> = { tangible: 'ملموس', intangible: 'غير ملموس (إطفاء)', land: 'أرض', lowValue: 'منخفض القيمة' }
/** §5.6.5 — intangibles use «إطفاء» in the UI and reports. */
export const depWord = (kind?: AssetKind) => (kind === 'intangible' ? 'الإطفاء' : 'الإهلاك')
export const accumWord = (kind?: AssetKind) => (kind === 'intangible' ? 'مجمّع الإطفاء' : 'مجمّع الاندثار')

export const txLabel: Record<TxType, string> = {
  capitalization: 'رسملة', capitalizationReversal: 'تراجع عن الرسملة', openingBalance: 'رصيد افتتاحي', addition: 'إضافة لاحقة',
  acquisitionReduction: 'تخفيض اقتناء', manualDepreciation: 'إهلاك يدوي', revaluation: 'إعادة تقييم', impairment: 'هبوط قيمة',
  transfer: 'نقل موقع / عهدة', costCenterTransfer: 'نقل مركز كلفة', pause: 'إيقاف', resume: 'استئناف', sale: 'بيع', saleReversal: 'عكس بيع',
  disposal: 'استبعاد', disposalReversal: 'عكس استبعاد', adjustment: 'تسوية', cancellation: 'إلغاء',
}
export const txTone: Record<TxType, Tone> = {
  capitalization: 'green', capitalizationReversal: 'amber', openingBalance: 'gray', addition: 'green', acquisitionReduction: 'amber',
  manualDepreciation: 'blue', revaluation: 'blue', impairment: 'amber', transfer: 'gray', costCenterTransfer: 'gray', pause: 'amber', resume: 'green',
  sale: 'red', saleReversal: 'amber', disposal: 'red', disposalReversal: 'amber', adjustment: 'gray', cancellation: 'gray',
}

export const maintTypeLabel: Record<MaintType, string> = { preventive: 'وقائية', corrective: 'علاجية', inspection: 'فحص دوري' }
export const maintStatusLabel: Record<MaintStatus, string> = { planned: 'مخطّطة', inProgress: 'قيد التنفيذ', done: 'منجزة', cancelled: 'ملغاة' }
export const maintStatusTone: Record<MaintStatus, Tone> = { planned: 'blue', inProgress: 'amber', done: 'green', cancelled: 'gray' }

export const roleLabel: Record<RoleId, string> = {
  superadmin: 'مدير النظام',
  viewer: 'مُطّلع على الأصول',
  user: 'مستخدم الأصول',
  accountant: 'محاسب الأصول',
  settings: 'مدير إعدادات الأصول',
}

export const months = ['كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران', 'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول']
export const periodLabel = (p: string) => {
  const [y, m] = p.split('-').map(Number)
  return `${months[m - 1]} ${y}`
}
