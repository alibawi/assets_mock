# وحدة إدارة الأصول الثابتة (Assets Management) في Enki — خطة التنفيذ

> **الحالة:** 🟡 مسودّة للمراجعة — لم يُكتب أي كود بعد. **المراجعة 2:** تسدّ سبع فجوات ظهرت في المراجعة — النقل بين مراكز الكلفة (§5.5)، إضافات آلة الحالات (§4.1)، ترتيب عكس الدورات وفحص التداخل (§3.8.1، §5.4)، أنواع الوثائق الناقصة (§3.10)، تعريفات التحاصص والدورية والتقريب (§5.1.1)، العمر المتبقي للأصل المستورد (§3.5، §5.1، أ.8)، وقيم سجل الأصول بتاريخ معيّن (§7.1). كما صُحِّح المثال أ.5 في الملحق. **المراجعة 3 (مقارنة SAP B1):** تضيف الإهلاك حتى تاريخ البيع/الاستبعاد، والإضافات اللاحقة، وتخفيض الاقتناء، والإهلاك اليدوي، وإعدادات الأصل وتحديد الحسابات لكل مجال، وأنواع الأصول (بما فيها منخفض القيمة)، وسطور الشراء بكمية N، وتقريرين جديدين (بطاقة الأصل، جدول الحركة) — مجمَّعة في §5.6 و§3.1.1–3.2.1 و§7.2–7.3.
> **النسخة الإنجليزية المقابلة:** [assets-management-module-plan-en.md](assets-management-module-plan-en.md) — نفس المحتوى، هذا الملف ترجمته العربية المرجعية.
> **مسودّة سابقة:** [assets-management-module-plan.md](assets-management-module-plan.md) — مسودّة عربية أقدم لنفس الوحدة، أُبقيت كما هي؛ هذا الملف هو المرجع اعتباراً من الآن لأنه مبنيّ على تحقّق مباشر من مصادر Odoo/OCA وكود Enki في نفس الجلسة.
> **يُقرأ مع:** [[planning-folder-convention]] · [[thin-appservice-cqrs-reference]] · [[feature-contracts-folder-structure]] · [[fiscal-year-period-category]] · [[localize-user-facing-messages]] · [[data-authority-query-convention]] · [[global-mapster-config-pattern]] · [[prefer-userfriendlyexception]] · [[entity-ctor-base-id]] · [[no-store-access-in-validators]] · [[primary-constructors-preference]] · [[report-manager-owns-query-logic]] · [[report-per-report-folder-structure]]

---

## 0. كيف تُصمِّم SAP B1 وOdoo هذه الوحدة فعلياً، وما الذي يتغيّر عند نقلها إلى Enki

تم التحقق من كلا النظامين المرجعيين مباشرةً لا من الذاكرة فقط:

- **Odoo / OCA `account_asset_management`** (تم التحقق من الكود المصدري على GitHub، `OCA/account-financial-tools@16.0`): مجموعة النماذج هي `account.asset.profile` (**القالب** المحاسبي — حسابات الأصل/الاندثار/المصروف/فائض القيمة/نقص القيمة/القيمة المتبقية، الدفتر اليومي، طريقة الحساب، العمر الإنتاجي، طول الفترة)، `account.asset` (سجل الأصل نفسه، يشير إلى قالب)، `account.asset.line` (سطر واحد لكل قسط إهلاك، بالإضافة إلى أسطر غير إهلاكية لإعادة التقييم/الاستبعاد)، و`account.asset.group` (تصنيف حرّ منفصل عن القالب المحاسبي). طرق الحساب هي `linear` (ثابت) و`linear-limit` و`degressive` (متناقص) و`degressive-linear` (متناقص ثم ثابت) و`degressive-limit`؛ والزمن يُحدَّد إما بـ«عدد السنوات» أو «عدد الأقساط»؛ وهناك خاصية `days_calc` للتحاصص بالأيام وخاصية `prorata` لقسط أول جزئي. تُرحَّل أسطر الإهلاك فردياً أو دفعةً واحدة عبر معالج (wizard) أو مهمة مجدولة (cron) — والملاحظة الجوهرية: السطر المُرحَّل **يُعكَس لا يُحذَف** عند الحاجة للتراجع عنه.
- **SAP Business One Fixed Assets** (الإصدار 9.0 فأعلى): البنية الموازية هي Asset Master Data (الأصل)، Asset Classes (القالب — نوع الاندثار، العمر الإنتاجي، تحديد الحسابات)، Depreciation Areas (يمكن تشغيل أكثر من «مجال» إهلاك واحد للأصل — مثل الدفاتر المحلية مقابل الضريبية — واختيار أيّها يُرحَّل إلى الأستاذ العام)، وAccount Determination (يربط فئة الأصل بحساب التكلفة الأصلية وحساب مجمّع الاندثار وحساب المصروف وحسابات أرباح/خسائر الاستبعاد). عمليات دورة الحياة هي الرسملة (Capitalization)، دورة الإهلاك المخطَّطة/غير المخطَّطة، التصحيح اليدوي للقيمة (إعادة التقييم)، النقل، والاستبعاد (بمقابل أو بلا مقابل) — ولكل منها نوع قيد خاص. كما يحتفظ SAP B1 بـ«توقّع إهلاك» شهري (Depreciation Forecast) يُظهر جدول السنة قبل أي ترحيل.

يلتقي النظامان في نفس الشكل الذي تحتاجه Enki: **طبقة قالب** (Profile/Class) تملك الإعداد المحاسبي، **سجل أصل** يرث منها ويمكن أن يتجاوزها، **جدول إهلاك مُولَّد** كبيانات فعلية لا مجرّد صيغة حساب، وفصل صارم بين **محاكاة** دورة الإهلاك و**ترحيلها**. هذا التقاطع هو أساس هذه الخطة. أما ما لا يُنقَل حرفياً:

| النمط المرجعي | الواقع في Enki | الأثر |
|---|---|---|
| `account_asset_id` علاقة FK (`Many2one`) إلى `account.account` | كل ترحيل في Enki يشير إلى حساب الأستاذ **برمز نصّي** — `JournalEntryPostLineDto.AccountCode` | فئة الأصل تخزّن **رموز** الحسابات (`[MaxLength(15)]`)، والتحقق من الصلاحية وقابلية الترحيل يقع في **معالج الأمر**، لا في قيد مرجعي على قاعدة البيانات |
| `journal_id` — Odoo يرحّل عبر دفتر يومية مُسمّى | لا يوجد كيان `Journal` في Enki؛ التصنيف عبر `DocumentType` + `DocumentNumbering` | لا حقل `journal_id`؛ بدلاً منه صفوف `DocumentType` مخصّصة (§3.10) |
| «دورة الإهلاك» في SAP مهمة خلفية بسجلّ أحداث | يجب أن يكون مقابلها في Enki **وثيقة** من الدرجة الأولى قابلة للاستعلام (`AssetDepreciationRun`)، لأن كل عملية دورية أخرى في هذا الكود (مثل `SalesRecurringTransactionGenerationJob`) تتّخذ هذا الشكل | المهمة المجدولة (Hangfire) تكتفي بـ«إنشاء وترحيل» الوثيقة؛ هي لا تكون مصدر الحقيقة بذاتها أبداً |
| قيد واحد لكل (فترة × دفتر × مركز كلفة) في معظم إعدادات SAP/Odoo | قيد Enki الواحد (`JournalEntry`) يحمل `CostCenterId` **على مستوى السطر**، لا في الرأس | قيد واحد لكل دورة إهلاك، أسطره مُجمّعة حسب (حساب المصروف، مركز الكلفة) |
| الحذف النهائي بعد الترحيل محظور كلياً في كلا النظامين المرجعيين | كل جذر تجميعي في Enki هو `FullAuditedAggregateRoot` (حذف ناعم) مع نمط عكس مُعتمَد (`IsReversal`) | الحذف بعد الترحيل يُرفض بـ`UserFriendlyException`؛ والتصحيح يتم بقيد عكسي، بما يطابق كيف تُصحَّح الأخطاء في بقية Enki |
| حقول `company_id` / تعدد الشركات | `MultiTenantAuditedAggregateRootWithUserAndOrgBase<Guid>` يوفّر أصلاً `TenantId` + `OrganizationId` | لا حقول إضافية؛ وكل استعلام قائمة يمرّ عبر `ApplyDataAuthority` |

---

## 1. الملخّص التنفيذي

**الهدف:** تغطية دورة حياة الأصل الثابت كاملة — الاقتناء، الرسملة، الإهلاك الدوري، إعادة التقييم، النقل، الإيقاف، البيع، الاستبعاد — مع ترحيل كل حدث عبر نقطة التكامل المعتمدة الوحيدة في Enki:

[`IJournalEntryIntegrationAppService.PostAsync(JournalEntryPostDto)`](../../../jasim_api/modules/core/src/Core.Application.Contracts/Integrations/IJournalEntryIntegrationAppService.cs)

**المبدأ الحاكم:** النظام لا يخزّن «القيمة الحالية للأصل» كحقل قابل للتعديل. يخزّن التكلفة الأصلية + جدول إهلاك **مُولَّد**، والقيمة الدفترية تُشتَقّ دائماً:

```
القيمة الدفترية = القيمة الأصلية − Σ(أسطر الإهلاك المُرحّلة) − الإهلاك المستورد (الأصول القديمة) ± تعديلات إعادة التقييم
```

**أكبر فجوة حالية في Enki — مُتحقَّق منها في الكود مباشرة، لا افتراضاً:**

- [`Item.IsFixedAsset`](../../../jasim_api/modules/inventory/src/Inventory.Domain/Entities/Items/Item.cs:257) (bool) راية تصنيف فقط — لا يوجد أي منطق إهلاك خلفها.
- `GeneralLedgerAccountType.AccumulatedDepreciation = 4` قيمة enum معرَّفة في [`FinanceSharedEnums.cs`](../../../jasim_api/modules/finance/src/Finance.Domain.Shared/Entities/FinanceSharedEnums.cs)، لكن **لا يوجد ولا حساب واحد في [`GeneralLedgerAccountSeedData.cs`](../../../jasim_api/modules/finance/src/Finance.Domain/Entities/GeneralLedgerAccounts/GeneralLedgerAccountSeedData.cs) مصنَّف بها فعلياً** — تم التأكد بالبحث المباشر في ملف الـ Seed.
- رموز أنواع الوثائق **222–229 غير مستخدمة** في [`DocumentType.cs`](../../../jasim_api/modules/core/src/Core.Domain.Shared/Entities/DocumentTypes/DocumentType.cs) (آخر رمزين مستخدمين: `220`/`221` للإنتاج؛ والرمز التالي المستخدم هو `500`) — الرموز `230`–`242` المقترحة أدناه آمنة.

---

## 2. الموقع المعماري

### 2.1 لماذا وحدة مستقلة لا جزء من Finance

| المعيار | الحكم |
|---|---|
| حجم النطاق | 10 كيانات + محرّك حساب + 7 تقارير + وثيقتا سير عمل — أكبر من أي شريحة قائمة داخل Finance |
| التبعيات | تحتاج `core` (منظمة، مركز كلفة، ترقيم، فترات) + `finance` (دليل الحسابات، الترحيل)، ولاحقاً `hr` (العهدة) و`procurement` (الرسملة من الفاتورة) — وهذا شكل تبعيات وحدة قائمة بذاتها |
| السابقة في المستودع | `manufacturing` آخر وحدة أُضيفت: 6 مشاريع، schema خاص، تبعية على `core` — تُنسَخ حرفياً هنا |
| قابلية التعطيل | schema مستقل ⇒ يمكن تعطيل الوحدة لمستأجر لا يحتاجها دون لمس Finance |

### 2.2 المشاريع الستة (نسخة طبق الأصل عن `modules/manufacturing`)

```
jasim_api/modules/assets/
├── Assets.abpmdl · Assets.sln · common.props
└── src/
    ├── Assets.Domain.Shared/         Enums, Localization/Assets/{ar,en}.json, AssetsResource
    ├── Assets.Domain/                Entities, Factories, IRepositories, Managers, JournalStrategies
    ├── Assets.Application.Contracts/ Entities/<Feature>/{Commands,Queries,Dtos} + *Permissions + I*AppService
    ├── Assets.Application/           Api/<Feature>/{Handlers/{Commands,Query},Validations,Managers} + *AppService
    ├── Assets.EntityFrameworkCore/   AssetsDbContext + Entities/<Feature>/{*ModelConfiguration,*Repository}
    └── Assets.HttpApi/               AssetsController فارغ (المسارات conventional)
```

### 2.3 نقاط الوصل الإلزامية بالمضيف

| الملف | التعديل |
|---|---|
| [`JasimERP.sln`](../../../jasim_api/JasimERP.sln) | إضافة المشاريع الستة |
| `src/JasimERP.{Domain,Domain.Shared,Application,Application.Contracts,EntityFrameworkCore,HttpApi}/*.csproj` | `ProjectReference` لكل طبقة مقابلة |
| [`JasimERPDomainModule.cs`](../../../jasim_api/src/JasimERP.Domain/JasimERPDomainModule.cs) | `typeof(AssetsDomainModule)` في `DependsOn` |
| [`JasimERPApplicationModule.cs`](../../../jasim_api/src/JasimERP.Application/JasimERPApplicationModule.cs) | `typeof(AssetsApplicationModule)` |
| [`JasimERPEntityFrameworkCoreModule.cs`](../../../jasim_api/src/JasimERP.EntityFrameworkCore/EntityFrameworkCore/JasimERPEntityFrameworkCoreModule.cs) | `typeof(AssetsEntityFrameworkCoreModule)` |
| [`JasimERPDbContext.cs`](../../../jasim_api/src/JasimERP.EntityFrameworkCore/EntityFrameworkCore/JasimERPDbContext.cs) | `builder.ConfigureAssets();` بعد `ConfigureFinance()` |
| [`JasimERPHttpApiHostModule.cs`](../../../jasim_api/src/JasimERP.HttpApi.Host/JasimERPHttpApiHostModule.cs) (Conventional Controllers) | `options.ConventionalControllers.Create(typeof(AssetsApplicationModule).Assembly, s => { s.RootPath = "assets"; });` |
| نفس الملف، `ConfigureRecurringJobs()` | تسجيل `AssetDepreciationRunJob` |

> **الهجرات:** لا مجلد Migrations داخل الوحدة. كل الهجرات تُولَّد على مشروع المضيف [`src/JasimERP.EntityFrameworkCore/Migrations`](../../../jasim_api/src/JasimERP.EntityFrameworkCore/Migrations) مقابل `JasimERPDbContext`، تماماً كبقية الوحدات.

---

## 3. نموذج البيانات

### قواعد عامة تسري على كل الجداول

