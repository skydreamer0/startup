# Architecture Health Report — Enterprise Admin System

> 撰寫日期：2026-05-17  
> 範圍：`systems/enterprise-admin/`（backend + admin-ui + pos-ui）  
> 目標：找出所有維護瓶頸、安全隱患、擴展障礙，依嚴重程度排序，並提供可執行的改善 Roadmap

---

## 整體評估

| 層面 | 現況 | 評分 |
|---|---|---|
| 後端模組結構 | Controller → Service → Prisma 三層清晰 | ✅ 好 |
| 多租戶隔離 | Prisma Extension 自動注入，middleware 建立 context | ⚠️ 可改進 |
| 型別安全 | 21 處 `as any`，跨應用無共用型別 | ⚠️ 有隱患 |
| 錯誤處理 | 大部分用 `next(err)`，但 AnalyticsController 自成一格 | ⚠️ 不一致 |
| 效能 | 每 request 做 2~3 次 DB 查詢（auth + tenant），無 cache | ⚠️ 有瓶頸 |
| 金額計算 | 全面使用 Float，浮點精度問題存在 | ❌ 有 bug 風險 |
| 前端資料層 | admin-ui 用 TanStack Query，pos-ui 用 useState/useEffect | ⚠️ 不一致 |
| 測試覆蓋 | Unit 測試存在，無 E2E，Analytics 測試偏少 | ⚠️ 有缺口 |
| 假數據 | Dashboard "+12.5% from last month" hardcoded | ❌ 會誤導使用者 |

---

## 問題清單（依嚴重度排序）

---

### P0 — 會造成 Bug 或安全事故

#### P0-1：Float 金額精度問題（全域）

**位置：** `prisma/schema.prisma`、所有 Service 層計算

**問題：**
```
costPrice  Float  # POS 結帳時 Float 計算
retailPrice Float
totalAmount Float
discountAmount Float
```
`0.1 + 0.2 = 0.30000000000000004`（JavaScript / IEEE 754 浮點）。  
藥局 POS 每筆交易的金額是法律與財務的精確要求，浮點誤差在累計計算時會導致每日對帳誤差。

**影響：** POS 結帳 → 日結 → 財務報表全部受影響。

**正確做法：** 改用 `Decimal`（Prisma + PostgreSQL 原生支援）。前端傳輸用字串或整數（以分為單位）。

---

#### P0-2：AnalyticsController 繞過 Global Error Handler

**位置：** `backend/src/modules/analytics/analytics.controller.ts`（8 個 method）

**問題：** 每個 method 自己 try/catch，不呼叫 `next(err)`：
```ts
// AnalyticsController — 錯誤被吃掉
catch (error) {
  console.error('[AnalyticsController] getKpis Error:', error);
  res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', ... } });
}

// 其他所有 Controller — 正確做法
catch (err) { next(err); }
```

**影響：**
- `AppError`（如 404、403）被吃掉，永遠回傳 500
- 錯誤不走 `error.middleware.ts`，無法集中記錄
- 未來接 Sentry / 監控時，analytics 錯誤會消失

---

#### P0-3：Dashboard 有永遠不會更新的假數據

**位置：** `admin-ui/src/pages/DashboardPage.tsx:74`

```tsx
<div className="text-sm text-success">+12.5% from last month</div>
```

這是寫死的字串，API 沒有回傳 MoM 比較數據，它永遠顯示 `+12.5%`。用戶會誤判業務狀況。

---

### P1 — 維護瓶頸（不緊急但會越來越痛）

#### P1-1：AnalyticsService God Object（736 行）

**位置：** `backend/src/modules/analytics/analytics.service.ts`

**問題：** 一個 class 包含：KPI 計算、RFM 分段、Churn Risk、ABC 分析、供應商排名、銷售熱力圖、獎金門檻。

```
Phase 5: getKpiSnapshot / getKpiTrend   → 200 行
Phase 7: getRfmSegmentation             → 80 行
Phase 7: getChurnRisk                   → 80 行
Phase 7: getProductAbcAnalysis          → 120 行
Phase 7: getSupplierRanking             → 80 行
Phase 7: getSalesHeatmap                → 80 行
Phase 7: getBonusGateStatus             → 100 行
```

