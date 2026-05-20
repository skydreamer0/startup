# 共用 UI 元件與樣式規範

## 概覽

本專案不使用第三方 UI Framework（無 Ant Design、Material-UI、Shadcn 等）。所有 UI 元件透過自定義 CSS class 系統實作，定義於各 SPA 的全域 CSS 檔案中。

---

## CSS Class 系統

### 按鈕（Button）

| Class | 用途 |
|-------|------|
| `.btn` | 所有按鈕的基底 class，必須與變體 class 搭配使用 |
| `.btn-primary` | 主要行動按鈕（藍色/品牌色） |
| `.btn-ghost` | 次要行動按鈕（透明背景、有邊框） |
| `.btn-danger` | 危險操作（刪除等，紅色） |
| `.btn-sm` | 小尺寸按鈕，常用於表格 row 中的操作 |

```tsx
// 範例用法
<button className="btn btn-primary" onClick={handleSave}>儲存</button>
<button className="btn btn-ghost" onClick={handleCancel}>取消</button>
<button className="btn btn-danger btn-sm" onClick={() => handleDelete(id)}>刪除</button>
```

### 卡片（Card）

| Class | 用途 |
|-------|------|
| `.card` | 通用卡片容器（白底、圓角、陰影） |
| `.stat-card` | 統計數據卡片，通常與 `.card` 搭配使用 |
| `.stat-grid` | KPI 卡片的網格容器 |
| `.stat-header` | stat-card 的標題列（label + icon 並排） |
| `.stat-label` | stat-card 的指標名稱文字 |
| `.stat-value` | stat-card 的主要數值（大字） |
| `.stat-icon` | stat-card 右上角的圖示圓形容器 |

```tsx
// 範例：KPI 統計卡片
<div className="stat-card card">
  <div className="stat-header">
    <span className="stat-label">本月營收</span>
    <div className="stat-icon">💰</div>
  </div>
  <div className="stat-value">${kpis?.revenue.toLocaleString()}</div>
</div>
```

### 表格（Table）

| Class | 用途 |
|-------|------|
| `.table` | 套用至 `<table>` 元素，提供一致的表格樣式 |
| `.table-container` | 表格的外層容器，處理水平捲動 |

```tsx
<div className="card table-container">
  <table className="table">
    <thead>...</thead>
    <tbody>...</tbody>
  </table>
</div>
```

### 頁面結構

| Class | 用途 |
|-------|------|
| `.page-header` | 頁面頂部標題列（標題 + 操作按鈕並排） |
| `.page-title` | 頁面主標題（`<h1>`） |
| `.page-subtitle` | 頁面副標題說明文字 |
| `.admin-layout` | 整體 admin layout 容器（sidebar + main） |
| `.sidebar` | 左側導覽列 |
| `.main-content` | 主內容區域 |

### 徽章（Badge）

| Class | 用途 |
|-------|------|
| `.badge` | 狀態標籤基底 class |
| 搭配語義 class | 依需求加上 success/warning/danger 等變體 |

---

## 禁止 Hardcoded 假數據

**所有顯示在 UI 上的數字、百分比、趨勢都必須來自 API 回傳的真實資料。**

以下是**不允許**的寫法：

```tsx
// 錯誤：寫死百分比，沒有 API 支撐
<div className="text-sm text-success">+12.5% from last month</div>
```

正確做法：若 API 沒有提供趨勢欄位，整行就不要顯示；或等 API 補上後再實作：

```tsx
// 正確：有資料才顯示
{kpis?.revenueGrowthPct != null && (
  <div className="text-sm text-success">
    {kpis.revenueGrowthPct > 0 ? '+' : ''}{kpis.revenueGrowthPct}% from last month
  </div>
)}
```

> 歷史紀錄：`DashboardPage.tsx` 曾有 hardcoded 的 `"+12.5% from last month"`，已於 Arch-Fix Phase 1 (AF-02) 移除，改用 `kpis.customers.newThisMonth` 真實值。

