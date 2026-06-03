# Enterprise Admin System - Engineering Roadmap

> 這是 `systems/enterprise-admin` 的專屬工程開發路線圖 (Engineering Roadmap)。
> 目標：打造具備 RBAC (Role-Based Access Control)、安全審計、易擴充的企業後台。

---

## Phase 1: Core Foundation & IAM (Identity & Access Management)
**目標：建立基本骨架、資料庫連線，以及穩定的身份驗證與授權機制。**

### Backend (`backend/`)
- [x] **DB-01**: 依據 `database_schema.md` 初始化 Prisma Schema (包含 Users, Roles, Permissions)。
- [x] **API-01**: 建立 Auth 驗證模組 (`POST /auth/login`, 產生 JWT, Refresh Token 保護)。
- [x] **API-02**: 開發 RBAC Middleware (解析 JWT 並根據權限阻擋路由)。
- [x] **SYS-01**: 建立全域錯誤處理 (Global Error Handler) 與統一的日誌記錄 (Logger)。

### Frontend (`admin-ui/`)
- [x] **UI-01**: 建立全域狀態管理 (Zustand 或 React Context) 以保存登入資訊與 Token。
- [x] **UI-02**: 實作登入頁面 (`/login`) 與私有路由守衛 (Auth Guard)。
- [x] **UI-03**: 搭建後台主版面 (Sidebar, Header, Breadcrumbs)。
- [x] **UI-04**: 設定 Axios Interceptors (自動帶入 Bearer Token、統一處理 401 登出)。

---

## Phase 2: System Administration & Auditing
**目標：建立管理系統本身使用者、角色與追蹤資安紀錄的功能。**

### Backend (`backend/`)
- [x] **API-03**: Users CRUD API (列表、新增、狀態更新、指派角色)。
- [x] **API-04**: Roles & Permissions 設定 API。
- [x] **API-05**: 實作 Audit Logs Middleware (攔截敏感操作並寫入資料庫)。
- [x] **API-06**: Audit Logs 查詢 API (支援分頁、時間區間過濾)。

### Frontend (`admin-ui/`)
- [x] **UI-05**: 使用者管理頁面 (`/users`)：包含資料表 (Data Table)、分頁、編輯彈窗。
- [x] **UI-06**: 角色管理頁面 (`/roles`)：介面用來勾選與綁定特定 Permissions。
- [x] **UI-07**: 審計日誌頁面 (`/audit-logs`)：唯讀資料表，提供搜尋與時間過濾。

---

## Phase 3: Business Domain Features (業務操作模組)
**目標：將 `startup_template_pack` 內定義的營運核心需求轉化為後台系統。**

### 模組一：商品與供應鏈管理 (對應 08_庫存與SKU策略)
- [x] **API-07**: `Products`/`SKUs` CRUD (包含分類、成本、售價、毛利率、安全庫存天數)。
- [x] **API-08**: `Suppliers` 供應商 CRUD (包含評分、退貨率、到期準時率)。
- [x] **UI-08**: `/inventory` 商品庫存水位監控表 (標示低於安全庫存的警示)。
- [x] **UI-09**: `/suppliers` 供應商評估與管理介面。

### 模組二：客戶關係與留存率 CRM (對應 16_90天驗證 & 28_Roadmap)
- [x] **API-09**: `Customers` 顧客資料庫 (追蹤來源、首購時間、聯絡紀錄)。
- [x] **API-10**: 回購率與 LTV 計算 API。
- [x] **UI-10**: `/crm` 客戶名單畫像，支援篩選「首購客」與「回購客」。

### 模組三：高階營運儀表板 (對應 11_營運KPI與儀表板)
- [x] **API-11**: 聚合當週 / 當月運營指標 (CAC, 總毛利率, 現金轉換週期 CCC)。
- [x] **UI-11**: `/dashboard` 替換目前的佔位頁面，實作視覺化圖表與 KPI 燈號警示。

---

## Phase 3.5: Technical Debt Remediation (架構品質強化)
**目標：依據 [ADR-005](infrastructure/adr/adr_005_phase3_technical_debt.md) 發現的 6 項技術債務進行修復，確保 Phase 4 以乾淨架構基底推進。**

###  P0 — 必須立刻修正 (阻塞性風險)
- [x] **DEBT-01**: 統一 `PrismaClient` 單例 — 所有 Service 改用 `lib/prisma.ts` 的共享實例，禁止各自 `new PrismaClient()`。
- [x] **DEBT-02**: 提取共用 `AppError` 類別至 `lib/errors.ts`，並修正 `error.middleware.ts` 以映射其 `statusCode` 與 `errorCode`。

###  P1 — Phase 4 Sprint 1 解決 (安全與品質)
- [x] **DEBT-03**: 所有 CRM / Inventory / Dashboard 路由套用 `requirePermission()` RBAC 中介層。
- [x] **DEBT-04**: 將 Inventory 相關權限 (`products:read/create/update`, `suppliers:read/create/update`) 加入 `seed.ts` 並同步 SUPER_ADMIN。
- [x] **DEBT-05**: 消除 Service 層中所有 `any` 類型，改用 Prisma Generated Types 與自定義 DTOs。