- الجذور التجميعية ترث `MultiTenantAuditedAggregateRootWithUserAndOrgBase<Guid>` من [`Core.Bases.EntityBase`](../../../jasim_api/modules/core/src/Core.Domain/Bases/EntityBase.cs) ⇒ `TenantId` + `OrganizationId` + حذف ناعم + تدقيق كامل، مجاناً.
- المُنشئ يمرّر المعرّف عبر `: base(id)` ولا يكتب `Id = id;` في الجسم — [[entity-ctor-base-id]].
- كل `decimal` يُخزَّن `decimal(19,6)` تلقائياً من [`BaseDbContext.cs`](../../../jasim_api/modules/core/src/Core.EntityFrameworkCore/EntityFrameworkCore/BaseDbContext.cs) — لا حاجة لـ `HasPrecision` إلا للنِسَب المئوية `(5,2)`.
- كل جدول في schema `Assets` عبر `builder.ToTable("X", AssetsDbProperties.DbSchema)` + `ConfigureByConvention()`.
- رموز الحسابات: `[MaxLength(15)]` مطابقةً لـ `GeneralLedgerAccount.AcctCode`.

### 3.1 `AssetClass` — فئة الأصل / القالب المحاسبي (≈ Asset Class في SAP و`account.asset.profile` في Odoo)

| الحقل | النوع | ملاحظات |
|---|---|---|
| `Code` | string(20) | فريد ضمن `OrganizationId` + `TenantId` |
| `Name` / `ForeignName` | string(100) | |
| `DepreciationMethod` | enum | `StraightLine` / `DecliningBalance` / `DecliningThenStraight` / `None` |
| `UsefulLifeMonths` | int | |
| `DecliningFactor` | decimal? | للمتناقص فقط |
| `Periodicity` | enum | `Monthly` / `Quarterly` / `Yearly` |
| `ProrataMethod` | enum | `None` / `ConstantPeriods` / `ByDays` |
| `AssetAcctCode` | string(15) | حساب الأصل (التكلفة الأصلية) — مثال `1100000003` لوسائط النقل |
| `AccumDeprAcctCode` | string(15) | حساب مجمّع الاندثار — **غير موجود في الدليل المزروع حالياً، انظر §3.9** |
| `DeprExpenseAcctCode` | string(15) | حساب مصروف الاندثار — مثال `3700000003` |
| `GainOnDisposalAcctCode` | string(15) | |
| `LossOnDisposalAcctCode` | string(15) | |
| `RevaluationSurplusAcctCode` | string(15)? | حساب حقوق ملكية لفائض إعادة التقييم بالزيادة |
| `AssetKind` | enum | `Tangible` / `Intangible` / `Land` / `LowValue` (§5.6.5). `Land` تفرض `IsDepreciable = false`؛ و`Intangible` تُسمّى «إطفاء» في الواجهة والتقارير لكنها بنفس الحسابات والمحرّك |
| `IsDepreciable` | bool | `false` للأراضي |
| `IsActive` | bool | |

> **قاعدة إلزامية:** يُرفض إنشاء/تعديل فئة يكون فيها أحد الحسابات المطلوبة فارغاً أو غير موجود أو `Postable == false`. يقع هذا التحقق في `AssetClassCreateCommandHandler` عبر `IGeneralLedgerAccountRepository` — **وليس في الـ Validator أبداً** ([[no-store-access-in-validators]]) — ويُرمى `UserFriendlyException` برسالة من `IStringLocalizer<AssetsResource>`.

### 3.1.1 `AssetClassAreaAccounts` — تحديد الحسابات لكل (فئة × مجال)

SAP B1 يحدّد الحسابات لكل فئة **ولكل** مجال إهلاك؛ ووجود مجموعة حسابات واحدة على الفئة (كما في Odoo) سيفرض هجرة يوم يظهر مجال ثانٍ. لذلك تقيم رموز الحسابات الستة في §3.1 (`AssetAcctCode` و`AccumDeprAcctCode` و`DeprExpenseAcctCode` و`GainOnDisposalAcctCode` و`LossOnDisposalAcctCode` و`RevaluationSurplusAcctCode?`) فعلياً في هذا الجدول: `ClassId` · `AreaId` · الرموز الستة، و`UNIQUE(ClassId, AreaId)`.

- شاشة الفئة تحرّر صف **المجال الافتراضي**، فلا يرى مستخدمو المراحل 1–4 الجدول أصلاً.
- الصف مطلوب فقط للمجالات ذات `PostsToGl = true`؛ وقاعدة الاكتمال وقابلية الترحيل في §3.1 تسري على كل صف. المجالات غير المرحَّلة لا تحتاج حسابات: دوراتها تعلّم الأسطر مُرحَّلة بلا قيد (§5.6.8).
- الدورات والاستراتيجيات تقرأ الحسابات بمجال الدورة (§5.4).

### 3.2 `DepreciationArea` — مجال الإهلاك (مفهوم SAP؛ Odoo القياسي لا يملك مقابلاً له — انظر §12.2)

يُنشأ الجدول من اليوم الأول ويُزرع فيه صف واحد `01 — Local GAAP` (`PostsToGl = true`, `IsDefault = true`)، وتبقى واجهته مخفية حتى المرحلة 5.

الحقول: `Code` string(2) · `Name` string(100) · `PostsToGl` bool · `IsDefault` bool · `IsActive` bool.

#### 3.2.1 `AssetAreaSetting` — إعدادات الأصل لكل مجال

SAP يحفظ الطريقة والعمر وتاريخ البدء لكل أصل *ولكل مجال*. وجدول الإهلاك (`AssetDepreciationLine`) يحمل أصلاً `DepreciationAreaId`، فيجب أن تحمله الإعدادات أيضاً:

`AssetId` · `AreaId` · `DepreciationMethod` · `UsefulLifeMonths` · `DecliningFactor?` · `Periodicity` · `ProrataMethod` · `SalvageValue` · `DepreciationStartDate` · `ImportedAccumulatedDepreciation` · `RemainingLifeMonthsAtImport?` — و`UNIQUE(AssetId, AreaId)`.

- `Capitalize` ينشئ صف المجال الافتراضي من افتراضيات الفئة (مع أي تجاوز على الأصل). والمولّد (§5.1) وكل قاعدة تذكر هذه الحقول تقرأ الصف **للمجال الجاري توليده**.
- الأعمدة المماثلة الاسم في `Asset` (§3.5) نسخ قراءة مُكرَّرة (denormalized) من صف المجال الافتراضي، لا يكتبها إلا `AssetStateManager`، وتُبقى لتصفية القوائم والتقارير.
- تبقى `OriginalValue` واحدة عبر المجالات في v1 (المجالات تختلف في الطريقة والعمر والتخريدية وتاريخ البدء فقط). والمرحلة 5 تضيف الواجهة وصف المجال الثاني فقط.

### 3.3 `AssetLocation` — الموقع (شجرة)

`Code`, `Name`, `ParentId` (FK ذاتي، `DeleteBehavior.Restrict`), `Levels` int, `IsActive` — نفس أسلوب التشجير المتَّبع في `GeneralLedgerAccount` (`FatherNum` + `Levels`) لكن بمعرّف Guid لأن لا حاجة لرمز هرمي هنا.

### 3.4 `AssetGroup` — مجموعة تنظيمية حرّة (≈ `account.asset.group` في Odoo)

`Code`, `Name`, `IsActive`. مستقلة عن الفئة المحاسبية؛ للتصفية والتقارير فقط.

### 3.5 `Asset` — السجل الرئيسي (جذر تجميعي)

| الحقل | النوع | ملاحظات |
|---|---|---|
| `AssetCode` | string(25) | من `DocumentNumberingManager.GenerateNumberAsync("Assets", "FA")` |
| `Name` / `Description` | string | |
| `AssetClassId` | Guid FK | إعداداته تُنسَخ لا تُشار إليها لحظة الإنشاء |
| `AssetGroupId` / `LocationId` | Guid? FK | |
| `CustodianEmployeeId` | Guid? | يشير إلى `HR.Employee` — **بلا FK عبر الوحدات**، يُثرى على القراءة |
| `ItemId` | Guid? | ربط اختياري بصنف `Item.IsFixedAsset == true` |
| `SerialNumber` / `TagNumber` | string(50) | `TagNumber` فريد جزئياً (`WHERE TagNumber IS NOT NULL`) |
| `PartnerId` | Guid? | المورّد — `Core.BusinessPartner` |
| `SourceDocLineId` / `SourceLineSequence` | Guid? / int? | سطر فاتورة الشراء وترتيبه 1..N داخله (§5.6.6)؛ و`UNIQUE(SourceDocType, SourceDocLineId, SourceLineSequence) WHERE SourceDocLineId IS NOT NULL` يجعل مستمع الفاتورة idempotent |
| `SourceDocType` / `SourceDocId` / `SourceDocRef` | string / Guid? / string | مرجع وثيقة الشراء الأصلية، بنفس اصطلاح `BaseType`/`BaseEntry`/`BaseRef` في `JournalEntryPostDto` |
| `AcquisitionDate` | DateTime | |
| `DepreciationStartDate` | DateTime | تاريخ دخول الخدمة |
| `OriginalValue` | decimal | التكلفة الأصلية (APC) |
| `SalvageValue` | decimal | |
| `DepreciationBase` | decimal | مُخزَّن، ويُحتسب = `OriginalValue − SalvageValue` |
| `UsefulLifeMonths` / `DepreciationMethod` / `Periodicity` / `ProrataMethod` | | مُورَّثة من الفئة وقابلة للتجاوز على مستوى الأصل؛ نسخة مُكرَّرة من `AssetAreaSetting` للمجال الافتراضي (§3.2.1) |
| `CapitalizationDate` | DateTime? | يُعيَّن عند `Capitalize` (= `ImportCutoffDate` للأصل القديم)؛ يحدّد دخول الأصل في سجل الأصول بتاريخ معيّن (§7.1) |
| `State` | enum | `Draft` / `Running` / `Paused` / `Closed` / `Sold` / `Disposed` / `Cancelled` (انظر §4.1) |
| `IsLegacy` | bool | مستورد كرصيد افتتاحي |
| `ImportedAccumulatedDepreciation` | decimal | إهلاك ما قبل دخول النظام، كما في `ImportCutoffDate` |
| `ImportCutoffDate` | DateTime? | للأصل القديم فقط: تاريخ بدء التشغيل. **يجب أن يكون نهاية فترة** (§5.1.1)؛ ويقع أول قسط في Enki في الفترة التالية |
| `RemainingLifeMonthsAtImport` | int? | للأصل القديم فقط، **إلزامي**: الأشهر المتبقية من العمر الإنتاجي عند تاريخ القطع. تقترح شاشة الاستيراد قيمة افتراضية `UsefulLifeMonths − الأشهر(DepreciationStartDate → ImportCutoffDate)` (حدّها الأدنى 0) ويمكن للمستخدم تجاوزها لأن النظام السابق قد يكون عدّل التقدير. يجب أن تكون من مضاعفات `monthsPerPeriod` |
| `CurrencyCode` | string(3) | v1: عملة النظام فقط (§12.2) |
| `CostCenterId` / `ProjectId` | Guid? | القيمة **الحالية**، تُمرَّر إلى سطر قيد الإهلاك؛ والتاريخ الفعلي للتغييرات في `AssetTransaction` (§5.5) |
| `FiscalPeriodId` | Guid? | `Core.PostingPeriod` لحظة الرسملة |

**القيمة الدفترية غير مخزَّنة أبداً.** تُحتسب في طبقة القراءة (`AssetGetByIdQueryHandler` / `AssetsRegisterReportManager`).

**الفهارس:** `(AssetCode, OrganizationId, TenantId) UNIQUE` · `(State)` · `(AssetClassId)` · `(LocationId)` · `(CustodianEmployeeId)` · `(TagNumber) UNIQUE FILTERED`.

### 3.6 `AssetDepreciationLine` — جدول الإهلاك (≈ `account.asset.line`)

`AssetId` (cascade) · `DepreciationAreaId` · `Sequence` int · `LineDate` date · `LineType` enum (`Depreciation` / `Manual` / `ToDate` / `Revaluation` / `Removal`) — `Manual` و`ToDate` يُنشآن مُرحَّلين أصلاً بحدثيهما (§5.6.1، §5.6.4) ولا يولّدهما المولّد أبداً · `Days` int? · `Amount` · `AccumulatedAmount` · `RemainingValue` · `IsPosted` bool · `DepreciationRunId` Guid? · `JournalEntryId` Guid? · `PostedAt` / `PostedBy`.

قيد فريد: `UNIQUE(AssetId, DepreciationAreaId, Sequence)`. فهارس تشغيلية: `(IsPosted, LineDate)` — المُستعلَم في كل دورة إهلاك — و`(AssetId, IsPosted, LineDate)` INCLUDE `Amount` — يستخدمه سجل الأصول بتاريخ معيّن (§7.1).

> **القاعدة الحرجة:** عند إعادة توليد الجدول (إعادة تقييم، تعديل عمر إنتاجي، استئناف) تُحذف **الأسطر غير المُرحّلة فقط** وتُعاد الحسبة من القيمة المتبقية الحالية. السطر المُرحّل لا يُمَسّ إطلاقاً — وهو ما يطابق موقف OCA («يُعكس لا يُحذف») من الأسطر المُرحّلة.

### 3.7 `AssetTransaction` — سجل الأحداث

`AssetId` · `TransactionType` enum (`Capitalization` / `CapitalizationReversal` / `OpeningBalance` / `Addition` / `AcquisitionReduction` / `ManualDepreciation` / `Revaluation` / `Impairment` / `Transfer` / `CostCenterTransfer` / `Pause` / `Resume` / `Sale` / `SaleReversal` / `Disposal` / `DisposalReversal` / `Adjustment`) · `TransactionDate` · `Amount` · `FromValue` / `ToValue` · `FromLocationId` / `ToLocationId` · `FromCustodianId` / `ToCustodianId` · `FromCostCenterId` / `ToCostCenterId` · `FromProjectId` / `ToProjectId` · `FromState` / `ToState` · `AccumulatedAtEvent` decimal? (مجمّع الاندثار عند `Sale`/`Disposal`، مجمَّد ليستغني جدول الحركة §7.3 عن إعادة الحساب) · `ReversedTransactionId` Guid? · `IsReversed` bool · `JournalEntryId` Guid? · `PostingPeriodId` · `Notes`.

- **`TransactionDate` هو التاريخ الفعلي** للحدث لا تاريخ الإدخال (وقت الإدخال موجود أصلاً في أعمدة التدقيق). يجوز تأريخه بأثر رجعي داخل فترة محاسبية مفتوحة فقط، وليس قبل آخر سطر إهلاك مُرحَّل (§5.5).
- `FromState` / `ToState` يتيحان للعكس استعادة الحالة السابقة بدقة (§4.1).
- العكس لا يعدّل الصف الأصلي أبداً: يُضاف صف `*Reversal` يشير إليه عبر `ReversedTransactionId` ويُضبط `IsReversed = true` على الأصلي. كل حسابات «بتاريخ معيّن» (§7.1) تتجاهل الصفوف ذات `IsReversed = true`.
- فهرس `(AssetId, TransactionDate)` — يستخدمه سجل الأصول بتاريخ معيّن.

