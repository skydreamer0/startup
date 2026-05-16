# Phase 9 POS System — Design Spec

**日期：** 2026-05-16  
**分支：** `feature/phase-9-pos`  
**狀態：** 設計確認，待實作

---

## 背景與目標

Phase 8 已完成銷售基礎 Schema（Shift、ProductBatch、DailySettlement）與對應 API。Phase 9 目標是在此基礎上建立完整的門市 POS 結帳系統，讓藥局收銀台能快速完成結帳、FIFO 批次扣庫存、列印熱感應收據，並為後續法規串接（電子發票、健保 IC 卡）保留乾淨的擴充介面。

---

## 範圍決策

| 功能 | Phase 9 | 後續 Phase |
|------|---------|-----------|
| POS 結帳（現金/刷卡/LINE Pay）| ✅ | |
| 三欄式 UI（類別 + 商品 + 購物車）| ✅ | |
| 掃槍條碼搜尋 | ✅ | |
| 整筆折扣 + 商品層級折扣 | ✅ | |
| 員工掃碼切換結帳人員（業績歸屬）| ✅ | |
| 熱感應印表機（ESC/POS）| ✅ | |
| Service Worker 離線佇列 | ✅ | |
| 電子發票（雲端發票）| | Phase 10 |
| 健保 IC 卡讀取 | | Phase 11 |
| 促銷引擎（滿額送、組合價）| | Phase 10 |

---

## 架構：Monorepo 結構

```
systems/enterprise-admin/
├── admin-ui/               # 現有後台，不改動
├── pos-ui/                 # NEW — 獨立 Vite React SPA
│   ├── public/
│   ├── src/
│   │   ├── api/            # axios client（mirror admin-ui 模式）
│   │   ├── components/
│   │   │   ├── CategoryNav.tsx       # 左欄：類別側欄
│   │   │   ├── ProductGrid.tsx       # 中欄：商品網格
│   │   │   ├── ProductCard.tsx       # 商品卡片（庫存燈號）
│   │   │   ├── CartPanel.tsx         # 右欄：購物車
│   │   │   ├── CartItem.tsx          # 購物車品項（含商品折扣）
│   │   │   ├── StaffSwitchModal.tsx  # 員工掃碼切換 Modal
│   │   │   ├── PaymentModal.tsx      # 付款確認 Modal
│   │   │   └── ReceiptModal.tsx      # 收據預覽 Modal
│   │   ├── pages/
│   │   │   ├── POSCheckoutPage.tsx   # 主結帳畫面
│   │   │   └── POSLoginPage.tsx      # POS 登入（獨立）
│   │   ├── store/
│   │   │   └── cartStore.ts          # Zustand 購物車 + 結帳人員狀態
│   │   ├── services/
│   │   │   ├── barcodeService.ts     # 掃槍 keydown 監聽 + 員工碼識別
│   │   │   ├── offlineQueue.ts       # IndexedDB 離線佇列
│   │   │   └── receiptService.ts     # ESC/POS buffer → Web USB
│   │   └── sw/
│   │       └── service-worker.ts     # Workbox SW（離線快取 + Background Sync）
│   ├── index.html
│   ├── vite.config.ts                # vite-plugin-pwa 設定
│   └── package.json
│
└── backend/
    └── src/modules/
        └── pos/                      # NEW — POS 後端模組
            ├── pos.controller.ts
            ├── pos.routes.ts
            ├── pos.schema.ts         # Zod validation
            ├── checkout.service.ts   # 結帳核心邏輯
            └── receipt.service.ts    # ESC/POS buffer 產生
```

### 架構原則

- **pos-ui 完全獨立部署**：可跑在不同 port（`localhost:5174`），不依賴 admin-ui bundle
- **共用後端 API**：pos-ui 與 admin-ui 打同一個 `/api/v1/admin`，auth token 機制相同
- **Design Token 共用**：pos-ui `@import` admin-ui 的 CSS token 層，視覺一致
- **型別共用**：後端 Prisma 生成的型別透過 monorepo path alias 引用，不需建 `packages/` 層

---

## Schema 新增（Phase 9 Migration）

```prisma
// User — 員工識別條碼（用於 POS 結帳人員切換）
model User {
  // ...現有欄位不動...
  employeeCode String? @unique @map("employee_code")
  salesOrders  Order[] @relation("SalesOrders")  // 業績歸屬訂單
}

// Order — 折扣欄位 + 業績歸屬員工
model Order {
  // ...現有欄位不動...
  discountAmount Float   @default(0)  @map("discount_amount")
  discountNote   String?              @map("discount_note")
  salesStaffId   String?              @map("sales_staff_id")
  salesStaff     User?   @relation("SalesOrders", fields: [salesStaffId], references: [id])
}

// OrderItem — 商品層級折扣
model OrderItem {
  // ...現有欄位不動...
  discountRate   Float  @default(0)  @map("discount_rate")    // 0–100 百分比
  finalUnitPrice Float?              @map("final_unit_price")  // 折扣後實際單價
}
```

### Seed 新增