###  P2 — Phase 4 Sprint 2 解決 (一致性與體驗)
- [x] **DEBT-06**: 統一所有 API 回應格式為 `{ success: true/false, data, error }` (移除 `status: 'success'` 變體)。
- [x] **DEBT-07**: 前端資料層遷移至 TanStack Query（所有頁面統一 cache + refetch）-query` (TanStack Query)，取代 `useEffect + useState` 資料獲取模式。

---

## Phase 4: Platform Extension (平台擴展)
**目標：完成訂單管理與生命週期價值基礎。**

### 模組一：訂單管理與真實 LTV
- [x] **API-14**: `Orders` 訂單 CRUD (含退貨流程、付款狀態追蹤)。
- [x] **API-15**: 訂單完成後自動回寫 `Customer.totalSpent` 與 `purchaseCount`。
- [x] **UI-13**: `/orders` 訂單列表與詳情頁。

---

## Phase 5: SaaS Architecture & Financial Intelligence (財務智能引擎)
**目標：定義 SaaS 化架構基礎，建立對齊 Template Pack 的完整營運 KPI 引擎與財務報表系統。**

### 模組一：SaaS 多租戶基礎 (ADR-006)
- [x] **SAAS-01**: 建立 `Tenant` Model 與 row-level isolation 中介層（Prisma extension 自動注入）。
- [x] **SAAS-02**: 所有核心 Model 加入 `tenant_id` 欄位與自動注入邏輯；`Role`/`Customer`/`Product`/`Tag`/`ProductCategory` 唯一約束升級為 tenant-scoped 複合鍵。
- [x] **SAAS-03**: Plan-based feature gating (`free`/`starter`/`pro`)。

### 模組二：營運 KPI 引擎 (對應 11_營運KPI / 12_單位經濟)
- [x] **KPI-01**: 統一 Analytics Service，計算 gross_margin / CCC / CAC / AOV / LTV / bonus_gate_pass。
- [x] **KPI-02**: `GET /analytics/kpis` 與 `GET /analytics/trends` API。
- [x] **UI-15**: `/dashboard` 升級 — 整合 KPI 燈號警示與趨勢折線圖 (Chart.js)。

### 模組三：毛利分析報表
- [x] **FIN-01**: Margin Service — 按商品/分類/月度計算毛利率。
- [x] **UI-16**: `/reports/margin` 毛利分析頁（當月儀表盤 + 逐品毛利表 + 趨勢圖）。

### 模組四：現金流追蹤
- [x] **FIN-02**: `Expense` Model 與 CRUD API（營業費用手動登記）。
- [x] **FIN-03**: CashFlow Service — 對齊 13_三年財務模型 格式產出月度現金流表。
- [x] **UI-17**: `/reports/cashflow` 現金流頁（瀑布圖 + 月度滾算表）。

### 模組五：產品銷售排行
- [x] **FIN-04**: Sales Ranking Service — 按營收/數量/毛利貢獻排名。
- [x] **UI-18**: `/reports/sales-ranking` 銷售排行頁（Top 10 排行榜 + 分類圓餅圖）。

---

## Phase 5.5: CI/CD & Technical Debt Remediation (架構品質強化 II)
**目標：修復 CI/CD Pipeline 失敗、移除殘留技術債、提升開發體驗與代碼品質。**

###  P0 — CI/CD 阻塞性修復
- [x] **CICD-01**: 修正 `ci.yml` 中 `working-directory` 路徑錯誤（`./backend` → `./systems/enterprise-admin/backend`，`./admin-ui` → `./systems/enterprise-admin/admin-ui`）。
- [x] **CICD-02**: 修正 `cache-dependency-path` 指向正確的 `package-lock.json` 位置。
- [x] **CICD-03**: 移除重複的 `tsc --noEmit` Step（`npm run build` 已包含 type check）。

###  P1 — 殘留依賴清理
- [x] **DEBT-08**: 移除 `package.json` 中 Jest 殘留依賴（`jest`, `ts-jest`, `@types/jest`），專案已全面使用 Vitest。
- [x] **DEBT-09**: 刪除 `jest.config.js`、`test.js`、`test.ts`、`tsc-errors.txt` 殘留檔案。
- [x] **DEBT-10**: 移除 `docker-compose.yml` 棄用的 `version: '3.8'` 欄位。

###  P2 — 架構品質提升（規劃中）
- [x] **DEBT-11**: ESLint 9 flat config 遷移 — 將 `.eslintrc.cjs` 遷移至 `eslint.config.mjs`（ADR-007）。
- [x] **DEBT-12**: 前端加入 ESLint + Vitest 基礎測試覆蓋。
- [x] **DEBT-13**: 開發環境 SQLite → Docker PostgreSQL 切換（對齊架構文件規範，ADR-007）。

---

## Phase 6: External Integrations & Advanced Automation (規劃中)
- [x] **INT-01**: LINE Messaging API (行銷推播與互動)
- [x] **INT-02**: 批次匯入匯出 (Excel/CSV) — 後端 export/import API、前端 Export/Import 按鈕已全部接上（Products、Orders、Inventory）
- [x] **INT-03**: 外部會計系統拋轉 (QuickBooks/Xero — adapter scaffold + mock provider; real SDKs deferred)

---

## Phase 6.2: Frontend UI Structure Refinement (UI 細節結構優化)
**目標：將 Phase 6 建立的設計系統徹底落實到所有次要頁面，確保所有表格、按鈕與輸入框的一致性高級感。**

- [x] **UI-19**: 重構 **Audit Logs** 與 **Users/Roles** 頁面 (套用標準 `.table`, `.btn`, `.input-field`)。
- [x] **UI-20**: 重構 **Inventory (Products)** 與 **Suppliers** 頁面 (修復表格標題擠壓，統一按鈕樣式)。
- [x] **UI-21**: 重構 **Orders** 與其他報表頁面的基礎控制項。

---

## Phase 7: Data Analytics Engine (數據分析引擎)
**目標：利用既有資料（免修改 Schema），建立高商業價值的藥局營運分析模組。**

### 模組一：客戶分層與回購預警 (CRM 進階)
- [x] **API-16**: `GET /analytics/rfm` RFM 客戶分層分析 (VIP / 忠誠 / 流失高危)。
- [x] **API-17**: `GET /analytics/churn-risk` 客戶回購週期 + 流失預警。
- [x] **UI-22**: `/crm/analytics` 顧客分層儀表板（5 分段摘要卡 + 客戶名單）。
- [x] **UI-23**: `/crm/analytics` 流失風險預警列表（Churn Risk 標籤頁）。

### 模組二：商品與供應商進階分析
- [x] **API-18**: `GET /analytics/product-abc` ABC 商品毛利交叉分析。
- [x] **API-19**: `GET /analytics/supplier-ranking` 供應商綜合績效排名。
- [x] **UI-24**: `/inventory/analytics` 商品四象限矩陣圖（Stars / Cash Cows / Hidden Gems / Underperformers）。
- [x] **UI-25**: `/inventory/analytics` 供應商複合評分排行（40% 營收 + 30% 毛利 + 20% 交期 + 10% 缺陷率）。

### 模組三：營運時段與獎金門檻
- [x] **API-20**: `GET /analytics/bonus-gate` 獎金門檻即時追蹤 (Gate Pass 達標狀態)。
- [x] **API-21**: `GET /analytics/heatmap` 銷售時段熱力圖（7×24 網格）。
- [x] **UI-26**: 擴充 `/dashboard`，整合獎金燈號與時段熱力圖。

---

## Phase 7.5: Analytics P0 Fixes & SaaS Constraint Hardening
**目標：修復 Analytics 模組的生產風險問題，強化 SaaS 多租戶正確性。**

###  Analytics P0 修復
- [x] **FIX-01**: 修復 `getSalesHeatmap()` 時區 Bug — 使用 UTC+8 offset 取代 Node.js local `getDay()/getHours()`。
- [x] **FIX-02**: 修復 `parsePeriod()` 日期邊界 — 使用次月起始點取代 `endOfMonth()`，避免月末訂單漏算。
- [x] **FIX-03**: 優化 `getSupplierRanking()` N+1 查詢 — 拆分為 `product.groupBy` + `$queryRaw` 聚合，消除潛在 600+ 次查詢。

###  SaaS 多租戶約束強化
- [x] **FIX-04**: `Role`/`Customer`/`Product`/`Tag`/`ProductCategory` 全部 `@unique` 升級為 `@@unique([field, tenantId])`。
- [x] **FIX-05**: `seed.ts` 所有 `upsert` 改用複合唯一鍵，對齊 schema 變更。
- [x] **FIX-06**: `crm.service.ts`、`roles.service.ts` 查重邏輯改用 tenant-scoped 複合鍵。
- [x] **FIX-07**: `vitest.config.ts` → `.mts`，修復 `ERR_REQUIRE_ESM`；更新測試斷言對齊新權限數量。

###  前端 P0 修復
- [x] **FIX-08**: 修復 `MarginAnalysisPage`、`SalesRankingPage`、`CashFlowPage` 刷新按鈕（`setPeriod(period)` → `queryClient.invalidateQueries()`）。
- [x] **FIX-09**: 補全 `ProductListPage`、`SupplierListPage`、`OrderListPage` 的 Add/Edit 按鈕事件綁定。

---

## Phase 7.6: PharmaSaaS Design System Foundation (設計系統基礎 — 待 merge)
**目標：整合 `codex/design-system-pos` 分支的設計系統 token，為 Phase 9 POS UI 奠定視覺基礎。**
**計畫 merge 時機：Phase 8 開始前（Schema 升級前）。**

### Merge 前置作業
- [x] **DS-00**: CSS 衝突解析 — 3-way merge `index.css`（PharmaSaaS tokens vs 現有 v3.0 tokens），確認 backward-compatible alias 不破壞現有頁面。
- [x] **DS-00b**: `AdminLayout.tsx` 衝突解析 — 合併佈局結構調整，驗證所有路由頁面正常渲染。

### 設計系統核心
- [x] **DS-01**: PharmaSaaS Design Token 遷移 — `--color-primary`、`--color-ink`、`--color-canvas` 等完整 token 體系整合進 `index.css`。
- [x] **DS-02**: Admin Shell Layout 重構 — 整合更新後的 `AdminLayout.tsx`。

### 輔助功能
- [x] **DS-03**: Demo / Preview 模式 — 整合 `authDemo.ts`、`demoLogin()` 與 wildcard 權限 (`*`)，供展示用途。
- [x] **DS-04**: POS Preview 頁面 — 整合 `PosPreviewPage.tsx` 雛形（88 行），作為 Phase 9 的視覺參考起點。

---

## Phase 7.7: Project Architecture Cleanup (架構整頓)
**目標：降低 AI 上下文噪音，建立可導航的 monorepo 結構，讓人與 AI 都能快速定向。**

- [x] **ARCH-01**: 建立 `CLAUDE.md` — Claude Code 原生上下文，替換過期的 `AI_CONTEXT.md`。
- [x] **ARCH-02**: 重寫根目錄 `README.md` — 含架構總覽、技術棧、快速啟動、文件索引。
- [x] **ARCH-03**: 建立 `systems/enterprise-admin/README.md` — 系統層入口說明。
- [x] **ARCH-04**: 建立 `docs/architecture.md` — 系統邊界圖、資料流、ADR 索引。
- [x] **ARCH-05**: 強化 `.aiignore` — 排除 `business/`、`docs/archive/`、`plans/archive/`。
- [x] **ARCH-06**: 封存已完成的計畫檔案至 `docs/archive/` 和 `infrastructure/plans/archive/`。
- [x] **ARCH-07**: 搬移 `startup_template_pack/` → `business/templates/`（商業文件獨立管理）。
- [x] **ARCH-08**: 刪除根目錄殘骸（`implementation_plan.md.resolved`、`AI_CONTEXT.md`）。

---

## Phase 8: Sales Foundation (銷售基盤強化)
**目標：擴展資料庫 Schema，讓 Order 模型從「後台手動建單」升級為「可承接 POS 即時銷售」。**

### 模組一：Schema 升級與遷移 (Prisma)
- [x] **DB-02**: 升級 `Order` 模型（加入 `order_number`, `order_type`, `payment_method`, `shift_id` 等欄位）。
- [x] **DB-03**: 新增 `ProductBatch` 模型（效期批號 FIFO 管理）。
- [x] **DB-04**: 新增 `Shift` (班別) 與 `DailySettlement` (日結對帳) 模型。
- [x] **MIG-01**: 建立 Prisma Migration `20260516140834_phase_8_sales_foundation` 並確保既有手動訂單資料向上相容。

### 模組二：班別與批號核心 API
- [x] **API-22**: `Shift` CRUD API (開班、交班狀態追蹤)。
- [x] **API-23**: `ProductBatch` API (入庫批號登錄、即期品查詢)。
- [x] **API-24**: `DailySettlement` API (日結計算與確認)。
- [x] **UI-27**: `/inventory/batches` 批號與效期管理頁面。
- [x] **UI-28**: `/shifts` 班別管理與日結報表頁面。

---

## Phase 9: POS System Integration (POS 系統建置)
**目標：建立適用於門市快速結帳的操作介面，達成即時資料閉環。**
- [x] **POS-01**: 獨立 pos-ui SPA（三欄式結帳 UI、條碼掃描、鍵盤快捷鍵、員工切換業績歸屬）。
- [x] **POS-02**: 多付款方式（CASH/CARD/LINE_PAY/TRANSFER）、商品層級折扣與整筆折扣、FIFO 批次扣庫存。
- [x] **POS-ESC**: ESC/POS 熱感應收據（後端 buffer 產生 + WebUSB 列印）。
- [x] **POS-OFF**: 離線佇列（IndexedDB 50 筆上限 + 網路恢復自動同步架構）。
- [x] **POS-UX-1**: 條碼 fallback 後端查詢（未找到時呼叫 API，單一結果自動加入、多結果填格）、庫存不足/重複掃描回饋 toast、掃描後焦點歸位。
- [x] **POS-UX-2**: 付款 Modal 強化（結帳摘要、現金找零計算、現金不足時 Confirm 停用、銷售人員顯示、防誤觸 backdrop）。
- [x] **POS-UX-3**: 收據 Modal 強化（列印 loading/retry 狀態、錯誤提示、列印失敗讓錯誤傳回 UI）。
- [x] **POS-UX-4**: 響應式版面（POS Layout CSS class 系統、tablet ≤1023px 自適應、行動裝置 ≤767px cart 固定底部）。
- [x] **POS-UX-5**: 離線佇列 UI（OfflineStatus topbar 元件：連線燈、待同步筆數、手動同步按鈕）、印表機狀態燈（USB/瀏覽器列印）。
- [x] **POS-UX-6**: 管理員控制（商品折扣 ≥20% / 整筆折扣 ≥500元 警示、交班按鈕與結帳金額輸入流程）。
- ~~**POS-03**: 電子發票 API 串接~~ — 無限期延期。

---

## Arch-Fix Phase 1: P0 緊急修復
**目標：消除會立即造成 bug 或誤導使用者的問題。**

- [x] **AF-01**: `AnalyticsController` 8 個 method 改用 `next(err)`，移除自行 try/catch + res.status(500)。（驗證時發現程式碼早已完成，2026-05-20 同步文檔）
- [x] **AF-02**: `DashboardPage` 移除 hardcoded `"+12.5% from last month"`；目前以 `customers.newThisMonth` 真實值取代。（程式碼已實作，文檔同步 2026-05-20）
- [x] **AF-03**: `backend/src/lib/prisma.ts` 的 `MappedModels` 已含 `Shift`、`ProductBatch`、`DailySettlement`（並追加 `AccountingSyncLog`、`MessageBroadcast`）。

---

## Arch-Fix Phase 2: 型別與一致性整頓
**目標：消除型別安全窟窿、統一前後端資料層模式。**

- [x] **AF-04**: 各子 Analytics Service（`crm-analytics`、`product-analytics`、`operations-analytics`）均加入顯式 `requireTenantId()` 呼叫。（2026-05-19）
- [x] **AF-05**: `PAYMENT_LABELS` 提取到 `pos-ui/src/constants.ts`，`CartPanel`、`PaymentModal`、`ReceiptModal` 三個 component 共用。（2026-05-19）
- [x] **AF-06**: 後端 Service 層消除可修復的 `as any`（`crm.service.ts`、`inventory.service.ts`、`order.service.ts`）。（2026-05-19）
- [x] **AF-07**: `pos-ui` 引入 TanStack Query，`getProducts` / `getCategories` 改為 `useQuery`，解決無 cache 與庫存數字過時問題。（2026-05-19）
- [x] **AF-08**: `POSCheckoutPage` 重構：抽出 `useShift()` hook + `useCheckout()` hook，將 8 個 useState 降到 6 個以內。（2026-05-20）

---

## Arch-Fix Phase 3: 效能與安全強化
**目標：解決 Auth / Tenant middleware 每次 request 打 DB 的問題，加入 rate limiting。**

- [x] **AF-09**: JWT payload 加入 `tenantId`（login 和 refresh 時寫入），`tenant.middleware.ts` 直接讀 JWT 取 tenantId，移除第一次 DB 查詢。（2026-05-19）
- [x] **AF-10**: JWT payload 加入 `permissions[]`，`auth.middleware.ts` 直接驗 payload，移除 3 層 join 查詢；`roles/permissions` 變更時強制重新登入。（2026-05-19）
- [x] **AF-11**: 加入 `express-rate-limit`：POS 120/min、Analytics 30/min、全域 300/min。（2026-05-19）

---

## Arch-Fix Phase 4: Analytics Service 拆分
**目標：消解 God Object，各子領域獨立可測試。**

- [x] **AF-12**: 建立 `modules/analytics/services/` 子目錄，拆分為 `crm-analytics.service.ts` / `product-analytics.service.ts` / `operations-analytics.service.ts`，共用型別集中於 `analytics.types.ts`。（C-04，2026-05-19）
- [x] **AF-13**: `analytics.controller.ts` 改為呼叫各子 service，HTTP 路由與回應形狀不變。（C-04，2026-05-19）
- [x] **AF-14**: 對各子 service 補充對應的獨立 unit test（目前測試掛在整合層，缺少子 service 隔離測試）。（2026-05-20）

---

## Arch-Fix Phase 5: Float → Decimal 金額精度遷移
**目標：消除 POS 結帳 / 日結 / 財務報表的浮點精度 bug。**

- [x] **AF-15**: Prisma Schema 所有金額欄位從 `Float` 改為 `Decimal`（`costPrice`、`retailPrice`、`totalAmount`、`discountAmount`、`unitPrice`、`finalUnitPrice`、`Expense.amount`、`Shift.openingCash/closingCash`、`DailySettlement.*Amount`）並建立 migration。（2026-05-20）
- [x] **AF-16**: Service 層所有算術使用 `Number(x)` 轉換；前端介面改為 `number | string`，顯示/運算前呼叫 `Number()`。（2026-05-20）
- [x] **AF-17**: 撰寫 ADR-010 記錄 Float → Decimal 決策與遷移策略。（2026-05-20）

---

## Arch-Fix Phase 6: Shared Types + E2E + Feature Gating
**目標：建立可擴展的 monorepo 結構，補全測試防護網，落地 SaaS 功能限制。**

- [x] **AF-18**: 建立 `packages/types/` workspace（pnpm workspace），backend Zod schema `infer` 輸出 shared types，`pos-ui` / `admin-ui` 直接 import，不再各自定義。（2026-05-20）
- [x] **AF-19**: Playwright E2E 覆蓋 POS 完整結帳流程（login → 開班 → 掃條碼 → 結帳 → 驗庫存扣減 → 驗收據）。（2026-05-20）
- [x] **AF-20**: SAAS-03 Plan-based feature gating 落地：`requirePlan()` 套用到 reports 路由，前端 axios interceptor 攔截 403 並顯示 `PlanUpgradeToast`。（2026-05-20）

---

## Phase 9.5: POS UI Warm Minimalist Design System (已完成 2026-05-22)
**目標：將 POS 介面從功能陽春升級為具品牌感的精品藥局風格。**

- [x] **UI-DS-01**: 建立 Warm Minimalist 設計 token 體系（`--bg-app: #FBF8F3`、`--accent: #D97706`、`--border: #E8DDD0`、全面升級 `--radius-*`）。
- [x] **UI-DS-02**: 商品卡重設計 — emoji icon（依 SKU 自動對應）、緊湊高度（`align-items: start` grid）、Amber 大字價格、庫存狀態 pill。
- [x] **UI-DS-03**: 分類導航從垂直 sidebar 改為橫向 pill tabs。
- [x] **UI-DS-04**: 搜尋欄移入 TopBar；品牌 icon（🌿）+ 藥局副標題。
- [x] **UI-DS-05**: Cart Panel 暖米色底、圓角 CartItem card、付款方式 pill、Amber gradient 結帳按鈕。
- [x] **UI-DS-06**: 登入頁 / 開班頁同步套用暖色系 + 全圓角設計。

