// Demo data. Chart-of-accounts codes follow plan §3.9; codes marked "مقترح" are placeholders the
// accountant still has to approve (plan §12, open decision 1).
import { bookValue, generateSchedule, monthEnd } from './calc'
import { capitalize, createRun, dispose, pause, postRun, revalue, sell, transfer } from './lifecycle'
import type { Account, Asset, AssetClass, AssetGroup, AssetLocation, CostCenter, DB, Employee, Partner } from './types'

const accounts: Account[] = [
  { code: '1100000000', name: 'الموجودات الثابتة', postable: false },
  { code: '1100000001', name: 'مباني', postable: true },
  { code: '1100000002', name: 'آلات ومعدات', postable: true },
  { code: '1100000003', name: 'وسائط نقل', postable: true },
  { code: '1100000004', name: 'أثاث وأجهزة مكتب', postable: true },
  { code: '1100000006', name: 'خطوط كهرباء وهاتف', postable: true },
  { code: '1100000008', name: 'نفقات تأسيس', postable: true },
  { code: '1100000009', name: 'أراضي (مقترح)', postable: true },
  { code: '1190000000', name: 'مجمّع الاندثار', postable: false },
  { code: '1190000001', name: 'مجمّع اندثار مباني', postable: true },
  { code: '1190000002', name: 'مجمّع اندثار آلات ومعدات', postable: true },
  { code: '1190000003', name: 'مجمّع اندثار وسائط نقل', postable: true },
  { code: '1190000004', name: 'مجمّع اندثار أثاث وأجهزة مكتب', postable: true },
  { code: '1200000001', name: 'النقد / المدينون (مقترح)', postable: true },
  { code: '2100000001', name: 'الموردون (مقترح)', postable: true },
  { code: '2500000001', name: 'فائض إعادة التقييم (مقترح)', postable: true },
  { code: '3700000000', name: 'الاندثار', postable: false },
  { code: '3700000001', name: 'اندثار مباني وإنشاءات وطرق', postable: true },
  { code: '3700000002', name: 'اندثار آلات ومعدات', postable: true },
  { code: '3700000003', name: 'اندثار وسائل نقل وانتقال', postable: true },
  { code: '3700000004', name: 'اندثار أثاث وأجهزة مكاتب', postable: true },
  { code: '3800000001', name: 'خسائر بيع واستبعاد موجودات ثابتة (مقترح)', postable: true },
  { code: '4900000001', name: 'أرباح بيع موجودات ثابتة (مقترح)', postable: true },
]

const common = { gainAcct: '4900000001', lossAcct: '3800000001', revalSurplusAcct: '2500000001', isActive: true }
const classes: AssetClass[] = [
  { id: 'c1', code: 'BLD', name: 'مباني وإنشاءات', foreignName: 'Buildings', method: 'SL', lifeMonths: 300, decliningFactor: null, periodicity: 'Y', prorata: 'CONST', assetAcct: '1100000001', accumAcct: '1190000001', expenseAcct: '3700000001', isDepreciable: true, ...common },
  { id: 'c2', code: 'MCH', name: 'آلات ومعدات', foreignName: 'Machinery & Equipment', method: 'DBSL', lifeMonths: 120, decliningFactor: 2, periodicity: 'M', prorata: 'DAYS', assetAcct: '1100000002', accumAcct: '1190000002', expenseAcct: '3700000002', isDepreciable: true, ...common },
  { id: 'c3', code: 'VEH', name: 'وسائط نقل', foreignName: 'Vehicles', method: 'SL', lifeMonths: 60, decliningFactor: null, periodicity: 'M', prorata: 'NONE', assetAcct: '1100000003', accumAcct: '1190000003', expenseAcct: '3700000003', isDepreciable: true, ...common },
  { id: 'c4', code: 'FUR', name: 'أثاث وأجهزة مكتب', foreignName: 'Furniture & Office Equipment', method: 'SL', lifeMonths: 96, decliningFactor: null, periodicity: 'M', prorata: 'NONE', assetAcct: '1100000004', accumAcct: '1190000004', expenseAcct: '3700000004', isDepreciable: true, ...common },
  { id: 'c5', code: 'ITE', name: 'أجهزة حاسوب وشبكات', foreignName: 'IT Equipment', method: 'DB', lifeMonths: 48, decliningFactor: 2, periodicity: 'M', prorata: 'NONE', assetAcct: '1100000004', accumAcct: '1190000004', expenseAcct: '3700000004', isDepreciable: true, ...common },
  { id: 'c6', code: 'LND', name: 'أراضي', foreignName: 'Land', method: 'NONE', lifeMonths: 0, decliningFactor: null, periodicity: 'Y', prorata: 'NONE', assetAcct: '1100000009', accumAcct: '', expenseAcct: '', isDepreciable: false, ...common },
]