---

## Toast 通知

### admin-ui：`useToast()` hook

```ts
import { useToast } from '../components/Toast';

const toast = useToast();

toast.success('資料更新成功');
toast.error('儲存失敗，請再試一次');
toast.warning('庫存不足');
toast.info('正在重新整理資料…');
```

- 需要在 `<ToastProvider>` 內部才能呼叫（`App.tsx` 已掛載）
- 自動 4 秒後消失，支援手動關閉
- 同時顯示多則 toast，依序疊加

### pos-ui：`<PosToast>` component

pos-ui 不使用 Context，而是以受控元件方式使用：

```tsx
import PosToast, { PosToastMessage } from '../components/PosToast';

const [toast, setToast] = useState<PosToastMessage | null>(null);

// 顯示
setToast({ type: 'success', message: '結帳成功' });
setToast({ type: 'error', message: '網路錯誤，請重試' });

// 在 JSX 中掛載
<PosToast toast={toast} onDismiss={() => setToast(null)} />
```

- 型別：`'success' | 'error' | 'warning' | 'info'`
- 固定定位於畫面右上角（`position: fixed; top: 16px; right: 16px`）
- 不會自動消失，需自行處理 `onDismiss` 並搭配 `setTimeout`

---

## API 錯誤提取

後端回傳的錯誤結構為 `response.data.error.message`。在 `catch` 區塊中，使用以下型別安全寫法：

```ts
type ApiError = {
  response?: {
    data?: {
      error?: {
        message?: string;
      };
    };
  };
};

// 使用方式
try {
  await api.post('/some-endpoint', payload);
} catch (err) {
  const message = (err as ApiError).response?.data?.error?.message || '操作失敗，請再試一次';
  toast.error(message);
}
```

> 此型別目前在各 Page 檔案中重複定義（已知技術債）。建議未來統一抽出至 `src/types/api.ts`。

---

## POS UI 特有規範

### 購物車狀態：`useCartStore`

`useCartStore` 是 pos-ui 中唯一的購物車狀態來源，所有購物車操作都必須透過此 store：

```ts
import { useCartStore } from '../store/cartStore';

const { items, addItem, removeItem, updateQuantity, updateItemDiscount,
        setOrderDiscount, setPaymentMethod, setSalesStaff, clearCart,
        subtotal, total } = useCartStore();
```

#### 可用 Actions

| Action | 說明 |
|--------|------|
| `addItem(product)` | 加入商品（已存在則 +1，上限為 stockQuantity） |
| `removeItem(productId)` | 移除商品 |
| `updateQuantity(productId, qty)` | 更新數量（qty ≤ 0 時自動移除） |
| `updateItemDiscount(productId, rate)` | 設定單品折扣（0–100，代表折扣百分比） |
| `setOrderDiscount(amount, note?)` | 設定整筆訂單折扣金額 |
| `setPaymentMethod(method)` | 設定付款方式（`'CASH' \| 'CARD' \| 'LINE_PAY' \| 'TRANSFER' \| 'OTHER'`） |
| `setSalesStaff(staffId)` | 設定負責業務員 ID |
| `clearCart()` | 結帳後清空購物車（重置 items 與折扣，保留付款方式設定） |

#### 計算屬性

```ts
// 小計（含單品折扣，未扣整單折扣）
const sub = useCartStore(s => s.subtotal());

// 最終應付金額（= subtotal - orderDiscountAmount，最小為 0）
const payable = useCartStore(s => s.total());
```

**禁止在元件中自行重新計算購物車金額**，一律使用 store 提供的 `subtotal()` / `total()`，以確保折扣邏輯的一致性。

### POS 認證

- Token key：`pos_accessToken`（`localStorage`）
- 登出方式：`localStorage.removeItem('pos_accessToken')` 後導向 `/login`
- 無 refresh token 機制，token 過期直接重新登入
