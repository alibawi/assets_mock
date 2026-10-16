# وحدة إدارة الأصول الثابتة (Assets Management) في Enki — خطة التنفيذ

> **الحالة:** 🟡 مسودّة للمراجعة — لم يُكتب أي كود بعد.
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
- رموز أنواع الوثائق **222–229 غير مستخدمة** في [`DocumentType.cs`](../../../jasim_api/modules/core/src/Core.Domain.Shared/Entities/DocumentTypes/DocumentType.cs) (آخر رمزين مستخدمين: `220`/`221` للإنتاج؛ والرمز التالي المستخدم هو `500`) — الرموز `230`–`236` المقترحة أدناه آمنة.

---

## 2. الموقع المعماري

### 2.1 لماذا وحدة مستقلة لا جزء من Finance

| المعيار | الحكم |
|---|---|
| حجم النطاق | 8 كيانات + محرّك حساب + 5 تقارير + وثيقتا سير عمل — أكبر من أي شريحة قائمة داخل Finance |
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
| `IsDepreciable` | bool | `false` للأراضي |
| `IsActive` | bool | |

> **قاعدة إلزامية:** يُرفض إنشاء/تعديل فئة يكون فيها أحد الحسابات المطلوبة فارغاً أو غير موجود أو `Postable == false`. يقع هذا التحقق في `AssetClassCreateCommandHandler` عبر `IGeneralLedgerAccountRepository` — **وليس في الـ Validator أبداً** ([[no-store-access-in-validators]]) — ويُرمى `UserFriendlyException` برسالة من `IStringLocalizer<AssetsResource>`.

### 3.2 `DepreciationArea` — مجال الإهلاك (مفهوم SAP؛ Odoo القياسي لا يملك مقابلاً له — انظر §12.2)

يُنشأ الجدول من اليوم الأول ويُزرع فيه صف واحد `01 — Local GAAP` (`PostsToGl = true`, `IsDefault = true`)، وتبقى واجهته مخفية حتى المرحلة 5.

الحقول: `Code` string(2) · `Name` string(100) · `PostsToGl` bool · `IsDefault` bool · `IsActive` bool.

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
| `SourceDocType` / `SourceDocId` / `SourceDocRef` | string / Guid? / string | مرجع وثيقة الشراء الأصلية، بنفس اصطلاح `BaseType`/`BaseEntry`/`BaseRef` في `JournalEntryPostDto` |
| `AcquisitionDate` | DateTime | |
| `DepreciationStartDate` | DateTime | تاريخ دخول الخدمة |
| `OriginalValue` | decimal | التكلفة الأصلية (APC) |
| `SalvageValue` | decimal | |
| `DepreciationBase` | decimal | مُخزَّن، ويُحتسب = `OriginalValue − SalvageValue` |
| `UsefulLifeMonths` / `DepreciationMethod` / `Periodicity` / `ProrataMethod` | | مُورَّثة من الفئة وقابلة للتجاوز على مستوى الأصل |
| `State` | enum | `Draft` / `Running` / `Paused` / `Closed` / `Sold` / `Disposed` |
| `IsLegacy` | bool | مستورد كرصيد افتتاحي |
| `ImportedAccumulatedDepreciation` | decimal | إهلاك ما قبل دخول النظام |
| `CurrencyCode` | string(3) | v1: عملة النظام فقط (§12.2) |
| `CostCenterId` / `ProjectId` | Guid? | يُمرَّران إلى سطر قيد الإهلاك |
| `FiscalPeriodId` | Guid? | `Core.PostingPeriod` لحظة الرسملة |

**القيمة الدفترية غير مخزَّنة أبداً.** تُحتسب في طبقة القراءة (`AssetGetByIdQueryHandler` / `AssetsRegisterReportManager`).

**الفهارس:** `(AssetCode, OrganizationId, TenantId) UNIQUE` · `(State)` · `(AssetClassId)` · `(LocationId)` · `(CustodianEmployeeId)` · `(TagNumber) UNIQUE FILTERED`.

### 3.6 `AssetDepreciationLine` — جدول الإهلاك (≈ `account.asset.line`)

