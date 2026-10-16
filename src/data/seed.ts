import { computeRun, schedule } from './calc'
import type { Asset, Category, DB, Employee, Location } from './types'

const categories: Category[] = [
  { id: 'c1', code: 'BLD', name: 'المباني والإنشاءات', method: 'SL', lifeYears: 25, salvagePct: 10, assetAccount: '1211 - المباني', accumAccount: '1291 - مجمع استهلاك المباني', expenseAccount: '5311 - مصروف استهلاك المباني', gainLossAccount: '4910 - أرباح/خسائر استبعاد موجودات' },
  { id: 'c2', code: 'VEH', name: 'وسائط النقل', method: 'DDB', lifeYears: 5, salvagePct: 15, assetAccount: '1214 - وسائط النقل', accumAccount: '1294 - مجمع استهلاك وسائط النقل', expenseAccount: '5314 - مصروف استهلاك وسائط النقل', gainLossAccount: '4910 - أرباح/خسائر استبعاد موجودات' },
  { id: 'c3', code: 'MCH', name: 'الآلات والمعدات', method: 'SL', lifeYears: 10, salvagePct: 5, assetAccount: '1213 - الآلات والمعدات', accumAccount: '1293 - مجمع استهلاك الآلات', expenseAccount: '5313 - مصروف استهلاك الآلات', gainLossAccount: '4910 - أرباح/خسائر استبعاد موجودات' },
  { id: 'c4', code: 'FUR', name: 'الأثاث والمفروشات', method: 'SL', lifeYears: 8, salvagePct: 0, assetAccount: '1215 - الأثاث', accumAccount: '1295 - مجمع استهلاك الأثاث', expenseAccount: '5315 - مصروف استهلاك الأثاث', gainLossAccount: '4910 - أرباح/خسائر استبعاد موجودات' },
  { id: 'c5', code: 'ITE', name: 'أجهزة الحاسوب والشبكات', method: 'SL', lifeYears: 4, salvagePct: 0, assetAccount: '1216 - أجهزة الحاسوب', accumAccount: '1296 - مجمع استهلاك أجهزة الحاسوب', expenseAccount: '5316 - مصروف استهلاك أجهزة الحاسوب', gainLossAccount: '4910 - أرباح/خسائر استبعاد موجودات' },
  { id: 'c6', code: 'OFF', name: 'الأجهزة المكتبية', method: 'SL', lifeYears: 5, salvagePct: 0, assetAccount: '1217 - الأجهزة المكتبية', accumAccount: '1297 - مجمع استهلاك الأجهزة المكتبية', expenseAccount: '5317 - مصروف استهلاك الأجهزة المكتبية', gainLossAccount: '4910 - أرباح/خسائر استبعاد موجودات' },
]

const locations: Location[] = [
  { id: 'l1', code: 'BGD-HQ', name: 'المقر الرئيسي - الكرادة', branch: 'بغداد', type: 'مبنى إداري' },
  { id: 'l2', code: 'BGD-WH', name: 'مستودع أبو غريب', branch: 'بغداد', type: 'مستودع' },
  { id: 'l3', code: 'BSR-01', name: 'فرع البصرة - العشار', branch: 'البصرة', type: 'فرع' },
  { id: 'l4', code: 'EBL-01', name: 'فرع أربيل - شارع 100', branch: 'أربيل', type: 'فرع' },
  { id: 'l5', code: 'BGD-FAC', name: 'معمل التعبئة - الزعفرانية', branch: 'بغداد', type: 'معمل' },
]

const employees: Employee[] = [
  { id: 'e1', name: 'أحمد كريم الجبوري', department: 'الإدارة العامة' },
  { id: 'e2', name: 'زينب علي حسن', department: 'المالية' },
  { id: 'e3', name: 'مصطفى عادل', department: 'تقنية المعلومات' },
  { id: 'e4', name: 'سارة محمود', department: 'الموارد البشرية' },
  { id: 'e5', name: 'حيدر سلمان', department: 'الخدمات اللوجستية' },
  { id: 'e6', name: 'نور الهدى جاسم', department: 'المبيعات' },
  { id: 'e7', name: 'علي عبد الأمير', department: 'الإنتاج' },
]

