// Plan §6.3 — permissions and the suggested roles composed from them.
import type { RoleId } from './types'

export type Perm = 'view' | 'create' | 'update' | 'delete' | 'post' | 'reverse' | 'settings'

export const permLabel: Record<Perm, string> = {
  view: 'عرض (Assets.Asset)',
  create: 'إنشاء (.Create)',
  update: 'تعديل (.Update)',
  delete: 'حذف (.Delete)',
  post: 'ترحيل: رسملة / إهلاك / بيع / استبعاد (.Post)',
  reverse: 'عكس (.Reverse)',
  settings: 'الفئات / المواقع / المجموعات',
}

export const rolePerms: Record<RoleId, Perm[]> = {
  superadmin: ['view', 'create', 'update', 'delete', 'post', 'reverse', 'settings'],
  viewer: ['view'],
  user: ['view', 'create', 'update'],
  accountant: ['view', 'create', 'update', 'post', 'reverse'],
  settings: ['view', 'settings'],
}

export const can = (role: RoleId, p: Perm) => rolePerms[role].includes(p)

/** §6.3 — permission groups shown in the matrix (cosmetic in the mock: buttons are gated by the role's flags above). */
export type Action = 'View' | 'Create' | 'Update' | 'Delete' | 'Post' | 'Reverse'
export const permGroups: { key: string; label: string; actions: Action[] }[] = [
  { key: 'Assets.Asset', label: 'الأصل (رسملة / إيقاف / استئناف / تسوية)', actions: ['View', 'Create', 'Update', 'Delete', 'Post', 'Reverse'] },
  { key: 'Assets.AssetDepreciationRun', label: 'دورات الإهلاك', actions: ['View', 'Create', 'Update', 'Delete', 'Post', 'Reverse'] },
  { key: 'Assets.AssetRevaluation', label: 'إعادة التقييم والهبوط', actions: ['View', 'Create', 'Update', 'Delete', 'Post', 'Reverse'] },
  { key: 'Assets.AssetDisposal', label: 'الاستبعاد', actions: ['View', 'Create', 'Update', 'Delete', 'Post', 'Reverse'] },
  { key: 'Assets.AssetCostAdjustment', label: 'الإضافة والتخفيض', actions: ['View', 'Create', 'Update', 'Delete', 'Post', 'Reverse'] },
  { key: 'Assets.AssetManualDepreciation', label: 'الإهلاك اليدوي', actions: ['View', 'Create', 'Update', 'Delete', 'Post', 'Reverse'] },
  { key: 'Assets.AssetTransfer', label: 'النقل', actions: ['View', 'Create', 'Update', 'Delete', 'Post', 'Reverse'] },
  { key: 'Assets.AssetOpeningBalance', label: 'استيراد الأصول القديمة', actions: ['View', 'Create', 'Update', 'Delete', 'Post', 'Reverse'] },
  { key: 'Assets.AssetTransaction', label: 'سجل حركات الأصول (قراءة فقط)', actions: ['View'] },
  { key: 'Assets.Settings', label: 'الفئات / المواقع / المجموعات / مجالات الإهلاك', actions: ['View', 'Create', 'Update', 'Delete'] },
]

/** Which actions a role has on a group (§6.3 suggested roles). */
export function roleHas(role: RoleId, group: string, action: Action): boolean {
  if (role === 'superadmin') return true
  if (group === 'Assets.Settings') return role === 'settings' ? true : action === 'View'
  if (group === 'Assets.AssetTransaction') return action === 'View'
  switch (role) {
    case 'viewer': return action === 'View'
    case 'settings': return action === 'View'
    case 'user': return group === 'Assets.AssetOpeningBalance' ? action === 'View' : ['View', 'Create', 'Update'].includes(action)
    case 'accountant': return group === 'Assets.Asset' && action === 'Delete' ? false : true
  }
  return false
}