`AssetId` (cascade) · `DepreciationAreaId` · `Sequence` int · `LineDate` date · `LineType` enum (`Depreciation` / `Revaluation` / `Removal`) · `Days` int? · `Amount` · `AccumulatedAmount` · `RemainingValue` · `IsPosted` bool · `DepreciationRunId` Guid? · `JournalEntryId` Guid? · `PostedAt` / `PostedBy`.

قيد فريد: `UNIQUE(AssetId, DepreciationAreaId, Sequence)`. فهرس تشغيلي: `(IsPosted, LineDate)` — هو المُستعلَم في كل دورة إهلاك.

> **القاعدة الحرجة:** عند إعادة توليد الجدول (إعادة تقييم، تعديل عمر إنتاجي، استئناف) تُحذف **الأسطر غير المُرحّلة فقط** وتُعاد الحسبة من القيمة المتبقية الحالية. السطر المُرحّل لا يُمَسّ إطلاقاً — وهو ما يطابق موقف OCA («يُعكس لا يُحذف») من الأسطر المُرحّلة.

### 3.7 `AssetTransaction` — سجل الأحداث

`AssetId` · `TransactionType` enum (`Capitalization` / `Revaluation` / `Transfer` / `Pause` / `Resume` / `Sale` / `Disposal` / `Adjustment`) · `TransactionDate` · `Amount` · `FromValue` / `ToValue` · `FromLocationId` / `ToLocationId` · `FromCustodianId` / `ToCustodianId` · `JournalEntryId` Guid? · `PostingPeriodId` · `Notes`.

هذا هو الكائن الذي تستهلكه استراتيجيات الترحيل (§5.2).

### 3.8 `AssetDepreciationRun` + `AssetDepreciationRunLine` — وثيقة دورة الإهلاك

الفرق الجوهري عن كلا النظامين المرجعيين: دورة الإهلاك الدورية في Enki **وثيقة**، لا أثر جانبي لمهمة مجدولة.

| `AssetDepreciationRun` | |
|---|---|
| `RunNumber` string(25) | من `DocumentNumberingManager` بالبادئة `DPR` |
| `PeriodEnd` date · `PostingPeriodId` Guid | الفترة المحاسبية المستهدفة |
| `DepreciationAreaId` · `AssetClassId?` | نطاق التشغيل (الكل أو فئة بعينها) |
| `Status` enum | `Draft` (محاكاة) / `Posted` / `Reversed` |
| `TotalAmount` decimal · `AssetCount` int | |
| `JournalEntryId` Guid? | قيد الدورة الواحد |

`AssetDepreciationRunLine`: `RunId` · `AssetId` · `DepreciationLineId` · `Amount` · `DeprExpenseAcctCode` · `AccumDeprAcctCode` · `CostCenterId?`.

قيد فريد على `(PostingPeriodId, DepreciationAreaId, AssetClassId)` للحالة `Posted` — هذا هو حاجز الـ Idempotency على مستوى قاعدة البيانات، إضافةً إلى فحص `IsPosted` على مستوى السطر.

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

تُضاف إلى [`DocumentTypeData`](../../../jasim_api/modules/core/src/Core.Domain.Shared/Entities/DocumentTypes/DocumentType.cs) — الرموز `230+` مؤكَّد أنها غير مستخدمة:

```csharp
public static readonly DocumentType FixedAsset           = new("Fixed Asset",            "230", "FA",  "Fixed Asset");
public static readonly DocumentType AssetCapitalization  = new("Asset Capitalization",   "231", "ACP", "Asset Capitalization");
public static readonly DocumentType AssetDepreciationRun = new("Asset Depreciation Run", "232", "DPR", "Asset Depreciation Run");
public static readonly DocumentType AssetRevaluation     = new("Asset Revaluation",      "233", "ARV", "Asset Revaluation");
public static readonly DocumentType AssetTransfer        = new("Asset Transfer",         "234", "ATR", "Asset Transfer");
public static readonly DocumentType AssetDisposal        = new("Asset Disposal",         "235", "ADS", "Asset Disposal");
public static readonly DocumentType AssetSale            = new("Asset Sale",             "236", "ASL", "Asset Sale");
```