type Row = [string, string, string, string, string, number, string, string, string?]
// name, category, location, custodian, inService, cost, supplier, brand/model, status
const rows: Row[] = [
  ['مبنى المقر الرئيسي', 'c1', 'l1', 'e1', '2019-01-01', 1850000000, 'شركة الرافدين للمقاولات', '—'],
  ['مستودع أبو غريب - هنكر', 'c1', 'l2', 'e5', '2020-06-01', 640000000, 'شركة دجلة للإنشاءات', '—'],
  ['سيارة تويوتا هايلكس 2023', 'c2', 'l2', 'e5', '2023-03-01', 48500000, 'وكالة تويوتا - بغداد', 'Toyota Hilux'],
  ['سيارة كيا سبورتاج 2024', 'c2', 'l1', 'e1', '2024-02-01', 39000000, 'وكالة كيا العراق', 'Kia Sportage'],
  ['شاحنة إيسوزو NPR', 'c2', 'l2', 'e5', '2022-09-01', 72000000, 'شركة الخليج للسيارات', 'Isuzu NPR'],
  ['باص نقل موظفين هيونداي', 'c2', 'l5', 'e7', '2021-11-01', 55000000, 'وكالة هيونداي', 'Hyundai County'],
  ['خط تعبئة أوتوماتيكي', 'c3', 'l5', 'e7', '2021-04-01', 310000000, 'Krones AG', 'Krones Modulfill'],
  ['رافعة شوكية كهربائية', 'c3', 'l2', 'e5', '2023-07-01', 26500000, 'شركة المعدات الحديثة', 'Toyota 8FBE'],
  ['مولدة كهربائية 500 KVA', 'c3', 'l1', 'e1', '2020-01-01', 95000000, 'Perkins Iraq', 'Perkins 2506'],
  ['مولدة كهربائية 250 KVA', 'c3', 'l3', 'e6', '2022-05-01', 52000000, 'Perkins Iraq', 'Perkins 1506'],
  ['ضاغطة هواء صناعية', 'c3', 'l5', 'e7', '2024-01-01', 18700000, 'Atlas Copco', 'GA 37'],
  ['أثاث قاعة الاجتماعات', 'c4', 'l1', 'e1', '2022-02-01', 14500000, 'معرض الأثاث الحديث', '—'],
  ['مكاتب الطابق الثاني (12 مكتب)', 'c4', 'l1', 'e4', '2021-08-01', 21600000, 'معرض الأثاث الحديث', '—'],
  ['أثاث فرع البصرة', 'c4', 'l3', 'e6', '2023-05-01', 9800000, 'مفروشات الفيحاء', '—'],
  ['خادم Dell PowerEdge R750', 'c5', 'l1', 'e3', '2024-04-01', 24500000, 'شركة الأفق للحاسبات', 'Dell R750'],
  ['أجهزة حاسوب محمولة (15 جهاز)', 'c5', 'l1', 'e3', '2025-01-01', 33750000, 'شركة الأفق للحاسبات', 'Lenovo ThinkPad T14'],
  ['منظومة شبكات وجدار ناري', 'c5', 'l1', 'e3', '2023-10-01', 17200000, 'Cisco Partner Iraq', 'FortiGate 100F'],
  ['أجهزة حاسوب مكتبية - أربيل', 'c5', 'l4', 'e6', '2024-09-01', 11400000, 'كردستان تك', 'HP ProDesk 400'],
  ['طابعة ليزر متعددة المهام', 'c6', 'l1', 'e2', '2023-02-01', 4200000, 'شركة الأفق للحاسبات', 'HP M528'],
  ['منظومة كاميرات مراقبة', 'c6', 'l2', 'e5', '2022-12-01', 8900000, 'هيكفيجن العراق', 'Hikvision NVR'],
  ['أجهزة تكييف سبليت (20 جهاز)', 'c6', 'l1', 'e4', '2022-06-01', 19000000, 'شركة الفرات للتبريد', 'Gree 2 Ton'],
  ['جهاز بصمة دوام', 'c6', 'l4', 'e4', '2025-03-01', 1350000, 'ZKTeco', 'ZK MB360'],
  ['آلة تصوير مستندات كبيرة', 'c6', 'l3', 'e6', '2021-03-01', 6500000, 'Canon Iraq', 'Canon IR-ADV', 'maintenance'],
  ['شاشات عرض تفاعلية', 'c6', 'l1', 'e1', '2026-10-01', 7600000, 'شركة الأفق للحاسبات', 'Samsung Flip', 'draft'],
]