const groups: AssetGroup[] = [
  { id: 'g1', code: 'ADM', name: 'أصول إدارية', isActive: true },
  { id: 'g2', code: 'PRD', name: 'أصول إنتاجية', isActive: true },
  { id: 'g3', code: 'DST', name: 'أصول المبيعات والتوزيع', isActive: true },
]

const locations: AssetLocation[] = [
  { id: 'l1', code: 'BGD', name: 'بغداد', parentId: null, isActive: true },
  { id: 'l11', code: 'BGD-HQ', name: 'المقر الرئيسي - الكرادة', parentId: 'l1', isActive: true },
  { id: 'l12', code: 'BGD-WH', name: 'مستودع أبو غريب', parentId: 'l1', isActive: true },
  { id: 'l13', code: 'BGD-FAC', name: 'معمل التعبئة - الزعفرانية', parentId: 'l1', isActive: true },
  { id: 'l2', code: 'BSR', name: 'البصرة', parentId: null, isActive: true },
  { id: 'l21', code: 'BSR-01', name: 'فرع العشار', parentId: 'l2', isActive: true },
  { id: 'l3', code: 'EBL', name: 'أربيل', parentId: null, isActive: true },
  { id: 'l31', code: 'EBL-01', name: 'فرع شارع 100', parentId: 'l3', isActive: true },
]

const employees: Employee[] = [
  { id: 'e1', name: 'أحمد كريم الجبوري', department: 'الإدارة العامة' },
  { id: 'e2', name: 'زينب علي حسن', department: 'المالية' },
  { id: 'e3', name: 'مصطفى عادل الربيعي', department: 'تقنية المعلومات' },
  { id: 'e4', name: 'سارة محمود الدليمي', department: 'الموارد البشرية' },
  { id: 'e5', name: 'حيدر سلمان العبيدي', department: 'الخدمات اللوجستية' },
  { id: 'e6', name: 'نور الهدى جاسم', department: 'المبيعات' },
  { id: 'e7', name: 'علي عبد الأمير الساعدي', department: 'الإنتاج' },
]

const partners: Partner[] = [
  { id: 'p1', name: 'شركة الرافدين للمقاولات' }, { id: 'p2', name: 'وكالة تويوتا - بغداد' }, { id: 'p3', name: 'شركة الخليج للسيارات' },
  { id: 'p4', name: 'Krones AG' }, { id: 'p5', name: 'Perkins Iraq' }, { id: 'p6', name: 'معرض الأثاث الحديث' },
  { id: 'p7', name: 'شركة الأفق للحاسبات' }, { id: 'p8', name: 'وكالة كيا العراق' }, { id: 'p9', name: 'شركة المعدات الحديثة' },
  { id: 'p10', name: 'Atlas Copco Iraq' }, { id: 'p11', name: 'شركة الفرات للتبريد' }, { id: 'p12', name: 'هيكفيجن العراق' },
  { id: 'p13', name: 'ZKTeco Iraq' }, { id: 'p14', name: 'Canon Iraq' }, { id: 'p15', name: 'شركة دجلة للإنشاءات' },
]

const costCenters: CostCenter[] = [
  { id: 'cc1', code: 'CC-01', name: 'الإدارة العامة' }, { id: 'cc2', code: 'CC-02', name: 'المالية' },
  { id: 'cc3', code: 'CC-03', name: 'تقنية المعلومات' }, { id: 'cc4', code: 'CC-04', name: 'الإنتاج' },
  { id: 'cc5', code: 'CC-05', name: 'المبيعات والتوزيع' }, { id: 'cc6', code: 'CC-06', name: 'الخدمات اللوجستية' },
]