لكل منها صف في `DocumentNumbering` (`ModuleName = "Assets"`) وإضافة إلى `_documentTypesByCode`.

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

**قواعد الانتقال المُنفَّذة في `AssetStateManager` (Domain Service):**

1. `Draft → Running` يشترط: فئة محدّدة، `OriginalValue > 0`، `SalvageValue < OriginalValue`، `DepreciationStartDate` غير فارغ، حسابات الفئة مكتملة وقابلة للترحيل، والفترة المحاسبية لتاريخ البدء غير مقفلة.
2. `DeleteAsync` مسموح فقط في `Draft` مع `IsLegacy == false` وبلا أي `AssetDepreciationLine.IsPosted == true`؛ خلاف ذلك `UserFriendlyException("Assets:CannotDeletePostedAsset")`.
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
       startDate    = lastPostedDate ?? asset.DepreciationStartDate
       periodsLeft  = (asset.UsefulLifeMonths / monthsPerPeriod) − postedCount
    3. if (!class.IsDepreciable || remaining <= 0 || periodsLeft <= 0) return []
    4. for i in 1..periodsLeft:
           amount = ComputeByMethod(method, remaining, periodsLeft, i)
           amount = Math.Round(amount, currencyDecimals, MidpointRounding.AwayFromZero)
           if (i == periodsLeft) amount = remaining        // كل فرق التقريب على القسط الأخير
           lines.Add(...); remaining -= amount
    5. Assert: Σ(lines.Amount) == asset.DepreciationBase − postedTotal
```

**الطرق:**

- `StraightLine`: `DepreciationBase ÷ عدد الفترات` (مقابل `linear` في Odoo؛ الافتراضي في SAP).
- `DecliningBalance`: `المتبقي × (DecliningFactor ÷ إجمالي الفترات)` (مقابل `degressive` في Odoo).
- `DecliningThenStraight`: الأكبر بين القسطين في كل فترة — يضمن إهلاكاً كاملاً قبل نهاية العمر (مقابل `degressive-linear` في Odoo).
- `Prorata`: `None` قسط أول كامل · `ConstantPeriods` بنسبة الفترات المتبقية في السنة · `ByDays` بالأيام الفعلية (مقابل `days_calc` في Odoo).

> التأكيد في الخطوة 5 ليس تعليقاً — هو `Debug.Assert` في المولّد **و**اختبار وحدة إلزامي لكل طريقة (§10).

### 5.2 استراتيجيات القيد

تُكتب كصفوف ترث `JournalPostingStrategyBase<T>` من [`Core.Bases.JournalPostingStrategyBase`](../../../jasim_api/modules/core/src/Core.Domain/Bases/JournalPostingStrategyBase.cs) وتُسجَّل في `AssetsDomainModule` تماماً كما تفعل [`InventoryDomainModule.cs`](../../../jasim_api/modules/inventory/src/Inventory.Domain/InventoryDomainModule.cs):

```csharp
JournalPostingStrategyFactory.RegisterStrategy<AssetTransaction>(
    DocumentTypeData.AssetCapitalization.Code, () => new AssetCapitalizationJournalStrategy());
// … ARV / ADS / ASL بنفس الشكل
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
| **إعادة تقييم بالزيادة** | `AssetAcctCode` | `RevaluationSurplusAcctCode` |
| **إعادة تقييم بالنقص** | `LossOnDisposalAcctCode` (أو حساب هبوط قيمة) | `AssetAcctCode` |
| **البيع بربح** | النقد/المدينون + `AccumDeprAcctCode` | `AssetAcctCode` + `GainOnDisposalAcctCode` |
| **البيع بخسارة** | النقد/المدينون + `AccumDeprAcctCode` + `LossOnDisposalAcctCode` | `AssetAcctCode` |
| **الاستبعاد بلا مقابل** | `AccumDeprAcctCode` + `LossOnDisposalAcctCode` | `AssetAcctCode` |
| **النقل** (موقع / عهدة فقط) | — لا قيد — | — |
| **النقل بين مراكز كلفة** | `DeprExpenseAcctCode` (المركز الجديد) | `DeprExpenseAcctCode` (المركز القديم) — ابتداءً من الفترة التالية |