---

## Phase 9.7: POS Completeness (POS 完整性補齊)
**目標：補齊真實門市每天必用的核心功能，確保 POS 能獨立上線營運。**
**AI 功能（Phase 10）延期至本 Phase 完成後執行。**

### Sprint 1 — 純前端修補（無需後端）
- [x] **POS-C-01**: 修復 `clearCart` — 補上 `paymentMethod: 'CASH'` reset，避免上筆付款方式殘留。
- [x] **POS-C-02**: 收銀機錢箱控制 — 現金結帳後送出 ESC/POS `ESC p` 指令自動開錢箱。
- [x] **POS-C-03**: 管理員 PIN 碼授權 — 折扣超過閾值時鎖定結帳，要求輸入班別管理員 PIN 才能放行。
- [x] **POS-C-04**: 掛單暫存（Hold Order）— cartStore 支援多購物車暫存；TopBar 顯示掛單數量；可切換 / 刪除掛單。

### Sprint 2 — 後端 + 前端
- [x] **POS-C-05**: 今日訂單查詢 — `GET /pos/orders/today` + `OrderLookupModal`（可按班別篩選、顯示品項明細）。
- [x] **POS-C-06**: 退貨 / 退款流程 — `POST /pos/orders/:id/refund` + `RefundModal`（整筆退貨、還原庫存、記錄 InventoryTransaction IN）。
- [x] **POS-C-07**: X/Z 班報表 — `GET /shifts/:id/report` + `ShiftReportModal`（各付款方式分計、退款合計、現金應在金額、可列印）。
- [x] **POS-C-08**: 庫存不足錯誤 UX — checkout 400 庫存不足時顯示明確 toast（商品名 + 剩餘庫存），而非靜默失敗。

