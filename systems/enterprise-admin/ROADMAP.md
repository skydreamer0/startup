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
- [ ] **API-07**: `Products`/`SKUs` CRUD (包含分類、成本、售價、毛利率、安全庫存天數)。
- [ ] **API-08**: `Suppliers` 供應商 CRUD (包含評分、退貨率、到期準時率)。
- [ ] **UI-08**: `/inventory` 商品庫存水位監控表 (標示低於安全庫存的警示)。
- [ ] **UI-09**: `/suppliers` 供應商評估與管理介面。

### 模組二：客戶關係與留存率 CRM (對應 16_90天驗證 & 28_Roadmap)
- [x] **API-09**: `Customers` 顧客資料庫 (追蹤來源、首購時間、聯絡紀錄)。
- [ ] **API-10**: 回購率與 LTV 計算 API。
- [x] **UI-10**: `/crm` 客戶名單畫像，支援篩選「首購客」與「回購客」。

### 模組三：高階營運儀表板 (對應 11_營運KPI與儀表板)
- [ ] **API-11**: 聚合當週 / 當月運營指標 (CAC, 總毛利率, 現金轉換週期 CCC)。
- [ ] **UI-11**: `/dashboard` 替換目前的佔位頁面，實作視覺化圖表與 KPI 燈號警示。