مثال البيع (أصل 100,000 / مجمّع اندثار 60,000 / بيع 50,000 ⇒ خسارة 10,000):

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

1. إعادة فحص `IsPosted` على كل سطر (الحاجز ضد التزامن) + فحص القيد الفريد على `(PostingPeriodId, AreaId, ClassId)`.
2. تجميع الأسطر حسب `(DeprExpenseAcctCode, CostCenterId)` مديناً، وحسب `AccumDeprAcctCode` دائناً ⇒ **قيد واحد** لكل الدورة.
3. `await jeIntegration.PostAsync(dto)` ⇒ `Guid journalEntryId`.
4. تعليم `IsPosted = true` + `JournalEntryId` + `DepreciationRunId` على كل سطر؛ `Run.Status = Posted`.
5. كل أصل استُنفدت أسطره ⇒ `State = Closed` + `AssetTransaction` من نوع `Adjustment`.

**عكس الدورة:** قيد بـ `IsReversal = true` + `Run.Status = Reversed` + إرجاع `IsPosted = false` على الأسطر. لا حذف — بما يطابق سجل تغييرات OCA («عكس الترحيل لا حذفه») ونمط العكس المُعتمَد أصلاً في بقية Enki.

**المهمة المجدولة** (Hangfire، في `ConfigureRecurringJobs()`): تنشئ الدورة وترحّلها لليوم الأخير من الشهر السابق. إعادة تشغيلها لنفس الفترة لا تُنتج قيداً ثانياً — يمنعه القيد الفريد وفحص `IsPosted`. النمط مطابق لـ [`SalesRecurringTransactionGenerationJob`](../../../jasim_api/modules/sales/src/Sales.Application/BackgroundJobs/SalesRecurringTransactionGenerationJob.cs): لا رمي استثناء، تسجيل الخطأ، والانتقال للفئة التالية.

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
| `AssetAppService` | `/api/assets/asset` + الأفعال `capitalize` · `pause` · `resume` · `revaluate` · `transfer` · `sell` · `dispose` · `depreciation-schedule` · `recompute-schedule` |
| `AssetDepreciationRunAppService` | `/api/assets/asset-depreciation-run` + `simulate` · `post` · `reverse` |
| `AssetReportAppService` | `/api/assets/asset-report/register` · `forecast` · `by-location` · `disposals` · `gl-reconciliation` |

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
| **سجل الأصول** (Register) | كل أصل بتاريخ معيّن: القيمة الأصلية، المجمّع، الدفترية، الفئة، الموقع، العهدة |
| **توقّع الإهلاك** (Forecast) | الأقساط غير المُرحّلة بين تاريخين، مجمّعة بالفترة والفئة (يقابل Depreciation Forecast في SAP B1) |
| **الأصول حسب الموقع/العهدة** | جرد تنظيمي لا محاسبي |
| **الاستبعادات** | المبيعات والاستبعادات بين تاريخين مع الربح/الخسارة وقيد كل منها |
| **مطابقة دفتر الأستاذ** | رصيد `AssetAcctCode` في GL مقابل Σ القيم الأصلية · رصيد `AccumDeprAcctCode` مقابل Σ الأقساط المُرحّلة — مع عمود فرق يجب أن يكون صفراً |

كل تقرير له ملف `.repx` مسجَّل في `ReportDataSeeder`. صفحات التقارير في الواجهة تُخفي أزرار الحفظ/الدفع/الإغلاق والإضافة والنسخ والمرفقات على `XView` وتمرّر `:hide-audit-columns="true"` لـ `BaseGrid` ([[report-page-xview-hide-actions]]).

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
| التقارير الخمسة | صفحة تقرير (فلاتر + `BaseGrid` + طباعة) |

