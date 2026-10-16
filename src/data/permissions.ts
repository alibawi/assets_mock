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