هذا هو الكائن الذي تستهلكه استراتيجيات الترحيل (§5.2).

### 3.8 `AssetDepreciationRun` + `AssetDepreciationRunLine` — وثيقة دورة الإهلاك

الفرق الجوهري عن كلا النظامين المرجعيين: دورة الإهلاك الدورية في Enki **وثيقة**، لا أثر جانبي لمهمة مجدولة.

| `AssetDepreciationRun` | |
|---|---|
| `RunNumber` string(25) | من `DocumentNumberingManager` بالبادئة `DPR` |
| `PeriodStart` date · `PeriodEnd` date · `PostingPeriodId` Guid | الفترة المحاسبية المستهدفة — الدورة = فترة واحدة بالضبط |
| `DepreciationAreaId` · `AssetClassId?` | نطاق التشغيل (الكل أو فئة بعينها) |
| `Status` enum | `Draft` (محاكاة) / `Posted` / `Reversed` |
| `TotalAmount` decimal · `AssetCount` int | |
| `JournalEntryId` Guid? | قيد الدورة الواحد |

`AssetDepreciationRunLine`: `RunId` · `AssetId` · `DepreciationLineId` · `Amount` · `DeprExpenseAcctCode` · `AccumDeprAcctCode` · `CostCenterId?`.

فهرس فريد مُرشَّح على `(PostingPeriodId, DepreciationAreaId, AssetClassId) WHERE Status = Posted` — هذا هو حاجز الـ Idempotency على مستوى قاعدة البيانات، إضافةً إلى فحص `IsPosted` على مستوى السطر. الدورة `Reversed` لا تشغل الخانة، فيمكن إعادة تشغيل الفترة بعد العكس، وتبقى الدورة المعكوسة سجلاً تاريخياً.

#### 3.8.1 قواعد الترتيب والتداخل

**نطاق** الدورة هو `(DepreciationAreaId, AssetClassId?)` حيث `AssetClassId = null` تعني كل الفئات. الفهرس الفريد وحده لا يعبّر عن التداخل (`null` مقابل فئة محدّدة)، لذلك يفرض المعالج القواعد التالية عند `simulate` **وعند** `post` مرة ثانية، تحت قفل موزَّع من ABP مفتاحه `(TenantId, DepreciationAreaId)`:

1. **لا تداخل.** لا يجوز لدورتين غير معكوستين استهداف نفس `PostingPeriodId` بنطاقين متداخلين. في نفس المجال: «كل الفئات» تتداخل مع أي دورة لفئة محدّدة؛ وفئتان مختلفتان لا تتداخلان. وبحدّ أقصى `Draft` واحد لكل فترة ونطاق.
2. **لا فجوات.** يُرحَّل سطر الفترة P فقط إذا لم يوجد في نطاقه سطر مستحق غير مُرحَّل بـ `LineDate` قبل `PeriodStart`. تدارك الأشهر الفائتة يكون بدورة لكل شهر، الأقدم أولاً؛ والمهمة المجدولة (§5.4) تفعل ذلك تماماً.
3. **العكس بترتيب معاكس (LIFO).** لا يُعكس `Posted` إلا إذا لم توجد دورة `Posted` بـ `PeriodEnd` أحدث في نطاق متداخل. وإلا: `Assets:ReverseLaterRunsFirst` مع تسمية الدورة المانعة.
4. **لا عكس تحت أحداث تابعة.** لا تُعكس دورة إذا كان لأي أصل فيها `Revaluation` أو `Impairment` أو `Addition` أو `AcquisitionReduction` أو `ManualDepreciation` أو `Sale` أو `Disposal` أو `Adjustment` يغيّر العمر الإنتاجي، غير معكوس، بـ `TransactionDate > PeriodEnd` — لأن هذه الأحداث حُسبت فوق أسطر الدورة المُرحَّلة. يعكسها المستخدم أولاً.
5. **فترة مفتوحة.** الترحيل والعكس كلاهما يشترطان أن تكون `PostingPeriod` المستهدفة مفتوحة (§5.4).

### 3.9 فجوة دليل الحسابات — مهمة مسبقة إلزامية

[`GeneralLedgerAccountSeedData.cs`](../../../jasim_api/modules/finance/src/Finance.Domain/Entities/GeneralLedgerAccounts/GeneralLedgerAccountSeedData.cs) يحتوي اليوم:

- ✅ الموجودات الثابتة `1100000000` وأبناؤها: `…01` مباني · `…02` آلات ومعدات · `…03` وسائط نقل · `…04` أثاث وأجهزة مكتب · `…06` خطوط كهرباء وهاتف · `…08` نفقات تأسيس.
- ✅ الاندثار (مصروف) `3700000000` وأبناؤه: `…01` مباني وإنشاءات وطرق · `…02` آلات ومعدات · `…03` وسائل نقل وانتقال · `…04` أثاث وأجهزة مكاتب · `…05` إطفاء نفقات إيرادية مؤجلة.
- ❌ **لا يوجد ولا حساب واحد لمجمّع الاندثار** (حساب مقابل دائن تحت الموجودات الثابتة)، ولا حساب أرباح/خسائر بيع أصول — تم التأكد بالبحث المباشر في ملف الـ Seed.

**المطلوب في المرحلة 1 قبل أي شيء آخر:** إضافة إلى الـ Seed:

| الرمز المقترح | الاسم | النوع |
|---|---|---|
| `1190000000` | مجمّع الاندثار | أب غير قابل للترحيل، `AcctType = AccumulatedDepreciation` |
| `1190000001..04` | مجمّع اندثار مباني / آلات ومعدات / وسائط نقل / أثاث وأجهزة مكتب | قابلة للترحيل، `BalDirect = Credit` |
| `4xxxxxxxxx` | أرباح بيع موجودات ثابتة | إيراد |
| `3xxxxxxxxx` | خسائر بيع واستبعاد موجودات ثابتة | مصروف |

> الأرقام النهائية يعتمدها المحاسب قبل كتابة الـ Seed — لا تُخترع في الكود (§12، القرار المفتوح رقم 1).

### 3.10 أنواع الوثائق الجديدة

تُضاف إلى [`DocumentTypeData`](../../../jasim_api/modules/core/src/Core.Domain.Shared/Entities/DocumentTypes/DocumentType.cs) — الرموز `230`–`242` مؤكَّد أنها غير مستخدمة (ثلاثة عشر نوعاً):

```csharp
public static readonly DocumentType FixedAsset           = new("Fixed Asset",            "230", "FA",  "Fixed Asset");
public static readonly DocumentType AssetCapitalization  = new("Asset Capitalization",   "231", "ACP", "Asset Capitalization");
public static readonly DocumentType AssetDepreciationRun = new("Asset Depreciation Run", "232", "DPR", "Asset Depreciation Run");
public static readonly DocumentType AssetRevaluation     = new("Asset Revaluation",      "233", "ARV", "Asset Revaluation");
public static readonly DocumentType AssetTransfer        = new("Asset Transfer",         "234", "ATR", "Asset Transfer");
public static readonly DocumentType AssetDisposal        = new("Asset Disposal",         "235", "ADS", "Asset Disposal");
public static readonly DocumentType AssetSale            = new("Asset Sale",             "236", "ASL", "Asset Sale");
public static readonly DocumentType AssetCostCenterTransfer = new("Asset Cost Center Transfer", "237", "ACC", "Asset Cost Center Transfer");
public static readonly DocumentType AssetImpairment      = new("Asset Impairment",       "238", "AIM", "Asset Impairment");
public static readonly DocumentType AssetOpeningBalance  = new("Asset Opening Balance",  "239", "AOB", "Asset Opening Balance");
public static readonly DocumentType AssetAddition        = new("Asset Addition",         "240", "AAD", "Asset Addition");
public static readonly DocumentType AssetAcquisitionReduction = new("Asset Acquisition Reduction", "241", "ACR", "Asset Acquisition Reduction");
public static readonly DocumentType AssetManualDepreciation = new("Asset Manual Depreciation", "242", "AMD", "Asset Manual Depreciation");
```

لكل منها صف في `DocumentNumbering` (`ModuleName = "Assets"`) وإضافة إلى `_documentTypesByCode`.

**أي حدث يستخدم أي نوع** (العكس يعيد استخدام النوع الأصلي مع `IsReversal = true` وفق اصطلاح Enki — لا أنواع «عكس» منفصلة):

| الحدث / `TransactionType` | نوع الوثيقة | قيد يومية؟ |
|---|---|---|
| سجل الأصل نفسه | `230` | لا |
| `Capitalization` / `CapitalizationReversal` | `231` | فقط إذا رحّلت الوحدة الرسملة (§12.3) |
| دورة الإهلاك وعكسها | `232` | نعم |
| `Revaluation` (بالزيادة) | `233` | نعم |
| `Transfer` (موقع / عهدة) | `234` | لا — رقم فقط للتتبّع |
| `Disposal` / `DisposalReversal` | `235` | نعم |
| `Sale` / `SaleReversal` | `236` | نعم |
| `CostCenterTransfer` | `237` | فقط لإعادة التصنيف الاختيارية لمصروف السنة حتى تاريخه (§5.5، §12.6) |
| `Impairment` (إعادة تقييم بالنقص) | `238` | نعم |
| `OpeningBalance` (دفعة استيراد الأصول القديمة) | `239` | لا — الأرصدة الافتتاحية للأستاذ تأتي من عمليتها الخاصة؛ هذه الدفعة مرساة التتبّع وسجل تدقيق الاستيراد |
| `Addition` (إضافة لاحقة، §5.6.2) | `240` | فقط إذا رحّلتها الوحدة (§12.3)؛ لا قيد حين رحّلت فاتورة الشراء التكلفة |
| `AcquisitionReduction` (مذكرة دائن على الرسملة، §5.6.3) | `241` | فقط إذا رحّلتها الوحدة (§12.3)؛ لا قيد حين تُرحَّل مذكرة دائن المشتريات بذاتها |
| `ManualDepreciation` (§5.6.4) | `242` | نعم |
| `Pause` / `Resume` / `Adjustment` / الإلغاء | لا يوجد | لا — يُسجَّل في `AssetTransaction` فقط |

---

## 4. آلة الحالات

```
                  ┌──────────┐
                  │  Draft   │  ← إنشاء يدوي / من فاتورة مشتريات
                  └────┬─────┘
                       │ Capitalize  (توليد الجدول + قيد الرسملة عند الاقتضاء)
                       ▼
     ┌───────────► ┌──────────┐ ◄──── Resume
     │             │ Running  │
     │  Pause      └────┬─────┘
     │                  ├─── Revaluate ──► Running (إعادة توليد غير المُرحّل)
  ┌──┴────┐             ├─── Transfer ───► Running (بلا مساس بالجدول)
  │Paused │             │
  └───────┘             ├─── Sell ──────► Sold
                        ├─── Dispose ───► Disposed
                        │ آخر قسط مُرحّل
                        ▼
                     Closed
```

المخطط يُظهر المسار الأساسي فقط؛ أما المجموعة الكاملة للانتقالات، بما فيها كل الحركات الرجعية والحالة `Cancelled`، فهي المصفوفة في §4.1.

### 4.1 مصفوفة الانتقالات الكاملة

| من | الإجراء | إلى | الشروط |
|---|---|---|---|
| `Draft` | `Capitalize` | `Running` | القاعدة 1 أدناه |
| `Draft` | `Cancel` | `Cancelled` | بلا قيود يومية؛ حالة نهائية؛ لا يُعاد استخدام `AssetCode`؛ يبقى السجل للتدقيق. بديل الحذف الفعلي للأصول التي سبق أن أُشير إليها |
| `Running` | `UndoCapitalization` | `Draft` | لا سطر مُرحَّل ولا `Revaluation`/`Impairment`؛ يعكس قيد الرسملة إن رحّلته الوحدة (`IsReversal`، بنفس التاريخ، فترة مفتوحة)؛ يحذف الجدول حذفاً ناعماً |
| `Running` | `Pause` | `Paused` | — |
| `Paused` | `Resume` | `Running` | يعيد التوليد من تاريخ الاستئناف؛ **الإيقاف لا يستهلك العمر الإنتاجي** — `periodsLeft` بلا تغيير وأول قسط بعد الاستئناف كامل (لا تحاصص عند الاستئناف تجنباً لحسابات فترات كسرية) |
| `Running` / `Paused` | `Revaluate` / `Impair` / `AddCost` / `ReduceCost` / `ManualDepreciation` / `Transfer` / `CostCenterTransfer` | نفس الحالة | `Transfer` (موقع/عهدة) مسموح أيضاً على `Closed`؛ ولا شيء منها مسموح على `Sold`/`Disposed`/`Cancelled` |
| `Running` | (تلقائي، ترحيل آخر سطر) | `Closed` | حركة `Adjustment` |
| `Closed` | (تلقائي، عكس دورة يُلغي ترحيل سطر) | `Running` | — |
| `Closed` | `Revaluate` بالزيادة / `AddCost` / تغيير تقدير | `Running` | فقط إذا بقيت قيمة قابلة للإهلاك `> 0`؛ يولّد جدولاً جديداً |
| `Running` / `Paused` / `Closed` | `Sell` / `Dispose` | `Sold` / `Disposed` | **أولاً** يشترط ترحيل كل الفترات السابقة (`Assets:PostDepreciationFirst`)، **ثم** يرحّل الإهلاك حتى تاريخ الإخراج كسطر `ToDate` (§5.6.1)، ويلغي بقية الأسطر غير المُرحّلة (حذف ناعم)، ويرحّل قيد الإغلاق؛ يسجّل `FromState` و`AccumulatedAtEvent`. دائماً للأصل كاملاً — الاستبعاد الجزئي خارج v1 (§5.6.7) |
| `Sold` / `Disposed` | `ReverseSale` / `ReverseDisposal` | `FromState` للحركة الأصلية | قيد `IsReversal` **بتاريخ البيع الأصلي**، فترة مفتوحة؛ وإن كان البيع مرتبطاً بفاتورة عميل (`SourceDocId`) فيجب إلغاء الفاتورة أولاً؛ الجدول المُستعاد يُعاد توليده لا يُسترجع من المحذوفات |
| `Sold` / `Disposed` / `Cancelled` | أي إجراء آخر | — | مرفوض: حالة نهائية |

الحركات الرجعية ممكنة فقط عبر إجراء عكس صريح يُبقي الصف الأصلي والصف العاكس معاً في `AssetTransaction`؛ لا تُكتب فوق أي حالة بصمت.

**قواعد الانتقال المُنفَّذة في `AssetStateManager` (Domain Service):**