### Sprint 3 — 複雜功能
- [x] **POS-C-09**: 拆單付款（Split Payment）— 新增 `OrderPayment` model；一筆訂單可指定兩種付款方式及各自金額；前端付款 modal 支援「+加入第二付款」。
- [x] **POS-C-10**: 顧客面向顯示器（Customer Display）— BroadcastChannel API 開新視窗，即時同步購物車品項與總計給顧客看。

---

## Phase 10: POS AI Intelligence (POS 智慧輔助，延後至 Phase 9.7 完成後)
**目標：在 POS 結帳流程中加入客戶識別、個人化推薦與庫存智慧預警，提升客單價與補貨效率。**

### 模組一：結帳客戶識別
- [x] **AI-01**: `GET /pos/customer-lookup` — 以電話號碼或會員條碼查詢客戶，回傳姓名、RFM 分層、最近購買、LTV、到期補充品清單。
- [x] **AI-02**: POS TopBar 加入客戶搜尋欄（電話輸入 / 條碼掃描），識別後顯示客戶名片 panel（層級徽章 + 累計消費 + 距上次來店天數）。
- [x] **AI-03**: VIP / 高風險流失客戶自動提示 toast（「VIP 客戶，LTV $12,500」或「90 天未回購，請關懷」）。

### 模組二：個人化商品推薦
- [x] **AI-04**: `GET /pos/recommendations/:customerId` — 依購買週期推算「即將用完」商品，結合 ABC 分析優先推高毛利品項，回傳最多 3 筆推薦。
- [x] **AI-05**: Cart Panel 底部顯示推薦 chips（「上次買了魚油，可能需要補貨」），點擊直接加入購物車。
- [x] **AI-06**: 無客戶時顯示「熱銷商品」推薦（依當日 / 當週銷售量排序）。

