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
- **INT-01**: LINE Messaging API (行銷推播與互動)
- **INT-02**: 批次匯入匯出 (Excel/CSV)
- **INT-03**: 外部會計系統拋轉 (QuickBooks/Xero)

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
- [ ] **POS-03**: 電子發票 API 串接（Phase 10）。

---

## 橫切關注點：架構改善方向 (Cross-cutting Concerns)
> 從開發歷程中抽象出的系統性問題，納入各 Phase 規劃前置處理。

### C-01: 行結尾規範化 (已完成 2026-05-16)
**問題根源**：無 `.gitattributes`，Mac/Windows 混合開發導致 CRLF/LF 雜訊，每次 stash pop 都產生 50+ 個假修改。
- [x] 建立 `.gitattributes`，強制所有文字檔 LF、`.bat/.ps1` 保留 CRLF。
- [x] `git rm --cached && git add` 一次性重新正規化索引。

### C-02: 短週期 Feature Branch 紀律
**問題根源**：本地累積大型 stash（18 個衝突檔），同期遠端推進 34 個 commits，造成高風險合併視窗。
- [ ] 每個獨立功能點開一個 feature branch，當天工作結束前至少 commit 一次。
- [ ] 超過 2 天未 push 的 branch 應視為技術債。
- [ ] Analytics / CRM 為衝突熱區，多人協作時優先使用 PR review。

### C-03: ROADMAP 同步作為 PR 必要條件
**問題根源**：Phase 8 DB schema + Shift API 全部 commit 完成，但 ROADMAP 仍全部打叉，導致人與 AI 都看不清真實進度。
- [ ] 每個 feature PR 必須包含對應的 ROADMAP 勾選更新。
- [ ] 建議 PR description template 加入 checklist：`- [ ] ROADMAP updated`。

### C-04: Analytics 模組 API 合約邊界
**問題根源**：Phase 7 Analytics Service 是最高頻修改區（stash 衝突 3 個檔案均在此模組），且後續 Phase 8/9 仍會繼續擴充。
- [ ] `AnalyticsService` 應拆分為子領域：`CrmAnalytics`、`ProductAnalytics`、`OperationsAnalytics`，避免單一服務變成 1000+ 行的 God Object。
- [ ] 各子領域定義清晰的 return type interface，作為前後端 contract。

### C-05: Phase 8 剩餘任務完整性
**背景**：Schema + Shift API 已完成，但 ProductBatch API、DailySettlement API 與 UI 頁面尚未開始，Phase 9 POS 依賴這些基礎。
- 待完成（見 Phase 8 模組二 API-23, API-24, UI-27, UI-28）。
- 建議在開始 Phase 9 POS UI 前先補齊，否則 POS 結帳無法寫入批號與日結。