1. `Draft → Running` يشترط: فئة محدّدة، `OriginalValue > 0`، `SalvageValue < OriginalValue`، `DepreciationStartDate` غير فارغ، حسابات الفئة مكتملة وقابلة للترحيل، والفترة المحاسبية لتاريخ البدء غير مقفلة.
2. `DeleteAsync` مسموح فقط في `Draft` مع `IsLegacy == false` وبلا أي `AssetDepreciationLine.IsPosted == true` وبلا أي صف في `AssetTransaction`؛ خلاف ذلك `UserFriendlyException("Assets:CannotDeletePostedAsset")` — ويُستخدم `Cancel` بدلاً منه.
3. `Sold` / `Disposed` يلغيان كل أسطر الإهلاك غير المُرحّلة (حذف ناعم) وينشئان قيد الإغلاق.
4. `Paused` يوقف التقاط الأصل في دورات الإهلاك ولا يُعدّل الأسطر الموجودة؛ `Resume` يعيد التوليد من تاريخ الاستئناف.
5. لا انتقال يتم خارج معالج أمر (`*CommandHandler`) — الـ AppService وسيط `mediator.Send` نحيف حصراً ([[thin-appservice-cqrs-reference]]).

---

## 5. محرّك الإهلاك والترحيل

### 5.1 `DepreciationScheduleGenerator` (Domain Service, primary constructor)

```
GenerateAsync(asset, area, cancellationToken):
    1. احذف (soft) الأسطر حيث IsPosted == false
    2. postedTotal  = Σ(posted.Amount) + asset.ImportedAccumulatedDepreciation
       remaining    = asset.DepreciationBase − postedTotal
       startDate    = lastPostedDate ?? (asset.IsLegacy ? nextPeriodStart(asset.ImportCutoffDate)
                                                         : asset.DepreciationStartDate)
       plannedLife  = asset.IsLegacy ? asset.RemainingLifeMonthsAtImport : asset.UsefulLifeMonths
       periodsLeft  = (plannedLife / monthsPerPeriod) − postedCount   // postedCount = الأسطر المُرحّلة في Enki فقط
       firstFraction = (postedCount == 0 && !asset.IsLegacy) ? ProrataFraction(startDate, period) : 1   // §5.1.1
       // عند firstFraction < 1 يصبح الجدول periodsLeft + 1 سطراً (قسط أول جزئي + سطر إتمام)
    3. if (!class.IsDepreciable || remaining <= 0 || periodsLeft <= 0) return []
    4. for i in 1..periodsLeft (+1 عند firstFraction < 1):
           amount = ComputeByMethod(method, remaining, periodsLeft, i, i == 1 ? firstFraction : 1)
           amount = Math.Round(amount, currencyDecimals, MidpointRounding.AwayFromZero)
           if (i == periodsLeft) amount = remaining        // كل فرق التقريب على القسط الأخير
           lines.Add(...); remaining -= amount
    5. Assert: Σ(lines.Amount) == asset.DepreciationBase − postedTotal
```

**الطرق:**

- `StraightLine`: `DepreciationBase ÷ عدد الفترات` (مقابل `linear` في Odoo؛ الافتراضي في SAP).
- `DecliningBalance`: `المتبقي × (DecliningFactor ÷ إجمالي الفترات)` (مقابل `degressive` في Odoo).
- `DecliningThenStraight`: الأكبر بين القسطين في كل فترة — يضمن إهلاكاً كاملاً قبل نهاية العمر (مقابل `degressive-linear` في Odoo).
- `Prorata`: `None` قسط أول كامل · `ConstantPeriods` بعدد الأشهر الكاملة المتبقية في الفترة الأولى · `ByDays` بالأيام الفعلية (مقابل `days_calc` في Odoo). الصيغ الدقيقة في §5.1.1.

> التأكيد في الخطوة 5 ليس تعليقاً — هو `Debug.Assert` في المولّد **و**اختبار وحدة إلزامي لكل طريقة (§10).

### 5.1.1 التعريفات: الدورية والتحاصص والتقريب

كانت هذه المصطلحات الثلاثة مذكورة بالاسم فقط؛ تُعرَّف هنا ليعني المولّد والاختبارات والمحاسب الشيء نفسه.

**الدورية (Periodicity).** `monthsPerPeriod` = 1 (`Monthly`) / 3 (`Quarterly`) / 12 (`Yearly`).
- حدود الفترات تتبع **التقويم المالي** ([[fiscal-year-period-category]]): الشهري = نهايات الأشهر؛ الفصلي = نهايات الأرباع المالية (الأشهر المالية 3 و6 و9 و12)؛ السنوي = نهاية السنة المالية. وعند كون السنة المالية ميلادية تتطابق مع الأرباع/السنوات الميلادية (انظر §12.7).
- `LineDate` = آخر يوم في فترته. فالسطر الفصلي أو السنوي يُرحَّل بدورة الفترة المحاسبية التي يقع فيها؛ والدورات الشهرية بينها لا تجد لهذه الفئات شيئاً مستحقاً.
- تحقق عند حفظ الفئة والأصل: `UsefulLifeMonths % monthsPerPeriod == 0` وإلا رُفض. و`N = UsefulLifeMonths / monthsPerPeriod` عدد الأقساط العادية.
- لا تُغيَّر الدورية بعد ترحيل أي سطر.

**التحاصص (Proration)** يسري على الفترة *الأولى* فقط — التي تحوي `DepreciationStartDate` أي `S` وحدودها `[Ps, Pe]` — ويُتجاوز في الأصول القديمة (بدايتها حدّ فترة) وعند الاستئناف (§4.1). لتكن `f` نسبة الفترة الأولى:

| `ProrataMethod` | `f` | عدد الأسطر |
|---|---|---|
| `None` | `1` — يبدأ الإهلاك بالفترة التي تحوي `S` بقسط كامل | `N` |
| `ConstantPeriods` | `(عدد الأشهر الكاملة من شهر S إلى شهر Pe، وشهر S يُحسب كاملاً) ÷ monthsPerPeriod`. في `Monthly` تساوي دائماً `1` أي مطابقة لـ `None`؛ وتظهر أهميتها في `Quarterly`/`Yearly` | `N` إذا `f = 1` وإلا `N + 1` |
| `ByDays` | `(Pe − S + 1) ÷ (Pe − Ps + 1)` — أيام تقويمية فعلية بما فيها السنوات الكبيسة | `N` إذا `f = 1` وإلا `N + 1` |

عند `f < 1`: السطر 1 = `القسط العادي × f`؛ الأسطر 2..N عادية؛ والسطر `N + 1` هو **سطر الإتمام** ويساوي ما تبقّى (وفي القسط الثابت هو بالضبط `القسط العادي × (1 − f)` بعد التقريب). وينتهي عمر الأصل بعد `UsefulLifeMonths` تماماً من `S`. وفي الطرق المتناقصة: السطر 1 = `المتبقي × المعدل × f` والسطر الأخير يأخذ الباقي أيضاً.

**التقريب (Rounding).**
- عدد المنازل العشرية من إعداد الوحدة الصغرى لعملة النظام (`SysCurrencyCode`) يُقرأ مرة واحدة لكل توليد. النمط: `MidpointRounding.AwayFromZero`.
- كل قسط يُقرَّب **منفرداً ومرة واحدة** بعد إتمام كل الحسابات (المعدل، النسبة، المتبقي) بدقة `decimal` الكاملة — لا يُقرَّب معدل أو نسبة قبل ذلك أبداً.
- القسط الأخير يمتص كل الفرق (الخطوة 4). وفي القسط الثابت والتحاصص يتأكد المولّد أن `|الأخير − العادي| ≤ ⌈N/2⌉ × 10^−المنازل` (مع سماح سطر الإتمام عند `f < 1`)؛ فجوة أكبر تعني خللاً لا تقريباً. والطرق المتناقصة معفاة من هذا الحدّ بالتصميم (أ.3) لكن يجب أن يكون `الأخير ≥ 0`.
- إجماليات الدورة وأسطرها وأسطر القيد مجاميع بسيطة لمبالغ مقرَّبة أصلاً و**لا تُقرَّب ثانية أبداً**، فيتساوى المدين والدائن حتى آخر وحدة بحكم البناء.
- يُخزَّن `DecliningFactor` بـ `decimal(5,2)`؛ ومعدل الفترة = `DecliningFactor ÷ N` مستقل عن الدورية.

### 5.2 استراتيجيات القيد

تُكتب كصفوف ترث `JournalPostingStrategyBase<T>` من [`Core.Bases.JournalPostingStrategyBase`](../../../jasim_api/modules/core/src/Core.Domain/Bases/JournalPostingStrategyBase.cs) وتُسجَّل في `AssetsDomainModule` تماماً كما تفعل [`InventoryDomainModule.cs`](../../../jasim_api/modules/inventory/src/Inventory.Domain/InventoryDomainModule.cs):

```csharp
JournalPostingStrategyFactory.RegisterStrategy<AssetTransaction>(
    DocumentTypeData.AssetCapitalization.Code, () => new AssetCapitalizationJournalStrategy());
// … ARV / AIM / ADS / ASL / ACC بنفس الشكل (العكس يعيد استخدام الاستراتيجية الأصلية مع IsReversal = true)
JournalPostingStrategyFactory.RegisterStrategy<AssetDepreciationRun>(
    DocumentTypeData.AssetDepreciationRun.Code, () => new AssetDepreciationRunJournalStrategy());
```

> المساعدات `CreateAccountGroups` في الصف الأساس مبنية على `DocBase`/`DocLineBase` ولا تصلح هنا؛ استراتيجيات الأصول تبني `Lines` يدوياً — وهو ما تفعله `LandedCostJournalStrategy` أصلاً بدرجة أقل.

كل استراتيجية تُرجع `JournalEntryPostDto` مع: `OrganizationId`, `PostingDate`, `DocumentType`, `SysCurrencyCode`, `FiscalPeriodId`, و`BaseType`/`BaseEntry`/`BaseRef` (نوع الوثيقة + معرّف الأصل أو الدورة + رمزه)، و`IsAutoGenerated = true` — تم التأكد من هذا الشكل مباشرة من [`JournalEntryPostDto.cs`](../../../jasim_api/modules/core/src/Core.Domain.Shared/Integrations/FinancePosting/JournalEntryPostDto.cs)، بما في ذلك حقل `AccountCode` كنصّ في [`JournalEntryPostLineDto.cs`](../../../jasim_api/modules/core/src/Core.Domain.Shared/Integrations/FinancePosting/JournalEntryPostLineDto.cs) الذي بُني عليه قرار رموز الحسابات النصّية في §0.

### 5.3 القيود المولَّدة

| الحدث | مدين | دائن |
|---|---|---|
| **الرسملة** (عند عدم وجود فاتورة مشتريات تُرحّل الأصل بذاتها) | `AssetAcctCode` | حساب المورّد / النقد |
| **الإهلاك الدوري** | `DeprExpenseAcctCode` (+ `CostCenterId` على السطر) | `AccumDeprAcctCode` |
| **إضافة لاحقة** (نوع الوثيقة `240`، §5.6.2) | `AssetAcctCode` | حساب المورّد / النقد (لا قيد إذا رحّلتها فاتورة الشراء) |
| **تخفيض الاقتناء** (نوع الوثيقة `241`، §5.6.3) | حساب المورّد / النقد (لا قيد إذا رُحِّلت مذكرة الدائن بذاتها) | `AssetAcctCode` |
| **إهلاك يدوي** (نوع الوثيقة `242`، §5.6.4) و**إهلاك حتى تاريخ الإخراج** (§5.6.1) | `DeprExpenseAcctCode` (+ مركز الكلفة كما في التاريخ) | `AccumDeprAcctCode` |
| **إعادة تقييم بالزيادة** | `AssetAcctCode` | `RevaluationSurplusAcctCode` |
| **إعادة تقييم بالنقص / هبوط قيمة** (نوع الوثيقة `238`) | `LossOnDisposalAcctCode` إلى حين اعتماد حساب خسارة هبوط قيمة مخصّص (§12.1) | `AssetAcctCode` |
| **البيع بربح** | النقد/المدينون + `AccumDeprAcctCode` | `AssetAcctCode` + `GainOnDisposalAcctCode` |
| **البيع بخسارة** | النقد/المدينون + `AccumDeprAcctCode` + `LossOnDisposalAcctCode` | `AssetAcctCode` |
| **الاستبعاد بلا مقابل** | `AccumDeprAcctCode` + `LossOnDisposalAcctCode` | `AssetAcctCode` |
| **النقل** (موقع / عهدة فقط) | — لا قيد — | — |
| **النقل بين مراكز كلفة / مشاريع** | — لا قيد افتراضياً؛ الأقساط المستقبلية تُرحَّل ببساطة إلى المركز الجديد (§5.5) — | — |
| **إعادة التصنيف الاختيارية لمصروف السنة حتى تاريخه** (فقط إذا أجاب §12.6 بنعم؛ نوع الوثيقة `237`) | `DeprExpenseAcctCode` (المركز الجديد) | `DeprExpenseAcctCode` (المركز القديم) |

قيود البيع والاستبعاد تستخدم مجمّع الاندثار **بعد** إضافة قسط «حتى التاريخ» في §5.6.1 (زوج مدين مصروف / دائن مجمّع الإضافي يقع في نفس القيد)؛ والمثال التالي يفترض أنه مشمول أصلاً في الـ 60,000. مثال البيع (أصل 100,000 / مجمّع اندثار 60,000 / بيع 50,000 ⇒ خسارة 10,000):

```
مدين  النقد                          50,000
مدين  مجمّع اندثار وسائط نقل         60,000
مدين  خسائر بيع موجودات ثابتة        10,000
  دائن  وسائط نقل                          100,000
```

### 5.4 دورة الإهلاك (`AssetDepreciationRun`)

**إنشاء بحالة `Draft` (محاكاة — لا قيد ولا تعليم ترحيل):**

1. جلب `AssetDepreciationLine` حيث `LineDate <= PeriodEnd && !IsPosted && !IsDeleted`، والأصل `State == Running`، مع `ApplyDataAuthority(currentUser)`.
2. التحقق من أن `PostingPeriod.PeriodStat` للفترة المستهدفة ليس `Y` (مقفل) ولا `C` (قيد الإقفال) — عبر `IPostingPeriodRepository`؛ خلاف ذلك `UserFriendlyException`.
3. بناء أسطر الدورة وحساب الإجماليات.

**الترحيل (`AssetDepreciationRunPostCommandHandler`) داخل وحدة عمل (UoW) واحدة:**

0. أخذ القفل الموزَّع `(TenantId, DepreciationAreaId)` وفرض قواعد التداخل وعدم الفجوات في §3.8.1.
1. إعادة فحص `IsPosted` على كل سطر (الحاجز ضد التزامن) + الفهرس الفريد المُرشَّح على `(PostingPeriodId, AreaId, ClassId)`.
1b. قراءة رموز الحسابات من `AssetClassAreaAccounts` لمجال الدورة `DepreciationAreaId` (§3.1.1). إذا كان المجال `PostsToGl = false` تُتجاوز الخطوتان 2–3: تُعلَّم الأسطر مُرحَّلة بلا `JournalEntryId` (§5.6.8).
1a. تحديد `CostCenterId`/`ProjectId` لكل سطر **كما في `LineDate`** من سجل `CostCenterTransfer` للأصل (§5.5)، لا من القيمة الحالية للأصل.
2. تجميع الأسطر حسب `(DeprExpenseAcctCode, CostCenterId)` مديناً، وحسب `AccumDeprAcctCode` دائناً ⇒ **قيد واحد** لكل الدورة.
3. `await jeIntegration.PostAsync(dto)` ⇒ `Guid journalEntryId`.
4. تعليم `IsPosted = true` + `JournalEntryId` + `DepreciationRunId` على كل سطر؛ `Run.Status = Posted`.
5. كل أصل استُنفدت أسطره ⇒ `State = Closed` + `AssetTransaction` من نوع `Adjustment`.