### 模組三：庫存智慧預警
- [x] **AI-07**: `GET /analytics/reorder-forecast` — 依各 SKU 近 30 天銷售速率 × 安全庫存天數，預測補貨日期，標記「本週須補貨」清單。
- [x] **AI-08**: POS TopBar 加入庫存預警角標（N 項本週須補貨），點開顯示詳細預警清單。
- [x] **AI-09**: Dashboard 整合補貨預警 widget。

---

## Phase 11: Production Deployment (生產環境建置)
**目標：將 backend、admin-ui、pos-ui 三個服務打包成可一鍵啟動的 production Docker 環境。**

### 模組一：pos-ui Docker 化
- [x] **DEPLOY-01**: 建立 `pos-ui/Dockerfile`（multi-stage: node build → nginx serve）。
- [x] **DEPLOY-02**: 建立 `pos-ui/nginx.conf`（SPA fallback、gzip、cache headers）。
- [x] **DEPLOY-03**: 更新根目錄 `docker-compose.yml`，加入 `pos-ui` service（port 5174 → Nginx 80）。

### 模組二：Nginx 統一入口
- [x] **DEPLOY-04**: 建立 `nginx/` reverse proxy 配置，統一入口：
  - `/api/*` → backend:3000
  - `/pos` → pos-ui:80
  - `/` → admin-ui:80