قواعد ملزِمة من [`jasim_web/CLAUDE.md`](../../../jasim_web/CLAUDE.md): كل صفحة داخل `XView`، كل شبكة `BaseGrid`، الخدمة ترث `CrudService` وتعرّف `urls` + `permission`، المتجر Pinia بنمط journal-entry (`init` / `saveAsync` / `getListSource` / `service` / `permission`)، والتحكم بالعرض عبر `$can(action, store.permission)`. لا مكوّنات UI مخصّصة.

التنقّل: عنصر `assets` في `src/navigation/modules/assets.ts` بنفس شكل `manufacturing.ts` — `subject: useAssetStore().permission` و`action: 'read'`.

---

## 9. الخطة المرحلية

### المرحلة 1 — الهيكل والإعدادات (2–3 أسابيع)

- [ ] توليد المشاريع الستة + ربطها بالحل والمضيف (§2.3)
- [ ] `AssetsDbContext` + `AssetsDbProperties` (schema `Assets`) + `ConfigureAssets()` في `JasimERPDbContext`
- [ ] الكيانات: `AssetClass`, `DepreciationArea`, `AssetLocation`, `AssetGroup`, `Asset`, `AssetDepreciationLine`, `AssetTransaction`, `AssetDepreciationRun(+Line)` — الجداول كلها من اليوم الأول بما فيها مجالات الإهلاك
- [ ] هجرة EF واحدة على مشروع المضيف
- [ ] **زرع حسابات مجمّع الاندثار وأرباح/خسائر البيع** (§3.9) + أنواع الوثائق السبعة + صفوف `DocumentNumbering`
- [ ] شرائح CRUD كاملة لـ `AssetClass` / `AssetLocation` / `AssetGroup` مع التحقق من اكتمال الحسابات وقابليتها للترحيل
- [ ] `Asset` في حالة `Draft` فقط + توليد `AssetCode`
- [ ] الصلاحيات + `ar.json` / `en.json`
- [ ] الواجهة: ثلاث صفحات Type B + صفحة الأصل Type A (بلا جدول إهلاك بعد)

**معيار القبول:** إنشاء فئة بحسابات صحيحة، ورفض فئة بحساب غير قابل للترحيل برسالة مُعرّبة؛ إنشاء أصل في `Draft` وعرضه في القائمة محكوماً بـ `ApplyDataAuthority`.

### المرحلة 2 — محرّك الإهلاك والترحيل (3–4 أسابيع)

- [ ] `DepreciationScheduleGenerator` — القسط الثابت + Prorata + قاعدة التقريب
- [ ] `AssetCapitalizeCommandHandler`: `Draft → Running` + توليد الجدول + `AssetTransaction`
- [ ] `AssetDepreciationRun`: إنشاء `Draft` (محاكاة) / `Post` / `Reverse`
- [ ] استراتيجيات القيد + تسجيلها في `AssetsDomainModule`
- [ ] التحقق من الفترة المحاسبية عبر `IPostingPeriodRepository`
- [ ] مهمة Hangfire الشهرية
- [ ] الواجهة: جدول الإهلاك (Depreciation Board) + صفحة دورة الإهلاك

**معيار القبول:** أصل 36,000 على 36 شهراً ⇒ 36 قسطاً × 1,000 ومجموعها 36,000.000000 بالضبط؛ دورة الشهر الأول تُنتج قيداً واحداً يظهر في `JournalEntries` بـ `BaseType = "232"`؛ إعادة تشغيل الدورة لنفس الفترة تُرفض.

### المرحلة 3 — دورة الحياة الكاملة (2–3 أسابيع)

- [ ] إعادة التقييم (زيادة/نقص) + إعادة توليد غير المُرحّل فقط
- [ ] النقل (موقع / عهدة / مركز كلفة) — مع القيد فقط عند تغيّر مركز الكلفة
- [ ] الإيقاف والاستئناف
- [ ] البيع (ربح/خسارة) والاستبعاد بلا مقابل
- [ ] سجل `AssetTransaction` كامل مربوطاً بمعرّفات القيود
- [ ] القسط المتناقص والمختلط