**عكس الدورة:** قيد بـ `IsReversal = true` + `Run.Status = Reversed` + إرجاع `IsPosted = false` على الأسطر. لا حذف — بما يطابق سجل تغييرات OCA («عكس الترحيل لا حذفه») ونمط العكس المُعتمَد أصلاً في بقية Enki. وإضافةً:
- يُسمح به فقط ضمن **قاعدتي LIFO والأحداث التابعة** في §3.8.1 (البندان 3 و4).
- قيد العكس **يُؤرَّخ بـ `PeriodEnd` للدورة الأصلية** لا بتاريخ اليوم، فيتصافى رصيد الأستاذ بأي تاريخ تاريخي تماماً كما يفعل سجل الوحدة بتاريخ معيّن (§7.1). لذلك يجب أن تكون الفترة المستهدفة مفتوحة؛ فإن كانت مقفلة رُفض العكس ويرحّل المحاسب دورة تصحيحية في الفترة الحالية.
- الأصول التي أُغلقت (`Closed`) بهذه الدورة تعود إلى `Running` (انتقال تلقائي، §4.1).

**المهمة المجدولة** (Hangfire، في `ConfigureRecurringJobs()`): تنشئ وترحّل دورة لكل شهر متأخر، **الأقدم أولاً**، حتى اليوم الأخير من الشهر السابق (فيُتدارَك الشهر الفائت بالترتيب كما تشترط قاعدة عدم الفجوات §3.8.1 بند 2). إعادة تشغيلها لنفس الفترة لا تُنتج قيداً ثانياً — يمنعه الفهرس الفريد وفحص `IsPosted`. النمط مطابق لـ [`SalesRecurringTransactionGenerationJob`](../../../jasim_api/modules/sales/src/Sales.Application/BackgroundJobs/SalesRecurringTransactionGenerationJob.cs): لا رمي استثناء، تسجيل الخطأ، والانتقال للفئة التالية.

### 5.5 النقل بين مراكز الكلفة (والمشاريع)

مركز الكلفة **له تاريخ سريان**، لأن الأقساط تُرحَّل لكل فترة ويجب أن تقع على المركز الذي كان يملك الأصل خلال تلك الفترة.

1. يحمل `Asset.CostCenterId` المركز الحالي. ولا يتغيّر إلا عبر إجراء `CostCenterTransfer` الذي يكتب `AssetTransaction` بـ `FromCostCenterId` و`ToCostCenterId` و`TransactionDate` (تاريخ السريان). يُرفض التعديل المباشر للحقل بعد الرسملة. المشاريع بنفس الآلية (`FromProjectId`/`ToProjectId`).
2. **لا نقل بأثر رجعي:** يجب أن يكون `TransactionDate` بعد `LineDate` لآخر سطر إهلاك مُرحَّل، وأن تكون فترته المحاسبية مفتوحة. وهذا يعني أن كل قسط مُرحَّل يحتفظ بمركزه ولا شيء في الماضي يحتاج تصحيحاً.
3. عند بناء الدورة لأسطرها (§5.4 الخطوة 1a) يأخذ كل سطر المركز من آخر `CostCenterTransfer` غير معكوس بـ `TransactionDate <= LineDate`، وإلا مركز الأصل الأصلي. الدقة هنا بمستوى الفترة: النقل المؤرَّخ في منتصف فترة ينقل قسط تلك الفترة كاملاً (لأن `LineDate` نهاية الفترة)، ولذلك تقترح الواجهة تاريخ السريان الافتراضي = أول يوم من الفترة التالية غير المُرحَّلة وتحذّر عند أي تاريخ آخر.
4. **لا قيد يومية افتراضياً.** مجمّع الاندثار على حساب ميزانية لا يحمل مركز كلفة، والمصروف السابق يبقى حيث رُحِّل. القيد الوحيد الذي قد ينشأ هو إعادة التصنيف *الاختيارية* لمصروف السنة حتى تاريخه (مدين مصروف / المركز الجديد، دائن مصروف / المركز القديم، نوع الوثيقة `237`)، وتُفعَّل لكل مستأجر فقط إذا أُجيب §12.6 بـ«نعم».
5. `CostCenterTransfer` لا يغيّر القيم، فلا يمنع عكس دورة (§3.8.1 بند 4)؛ لكنه هو نفسه لا يُعكس إلا ما دام لا يوجد سطر مُرحَّل بتاريخ يساوي أو يلي `TransactionDate` الخاص به.

### 5.6 أحداث دورة الحياة المضافة بعد مقارنة SAP Business One

كلها أنواع `AssetTransaction` (§3.7)، وتخضع لقواعد الفترة المفتوحة والعكس في §3.8.1/§4.1، وتعيد توليد **الأسطر غير المُرحَّلة فقط** (§3.6).

**5.6.1 الإهلاك حتى تاريخ الإخراج (`Sell` / `Dispose`).** بدونه يترك البيع في منتصف الشهر مجمّعاً ناقصاً وربحاً أو خسارة خاطئين. القواعد لتاريخ إخراج `D` في الفترة `[Ps, Pe]`:
1. يجب أن تكون كل الفترات السابقة مُرحَّلة؛ وإلا `Assets:PostDepreciationFirst`.
2. يُنشأ سطر `ToDate` مُرحَّل أصلاً بتاريخ `D` ومبلغه = القسط العادي لتلك الفترة × `g`: `ByDays` ⇒ `g = (D − Ps + 1) ÷ (Pe − Ps + 1)`؛ `ConstantPeriods` ⇒ الأشهر الكاملة من بداية الفترة حتى شهر `D` (يُحسب كاملاً) ÷ `monthsPerPeriod`؛ `None` ⇒ `g = 0` (لا إهلاك في فترة الإخراج، تماثلاً مع «لا تحاصص عند البدء»). يُقرَّب وفق §5.1.1. يُتجاوز للأصل غير القابل للإهلاك وإذا كان سطر الفترة العادي مُرحَّلاً أصلاً.
3. زوج `ToDate` (مدين `DeprExpenseAcctCode` بمركز الكلفة كما في `D` / دائن `AccumDeprAcctCode`) جزء من **قيد البيع أو الاستبعاد** ويُعكس معه بـ `ReverseSale`/`ReverseDisposal`.
4. تُلغى كل الأسطر غير المُرحَّلة اللاحقة. ويُخزَّن المجمّع النهائي في `AccumulatedAtEvent`.

**5.6.2 الإضافة اللاحقة (`AddCost`، نوع الوثيقة `240`).** تضيف نفقة رأسمالية على أصل قائم (تحسين، توسعة). مسموحة على `Running` و`Paused` و`Closed` (→ `Running`). `OriginalValue += Amount`؛ تُعاد حسبة `DepreciationBase`؛ وتُعاد توليد الأسطر غير المُرحَّلة من القيمة المتبقية القابلة للإهلاك الجديدة على **الفترات المتبقية بلا تغيير** (لا تدارك بأثر رجعي — الفترات المُرحَّلة لا تُعاد صياغتها أبداً). ويمكن للمستخدم اختيارياً إدخال عمر متبقٍّ جديد يُسجَّل `Adjustment`. القيد: مدين `AssetAcctCode` / دائن المورّد أو النقد؛ ولا قيد عندما يشير `SourceDoc*` إلى فاتورة شراء رحّلت التكلفة بذاتها (§12.3).

**5.6.3 تخفيض الاقتناء (`ReduceCost`، نوع الوثيقة `241`).** مقابل مذكرة دائن المشتريات أو مرتجع الشراء بعد الرسملة، مرتبط عبر `SourceDoc*`. `OriginalValue −= Amount`؛ وإعادة التوليد كما في 5.6.2. يُرفض (`Assets:ReductionExceedsBookValue`) إذا هبطت `OriginalValue` الجديدة دون المجمّع المُرحَّل + المستورد — فيستبعد المستخدم الأصل أو يعدّله. القيد: مدين المورّد أو النقد / دائن `AssetAcctCode`؛ ولا قيد إذا رُحِّلت مذكرة الدائن بذاتها.

**5.6.4 الإهلاك اليدوي غير المخطَّط (`ManualDepreciation`، نوع الوثيقة `242`).** تحميل لمرة واحدة (ورديات إضافية، تلف جزئي) في فترة مفتوحة يختارها المستخدم. يجب أن يكون المبلغ `> 0` و`≤` القيمة المتبقية القابلة للإهلاك، والأصل قابلاً للإهلاك. يُنشئ سطر `Manual` مُرحَّلاً (بلا دورة، وله قيده: مدين مصروف / دائن مجمّع) ويعيد توليد الأسطر غير المُرحَّلة من المتبقي المخفَّض على الفترات المتبقية بلا تغيير. ويُعدّ حدثاً تابعاً عند عكس الدورات (§3.8.1 بند 4).

**5.6.5 أنواع الأصول والأصول منخفضة القيمة.** `AssetKind` على الفئة (§3.1): `Land` ⇒ `IsDepreciable = false`؛ `Intangible` ⇒ نفس المحرّك وتسمية «إطفاء» في الواجهة والتقارير؛ `LowValue` ⇒ عند `Capitalize` ينتج المولّد **سطراً واحداً** بـ 100% من القاعدة بتاريخ نهاية فترة دخول الخدمة (فتحمّله أول دورة مصروفاً) بصرف النظر عن العمر والطريقة. إعداد المستأجر الاختياري `Assets:LowValueThreshold` (null = معطّل) يرفض أصول `LowValue` التي تتجاوز قيمتها الأصلية الحدّ. تبقى الأصول منخفضة القيمة في السجل وفي الجرد الفعلي حتى الاستبعاد.

**5.6.6 سطر فاتورة مشتريات بكمية N.** مستمع المرحلة 4 ينشئ **N أصلاً بحالة `Draft`** لسطر كميته N (لكل أصل كمية 1 كما في SAP)، وتكلفة كل أصل = `round(صافي السطر ÷ N)` مع أخذ الأصل الأخير لفرق التقريب، ولكل منها `SourceDocLineId` و`SourceLineSequence = 1..N`. إعادة ترحيل نفس الفاتورة idempotent بفضل الفهرس الفريد في §3.5. وتُرفض الكميات الكسرية لأصناف الأصول الثابتة.

**5.6.7 الاستبعاد الجزئي — خارج v1.** `Sell` و`Dispose` يُخرجان الأصل كاملاً دائماً. وتُنشأ الحيازات المجمَّعة كـ N أصلاً (5.6.6) ليُخرَج كل منها منفرداً. يُراجَع في المرحلة 5 (§12.9).

**5.6.8 المجالات غير المرحَّلة للأستاذ.** دورة لمجال `PostsToGl = false` تحسب وتعلّم الأسطر مُرحَّلة لكن لا تنشئ قيد يومية ولا `JournalEntryId`؛ ومطابقة الأستاذ تغطي المجالات `PostsToGl = true` فقط.

---

## 6. طبقة التطبيق — الشرائح والمسارات

### 6.1 الشكل الإلزامي لكل شريحة

```
Assets.Application.Contracts/Entities/<Feature>/
    ├── Commands/   <Feature>CreateCommand.cs · UpdateCommand · DeleteCommand · <الأفعال>
    ├── Queries/    GetByIdQuery · GetListQuery · GetDxListQuery · AutocompleteQuery
    ├── Dtos/       <Feature>Dto · <Feature>BasicDto
    ├── I<Feature>AppService.cs
    └── <Feature>Permissions.cs      ← يرث PermissionDefinitionProvider
Assets.Application/Api/<Feature>/
    ├── Handlers/Commands/ · Handlers/Query/ · Validations/ · Managers/
    └── <Feature>AppService.cs       ← مندوب mediator نحيف + [Authorize]
```

القالب المرجعي حرفياً: شريحة [`PaymentTerms`](../../../jasim_api/modules/finance/src/Finance.Application/Api/PaymentTerms/PaymentTermAppService.cs) في Finance — تم التأكد أنها تحوي فعلياً تقسيم Commands/Query/Validations الكامل الذي تفترضه هذه الخطة ([[thin-appservice-cqrs-reference]] · [[feature-contracts-folder-structure]]).

**قواعد لا تُخالَف:**

- لا منطق استعلام داخل `AppService` — حتى `GetDxListAsync` يمرّر `new XGetDxListQuery(options)` إلى معالج ([[data-authority-query-convention]]).
- كل معالج قائمة يستدعي `.AsNoTracking().Where(x => !x.IsDeleted).ApplyDataAuthority(_currentUser)` ثم `ProjectToType<TDto>()` ([[autocomplete-byterm-conventions]]).
- كل التحويلات عبر `TypeAdapterConfig.GlobalSettings` المُهيّأة في `AssetsApplicationModule.ConfigureMapster()` ([[global-mapster-config-pattern]])؛ وأي `enum?` في الكيان يقابله `int?` في الـ DTO يحتاج `.Map()` صريحاً ([[mapster-nullable-enum-cast]]).
- كل رسالة للمستخدم عبر `IStringLocalizer<AssetsResource>` مع مفاتيح في `ar.json` و`en.json` ([[localize-user-facing-messages]]).
- `UserFriendlyException` لا `BusinessException` ([[prefer-userfriendlyexception]]).
- المعالجات والخدمات والمستودعات بـ primary constructors ([[primary-constructors-preference]]).

### 6.2 المسارات المُولَّدة (مرجع، لا تُكتب يدوياً)

| AppService | المسار |
|---|---|
| `AssetClassAppService` | `/api/assets/asset-class` · `/dx-list` · `/autocomplete` |
| `AssetLocationAppService` | `/api/assets/asset-location` · `/tree` |
| `AssetGroupAppService` | `/api/assets/asset-group` |
| `DepreciationAreaAppService` | `/api/assets/depreciation-area` |
| `AssetAppService` | `/api/assets/asset` + الأفعال `capitalize` · `undo-capitalization` · `cancel` · `pause` · `resume` · `revaluate` · `impair` · `add-cost` · `reduce-cost` · `manual-depreciation` · `transfer` · `transfer-cost-center` · `sell` · `reverse-sale` · `dispose` · `reverse-disposal` · `depreciation-schedule` · `recompute-schedule` |
| `AssetDepreciationRunAppService` | `/api/assets/asset-depreciation-run` + `simulate` · `post` · `reverse` |
| `AssetReportAppService` | `/api/assets/asset-report/register` · `forecast` · `by-location` · `disposals` · `gl-reconciliation` · `ledger` · `movement-schedule` (ولكل منها مسار `/excel` مرافق) |