- [x] **DEPLOY-05**: SSL/TLS 佔位配置（Let's Encrypt certbot 掛載路徑預留）。

### 模組三：環境設定與 CI/CD
- [x] **DEPLOY-06**: 建立 `.env.production.example`（各服務生產環境變數模板，含 JWT secrets、DB URL、CORS）。
- [x] **DEPLOY-07**: 更新 `.github/workflows/ci.yml`，加入 pos-ui build + type-check job。
- [x] **DEPLOY-08**: 建立 `Makefile`（`make dev` 啟動全 stack、`make prod` 建置 production image、`make migrate` 執行 DB migration）。

### 模組四：健康檢查與監控
- [x] **DEPLOY-09**: 所有服務加入 `/health` endpoint，docker-compose healthcheck 完整設定。
- [x] **DEPLOY-10**: 撰寫 ADR-011 記錄 production deployment 架構決策。

---

## Phase 12: Admin-UI Visual Redesign (延後執行，低優先度)
**目標：將 admin-ui 後台套用一致的設計語言，提升管理介面的品牌感與易用性。**
**計畫啟動時機：Phase 10 + Phase 11 完成後。**

- [x] **ADM-UI-01**: 建立 admin-ui 設計 token（與 pos-ui 共用 brand tokens，但保留深色 admin shell 風格）。
- [x] **ADM-UI-02**: Dashboard、Users、Roles 頁面視覺升級。
- [x] **ADM-UI-03**: 報表頁面（Margin、CashFlow、SalesRanking）圖表樣式統一。
- [x] **ADM-UI-04**: 共用 component library 抽象決策完成。依 [ADR-012](infrastructure/adr/adr_012_shared_ui_library_decision.md) 暫緩建立 `packages/ui/`；目前保留 app-local primitives，等跨 app primitive reuse 達到 ADR 門檻再重啟。