// name, class, group, location, custodian, costCenter, partner, acquisition, original, salvage,
// legacy? [importedAccum, remainingLifeMonths], sourceDocRef, serial
type R = [string, string, string, string, string, string, string, string, number, number, [number, number] | null, string, string]
const rows: R[] = [
  ['مبنى المقر الرئيسي', 'c1', 'g1', 'l11', 'e1', 'cc1', 'p1', '2019-01-01', 1850000000, 185000000, [466200000, 216], '', 'BLD-HQ-01'],
  ['مستودع أبو غريب - هنكر رئيسي', 'c1', 'g3', 'l12', 'e5', 'cc6', 'p15', '2020-06-01', 640000000, 64000000, [126720000, 234], '', 'BLD-WH-01'],
  ['أرض معمل الزعفرانية', 'c6', 'g2', 'l13', 'e7', 'cc4', 'p1', '2018-03-01', 900000000, 0, [0, 0], '', 'LND-FAC-01'],
  ['خط تعبئة أوتوماتيكي Krones', 'c2', 'g2', 'l13', 'e7', 'cc4', 'p4', '2021-04-01', 310000000, 15500000, [165000000, 63], '', 'KR-MF-77821'],
  ['مولدة كهربائية 500 KVA', 'c2', 'g1', 'l11', 'e1', 'cc1', 'p5', '2020-01-01', 95000000, 4750000, [61000000, 48], '', 'PK-2506-1180'],
  ['شاحنة إيسوزو NPR', 'c3', 'g3', 'l12', 'e5', 'cc6', 'p3', '2022-09-01', 72000000, 7200000, [40000000, 20], '', 'JALC4B16'],
  ['باص نقل موظفين هيونداي كاونتي', 'c3', 'g1', 'l13', 'e7', 'cc4', 'p3', '2021-11-01', 55000000, 5500000, [44000000, 10], '', 'KMJHD17'],
  ['سيارة تويوتا هايلكس 2023', 'c3', 'g3', 'l12', 'e5', 'cc6', 'p2', '2023-03-01', 48500000, 4850000, [27000000, 26], '', 'MR0FA3CD'],
  ['مكاتب الطابق الثاني (12 مكتب)', 'c4', 'g1', 'l11', 'e4', 'cc1', 'p6', '2021-08-01', 21600000, 0, [11700000, 41], '', '—'],
  ['أثاث قاعة الاجتماعات', 'c4', 'g1', 'l11', 'e1', 'cc1', 'p6', '2022-02-01', 14500000, 0, [7100000, 49], '', '—'],
  ['آلة تصوير مستندات Canon IR-ADV', 'c4', 'g1', 'l21', 'e6', 'cc5', 'p14', '2021-03-01', 6500000, 0, [4000000, 23], '', 'CN-IRADV-5521'],
  ['منظومة شبكات وجدار ناري FortiGate', 'c5', 'g1', 'l11', 'e3', 'cc3', 'p7', '2023-10-01', 17200000, 0, [9000000, 21], '', 'FG100F-TK1902'],
  ['أجهزة حاسوب مكتبية HP (10 أجهزة)', 'c5', 'g1', 'l11', 'e2', 'cc2', 'p7', '2022-01-01', 9000000, 0, [8700000, 4], '', 'HP-400G7-LOT'],
  ['خادم Dell PowerEdge R750', 'c5', 'g1', 'l11', 'e3', 'cc3', 'p7', '2026-02-10', 24500000, 0, null, 'PB-2026-0041', 'DL-R750-8XK2'],
  ['أجهزة حاسوب محمولة Lenovo (15 جهاز)', 'c5', 'g1', 'l11', 'e3', 'cc3', 'p7', '2026-03-01', 33750000, 0, null, 'PB-2026-0057', 'LN-T14-LOT'],
  ['سيارة كيا سبورتاج 2026', 'c3', 'g1', 'l11', 'e1', 'cc1', 'p8', '2026-04-05', 39000000, 3900000, null, '', 'KNAPU81'],
  ['رافعة شوكية كهربائية Toyota 8FBE', 'c2', 'g3', 'l12', 'e5', 'cc6', 'p9', '2026-05-15', 26500000, 1325000, null, 'PB-2026-0088', 'TY-8FBE-3341'],
  ['مبنى ملحق فرع أربيل', 'c1', 'g3', 'l31', 'e6', 'cc5', 'p15', '2026-05-01', 420000000, 42000000, null, '', 'BLD-EBL-02'],
  ['أثاث فرع البصرة', 'c4', 'g3', 'l21', 'e6', 'cc5', 'p6', '2026-06-01', 9800000, 0, null, 'PB-2026-0095', '—'],
  ['ضاغطة هواء صناعية Atlas Copco GA37', 'c2', 'g2', 'l13', 'e7', 'cc4', 'p10', '2026-07-01', 18700000, 935000, null, 'PB-2026-0102', 'AC-GA37-7710'],
  ['أجهزة تكييف سبليت Gree (20 جهاز)', 'c4', 'g1', 'l11', 'e4', 'cc1', 'p11', '2026-03-20', 19000000, 0, null, '', 'GR-2T-LOT'],
  ['منظومة كاميرات مراقبة Hikvision', 'c4', 'g3', 'l12', 'e5', 'cc6', 'p12', '2026-08-01', 8900000, 0, null, 'PB-2026-0110', 'HK-NVR-6612'],
  ['شاشات عرض تفاعلية Samsung Flip', 'c4', 'g1', 'l11', 'e1', 'cc1', 'p7', '2026-10-01', 7600000, 0, null, 'PB-2026-0131', 'SM-FLIP-02'],
  ['جهاز بصمة دوام ZKTeco', 'c4', 'g1', 'l31', 'e4', 'cc1', 'p13', '2026-10-12', 1350000, 0, null, '', 'ZK-MB360-1'],
]

