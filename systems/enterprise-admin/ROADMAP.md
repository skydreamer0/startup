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

### 🔴 P0 — 必須立刻修正 (阻塞性風險)
- [x] **DEBT-01**: 統一 `PrismaClient` 單例 — 所有 Service 改用 `lib/prisma.ts` 的共享實例，禁止各自 `new PrismaClient()`。
- [x] **DEBT-02**: 提取共用 `AppError` 類別至 `lib/errors.ts`，並修正 `error.middleware.ts` 以映射其 `statusCode` 與 `errorCode`。

### 🟡 P1 — Phase 4 Sprint 1 解決 (安全與品質)
- [x] **DEBT-03**: 所有 CRM / Inventory / Dashboard 路由套用 `requirePermission()` RBAC 中介層。
- [x] **DEBT-04**: 將 Inventory 相關權限 (`products:read/create/update`, `suppliers:read/create/update`) 加入 `seed.ts` 並同步 SUPER_ADMIN。
- [x] **DEBT-05**: 消除 Service 層中所有 `any` 類型，改用 Prisma Generated Types 與自定義 DTOs。

### 🟢 P2 — Phase 4 Sprint 2 解決 (一致性與體驗)
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
- [ ] **SAAS-01**: 建立 `Tenant` Model 與 row-level isolation 中介層。
- [ ] **SAAS-02**: 所有核心 Model 加入 `tenant_id` 欄位與自動注入邏輯。
- [ ] **SAAS-03**: Plan-based feature gating (`free`/`starter`/`pro`)。

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

## Phase 6: External Integrations & Advanced Automation (規劃中)
- **INT-01**: LINE Messaging API (行銷推播與互動)
- **INT-02**: 批次匯入匯出 (Excel/CSV)
- **INT-03**: 外部會計系統拋轉 (QuickBooks/Xero)