---

## Phase 13: Cloud-Run Improvement Roadmaps (雲端代理改善計畫)
**目標：把下一輪改善拆成雲端 agent 可獨立執行的 roadmap，並在文件內附上本機不可見的 required skills 與 fallback workflow。**
**執行紀錄：** [`docs/archive/plans/2026-06-02-cloud-improvement-roadmaps.md`](../../docs/archive/plans/2026-06-02-cloud-improvement-roadmaps.md)

- [x] **CLOUD-01**: Fresh Architecture And Test Health Audit — 重新產出目前架構健康與測試/CI 狀態。
- [x] **CLOUD-02**: Production Readiness Hardening — 補齊 production runbook、migration/rollback、backup/monitoring 操作文件。
- [x] **CLOUD-03**: Admin-UI Visual Redesign — 執行 Phase 12 的 admin-ui 視覺一致化。
- [x] **CLOUD-04**: Shared UI Library Decision — 判斷並最小化落地 `packages/ui/`，或記錄暫不抽象的決策。

---

## Phase 14: Architecture Deepening Backlog (2026-06-03 Review)
**目標：把 architecture review 的仍有效改善項目轉成可執行 roadmap；已完成或已由 ADR 決策暫緩的項目不再保留為活待辦。**
**Review 來源：** `C:\Users\User\AppData\Local\Temp\architecture-review-20260603-005952.html`