**معيار القبول:** سيناريو متصل — إنشاء، رسملة، 6 دورات إهلاك، إعادة تقييم، نقل، بيع — وكل قيد صحيح ومتوازن، والأقساط الستة الأولى لم تتغيّر بعد إعادة التقييم.

### المرحلة 4 — التكامل والاستيراد (2–3 أسابيع)

- [ ] **من المشتريات:** عند ترحيل `PurchaseBill` يحمل سطراً لصنف `IsFixedAsset == true` ⇒ إنشاء `Asset` في `Draft` مع `SourceDocType`/`SourceDocId`/`SourceDocRef` — يُنفَّذ كمستمع حدث في `Assets.Application` لا بتعديل معالج المشتريات
- [ ] **إلى المبيعات:** ربط البيع بفاتورة عميل قائمة (`SourceDocId`) بدل قيد نقدي مباشر
- [ ] **استيراد الأصول القائمة (Legacy)** من Excel بنمط `ConfigurationExcels` القائم في Finance: معاينة + تحقق توازن قبل الاعتماد + `IsLegacy = true` + `ImportedAccumulatedDepreciation`
- [ ] التقارير الخمسة + ملفات `.repx` + `ReportDataSeeder`

**معيار القبول:** تقرير المطابقة يُظهر فرقاً صفراً بين GL والوحدة بعد 12 دورة إهلاك واستيراد 50 أصلاً قائماً.

### المرحلة 5 — التوسعات (3–4 أسابيع)

- [ ] مجالات إهلاك متعدّدة (محلي + ضريبي) وكشف الواجهة
- [ ] الأصول الدفعيّة (إنشاء دفعة متطابقة بكمية)
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
| حسابات مجمّع الاندثار غير موجودة في الدليل | **حاجب للمرحلة 1** | تُزرع قبل أي كود آخر (§3.9) بعد اعتماد الأرقام من المحاسب |

---

## 12. قرارات مفتوحة تحتاج تأكيداً قبل البدء

1. **أرقام حسابات مجمّع الاندثار وأرباح/خسائر البيع** — الأرقام في §3.9 مقترحة ويعتمدها المحاسب.
2. **عملة الأصل** — v1 يفترض عملة النظام فقط. هل هناك أصول بعملة أجنبية تستوجب إهلاكاً بعملتين (`Amount` + `AmountFc`)؟ الحقول موجودة أصلاً في `JournalEntryPostLineDto`، فالإضافة لاحقاً لا تتطلب هجرة بيانات.
3. **قيد الرسملة** — هل تُرحَّل الرسملة من الوحدة (مدين الأصل / دائن المورّد)، أم أن فاتورة المشتريات تُرحّل الأصل بنفسها ويكتفي الأصل بالربط المرجعي؟ الخيار الثاني أسلم محاسبياً ويمنع الازدواج، وهو الافتراض المعتمد في §5.3.
4. **مصدر العهدة** — `HR.Employee` أم `IdentityUser`؟ الخطة تفترض `Employee` مع إثراء على القراءة بلا FK عبر الوحدات.
5. **دورية الإهلاك الافتراضية** — شهري لكل الفئات، أم يُترك الخيار للفئة من المرحلة 1؟ الحقل موجود في النموذج بأي حال.

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

- **قسط آذار (جزئي):** 17 يوماً من 31 ⇒ 500,000 × 17/31 ≈ **274,194**
- **نيسان → كانون الثاني:** 10 أشهر × 500,000 = 5,000,000
- **آخر قسط (شباط التالي):** يأخذ كل الفرق المتبقي ليكون المجموع = 6,000,000.000000 بالضبط.

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

خط إنتاج قديم: القيمة الأصلية 80,000,000، `ImportedAccumulatedDepreciation = 50,000,000` (إهلاك من النظام السابق، بلا قيد في Enki)، متبقٍّ من العمر الإنتاجي 24 شهراً ⇒ القسط الشهري المستقبلي = (80,000,000 − 50,000,000) ÷ 24 = **1,250,000**. أول قيد فعلي في Enki يبدأ من هذه النقطة فقط — لا يُعاد ترحيل الإهلاك السابق.