> `simulate` ليست رفاهية: المحاسب يجب أن يرى ما سيُرحَّل قبل الترحيل. في Enki تتحقق هذه المحاكاة بوثيقة `Draft` قابلة للعرض والحذف، لا بمعامل `dry_run` — بما يطابق منطق «توقّع الإهلاك» في SAP B1 ومعالج المحاكاة في OCA، لكن مُعبَّراً عنه كوثيقة Enki من الدرجة الأولى.

### 6.3 الصلاحيات

`AssetPermissions` يرث `PermissionDefinitionProvider` تماماً كـ [`PaymentTermPermissions`](../../../jasim_api/modules/finance/src/Finance.Application.Contracts/Entities/PaymentTerms/PaymentTermPermissions.cs):

```csharp
public const string View    = AssetsPermissions.GroupName + ".Asset";   // "Assets.Asset"
public const string Create  = View + ".Create";
public const string Update  = View + ".Update";
public const string Delete  = View + ".Delete";
public const string Post    = View + ".Post";       // رسملة / ترحيل إهلاك / بيع / استبعاد
public const string Reverse = View + ".Reverse";
```

الأدوار المقترحة تُركَّب من هذه الصلاحيات في شاشة الأدوار — لا تُبرمج كأدوار ثابتة:

| الدور | الصلاحيات |
|---|---|
| مُطّلع على الأصول | `Assets.*` (View) فقط |
| مستخدم الأصول | View + Create/Update على `Asset` في `Draft` |
| محاسب الأصول | ما سبق + `Post` + `Reverse` على `Asset` و`AssetDepreciationRun` |
| مدير إعدادات الأصول | `AssetClass` / `AssetLocation` / `AssetGroup` / `DepreciationArea` بالكامل |

---

## 7. التقارير

تُبنى على نمط «Account Statement» في Finance، بمجلد لكل تقرير ([[report-per-report-folder-structure]]):

```
Assets.Application/Api/Reports/<ReportName>/
    ├── <ReportName>Manager.cs                ← كل منطق الاستعلام هنا
    ├── Handlers/<ReportName>GetHandler.cs    ← سطر واحد يفوّض للـ Manager
    ├── <ReportName>ExcelHandler.cs
    └── Dtos/
```

([[report-manager-owns-query-logic]])

| التقرير | المحتوى |
|---|---|
| **سجل الأصول** (Register) | كل أصل **بأي تاريخ سابق** (معامل `asOfDate`): القيمة الأصلية، المجمّع، الدفترية، الإهلاك المعلّق، الفئة، الموقع، العهدة، مركز الكلفة — محسوباً وفق §7.1 |
| **توقّع الإهلاك** (Forecast) | الأقساط غير المُرحّلة بين تاريخين، مجمّعة بالفترة والفئة (يقابل Depreciation Forecast في SAP B1) |
| **الأصول حسب الموقع/العهدة** | جرد تنظيمي لا محاسبي |
| **الاستبعادات** | المبيعات والاستبعادات بين تاريخين مع الربح/الخسارة وقيد كل منها |
| **مطابقة دفتر الأستاذ** | رصيد `AssetAcctCode` في GL مقابل Σ القيم الأصلية · رصيد `AccumDeprAcctCode` مقابل Σ الأقساط المُرحّلة — مع عمود فرق يجب أن يكون صفراً؛ ويأخذ نفس `asOfDate` الخاص بالسجل (§7.1) |
| **بطاقة الأصل** (Asset Ledger) | أصل واحد، كل حدث بالترتيب مع أرصدة جارية — أول ما يفتحه المدقق (§7.2) |
| **جدول حركة الأصول** (Roll-forward) | لكل فئة وفترة: التكلفة أول المدة + الإضافات − التخفيضات ± إعادة التقييم − الاستبعادات = التكلفة آخر المدة، والمسار نفسه للمجمّع والقيمة الدفترية (§7.3) |

### 7.1 قيم سجل الأصول بتاريخ معيّن

عبارة «القيمة الدفترية مُشتقّة» (§1) تحتاج تعريفاً دقيقاً بتاريخ معيّن، لأن `Asset.State` و`OriginalValue` والموقع والعهدة قيم *حالية*. لكل أصل عند `asOfDate` (أي تاريخ حتى اليوم؛ التواريخ المستقبلية من اختصاص تقرير التوقّع):

| العمود | القاعدة |
|---|---|
| **مُدرَج؟** | `CapitalizationDate <= asOfDate` **و**لا يوجد `Sale`/`Disposal` غير معكوس بـ `TransactionDate <= asOfDate`. الأصل المباع *بعد* `asOfDate` يُدرَج بقيمه قبل البيع؛ و`Draft`/`Cancelled` لا يُدرَجان أبداً. |
| **القيمة الأصلية** | `ToValue` لآخر حركة غير معكوسة تغيّر القيمة (`Capitalization`، `OpeningBalance`، `Revaluation`، `Impairment`) بـ `TransactionDate <= asOfDate`. إعادة التقييم اللاحقة تُتجاهل. |
| **مجمّع الاندثار** | `ImportedAccumulatedDepreciation` (فقط إذا `asOfDate >= ImportCutoffDate`) + Σ `Amount` للأسطر **المُرحَّلة** بـ `LineDate <= asOfDate`. |
| **القيمة الدفترية** | القيمة الأصلية − مجمّع الاندثار (القيمة التخريدية *لا* تُخصم؛ تظهر في عمود مستقل). |
| **الإهلاك المعلّق** | Σ `Amount` للأسطر **غير المُرحَّلة** بـ `LineDate <= asOfDate`، ليفسّر السجل نفسه إن اختلف عن المتوقّع. ليس جزءاً من القيمة الدفترية. |
| **الموقع / العهدة / مركز الكلفة / المشروع** | `ToX` لآخر `Transfer`/`CostCenterTransfer` غير معكوس بـ `TransactionDate <= asOfDate`؛ وإلا `FromX` لأقدم نقل لاحق؛ وإن لم يوجد نقل إطلاقاً فالقيمة الحالية. |

قواعد تُبقي السجل مساوياً للأستاذ العام في نفس التاريخ:
- **العناصر المعكوسة تُعدّ كأنها لم تحدث** (`IsPosted = false` / `IsReversed = true`)، ولأن قيود العكس تُؤرَّخ بتاريخ الوثيقة الأصلية (§4.1، §5.4) يتصافى الأستاذ بأي تاريخ تاريخي بنفس الطريقة. تقرير مطابقة الأستاذ يأخذ نفس `asOfDate` ويقارن مع أرصدة الأستاذ بـ `PostingDate <= asOfDate`.
- **الأصول القديمة** لها رقم مجمّع مستورد واحد، فعند `asOfDate < ImportCutoffDate` تُستبعد ويذكر تذييل التقرير عددها («N أصل قديم مستبعد — تاريخ التقرير يسبق تاريخ قطع الاستيراد») بدل عرض رقم خاطئ.
- تسري صلاحيات البيانات (`ApplyDataAuthority`)؛ والتقرير استعلام واحد مجمَّع في `AssetsRegisterReportManager` فوق الفهرسين `(AssetId, IsPosted, LineDate)` و`(AssetId, TransactionDate)` — بلا رحلات منفصلة لكل أصل. جدول لقطات نهاية السنة تحسين اختياري في المرحلة 5 فقط إن فرضه الحجم.

### 7.2 بطاقة الأصل (Asset Ledger)

المرشِّحات: الأصل (إلزامي)، `fromDate`، `toDate`، المجال (الافتراضي افتراضياً). صف لكل حدث، مرتَّباً بالتاريخ ثم وقت الإنشاء:

| مصدر الصف | يظهر كـ |
|---|---|
| كل `AssetTransaction` غير معكوسة (كل الأنواع بما فيها `OpeningBalance`) | النوع، رقم الوثيقة (`DocumentNumbering`)، مرجع قيد اليومية، حركة التكلفة (`ToValue − FromValue`)، الملاحظات؛ والأصل المعكوس وعكسه يظهران معاً مع وسم «معكوس» على الأصلي |
| أسطر `AssetDepreciationLine` المُرحَّلة | صف **لكل دورة** (لا لكل سطر)، مع صفوف `Manual` و`ToDate` كأحداث مستقلة، ومرجع قيد اليومية |
| النقل | بلا مبلغ؛ من/إلى الموقع والعهدة ومركز الكلفة في عمود الملاحظات |

الأعمدة: التاريخ · الحدث · الوثيقة · قيد اليومية · حركة التكلفة · حركة الإهلاك · **التكلفة الجارية · المجمّع الجاري · القيمة الدفترية الجارية**. تبدأ الأرصدة الجارية بقيم §7.1 كما في `fromDate − 1`، فتبدأ البطاقة المصفّاة من رصيد صحيح، وآخر صف يساوي سجل الأصول لهذا الأصل عند `toDate`. تسري صلاحيات البيانات وصلاحية View على `Assets.Asset`؛ وتُعرض الصفحة أيضاً كتبويب في بطاقة الأصل.

### 7.3 جدول حركة الأصول (Roll-forward)

المرشِّحات: `fromDate` و`toDate` والمجال والتجميع (فئة — افتراضي — / مجموعة / موقع). لكل مجموعة ثلاث كتل:

| الكتلة | أول المدة | الحركات في `[fromDate, toDate]` | آخر المدة |
|---|---|---|---|
| **التكلفة** | تكلفة السجل كما في `fromDate − 1` | + `Capitalization` و`OpeningBalance` و`Addition` · − `AcquisitionReduction` · ± `Revaluation`/`Impairment` · − تكلفة `Sale`/`Disposal` (`FromValue`) | تكلفة السجل كما في `toDate` |
| **مجمّع الاندثار** | مجمّع السجل كما في `fromDate − 1` | + الإهلاك المُرحَّل (أسطر `Depreciation` و`Manual` و`ToDate`) · − المجمّع المُخرَج بـ `Sale`/`Disposal` (`AccumulatedAtEvent`) | مجمّع السجل كما في `toDate` |
| **القيمة الدفترية** | تكلفة أول المدة − مجمّع أول المدة | صافي الكتلتين | تكلفة آخر المدة − مجمّع آخر المدة |

التقرير **يتحقق من نفسه**: أول المدة + الحركات يجب أن يساوي إقفال السجل لكل مجموعة؛ وأي فرق يظهر في عمود «غير مفسَّر» الذي يجب أن يكون صفراً، تماماً كعمود الفرق في مطابقة الأستاذ. العناصر المعكوسة مستبعدة من الطرفين (§7.1). والأصول القديمة التي يقع `ImportCutoffDate` الخاص بها داخل المدى تظهر تحت «أرصدة افتتاحية مستوردة» كي لا تتنكر بصفة إضافات. تتطابق الإجماليات مع حركة الأستاذ لـ `AssetAcctCode`/`AccumDeprAcctCode` في نفس التواريخ، والتقرير أساس إيضاح الأصول الثابتة في القوائم المالية.

كل التقارير السبعة لها ملف `.repx` مسجَّل في `ReportDataSeeder`. صفحات التقارير في الواجهة تُخفي أزرار الحفظ/الدفع/الإغلاق والإضافة والنسخ والمرفقات على `XView` وتمرّر `:hide-audit-columns="true"` لـ `BaseGrid` ([[report-page-xview-hide-actions]]).

---

## 8. الواجهة الأمامية (`jasim_web`)

```
src/modules/assets/{components,services,stores,types,enums}/
src/pages/assets/{asset-class,asset-location,asset-group,asset,depreciation-run,reports}/
src/navigation/modules/assets.ts
src/locales/assets.json   (+ مفاتيح في ar.json / en.json)
```

| الصفحة | النمط |
|---|---|
| فئات الأصول · المواقع · المجموعات · مجالات الإهلاك | **Type B** (CRUD بسيط) — `TYPE_B_PAGE_PATTERN.md` |
| الأصل (رأس + جدول الإهلاك + سجل الأحداث) | **Type A** (master-detail) — `TYPE_A_PAGE_PATTERN.md` |
| دورة الإهلاك (رأس + أسطر + أزرار محاكاة/ترحيل/عكس) | **Type A** |
| التقارير السبعة | صفحة تقرير (فلاتر + `BaseGrid` + طباعة) |

قواعد ملزِمة من [`jasim_web/CLAUDE.md`](../../../jasim_web/CLAUDE.md): كل صفحة داخل `XView`، كل شبكة `BaseGrid`، الخدمة ترث `CrudService` وتعرّف `urls` + `permission`، المتجر Pinia بنمط journal-entry (`init` / `saveAsync` / `getListSource` / `service` / `permission`)، والتحكم بالعرض عبر `$can(action, store.permission)`. لا مكوّنات UI مخصّصة.

التنقّل: عنصر `assets` في `src/navigation/modules/assets.ts` بنفس شكل `manufacturing.ts` — `subject: useAssetStore().permission` و`action: 'read'`.

---

## 9. الخطة المرحلية

### المرحلة 1 — الهيكل والإعدادات (2–3 أسابيع)

- [ ] توليد المشاريع الستة + ربطها بالحل والمضيف (§2.3)
- [ ] `AssetsDbContext` + `AssetsDbProperties` (schema `Assets`) + `ConfigureAssets()` في `JasimERPDbContext`
- [ ] الكيانات: `AssetClass`, `DepreciationArea`, `AssetLocation`, `AssetGroup`, `Asset`, `AssetDepreciationLine`, `AssetTransaction`, `AssetDepreciationRun(+Line)` و`AssetAreaSetting` و`AssetClassAreaAccounts` — الجداول كلها من اليوم الأول بما فيها مجالات الإهلاك وإعداداتها وحساباتها لكل مجال
- [ ] هجرة EF واحدة على مشروع المضيف
- [ ] **زرع حسابات مجمّع الاندثار وأرباح/خسائر البيع** (§3.9) + أنواع الوثائق الثلاثة عشر (§3.10) + صفوف `DocumentNumbering`
- [ ] شرائح CRUD كاملة لـ `AssetClass` / `AssetLocation` / `AssetGroup` مع التحقق من اكتمال الحسابات وقابليتها للترحيل
- [ ] `Asset` في حالة `Draft` فقط + توليد `AssetCode`
- [ ] الصلاحيات + `ar.json` / `en.json`
- [ ] الواجهة: ثلاث صفحات Type B + صفحة الأصل Type A (بلا جدول إهلاك بعد)

**معيار القبول:** إنشاء فئة بحسابات صحيحة، ورفض فئة بحساب غير قابل للترحيل برسالة مُعرّبة؛ إنشاء أصل في `Draft` وعرضه في القائمة محكوماً بـ `ApplyDataAuthority`.

### المرحلة 2 — محرّك الإهلاك والترحيل (3–4 أسابيع)