**影響：**
- 任何新分析功能都往這個 class 加，沒有終點
- 測試難以隔離：`analytics.service.test.ts` 要 mock 整個 service
- ROADMAP C-04 已標記此問題但未執行

**正確做法：** 依業務領域拆分：
```
modules/analytics/
  crm-analytics.service.ts      (RFM, Churn)
  product-analytics.service.ts  (ABC, Supplier Ranking)
  ops-analytics.service.ts      (Heatmap, Bonus Gate)
  kpi.service.ts                (KPI Snapshot, Trend)
```

---

#### P1-2：Auth Middleware 每次 Request 做深層 Join（無 Cache）

**位置：** `backend/src/middleware/auth.middleware.ts`

**問題：** 每個 authenticated request 都執行：
```ts
prisma.user.findUnique({
  include: {
    userRoles: {
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } }
      }
    }
  }
})
```
這是 3 層 join，產生約 4 條 SQL。POS 結帳在高頻操作下（每筆交易）會觸發此查詢。

**正確做法：** 把 permissions 在 JWT 簽發時直接寫入 payload（或加 in-memory 快取 with TTL）。

---

#### P1-3：Tenant Middleware 每次 Request 查 2 次 DB

**位置：** `backend/src/middleware/tenant.middleware.ts`

**問題：**
1. 查 `user.tenantId`（為了從 JWT 取得 tenant）
2. 查 `tenant.plan`（為了 plan-based feature gating）

JWT 簽發時沒有包含 `tenantId` 和 `plan`，導致每次都要回查 DB。

**正確做法：** 在 JWT payload 中包含 `tenantId` 和 `plan`，並在 plan 變更時（管理員操作）讓所有 token 失效。

---

#### P1-4：`as any` 21 處型別安全窟窿

**位置：** 散落全後端

主要集中在：
- `prisma.ts` — Prisma Extension 實作（必要但可改進）
- `crm.service.ts`、`inventory.service.ts`、`order.service.ts` — `create({ data: data as any })`
- `auth.controller.ts` — audit log 型別
- `tenant.middleware.ts` — `user as any`

**原因：** Prisma Extended Client 的型別在 `create/update` 操作中因為 Extension 加入的欄位而失配，開發時用 `as any` 繞過。

**正確做法：** 為 Extended Prisma Client 定義 proper DTOs，或使用 `Prisma.validator()` 產生正確型別。

---

#### P1-5：pos-ui 無 TanStack Query，資料層不一致

**位置：** `pos-ui/src/pages/POSCheckoutPage.tsx`

**問題：** admin-ui 使用 TanStack Query（統一 cache + refetch）。pos-ui 用 `useState + useEffect + posApi.getXxx().then()`，導致：
- 無 cache：切換分類時每次重新 fetch 商品
- 無自動 refetch：庫存變動後 UI 不會更新
- Error 狀態手動管理
- Loading 狀態手動管理

**影響：** POS 在高頻操作下不必要的網路請求，且庫存數字可能過時。

---

#### P1-6：POSCheckoutPage 14 個 useState，5 個 useEffect

**位置：** `pos-ui/src/pages/POSCheckoutPage.tsx`（377 行）

**問題：** 所有狀態混在一個 component：
- 商品/分類/搜尋狀態（可以是 TanStack Query）
- 班別開關狀態（可以是 `useShift` hook）
- Modal 顯示狀態（3 個 boolean）
- Toast 狀態
- Loading 狀態（3 個 boolean）

**正確做法：** 抽出 `useShift()` 和 `usePOSProducts()` hooks，開班畫面獨立為 `ShiftOpenScreen` component。

---

#### P1-7：PAYMENT_LABELS 三處重複定義

**位置：**
- `pos-ui/src/components/CartPanel.tsx`
- `pos-ui/src/components/PaymentModal.tsx`
- `pos-ui/src/components/ReceiptModal.tsx`

同一個 `{ CASH: '現金', CARD: '信用卡', ... }` 在三個檔案各自定義一次。

---

#### P1-8：Analytics Service 不顯式呼叫 requireTenantId()

**位置：** `backend/src/modules/analytics/analytics.service.ts`

**問題：** Service 沒有呼叫 `requireTenantId()`，依賴 Prisma Extension 隱式注入 tenant 過濾。當 `MappedModels` 漏列某個 model 時，查詢會跨租戶洩漏資料，且沒有任何明顯錯誤。