function buildAssets(): Asset[] {
  return rows.map(([name, cid, gid, loc, cust, cc, partner, acq, orig, salvage, legacy, src, serial], i) => {
    const c = classes.find((x) => x.id === cid)!
    return {
      id: `a${i + 1}`, code: `FA-${String(i + 1).padStart(6, '0')}`, name, description: '',
      classId: cid, groupId: gid, locationId: loc, custodianId: cust, serial, tagNumber: `TAG-${String(10240 + i * 7)}`,
      partnerId: partner, sourceDocRef: src, acquisitionDate: acq, depStartDate: legacy ? '2026-01-01' : acq,
      originalValue: orig, salvage, lifeMonths: legacy ? legacy[1] : c.lifeMonths, method: c.method, periodicity: c.periodicity,
      prorata: c.prorata, decliningFactor: c.decliningFactor, state: 'draft', isLegacy: !!legacy, importedAccum: legacy ? legacy[0] : 0,
      revaluationAdj: 0, costCenterId: cc, project: '',
    }
  })
}

export function seed(): DB {
  const db: DB = {
    classes, groups, locations, employees, partners, costCenters, accounts,
    assets: buildAssets(), lines: [], txs: [], runs: [], role: 'superadmin',
  }
  db.classes = structuredClone(classes)

  // Go-live 2026-01-01: legacy assets imported with their accumulated depreciation (plan §14 أ.8).
  db.assets.filter((a) => a.isLegacy).forEach((a) => {
    a.state = 'running'
    generateSchedule(db, a, db.classes.find((c) => c.id === a.classId)!)
    db.txs.push({
      id: `tx-l-${a.id}`, number: `AAJ-2026-${String(db.txs.length + 1).padStart(4, '0')}`, assetId: a.id, type: 'adjustment',
      date: '2026-01-01', amount: a.originalValue, fromValue: null, toValue: a.originalValue - a.importedAccum, journal: [],
      notes: `استيراد كرصيد افتتاحي — إهلاك سابق ${a.importedAccum.toLocaleString('en-US')}`, user: 'superadmin',
    })
  })

  const before: Record<number, ((d: DB) => void)[]> = {
    7: [(d) => dispose(d, 'a11', '2026-07-10', 'تلف وحدة الطباعة — شطب بقرار لجنة الجرد')],
    8: [(d) => sell(d, 'a7', '2026-08-20', 21000000, 'معرض السلام للسيارات', 'بيع بالمزايدة')],
    9: [
      (d) => pause(d, 'a5', '2026-09-01', 'عطل في المحرك — بانتظار قطع غيار'),
      (d) => transfer(d, 'a8', '2026-09-05', { locationId: 'l21', custodianId: 'e6', costCenterId: 'cc5' }, ''),
    ],
  }
  const after: Record<number, ((d: DB) => void)[]> = {
    6: [(d) => revalue(d, 'a1', '2026-06-30', bookValue(d, d.assets[0]) + 250000000, 'تقييم المكتب الاستشاري العراقي للعقارات')],
    7: [(d) => transfer(d, 'a10', '2026-07-20', { locationId: 'l21', custodianId: 'e6', costCenterId: 'cc1' }, '')],
  }

  for (let m = 1; m <= 9; m++) {
    const ym = `2026-${String(m).padStart(2, '0')}`
    db.assets.filter((a) => !a.isLegacy && a.state === 'draft' && a.acquisitionDate.slice(0, 7) === ym).forEach((a) => capitalize(db, a.id, a.acquisitionDate))
    before[m]?.forEach((f) => f(db))
    const r = createRun(db, ym, '', `دورة إهلاك شهر ${m}/2026`)
    postRun(db, r.id, monthEnd(ym))
    after[m]?.forEach((f) => f(db))
  }
  return db
}