- [ ] `DepreciationScheduleGenerator` — القسط الثابت + Prorata + الدورية + قاعدة التقريب، تماماً كما في §5.1.1
- [ ] قواعد التداخل وعدم الفجوات وعكس LIFO مع القفل الموزَّع (§3.8.1)
- [ ] `AssetCapitalizeCommandHandler`: `Draft → Running` + توليد الجدول + `AssetTransaction`
- [ ] `AssetDepreciationRun`: إنشاء `Draft` (محاكاة) / `Post` / `Reverse`
- [ ] استراتيجيات القيد + تسجيلها في `AssetsDomainModule`
- [ ] التحقق من الفترة المحاسبية عبر `IPostingPeriodRepository`
- [ ] مهمة Hangfire الشهرية
- [ ] الواجهة: جدول الإهلاك (Depreciation Board) + صفحة دورة الإهلاك

**معيار القبول:** أصل 36,000 على 36 شهراً ⇒ 36 قسطاً × 1,000 ومجموعها 36,000.000000 بالضبط؛ دورة الشهر الأول تُنتج قيداً واحداً يظهر في `JournalEntries` بـ `BaseType = "232"`؛ إعادة تشغيل الدورة لنفس الفترة تُرفض.

### المرحلة 3 — دورة الحياة الكاملة (2–3 أسابيع)

- [ ] إعادة التقييم (زيادة/نقص) + إعادة توليد غير المُرحّل فقط
- [ ] النقل (موقع / عهدة) ونقل مركز الكلفة / المشروع بتاريخ سريان (§5.5) — بلا قيد افتراضياً
- [ ] مصفوفة الحالات الكاملة (§4.1): `Cancel` و`UndoCapitalization` و`ReverseSale` و`ReverseDisposal` و`Closed → Running`
- [ ] `Impair` (نوع الوثيقة `238`)
- [ ] الإهلاك حتى تاريخ الإخراج عند `Sell`/`Dispose` (§5.6.1)
- [ ] `AddCost` (`240`) و`ReduceCost` (`241`) و`ManualDepreciation` (`242`) — §5.6.2–5.6.4
- [ ] أنواع الأصول بما فيها `LowValue` (§5.6.5)
- [ ] الإيقاف والاستئناف
- [ ] البيع (ربح/خسارة) والاستبعاد بلا مقابل
- [ ] سجل `AssetTransaction` كامل مربوطاً بمعرّفات القيود
- [ ] القسط المتناقص والمختلط

**معيار القبول:** سيناريو متصل — إنشاء، رسملة، 6 دورات إهلاك، إعادة تقييم، نقل، بيع — وكل قيد صحيح ومتوازن، والأقساط الستة الأولى لم تتغيّر بعد إعادة التقييم.

### المرحلة 4 — التكامل والاستيراد (2–3 أسابيع)

- [ ] **من المشتريات:** عند ترحيل `PurchaseBill` يحمل سطراً لصنف `IsFixedAsset == true` ⇒ إنشاء `Asset` في `Draft` مع `SourceDocType`/`SourceDocId`/`SourceDocRef` — يُنفَّذ كمستمع حدث في `Assets.Application` لا بتعديل معالج المشتريات
- [ ] **إلى المبيعات:** ربط البيع بفاتورة عميل قائمة (`SourceDocId`) بدل قيد نقدي مباشر
- [ ] **استيراد الأصول القائمة (Legacy)** من Excel بنمط `ConfigurationExcels` القائم في Finance: معاينة + تحقق توازن قبل الاعتماد + `IsLegacy = true` + `ImportedAccumulatedDepreciation` + `ImportCutoffDate` + `RemainingLifeMonthsAtImport`، كلها تحت دفعة `OpeningBalance` واحدة (نوع الوثيقة `239`). أخطاء مستوى الصف في المعاينة: تاريخ القطع ليس نهاية فترة؛ العمر المتبقي ليس من مضاعفات `monthsPerPeriod`؛ المجمّع أكبر من قاعدة الإهلاك؛ العمر المتبقي 0 بينما القيمة الدفترية أعلى من التخريدية؛ عمر متبقٍّ > 0 بينما الأصل مُهلَك بالكامل (تحذير — يُستورد `Closed`)
- [ ] التقارير السبعة (بما فيها بطاقة الأصل وجدول الحركة، §7.2–7.3) + ملفات `.repx` + `ReportDataSeeder`
- [ ] **سطر فاتورة مشتريات بكمية N ينشئ N سجل أصل** (§5.6.6) — مسحوب من المرحلة 5

**معيار القبول:** تقرير المطابقة يُظهر فرقاً صفراً بين GL والوحدة بعد 12 دورة إهلاك واستيراد 50 أصلاً قائماً.

### المرحلة 5 — التوسعات (3–4 أسابيع)

- [ ] مجالات إهلاك متعدّدة (محلي + ضريبي) وكشف الواجهة
- [ ] واجهة إنشاء دفعي يدوي من قالب (قاعدة الكمية N من فواتير الشراء تُسلَّم أصلاً في المرحلة 4)
- [ ] نسب توزيع مراكز الكلفة للأصول المشتركة (`AssetCostCenterAllocation`)
- [ ] الاستبعاد الجزئي (بانتظار القرار §12.9)
- [ ] الباركود والجرد الفعلي
- [ ] جدولة الصيانة (`AssetMaintenance`)
- [ ] لوحة تحكم الأصول

---

## 10. الاختبارات الإلزامية

**وحدة** (xUnit + Moq على `DepreciationScheduleGenerator` و`AssetStateManager`):

1. قسط ثابت 36,000 / 36 ⇒ 36 × 1,000، والمجموع يساوي القاعدة تماماً.
2. تقريب 10,000 / 3 ⇒ الفرق كله على القسط الأخير، والمجموع = 10,000.
3. قيمة تخريدية: 50,000 بتخريدية 5,000 ⇒ الإهلاك على 45,000 فقط.
4. Prorata بالأيام: بدء 15 مارس ⇒ قسط أول جزئي صحيح.
5. فئة `IsDepreciable == false` (أرض) ⇒ جدول فارغ.
6. إعادة التوليد بعد ترحيل 6 أقساط ⇒ الستة الأولى لم تتغيّر لا عدداً ولا مبلغاً.
7. `Draft → Running` بحساب فئة غير قابل للترحيل ⇒ `UserFriendlyException`.
8. حذف أصل بعد ترحيل قسط ⇒ `UserFriendlyException`.

**تكامل** (ABP integration tests):

9. تشغيل دورة الإهلاك مرتين لنفس الفترة ⇒ قيد واحد فقط.
10. ترحيل في فترة `PeriodStat == 'Y'` ⇒ رفض برسالة واضحة.
11. البيع بربح وبخسارة ⇒ قيدان صحيحان متوازنان.
12. عكس دورة إهلاك ⇒ قيد `IsReversal` + عودة `IsPosted = false`.
13. مطابقة GL بعد 12 دورة.
14. مستخدم بـ `DataAuthorityLevel.Org` لا يرى أصول منظمة أخرى.
15. التداخل: دورة «كل الفئات» ودورة فئة محدّدة لنفس الفترة والمجال ⇒ تُرفض الثانية؛ فئتان مختلفتان ⇒ تُقبلان.
16. الفجوة: ترحيل آذار بينما شباط غير مُرحَّل ⇒ يُرفض؛ والمهمة المجدولة تتدارك شباط ثم آذار بالترتيب.
17. LIFO: عكس شباط بينما آذار `Posted` ⇒ يُرفض؛ عكس آذار ثم شباط ينجح؛ وقيد العكس مؤرَّخ بـ `PeriodEnd` لكل دورة.
18. عكس دورة بعد `Sale` لاحق لأحد أصولها ⇒ يُرفض إلى أن يُنفَّذ `ReverseSale`.
19. نقل مركز الكلفة: تأريخ قبل آخر سطر مُرحَّل ⇒ يُرفض؛ نقل صحيح ⇒ لا قيد، وأسطر الدورة التالية تحمل المركز الجديد، والسابقة تحتفظ بالقديم.
20. مصفوفة الحالات: `UndoCapitalization` ممنوع بعد ترحيل سطر؛ `ReverseSale` يستعيد `FromState` مع جدول مُعاد توليده؛ `Cancel` على `Draft` يُبقي الرمز محجوزاً.
21. سجل الأصول بتاريخ معيّن: أصل بيع بعد `asOfDate` يُدرَج بقيمه قبل البيع؛ إعادة تقييم بعد `asOfDate` تُتجاهل؛ الموقع بالتاريخ يتبع سجل النقل؛ أصل قديم بـ `asOfDate < ImportCutoffDate` يُستبعد ويُحصى في التذييل.
22. سجل الأصول بتاريخ معيّن يساوي مطابقة الأستاذ بنفس التاريخ السابق، بما في ذلك بعد عكس دورة.

**إضافات مقارنة SAP (§5.6، §7.2–7.3):**

29. بيع في 20 آذار لأصل شهري `ByDays` ⇒ سطر `ToDate` بنسبة 20/31 من القسط داخل قيد البيع، والمجمّع يشمله، والربح/الخسارة محسوبان على الناتج؛ والبيع ممنوع ما دام شباط غير مُرحَّل.
30. `ReverseSale` يعكس زوج `ToDate` أيضاً ويعيد توليد الجدول.
31. `AddCost` على أصل بـ 6 أقساط مُرحَّلة ⇒ الأسطر المُرحَّلة لا تُمَسّ؛ وغير المُرحَّلة يُعاد توزيعها على الفترات المتبقية بلا تغيير؛ ومجموع الإهلاك = القاعدة الجديدة.
32. `ReduceCost` دون المجمّع المُرحَّل + المستورد ⇒ `Assets:ReductionExceedsBookValue`.
33. `ManualDepreciation` فوق القيمة المتبقية القابلة للإهلاك ⇒ يُرفض؛ والصحيح ⇒ قيد خاص، وإعادة توزيع الباقي، وحدث تابع عند عكس الدورات.
34. أصل `LowValue` ⇒ سطر واحد بـ 100% في الفترة الأولى؛ `Land` ⇒ جدول فارغ؛ تجاوز الحدّ ⇒ يُرفض.
35. سطر فاتورة بكمية 5 ⇒ 5 أصول `Draft`، التكلفة موزَّعة والفرق على الأخير؛ وإعادة ترحيل الفاتورة لا تنشئ شيئاً.
36. دورة مجال غير مرحَّل ⇒ أسطر مُرحَّلة بلا قيد يومية ومستبعدة من مطابقة الأستاذ.
37. بطاقة الأصل: الأرصدة الجارية بعد مدى مصفّى تساوي السجل عند `toDate`؛ والحركة المعكوسة تظهر بصفّيها.
38. جدول الحركة: أول المدة + الحركات = آخر المدة لكل فئة، وعمود «غير مفسَّر» صفر بعد بيع وإضافة وإعادة تقييم واستيراد قديم داخل المدى.

**وحدة — التعريفات (§5.1.1):**

23. سنوي + `ConstantPeriods`، بدء 15 آذار ⇒ `f = 10/12`؛ فصلي بدأ في منتصف الربع ⇒ تُحسب الأشهر الكاملة.
24. `ByDays` عبر شباط كبيس ⇒ الأيام فعلية.
25. المثال أ.5 حرفياً: 13 سطراً، 274,194 + 11 × 500,000 + 225,806 = 6,000,000.000000.
26. التقريب بمنزلتين 0 و3 ⇒ كل سطر يُقرَّب مرة واحدة، و`|الأخير − العادي|` ضمن حدّ §5.1.1؛ ومولّد معطوب عمداً يُسقط التأكيد.
27. `UsefulLifeMonths % monthsPerPeriod != 0` ⇒ `UserFriendlyException`؛ تغيير الدورية بعد سطر مُرحَّل ⇒ يُرفض.
28. استيراد قديم: عمر متبقٍّ 24، مجمّع 50,000,000 من 80,000,000 ⇒ 24 سطراً × 1,250,000 تبدأ الفترة التالية للقطع؛ قطع في منتصف فترة ⇒ خطأ؛ عمر متبقٍّ 0 مع قيمة دفترية فوق التخريدية ⇒ خطأ؛ مُهلَك بالكامل ⇒ `Closed` وجدول فارغ.

---

## 11. المخاطر

| الخطر | الأثر | التخفيف في Enki |
|---|---|---|
| انحراف بين الوحدة ودفتر الأستاذ | خطير — يُفسد القوائم المالية | تقرير المطابقة إلزامي في المرحلة 4 + منع أي تعديل مباشر على القيم بعد الترحيل |
| أخطاء تقريب تراكمية | متوسط | الفرق كله على القسط الأخير + `Debug.Assert` + اختباران إلزاميان |
| ترحيل مكرّر عند فشل جزئي للمهمة المجدولة | خطير | قيد فريد على `(PostingPeriodId, AreaId, ClassId)` + فحص `IsPosted` + وحدة عمل واحدة |
| تعديل العمر الإنتاجي بعد الترحيل | متوسط | إعادة توليد غير المُرحّل فقط + `AssetTransaction` من نوع `Adjustment` يوثّق الحدث |
| أصول Legacy بأرصدة خاطئة | خطير | شاشة استيراد بمعاينة وتحقق توازن قبل الاعتماد |
| بطء مع آلاف الأصول | متوسط | قيد واحد لكل دورة + فهرس `(IsPosted, LineDate)` + تشغيل الدورة على دفعات بالفئة |
| دورات خارج الترتيب أو متداخلة، أو عكس دورة تحتها أحداث لاحقة | خطير — ينفصل الجدول عن الأستاذ | قفل موزَّع + قواعد عدم التداخل/الفجوات/LIFO/الأحداث التابعة (§3.8.1) + قيود العكس بتاريخ الأصل |
| اختلاف سجل الأصول بتاريخ سابق عن الأستاذ | خطير | تعريف واحد «بتاريخ معيّن» مشترك بين السجل والمطابقة (§7.1)؛ الاختبار 22 |
| أصل مستورد بعمر متبقٍّ غير متسق | خطير — مصروف مستقبلي خاطئ | `RemainingLifeMonthsAtImport` إلزامي، وقيمة مشتقة مقترحة قابلة للتجاوز، وأخطاء صف في الاستيراد |
| حسابات مجمّع الاندثار غير موجودة في الدليل | **حاجب للمرحلة 1** | تُزرع قبل أي كود آخر (§3.9) بعد اعتماد الأرقام من المحاسب |

---

## 12. قرارات مفتوحة تحتاج تأكيداً قبل البدء