其他 Service（如 `checkout.service.ts`、`crm.service.ts`）都有顯式呼叫 `requireTenantId()`，只有 Analytics 是例外。

---

### P2 — 未來成長瓶頸（現在規劃，避免後期大重構）

#### P2-1：沒有 Shared Types Package

**問題：** Monorepo 有三個應用（backend / admin-ui / pos-ui），但沒有 `packages/types` 層。
- `CheckoutPayload`、`PosProduct` 在 pos-ui 定義，backend 有自己的 Zod schema，兩者不同步
- 新增欄位時需同時改三個地方
- 無法 codegen（e.g., openapi-typescript）

**正確做法：** 建立 `packages/types/` workspace，後端用 `zod.infer` 輸出型別，前端直接 import。

---

#### P2-2：沒有 E2E 測試

**問題：** 目前只有後端 unit tests（7 個測試檔）和前端 component tests（pos-ui 5 個）。

關鍵業務流程（POS 結帳→庫存扣減→收據產生）沒有 E2E 測試。

**正確做法：** Playwright 測試覆蓋：登入 → 開班 → 掃條碼 → 結帳 → 驗收據。

---

#### P2-3：沒有 API Rate Limiting

**問題：** `app.ts` 沒有 rate limiting middleware。POS barcode 查詢（每次掃描觸發 API）和 analytics（計算密集）都沒有保護。

**正確做法：** 加 `express-rate-limit`，對 `/pos/products`、`/analytics/*` 設不同的 rate limit。

---

#### P2-4：Plan-based Feature Gating 未實作（SAAS-03）

**位置：** `backend/src/middleware/plan.middleware.ts`（已建立 middleware 框架）

**問題：** ROADMAP SAAS-03 標記為未完成。`plan.middleware.ts` 存在但沒有接進任何路由。多租戶 SaaS 的核心商業邏輯（free/starter/pro 功能限制）還沒落地。

---

#### P2-5：MappedModels 列表漏掉新 Model

**位置：** `backend/src/lib/prisma.ts`

```ts
const MappedModels = ['User', 'Role', 'AuditLog', 'Customer', 'Tag',
  'Interaction', 'Supplier', 'ProductCategory', 'Product', 'Order',
  'InventoryTransaction', 'Expense'] as const;
```

**漏掉的 Model（Phase 8 新增）：** `Shift`、`ProductBatch`、`DailySettlement`

這些 model 有 `tenantId` 欄位，但不在 `MappedModels` 中，代表 Prisma Extension 不會自動注入 tenant filter。目前 Service 層用手動 `where: { tenantId }` 補救，但未來若有開發者忘記，就會有跨租戶資料洩漏。

---

## 改善 Roadmap

---

### Arch-Fix Phase 1：P0 緊急修復（1-2 天）

**目標：** 消除會立即造成 bug 或誤導的問題

- [ ] **AF-01**: `AnalyticsController` 8 個 method 改用 `next(err)`，移除手動 try/catch
- [ ] **AF-02**: `DashboardPage` 移除 hardcoded `"+12.5% from last month"`；改為顯示 `N/A` 或從 API 取得真實 MoM 比較
- [ ] **AF-03**: `prisma.ts` 的 `MappedModels` 加入 `Shift`、`ProductBatch`、`DailySettlement`

---

### Arch-Fix Phase 2：型別與一致性整頓（3-5 天）

**目標：** 消除型別安全窟窿、統一前端資料層模式

- [ ] **AF-04**: `AnalyticsService` 加入 `requireTenantId()` 呼叫（防守性，明確 fail fast）
- [ ] **AF-05**: `PAYMENT_LABELS` 提取到 `pos-ui/src/constants.ts`，三個 component 共用
- [ ] **AF-06**: 後端 Service 層消除可修復的 `as any`（`crm.service.ts`、`inventory.service.ts`、`order.service.ts`）；用 `Prisma.validator()` 或拆出 DTO
- [ ] **AF-07**: `pos-ui` 引入 TanStack Query，`getProducts` 改為 `useQuery`，解決 cache 缺失問題
- [ ] **AF-08**: `POSCheckoutPage` 重構：抽出 `useShift()` hook + `ShiftOpenScreen` component，將 14 個 useState 降到 6 個以內

