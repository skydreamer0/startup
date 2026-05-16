# Phase 7 數據分析引擎實作計畫 (Implementation Plan)

> **前置需求**：此計畫基於 `20260302_pharmacy_management_features_design.md` 設計文件，符合 Phase 7 目標（不更動現有 Prisma Schema，純粹萃取數據價值）。

---

## 總覽

本計畫將 Phase 7 的四大分析模組拆解為 5-15 分鐘的微型任務。開發過程將嚴格遵守 TDD (Test-Driven Development) 原則，先撰寫後端 API 測試，再實作業務邏輯。

---

## 模組一：客戶分層與回購預警 (CRM 進階)

### 任務 1.1: 實作 RFM 客戶分層 API (Backend)
**目標**：根據 `Customer.lastPurchaseDate`, `purchaseCount`, `totalSpent` 產出 VIP/忠誠客/新客/沉睡客/流失高危 名單。
**檔案**:
- 修改: `backend/src/services/analytics.service.ts`
- 修改: `backend/src/api/routes/analytics.routes.ts`
- 測試: `backend/tests/services/analytics.service.test.ts` (需新建或擴充)

**步驟**:
1. 撰寫失敗測試 (vitest `backend/tests/services/analytics.service.test.ts`)，模擬五種類型的客戶資料並斷言其分層結果。
2. 實作 `AnalyticsService.getRfmSegmentation()` 邏輯。
3. 實作 `GET /analytics/rfm` 路由與 Controller。
4. 驗證測試通過 (green)。
5. Git Commit: `feat(api): add RFM customer segmentation endpoint`.

### 任務 1.2: 實作流失風險預警 API (Backend)
**目標**：計算客戶平均回購週期，超過 1.5 倍平均週期即標記流失預警。
**檔案**:
- 修改: `backend/src/services/analytics.service.ts`
- 修改: `backend/src/api/routes/analytics.routes.ts`
- 測試: `backend/tests/services/analytics.service.test.ts`

**步驟**:
1. 撰寫失敗測試，模擬正常回購與超過預警時間的客戶紀錄。
2. 實作 `AnalyticsService.getChurnRisk()` 邏輯。
3. 實作 `GET /analytics/churn-risk` 路由與 Controller。
4. 驗證測試通過 (green)。
5. Git Commit: `feat(api): add customer churn risk and repurchase cycle endpoint`.

### 任務 1.3: 建立 RFM 與流失預警前端頁面 (Frontend)
**目標**：將 1.1 與 1.2 的 API 資料視覺化。
**檔案**:
- 新增: `admin-ui/src/pages/analytics/CrmAnalyticsPage.tsx`
- 修改: `admin-ui/src/App.tsx` (註冊路由 `/analytics/crm`)
- 修改: `admin-ui/src/components/layout/Sidebar.tsx` (新增選單)

**步驟**:
1. 建立 `CrmAnalyticsPage` 組件結構。
2. 使用 TanStack Query 串接 `GET /analytics/rfm` 與 `GET /analytics/churn-risk`。
3. 實作 RFM 圓餅圖與風險名單 Data Table (套用 `.table` 標準類別)。
4. Git Commit: `feat(ui): create CRM analytics dashboard with RFM and churn risk`.

---

## 模組二：商品與供應商進階分析

### 任務 2.1: 實作 ABC 商品分析 API (Backend)
**目標**：交叉比對營收與毛利率，將商品分為明星品、現金牛、隱藏寶石、瘦狗品。
**檔案**:
- 修改: `backend/src/services/analytics.service.ts`
- 修改: `backend/src/api/routes/analytics.routes.ts`
- 測試: `backend/tests/services/analytics.service.test.ts`

**步驟**:
1. 撰寫失敗測試，斷言商品能正確按營收與毛利分佈至四個象限。
2. 實作 `AnalyticsService.getProductAbcAnalysis()`。
3. 實作 `GET /analytics/product-abc`。
4. 驗證測試通過 (green)。
5. Git Commit: `feat(api): add ABC product and margin cross-analysis endpoint`.

### 任務 2.2: 實作供應商績效排名 API (Backend)
**目標**：計算供應商的總營收佔比、平均毛利、可靠度。
**檔案**:
- 修改: `backend/src/services/analytics.service.ts`
- 修改: `backend/src/api/routes/analytics.routes.ts`
- 測試: `backend/tests/services/analytics.service.test.ts`

**步驟**:
1. 撰寫失敗測試，驗證供應商績效分數計算邏輯。
2. 實作 `AnalyticsService.getSupplierRanking()`。
3. 實作 `GET /analytics/supplier-ranking`。
4. 驗證測試通過 (green)。
5. Git Commit: `feat(api): add supplier performance ranking endpoint`.

### 任務 2.3: 建立商品與供應商分析前端頁面 (Frontend)
**目標**：將 2.1 與 2.2 的資料視覺化。
**檔案**:
- 新增: `admin-ui/src/pages/analytics/InventoryAnalyticsPage.tsx`
- 修改: `admin-ui/src/App.tsx` (註冊路由 `/analytics/inventory`)

**步驟**:
1. 建立 `InventoryAnalyticsPage` 組件。
2. 使用 TanStack Query 串接兩支新 API。
3. 實作四象限散點圖 (Recharts/Chart.js) 與供應商排行榜。
4. Git Commit: `feat(ui): create inventory analytics dashboard with ABC matrix and supplier ranks`.

---

## 模組三：營運時段與獎金門檻

### 任務 3.1: 實作熱力圖與獎金門檻 API (Backend)
**目標**：撈取銷售時段分佈，並判斷是否達標當月獎金發放條件 (Gate Pass)。
**檔案**:
- 修改: `backend/src/services/analytics.service.ts`
- 修改: `backend/src/api/routes/analytics.routes.ts`
- 測試: `backend/tests/services/analytics.service.test.ts`

**步驟**:
1. 撰寫失敗測試，驗證 7x24 熱力圖資料結構與 Gate Pass 邏輯。
2. 實作 `AnalyticsService.getSalesHeatmap()` 與 `getBonusGateStatus()`。
3. 實作對應路由。
4. 驗證測試通過。
5. Git Commit: `feat(api): add sales heatmap and bonus gate status endpoints`.

### 任務 3.2: 擴充主儀表板 (Frontend)
**目標**：將 3.1 的資訊整合進首頁 Dashboard。
**檔案**:
- 修改: `admin-ui/src/pages/DashboardPage.tsx`

**步驟**:
1. 擴展 TanStack Query 擷取 heatmap 與 bonus-gate 資料。
2. 在現有 Dashboard 新增「獎金門檻狀態列 (Status Banner)」組件。
3. 新增「一週銷售時段分佈」區塊。
4. Git Commit: `feat(ui): integrate bonus gate and sales heatmap into main dashboard`.

---

## 驗證與核准

> 檔案儲存路徑：`systems/enterprise-admin/infrastructure/plans/20260304_phase7_analytics_plan.md`
> 狀態：等待使用者核准進入 **任務 1.1** 開發階段。