每個 tenant 初始化一筆 `WALK_IN_CUSTOMER`（系統匿名客戶），讓 POS 不強制綁定 CRM 客戶即可結帳，避免 `Order.customerId` 改為 nullable 的破壞性 migration。

---

## 後端 POS API

| Method | Path | 說明 |
|--------|------|------|
| `POST` | `/api/v1/admin/pos/checkout` | 結帳核心（Prisma transaction）|
| `GET` | `/api/v1/admin/pos/products` | POS 商品搜尋（含條碼、庫存過濾）|
| `GET` | `/api/v1/admin/pos/staff` | 列出可切換的結帳人員（同 tenant 的 User 列表）|
| `GET` | `/api/v1/admin/pos/shift/active` | 查詢當前登入者的開班狀態 |
| `POST` | `/api/v1/admin/pos/receipt/:orderId` | 產生 ESC/POS 收據 buffer（base64）|

### Checkout Request Body

```typescript
interface CheckoutDto {
  cartItems: {
    productId: string;
    quantity: number;
    discountRate?: number;   // 0–100，商品層級折扣百分比
  }[];
  paymentMethod: 'CASH' | 'CARD' | 'LINE_PAY' | 'TRANSFER' | 'OTHER';
  orderDiscountAmount?: number;   // 整筆折扣額（元）
  orderDiscountNote?: string;
  customerId?: string;            // 未帶 → 使用 WALK_IN_CUSTOMER
  shiftId: string;                // 必填：當前開班 ID
  salesStaffId?: string;          // 業績歸屬員工；未帶 → 使用 shift.staffId
}
```

### Checkout 核心邏輯（單一 Prisma Transaction）

```
1. 驗證 shiftId → status 必須為 'OPEN'
2. 解析 salesStaffId：有帶則用之，否則取 shift.staffId
3. For each cartItem：
   a. 確認 product 存在且 stockQuantity ≥ quantity
   b. FIFO 批次選取：ProductBatch ORDER BY expiryDate ASC，quantity > 0
   c. 計算 finalUnitPrice = retailPrice × (1 − discountRate/100)
4. 套用整筆折扣：finalAmount = subtotal − orderDiscountAmount
5. 產生 orderNumber：格式 POS-YYYYMMDD-00001（當日 tenant 流水號）
6. 建立 Order（status: 'completed', paymentStatus: 'paid'）+ OrderItems
7. 批次扣減 ProductBatch.quantity（FIFO 順序）
8. 更新 Product.stockQuantity
9. 建立 InventoryTransaction（type: 'OUT', referenceId: orderId）
10. 回傳完整 Order + items（含 receiptData payload）
```

---

## POS UI 設計

### 三欄式佈局（`POSCheckoutPage.tsx`）

```
┌─────────────────────────────────────────────────────────────┐
│ [PharmaSaaS POS]  班別開啟中 ｜ [👤 張藥師 ▾ F6] [交班 F12]│ ← TopBar（收銀員可點擊切換）
├─────────────────────────────────────────────────────────────┤
│ 🔍 掃描條碼 / 輸入品名或 SKU...                     [F2]   │ ← SearchBar（掃槍常駐聚焦）
├──────────┬───────────────────────────────┬──────────────────┤
│ [類別]   │ 商品網格（4 欄）              │ 購物車            │
│          │                               │                  │
│ 💊 OTC   │ [Panadol] [Ibuprofen] ...     │ 結帳人員（業績）  │
│ 🌿 保健  │ 庫存燈號：綠/黃/紅/缺貨       │ ─────────────── │
│ 🩺 醫材  │                               │ CartItem ×N      │
│ 👶 嬰兒  │                               │ 整筆折扣輸入     │
│ 🧴 美妝  │                               │ 付款方式切換     │
│ ☆ 常用   │                               │ [結帳 Enter ↵]   │
├──────────┴───────────────────────────────┴──────────────────┤
│ F2:搜尋  F3:折扣  F4:搜尋客戶  F5:清空  F6:換人  F12:交班  │ ← 快捷鍵列
└─────────────────────────────────────────────────────────────┘
```

### 員工掃碼切換（業績歸屬）

**設計原則：常駐收銀員狀態，切換一次持續生效。**

- **TopBar 常駐顯示**當前收銀員姓名（例：`👤 張藥師`），點擊或按 **F6** 可切換
- 預設：班別開啟者（`shift.staffId`）
- 切換後**持續生效**，所有後續交易均歸屬該收銀員，直到再次主動切換
- 切換流程：按 F6 → 彈出 `StaffSwitchModal`（輸入框自動聚焦）→ 掃員工條碼或從列表選擇 → 確認後 TopBar 更新顯示
- 切換範圍：**整個 POS Session**（不是單筆）
- 狀態儲存在 `cartStore.ts` 的 `currentSalesStaffId`（Zustand，頁面 reload 後重置為 shift.staffId）
- `Order.salesStaffId` 記錄業績歸屬，供後續 analytics 彙總

### 響應式裝置支援