1. **أرقام حسابات مجمّع الاندثار وأرباح/خسائر البيع** — الأرقام في §3.9 مقترحة ويعتمدها المحاسب.
2. **عملة الأصل** — v1 يفترض عملة النظام فقط. هل هناك أصول بعملة أجنبية تستوجب إهلاكاً بعملتين (`Amount` + `AmountFc`)؟ الحقول موجودة أصلاً في `JournalEntryPostLineDto`، فالإضافة لاحقاً لا تتطلب هجرة بيانات.
3. **قيد الرسملة** — هل تُرحَّل الرسملة من الوحدة (مدين الأصل / دائن المورّد)، أم أن فاتورة المشتريات تُرحّل الأصل بنفسها ويكتفي الأصل بالربط المرجعي؟ الخيار الثاني أسلم محاسبياً ويمنع الازدواج، وهو الافتراض المعتمد في §5.3.
4. **مصدر العهدة** — `HR.Employee` أم `IdentityUser`؟ الخطة تفترض `Employee` مع إثراء على القراءة بلا FK عبر الوحدات.
5. **دورية الإهلاك الافتراضية** — شهري لكل الفئات، أم يُترك الخيار للفئة من المرحلة 1؟ الحقل موجود في النموذج بأي حال.
6. **إعادة تصنيف مصروف السنة حتى تاريخه عند نقل مركز الكلفة** (§5.5) — الافتراضي بلا قيد (الأقساط المستقبلية فقط). هل يريد المحاسب نقل مصروف السنة المالية الحالية المُرحَّل أصلاً إلى المركز الجديد (نوع الوثيقة `237`)؟ لازم فقط إذا كان يجب أن تتبع أرباح وخسائر مراكز الكلفة الأصل بأثر رجعي.
7. **محاذاة الفترات للفئات الفصلية/السنوية** (§5.1.1) — تفترض الخطة الأرباع/السنوات المالية من التقويم المالي. التأكيد، أو اختيار الأرباع/السنوات الميلادية.
8. **حساب خسارة هبوط القيمة** — §5.3 يعيد استخدام `LossOnDisposalAcctCode` لإعادة التقييم بالنقص إلى حين اعتماد حساب مخصّص مع بقية الحسابات الجديدة في القرار 1.
9. **الاستبعاد الجزئي** (§5.6.7) — v1 يُخرج الأصول كاملة فقط وتُنشأ الحيازات المجمَّعة كـ N أصلاً. التأكيد على قبول ذلك، أو جدولة الاستبعاد الجزئي (تقسيم التكلفة والمجمّع بالتناسب) في المرحلة 5.
10. **سياسة إهلاك فترة الإخراج** (§5.6.1) — قسط `ToDate` يتبع طريقة تحاصص الفئة (`None` ⇒ لا إهلاك في شهر البيع). التأكيد، أو اشتراط تحميل شهر كامل.
11. **حدّ الأصول منخفضة القيمة** (§5.6.5) — المبلغ على مستوى المستأجر (أو «معطّل») الذي يُسمح دونه بإنشاء أصول `LowValue`.

---

## 13. المراجع

- Odoo `account_asset` وOCA `account_asset_management` — تم التحقق منها مباشرة على [`OCA/account-financial-tools@16.0/account_asset_management`](https://github.com/OCA/account-financial-tools/tree/16.0/account_asset_management): نماذج `account.asset.profile` / `account.asset` / `account.asset.line` / `account.asset.group`؛ طرق الحساب `linear` / `linear-limit` / `degressive` / `degressive-linear` / `degressive-limit`؛ خاصيتا `days_calc` و`prorata`؛ عكس السطر المُرحَّل لا حذفه.
- SAP Business One 9.0+ Fixed Assets — Asset Master Data، Asset Classes، Depreciation Areas & Types، Account Determination، Capitalization / Retirement / Transfer، Depreciation Forecast.
- الكود المرجعي داخل Enki:
  - [`Finance/PaymentTerms`](../../../jasim_api/modules/finance/src/Finance.Application/Api/PaymentTerms) — نمط الشريحة (AppService نحيف + CQRS).
  - [`Procurement/LandedCosts`](../../../jasim_api/modules/procurement/src/Procurement.Application/Api/LandedCosts/Handlers/Commands/LandedCostCreateCommandHandler.cs) — نمط الترحيل عبر `JournalPostingStrategyFactory`.
  - [`Sales/BackgroundJobs`](../../../jasim_api/modules/sales/src/Sales.Application/BackgroundJobs/SalesRecurringTransactionGenerationJob.cs) — نمط المهمة المجدولة الـ idempotent.
  - [`modules/manufacturing`](../../../jasim_api/modules/manufacturing) — نمط الوحدة الجديدة كاملاً.
  - [`Core.Integrations.FinancePosting.JournalEntryPostDto` / `JournalEntryPostLineDto`](../../../jasim_api/modules/core/src/Core.Domain.Shared/Integrations/FinancePosting) — عقد الترحيل الوحيد الذي تستهدفه كل استراتيجية في هذه الخطة.

---

## 14. الملحق أ — أمثلة محسوبة على الإهلاك

أرقام فعلية تُطبِّق كل طريقة وكل حدث معرَّف في §5، باستخدام رموز الحسابات من §3.9.

### أ.1 القسط الثابت (Straight-Line) — سيارة شركة

| الحقل | القيمة |
|---|---|
| الفئة | وسائط نقل (`1100000003`) |
| القيمة الأصلية | 36,000,000 |
| القيمة التخريدية | 0 |
| العمر الإنتاجي | 36 شهراً |
| القسط الشهري | 36,000,000 ÷ 36 = **1,000,000** |

الأشهر الستة والثلاثون كلها 1,000,000 بالضبط، ومجموعها = 36,000,000.000000 — وهذا هو اختبار القبول رقم 1 في §10.

قيد كل شهر:
```
مدين  مصروف اندثار وسائط نقل (3700000003)   1,000,000
  دائن  مجمّع اندثار وسائط نقل (1190000003)         1,000,000
```

### أ.2 القسط الثابت بقيمة تخريدية — أثاث مكتبي

| الحقل | القيمة |
|---|---|
| القيمة الأصلية | 12,500,000 |
| القيمة التخريدية | 500,000 |
| قاعدة الإهلاك | 12,000,000 |
| العمر الإنتاجي | 5 سنوات (سنوي) |
| القسط السنوي | 12,000,000 ÷ 5 = **2,400,000** |

القيمة التخريدية لا تُهلَك أبداً — تبقى 500,000 كقيمة دفترية نهائية حتى الاستبعاد.

### أ.3 المتناقص (Declining Balance) — معدة إنتاج CNC

معامل التناقص = 2 (أي معدل ثابت = 2 ÷ 5 سنوات = 40% سنوياً على الرصيد المتبقي):

| السنة | الرصيد أول الفترة | القسط (40%) | الرصيد آخر الفترة |
|---|---|---|---|
| 1 | 100,000,000 | 40,000,000 | 60,000,000 |
| 2 | 60,000,000 | 24,000,000 | 36,000,000 |
| 3 | 36,000,000 | 14,400,000 | 21,600,000 |
| 4 | 21,600,000 | 8,640,000 | 12,960,000 |
| 5 | 12,960,000 | **12,960,000** ← قاعدة «آخر قسط يأخذ كل الفرق المتبقي» | 0 |

المتناقص الصرف لا يصل رصيده إلى صفر من تلقاء نفسه؛ لذلك تفرض قاعدة §5.1 أن يأخذ القسط الأخير كامل المتبقي حتى يُقفَل الأصل تماماً.

### أ.4 المتناقص ثم الثابت (Declining-Then-Straight) — معدة (الأعدل محاسبياً)

نفس المعدة، معامل 40%، لكن كل سنة تُقارَن (المتناقص) مع (الثابت على المتبقي من الفترات) ويُؤخَذ الأكبر:

| السنة | متناقص | ثابت (متبقي÷فترات متبقية) | المُختار |
|---|---|---|---|
| 1 (متبقي 50,000,000) | 20,000,000 | 50,000,000÷5=10,000,000 | **20,000,000** (متناقص) |
| 2 (متبقي 30,000,000) | 12,000,000 | 30,000,000÷4=7,500,000 | **12,000,000** (متناقص) |
| 3 (متبقي 18,000,000) | 7,200,000 | 18,000,000÷3=6,000,000 | **7,200,000** (متناقص) |
| 4 (متبقي 10,800,000) | 4,320,000 | 10,800,000÷2=5,400,000 | **5,400,000** (ثابت — هنا يحدث الانقلاب) |
| 5 (متبقي 5,400,000) | — | — | **5,400,000** (آخر قسط = كل المتبقي) |

هذا يوضّح آلية «الانقلاب» التي تضمن إهلاكاً كاملاً بنهاية العمر الإنتاجي دون قسط أخير ضخم مفاجئ.

### أ.5 Prorata بالأيام — طابعة صناعية دخلت الخدمة في منتصف الشهر

| الحقل | القيمة |
|---|---|
| القيمة الأصلية | 6,000,000 |
| العمر الإنتاجي | 12 شهراً، قسط شهري كامل = 500,000 |
| تاريخ دخول الخدمة | 15 آذار |

- **قسط آذار (جزئي):** 17 يوماً من 31 ⇒ 500,000 × 17/31 = 274,193.55 ⇒ **274,194**
- **نيسان → شباط:** 11 شهراً كاملاً × 500,000 = 5,500,000
- **سطر الإتمام (آذار التالي):** الباقي 6,000,000 − 274,194 − 5,500,000 = **225,806** (≈ 500,000 × 14/31)، فيكون المجموع 6,000,000.000000 بالضبط وينتهي الإهلاك بعد 12 شهراً من تاريخ دخول الخدمة. وهذا 13 سطراً (`N + 1`، §5.1.1).

> *تصحيح (المراجعة 2):* كانت النسخة السابقة من المثال تعرض 10 أشهر كاملة و«قسطاً أخيراً» في شباط كان سيبلغ 725,806 — أي أكبر من القسط العادي، وهذا خطأ.

### أ.6 أصل غير قابل للإهلاك — أرض

أرض المستودع الرئيسي، `IsDepreciable = false`: الجدول فارغ تماماً منذ البداية (اختبار القبول رقم 5)، والقيمة الدفترية تبقى مساوية للقيمة الأصلية دائماً إلا بإعادة تقييم يدوية.

### أ.7 البيع بخسارة (مكرَّر من §5.3) وبربح

**بخسارة** — سيارة (أصل 100,000,000 / مجمّع اندثار 60,000,000 / بيعت بـ 50,000,000 ⇒ خسارة 10,000,000):
```
مدين  النقد                              50,000,000
مدين  مجمّع اندثار وسائط نقل             60,000,000
مدين  خسائر بيع موجودات ثابتة            10,000,000
  دائن  وسائط نقل                               100,000,000
```

**بربح** — سيارة توصيل قديمة (أصل 30,000,000 / مجمّع اندثار 28,000,000 / بيعت بـ 5,000,000 ⇒ ربح 3,000,000):
```
مدين  النقد                               5,000,000
مدين  مجمّع اندثار وسائط نقل              28,000,000
  دائن  وسائط نقل                                30,000,000
  دائن  أرباح بيع موجودات ثابتة                    3,000,000
```

### أ.8 أصل قديم مستورد (Legacy) عند بدء التشغيل

خط إنتاج قديم: القيمة الأصلية 80,000,000، بلا قيمة تخريدية، دورية شهرية، `ImportedAccumulatedDepreciation = 50,000,000` (إهلاك من النظام السابق، بلا قيد في Enki)، `ImportCutoffDate` = نهاية شهر بدء التشغيل، `RemainingLifeMonthsAtImport = 24` ⇒ القسط الشهري المستقبلي = (80,000,000 − 50,000,000) ÷ 24 = **1,250,000**، 24 سطراً، أولها بنهاية الشهر التالي لتاريخ القطع. أول قيد فعلي في Enki يبدأ من هذه النقطة فقط — لا يُعاد ترحيل الإهلاك السابق، ولا تحاصص لأن تاريخ القطع نهاية فترة.

العمر المتبقي مُدخَل صريح لا يُستنتج من التواريخ: لو كان العمر الأصلي 120 شهراً من 2018-01-01 وتاريخ القطع 2026-12-31 تقترح الشاشة 120 − 108 = 12 شهراً. ويمكن للمستخدم تجاوزها إلى 24 إن كان النظام السابق قد مدّد عمر الأصل؛ والتجاوز هو المخزَّن وهو ما يستخدمه الجدول. حالات أخرى: عمر متبقٍّ 0 مع قيمة دفترية فوق التخريدية ⇒ خطأ استيراد؛ المجمّع = قاعدة الإهلاك ⇒ يُستورد `Closed` بجدول فارغ.

### أ.9 نقل مركز الكلفة

سيارة تُهلَك 1,000,000 شهرياً على مركز *المبيعات*. دورة آذار مُرحَّلة. في 1 نيسان تنتقل السيارة إلى *اللوجستيات* (`CostCenterTransfer` بتاريخ سريان 2027-04-01). لا يُنشأ قيد. سطر آذار يبقى على *المبيعات*؛ وسطر دورة نيسان لهذا الأصل يُحسم إلى *اللوجستيات* (آخر نقل بـ `TransactionDate <= LineDate`). محاولة تأريخ النقل 15 آذار تُرفض: لأنه يسبق آخر سطر مُرحَّل.

### أ.10 السجل بتاريخ سابق

سيارة: رُسمِلت 2026-01-01 بـ 36,000,000 على 36 شهراً؛ أُعيد تقييمها بالزيادة بـ 3,000,000 في 2026-07-01؛ وبيعت 2026-11-30. السجل بتاريخ 2026-06-30: القيمة الأصلية 36,000,000 (إعادة التقييم تُتجاهل)، المجمّع 6,000,000 (ستة أسطر مُرحَّلة)، الدفترية 30,000,000، والأصل مُدرَج رغم أنه بيع لاحقاً. السجل بتاريخ 2026-12-31: الأصل مستبعد. وبتاريخ 2026-08-31 القيمة الأصلية 39,000,000.

### أ.11 بيع في منتصف الشهر مع الإهلاك حتى التاريخ

سيارة تكلفتها 36,000,000، قسط شهري 1,000,000، `ByDays`. شباط مُرحَّل (المجمّع 2,000,000)؛ بيعت في 20 آذار بـ 20,000,000. قسط حتى التاريخ = 1,000,000 × 20/31 = 645,161، فيصير المجمّع 2,645,161 والقيمة الدفترية 33,354,839 والخسارة 13,354,839.
```
مدين  مصروف اندثار وسائط نقل            645,161
  دائن  مجمّع اندثار وسائط نقل                  645,161
مدين  النقد                            20,000,000
مدين  مجمّع اندثار وسائط نقل            2,645,161
مدين  خسائر بيع موجودات ثابتة          13,354,839
  دائن  وسائط نقل                              36,000,000
```
البيع قبل ترحيل شباط يُرفض بـ `Assets:PostDepreciationFirst`.

### أ.12 إضافة لاحقة

آلة: تكلفة 60,000,000 على 60 شهراً (1,000,000 شهرياً)، 12 قسطاً مُرحَّلاً، 48 متبقياً. تُرسمَل تحسينات بـ 12,000,000 (`AddCost`). القاعدة الجديدة 72,000,000؛ المتبقي القابل للإهلاك 72,000,000 − 12,000,000 = 60,000,000؛ على الـ 48 شهراً بلا تغيير ⇒ **1,250,000** شهرياً من أول فترة غير مُرحَّلة. الأقساط الاثنا عشر المُرحَّلة لا تُعاد صياغتها.