function buildAssets(): Asset[] {
  return rows.map(([name, cat, loc, cust, inService, cost, supplier, brand, status], i) => {
    const c = categories.find((x) => x.id === cat)!
    const base: Asset = {
      id: `a${i + 1}`,
      code: `FA-${c.code}-${String(i + 1).padStart(4, '0')}`,
      name,
      categoryId: cat,
      locationId: loc,
      custodianId: cust,
      costCenter: employees.find((e) => e.id === cust)!.department,
      status: (status as Asset['status']) ?? 'active',
      acquisitionDate: inService,
      inServiceDate: inService,
      cost,
      salvage: Math.round((cost * c.salvagePct) / 100),
      lifeMonths: c.lifeYears * 12,
      method: c.method,
      openingAccum: 0,
      revaluation: 0,
      supplier,
      invoiceNo: `INV-${inService.slice(0, 4)}-${String(100 + i * 7)}`,
      serial: `SN${(948213 + i * 1371).toString(36).toUpperCase()}`,
      brand: brand.split(' ')[0],
      model: brand,
      warrantyEnd: `${Number(inService.slice(0, 4)) + 2}${inService.slice(4)}`,
      notes: '',
      history: [{ date: inService, action: 'إضافة الموجود وتسجيله في السجل', user: 'superadmin' }],
    }
    // Opening accumulated depreciation as of go-live (end of Aug 2026)
    if (base.status !== 'draft') {
      base.openingAccum = schedule(base)
        .filter((r) => r.period <= '2026-08')
        .reduce((s, r) => s + r.dep, 0)
    }
    return base
  })
}

export function seed(): DB {
  const db: DB = {
    categories,
    locations,
    employees,
    assets: buildAssets(),
    depRuns: [],
    transfers: [],
    disposals: [],
    revaluations: [],
    maintenance: [],
    settings: {
      company: 'شركة إنكي للتجارة العامة',
      currency: 'IQD',
      fiscalYearStart: '2026-01-01',
      defaultMethod: 'SL',
      postingDay: 30,
      capitalizeThreshold: 500000,
      prefixAsset: 'FA',
    },
  }
  db.depRuns.push({
    id: 'd1', number: 'DEP-2026-0009', date: '2026-09-30', status: 'posted', period: '2026-09',
    notes: 'استهلاك شهر أيلول', lines: computeRun(db, '2026-09'),
  })
  db.transfers.push({
    id: 't1', number: 'TRF-2026-0001', date: '2026-09-12', status: 'posted', reason: 'إعادة توزيع على فرع البصرة', notes: '',
    lines: [{ assetId: 'a10', fromLocationId: 'l1', toLocationId: 'l3', fromCustodianId: 'e1', toCustodianId: 'e6' }],
  })
  db.transfers.push({
    id: 't2', number: 'TRF-2026-0002', date: '2026-10-14', status: 'draft', reason: 'نقل أجهزة إلى فرع أربيل', notes: '',
    lines: [{ assetId: 'a19', fromLocationId: 'l1', toLocationId: 'l4', fromCustodianId: 'e2', toCustodianId: 'e6' }],
  })
  db.maintenance.push(
    { id: 'm1', number: 'MNT-2026-0001', date: '2026-10-05', status: 'draft', assetId: 'a23', type: 'corrective', vendor: 'Canon Iraq', cost: 750000, dueDate: '2026-10-20', capitalize: false, notes: 'عطل في وحدة التغذية' },
    { id: 'm2', number: 'MNT-2026-0002', date: '2026-09-02', status: 'posted', assetId: 'a9', type: 'preventive', vendor: 'Perkins Iraq', cost: 1200000, dueDate: '2026-09-02', capitalize: false, notes: 'صيانة دورية 2000 ساعة' },
    { id: 'm3', number: 'MNT-2026-0003', date: '2026-10-25', status: 'draft', assetId: 'a7', type: 'inspection', vendor: 'Krones AG', cost: 2500000, dueDate: '2026-10-25', capitalize: false, notes: 'فحص سنوي لخط التعبئة' },
  )
  db.disposals.push({
    id: 's1', number: 'DSP-2026-0001', date: '2026-10-10', status: 'draft', type: 'sale', party: 'معرض السلام للسيارات', notes: '',
    lines: [{ assetId: 'a6', nbv: 0, price: 21000000 }],
  })
  return db
}