### P1：介面洩漏與核心流程深度
- [x] **ARCH-14-01**: Deepen frontend request lifecycle module。收斂 `admin-ui/src/api/client.ts`、admin API modules、`admin-ui/src/lib/downloadBlob.ts`、`pos-ui/src/api/client.ts`、`pos-ui/src/api/pos.ts` 的 auth storage、base URL、401 refresh、403 plan handling、blob download 規則，讓 JSON/file request 共用清楚 seam。
- [x] **ARCH-14-02**: Collapse POS checkout intent。把 cart、staff/customer、discount approval、split payment、shift、online/offline submission payload assembly 收斂成 checkout intent module，降低 `POSCheckoutPage`、`useCheckout`、`cartStore`、offline queue、backend checkout schema/service 之間的流程知識外洩。
  - [x] **ARCH-14-02a**: 新增 `checkoutIntent` payload builder，先把 `useCheckout` 的 backend payload assembly 收斂到純 service 並補單元測試。

### P2：測試 locality 與 contract drift
- [x] **ARCH-14-03**: Deepen tenant-scoped persistence tests。為 backend tenant context/scoped Prisma 建立一致 test adapter，並評估 schema-derived tenant model map，避免測試各自 mock AsyncLocalStorage 或手寫 mapped model knowledge。
  - [x] **ARCH-14-03a**: 新增 backend tenant context test helper，並將 `accounting.service.test.ts` 從直接 mock tenant context 改為使用真實 `tenantContext.run()`。
- [x] **ARCH-14-04**: Reduce backend/UI contract drift。評估讓 backend Zod validation、`packages/types`、admin/pos API client return shapes 從單一 contract source module 派生，減少 hand-crafted shared types 與 UI request shape 漂移。

---

## 橫切關注點：架構改善方向 (Cross-cutting Concerns)
> 從開發歷程中抽象出的系統性問題，納入各 Phase 規劃前置處理。

### C-01: 行結尾規範化 (已完成 2026-05-16)
**問題根源**：無 `.gitattributes`，Mac/Windows 混合開發導致 CRLF/LF 雜訊，每次 stash pop 都產生 50+ 個假修改。
- [x] 建立 `.gitattributes`，強制所有文字檔 LF、`.bat/.ps1` 保留 CRLF。
- [x] `git rm --cached && git add` 一次性重新正規化索引。

### C-02: 短週期 Feature Branch 紀律 (已完成 2026-05-19)
**問題根源**：本地累積大型 stash（18 個衝突檔），同期遠端推進 34 個 commits，造成高風險合併視窗。
- [x] 每個獨立功能點開一個 feature branch，當天工作結束前至少 commit 一次。
- [x] 超過 2 天未 push 的 branch 應視為技術債。
- [x] Analytics / CRM 為衝突熱區，多人協作時優先使用 PR review。

紀律規範已寫入 `infrastructure/standards/git_workflow.md`（§3 Branch Discipline、§4 Scope 表）。

### C-03: ROADMAP 同步作為 PR 必要條件 (已完成 2026-05-19)
**問題根源**：Phase 8 DB schema + Shift API 全部 commit 完成，但 ROADMAP 仍全部打叉，導致人與 AI 都看不清真實進度。
- [x] 每個 feature PR 必須包含對應的 ROADMAP 勾選更新。
- [x] 建議 PR description template 加入 checklist：`- [ ] ROADMAP updated`。

`.github/pull_request_template.md` 已加入 `ROADMAP updated` / `ADR added` 必勾項。

### C-04: Analytics 模組 API 合約邊界 (已完成 2026-05-19)
**問題根源**：Phase 7 Analytics Service 是最高頻修改區（stash 衝突 3 個檔案均在此模組），且後續 Phase 8/9 仍會繼續擴充。
- [x] `AnalyticsService` 應拆分為子領域：`CrmAnalytics`、`ProductAnalytics`、`OperationsAnalytics`，避免單一服務變成 1000+ 行的 God Object。
- [x] 各子領域定義清晰的 return type interface，作為前後端 contract。

實作：744 行的 `analytics.service.ts` 已拆為 `crm-analytics.service.ts` (190 LOC) / `product-analytics.service.ts` (238 LOC) / `operations-analytics.service.ts` (276 LOC)，共用型別集中於 `analytics.types.ts`。Controller 仍為單一進入點，HTTP 路由與回應形狀不變；17 個 analytics 測試全綠，FIX-01/02/03 全部保留。

### C-05: Phase 8 剩餘任務完整性 (已解決 2026-05-17)
**背景**：此警告已過時。Phase 8 全部項目（API-22~24、UI-27~28）均已完成，Phase 9 POS 建置時依賴已就緒。
- [x] API-23, API-24, UI-27, UI-28 全部完成（見 Phase 8 勾選狀態）。