- **桌機（≥1024px）**：三欄完整展開，鍵盤快捷鍵為主操作方式，掃槍條碼直接觸發搜尋列
- **平板（768px–1023px）**：類別側欄收合為 icon-only（80px），商品網格改為 3 欄，購物車面板固定右側；觸控優先，商品卡片 tap target ≥ 48px
- **實作方式**：CSS media query + Tailwind breakpoints，`pos-ui` 獨立 SPA 不繼承 admin-ui 的桌機限制

### 鍵盤快捷鍵

| 按鍵 | 動作 |
|------|------|
| F2 | 聚焦搜尋列（掃槍觸發入口）|
| F3 | 聚焦整筆折扣輸入 |
| F4 | 開啟客戶搜尋 |
| F5 / Del | 清空購物車 |
| F6 | 開啟收銀員切換 Modal（切換後持續生效）|
| Enter | 結帳（購物車不為空時）|
| F12 | 交班 |
| Esc | 關閉 Modal / 取消 |

### 庫存燈號規則

| 狀態 | 條件 | 顯示 |
|------|------|------|
| 充足 | stockQuantity > safetyStock | 綠色「庫存 N」|
| 低庫存 | 0 < stockQuantity ≤ safetyStock | 黃色「庫存 N」|
| 缺貨 | stockQuantity = 0 | 紅色「缺貨」+ 禁止點擊 |

---

## 離線佇列機制

### Service Worker 快取策略（Workbox）

| 資源類型 | 策略 |
|---------|------|
| JS/CSS/HTML | `CacheFirst`（預快取，離線可開啟 POS）|
| `GET /pos/products` | `StaleWhileRevalidate`（顯示舊資料，背景更新）|
| `POST /pos/checkout` | `NetworkOnly` + 離線佇列 |

### 離線結帳流程

```
離線狀態 → 按下結帳：
  1. 交易存入 IndexedDB（pending_transactions）
  2. UI 顯示「已記錄 — 網路恢復後自動同步」
  3. 本地產生暫時 orderNumber（LOCAL-YYYYMMDD-XXXXX）
  4. 可繼續下一筆

恢復連線（Background Sync API）：
  5. SW 觸發 sync 事件
  6. 依序送出 pending_transactions
  7. 後端回傳正式 orderNumber → 更新 IndexedDB
  8. 前端顯示同步完成通知
```

**衝突處理：** 離線期間庫存被他端扣掉 → 後端拋 `InsufficientStock` → 前端顯示衝突清單，由收銀員人工確認。最多允許 **50 筆** pending，超過顯示警告。

---

## 收據列印（ESC/POS）

**流程：** 結帳成功 → `POST /pos/receipt/:orderId` → 後端組裝 ESC/POS buffer → base64 回傳 → 前端 Web USB API 送印表機

**降級：** Web USB 不可用（iOS Safari）→ `window.print()` 觸發瀏覽器列印

**收據欄位：**
- 店名 / 藥局名稱、地址、電話
- 訂單號（POS-YYYYMMDD-XXXXX）、日期時間、收銀員
- 商品明細（品名、數量、折扣率、單價、小計）
- 整筆折扣、應付金額、付款方式
- 頁尾問候語

---

## 測試策略

| 層級 | 工具 | 範疇 |
|------|------|------|
| 後端單元 | Vitest | FIFO 批次扣減、折扣計算、orderNumber 流水號 |
| 後端整合 | Vitest + Prisma | 完整 checkout transaction 正確性 |
| 前端元件 | Vitest + Testing Library | CartPanel 狀態、折扣計算顯示 |
| E2E（可選）| Playwright | 掃槍 → 加入購物車 → 換人 → 結帳 golden path |
| 離線 | Chrome DevTools offline | SW 攔截、IndexedDB 寫入、恢復同步 |

---

## ADR-008：POS 獨立 SPA 架構決策（待建立）

需新增 `infrastructure/adr/adr_008_pos_standalone_spa.md`，記錄以下決策：

1. **pos-ui 獨立於 admin-ui**：避免 admin bundle 污染 POS 快取，支援 kiosk 部署
2. **Shared types via path alias**：不建 `packages/` 層，避免 monorepo toolchain 複雜化
3. **ESC/POS 由後端產生**：receipt 格式邏輯集中在後端，可測試，前端只負責 USB 傳輸
4. **WALK_IN_CUSTOMER 系統客戶**：避免 Order.customerId 改 nullable 的破壞性 migration
5. **salesStaffId 獨立於 shiftId.staffId**：班別開啟者與業績歸屬員工分開記錄，支援多人輪流結帳場景
6. **Background Sync 離線佇列**：50 筆上限 + 庫存衝突人工確認機制

---

## 與 Phase 8 的相依關係

Phase 9 依賴以下 Phase 8 已完成項目：

- `Shift` model + API（`/shifts`）— POS 結帳必須綁定開班 Shift
- `ProductBatch` model + API — FIFO 批次扣庫存
- `DailySettlement` API — 交班日結（POS 結帳完成後彙總）
- `Order.shiftId`, `Order.orderType`, `Order.paymentMethod` 欄位

所有 Phase 8 依賴項均已標記完成（ROADMAP.md Phase 8 全部打勾）。