---

### Arch-Fix Phase 3：效能與安全強化（1 週）

**目標：** 解決 Auth/Tenant middleware 的每次 DB 查詢問題

- [ ] **AF-09**: JWT payload 加入 `tenantId`（login 和 refresh 時寫入），`tenant.middleware.ts` 直接讀 JWT 取 tenantId，移除第一次 DB 查詢
- [ ] **AF-10**: JWT payload 加入 `permissions[]`（或 permission hash），`auth.middleware.ts` 直接驗 payload，移除 3 層 join 查詢；在 `roles/permissions` 變更時強制重新登入
- [ ] **AF-11**: 加入 `express-rate-limit`：`/pos/products` 每秒 10 次，`/analytics/*` 每分鐘 30 次

---

### Arch-Fix Phase 4：AnalyticsService 拆分（1 週）

**目標：** 消解 736 行 God Object，對齊大廠「單一職責」標準

- [ ] **AF-12**: 建立 `modules/analytics/services/` 子目錄：
  - `kpi.service.ts`（KPI Snapshot + Trend）
  - `crm-analytics.service.ts`（RFM + Churn Risk）
  - `product-analytics.service.ts`（ABC + Supplier Ranking）
  - `ops-analytics.service.ts`（Heatmap + Bonus Gate）
- [ ] **AF-13**: `analytics.controller.ts` 改為呼叫各子 service，移除 God Object
- [ ] **AF-14**: 對各子 service 補充對應的 unit test

---

### Arch-Fix Phase 5：Float → Decimal 遷移（計劃中，Phase 10 前）

**目標：** 解決金額浮點精度問題

- [ ] **AF-15**: Prisma Schema 所有金額欄位從 `Float` 改為 `Decimal`
  - `costPrice`、`retailPrice`、`totalAmount`、`discountAmount`、`unitPrice`、`finalUnitPrice`
  - `Expense.amount`、`Shift.openingCash/closingCash`
  - `DailySettlement.*Amount`
- [ ] **AF-16**: 前端金額計算改為整數運算（以分為單位）或使用 `decimal.js`
- [ ] **AF-17**: 撰寫 ADR-009 記錄此決策

---

### Arch-Fix Phase 6：Shared Types + E2E（長期）

**目標：** 建立可擴展的 monorepo 結構，補全測試防護網

- [ ] **AF-18**: 建立 `packages/types/` workspace（turborepo 或 pnpm workspace）
  - backend Zod schema `infer` 輸出到 shared types
  - pos-ui / admin-ui 直接 import，不再各自定義
- [ ] **AF-19**: Playwright E2E：POS 完整結帳流程（login → 開班 → 加商品 → 結帳 → 驗庫存）
- [ ] **AF-20**: SAAS-03 Plan-based feature gating 落地（`plan.middleware.ts` 接進路由）

---

## 問題地圖快速參考

```
高影響
  │
  │  P0-1 Float 金額 ─────────────────── P1-1 Analytics God Object
  │  P0-2 Analytics error handling       P1-2 Auth middleware N+1 query
  │  P0-3 Hardcoded "+12.5%"            P1-3 Tenant middleware 2x DB
  │                                       P1-4 as any 21 處
  │                                       P1-5 pos-ui 無 Query cache
  │
  │                    P2-1 Shared Types  P2-2 無 E2E
  │                    P2-3 無 Rate Limit P2-4 Feature Gating
  │                    P2-5 MappedModels 漏 model
  │
低影響
       緊急                              不緊急
```

---

## 什麼不需要動

以下是目前架構的亮點，不要過度改動：

- **`cartStore.ts`** — Zustand store 設計乾淨，addItem/remove/計算分離清楚
- **`checkout.service.ts`** — FIFO 批次邏輯是業務複雜度，寫法已很正確
- **`barcodeService.ts`** — 43 行，pub/sub 模式，不需改
- **`tenant.context.ts` + Prisma Extension** — AsyncLocalStorage 用法正確，是大廠常見模式
- **模組化路由結構** — `modules/[domain]/controller+service+routes+schema` 四件套清晰

---

> 本文件反映 2026-05-17 的架構快照。建議在每個 Arch-Fix Phase 完成後更新對應條目狀態。
