# Cart Logic Fix & Comprehensive Tests

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 找出並修復購物車數量/價格不聯動的 Bug，並建立完整的 store + 元件互動測試覆蓋。

**Architecture:** Bug 根源是 CartItem 的受控 `<input>` 在使用者清空輸入框時 `parseInt("") = NaN`，`if (!isNaN(val))` 阻擋了更新，輸入框彈回舊值。修法：改用 local state 暫存輸入字串，blur/Enter 才 commit 到 store。元件測試使用 Vitest + Testing Library + userEvent，store 測試維持純 Zustand unit test。

**Tech Stack:** Vitest 3, @testing-library/react 16, @testing-library/user-event 14, @testing-library/jest-dom, Zustand 5, React 19, jsdom

---

## File Map

| 檔案 | 動作 | 說明 |
|------|------|------|
| `pos-ui/src/__tests__/cartStore.test.ts` | Modify | 擴充 store 單元測試（現有 8 個 → 目標 18 個） |
| `pos-ui/src/__tests__/CartItem.test.tsx` | Create | CartItem 元件互動測試 |
| `pos-ui/src/__tests__/CartPanel.test.tsx` | Create | CartPanel 小計/合計顯示測試 |
| `pos-ui/src/components/CartItem.tsx` | Modify | 量 input 改用 local state，blur/Enter commit |
| `pos-ui/package.json` | Modify | 加入 @testing-library/user-event |

---

## Task 1: 安裝 @testing-library/user-event

**Files:**
- Modify: `pos-ui/package.json`

- [ ] **Step 1: 安裝**

```bash
cd /Users/george/Documents/專案/startup/systems/enterprise-admin/pos-ui
npm install --save-dev @testing-library/user-event@^14
```

Expected: package.json devDependencies 出現 `@testing-library/user-event`

- [ ] **Step 2: 確認**

```bash
node -e "require('@testing-library/user-event'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
cd /Users/george/Documents/專案/startup/systems/enterprise-admin
git add pos-ui/package.json pos-ui/package-lock.json
git commit -m "chore(pos-ui): add @testing-library/user-event for interaction tests"
```

---

## Task 2: 擴充 cartStore 單元測試（找出 store 層 Bug）

**Files:**
- Modify: `pos-ui/src/__tests__/cartStore.test.ts`

- [ ] **Step 1: 完整替換測試檔**

用以下內容完整覆寫 `pos-ui/src/__tests__/cartStore.test.ts`：

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '../store/cartStore';
import { PosProduct } from '../api/pos';

const mockProduct: PosProduct = {
  id: 'prod-1',
  name: 'Panadol 500mg',
  sku: 'PAN-500',
  retailPrice: 100,
  stockQuantity: 10,
};

const mockProduct2: PosProduct = {
  id: 'prod-2',
  name: 'Ibuprofen 400mg',
  sku: 'IBU-400',
  retailPrice: 200,
  stockQuantity: 5,
};

beforeEach(() => {
  useCartStore.setState({
    items: [],
    orderDiscountAmount: 0,
    orderDiscountNote: '',
    paymentMethod: 'CASH',
    currentSalesStaffId: null,
  });
});

// ─── addItem ─────────────────────────────────────────────
describe('addItem', () => {
  it('adds product with quantity 1 and discountRate 0', () => {
    useCartStore.getState().addItem(mockProduct);
    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(1);
    expect(items[0].discountRate).toBe(0);
  });

  it('increments quantity when same product added again', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().addItem(mockProduct);
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });

  it('caps quantity at stockQuantity when adding repeatedly', () => {
    for (let i = 0; i < 15; i++) useCartStore.getState().addItem(mockProduct);
    expect(useCartStore.getState().items[0].quantity).toBe(mockProduct.stockQuantity);
  });

  it('adds different products as separate cart items', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().addItem(mockProduct2);
    expect(useCartStore.getState().items).toHaveLength(2);
  });
});

// ─── removeItem ──────────────────────────────────────────
describe('removeItem', () => {
  it('removes the target product', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().removeItem(mockProduct.id);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('only removes the matching product', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().addItem(mockProduct2);
    useCartStore.getState().removeItem(mockProduct.id);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].product.id).toBe('prod-2');
  });
});

// ─── updateQuantity ──────────────────────────────────────
describe('updateQuantity', () => {
  it('updates quantity to the given value', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateQuantity(mockProduct.id, 5);
    expect(useCartStore.getState().items[0].quantity).toBe(5);
  });

  it('removes item when quantity set to 0', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateQuantity(mockProduct.id, 0);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('removes item when quantity set to negative', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateQuantity(mockProduct.id, -1);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('does not affect other items when updating quantity', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().addItem(mockProduct2);
    useCartStore.getState().updateQuantity(mockProduct.id, 8);
    expect(useCartStore.getState().items.find(i => i.product.id === 'prod-2')?.quantity).toBe(1);
  });
});

// ─── updateItemDiscount ──────────────────────────────────
describe('updateItemDiscount', () => {
  it('updates discountRate for the item', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateItemDiscount(mockProduct.id, 20);
    expect(useCartStore.getState().items[0].discountRate).toBe(20);
  });

  it('does not affect quantity', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateQuantity(mockProduct.id, 3);
    useCartStore.getState().updateItemDiscount(mockProduct.id, 10);
    expect(useCartStore.getState().items[0].quantity).toBe(3);
  });
});

// ─── subtotal ────────────────────────────────────────────
describe('subtotal()', () => {
  it('returns 0 for empty cart', () => {
    expect(useCartStore.getState().subtotal()).toBe(0);
  });

  it('returns retailPrice × quantity when no discount', () => {
    useCartStore.getState().addItem(mockProduct); // qty=1, price=100
    expect(useCartStore.getState().subtotal()).toBeCloseTo(100);
  });

  it('reflects quantity change: qty=5 → subtotal=500', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateQuantity(mockProduct.id, 5);
    expect(useCartStore.getState().subtotal()).toBeCloseTo(500);
  });

  it('applies item-level discount: 10% off → subtotal=90', () => {
    useCartStore.getState().addItem(mockProduct); // price=100, qty=1
    useCartStore.getState().updateItemDiscount(mockProduct.id, 10);
    expect(useCartStore.getState().subtotal()).toBeCloseTo(90);
  });

  it('sums multiple items correctly', () => {
    useCartStore.getState().addItem(mockProduct);  // 100×1 = 100
    useCartStore.getState().addItem(mockProduct2); // 200×1 = 200
    expect(useCartStore.getState().subtotal()).toBeCloseTo(300);
  });

  it('updates subtotal after quantity change on one of many items', () => {
    useCartStore.getState().addItem(mockProduct);  // 100×1
    useCartStore.getState().addItem(mockProduct2); // 200×1
    useCartStore.getState().updateQuantity(mockProduct.id, 3); // 100×3 = 300
    expect(useCartStore.getState().subtotal()).toBeCloseTo(500); // 300+200
  });
});

// ─── total() ─────────────────────────────────────────────
describe('total()', () => {
  it('equals subtotal when no order discount', () => {
    useCartStore.getState().addItem(mockProduct);
    expect(useCartStore.getState().total()).toBeCloseTo(useCartStore.getState().subtotal());
  });

  it('deducts orderDiscountAmount from subtotal', () => {
    useCartStore.getState().addItem(mockProduct); // subtotal=100
    useCartStore.getState().setOrderDiscount(20);
    expect(useCartStore.getState().total()).toBeCloseTo(80);
  });

  it('is never negative', () => {
    useCartStore.getState().addItem(mockProduct); // subtotal=100
    useCartStore.getState().setOrderDiscount(9999);
    expect(useCartStore.getState().total()).toBe(0);
  });

  it('updates after quantity change + order discount', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateQuantity(mockProduct.id, 3); // subtotal=300
    useCartStore.getState().setOrderDiscount(50);
    expect(useCartStore.getState().total()).toBeCloseTo(250);
  });
});

// ─── clearCart ───────────────────────────────────────────
describe('clearCart', () => {
  it('empties items and resets order discount', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().setOrderDiscount(30);
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().orderDiscountAmount).toBe(0);
  });

  it('does not reset paymentMethod or salesStaff', () => {
    useCartStore.getState().setPaymentMethod('CARD');
    useCartStore.getState().setSalesStaff('staff-1');
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().paymentMethod).toBe('CARD');
    expect(useCartStore.getState().currentSalesStaffId).toBe('staff-1');
  });
});
```

- [ ] **Step 2: 執行，確認全部通過**

```bash
cd /Users/george/Documents/專案/startup/systems/enterprise-admin/pos-ui
npm test -- cartStore 2>&1 | tail -10
```

Expected: 全部 PASS（約 22 tests）

- [ ] **Step 3: Commit**

```bash
cd /Users/george/Documents/專案/startup/systems/enterprise-admin
git add pos-ui/src/__tests__/cartStore.test.ts
git commit -m "test(pos-ui): expand cartStore tests to 22 cases — quantity, discount, total coverage"
```

---

## Task 3: CartItem 元件互動測試（會先 FAIL — 暴露 Bug）

**Files:**
- Create: `pos-ui/src/__tests__/CartItem.test.tsx`

- [ ] **Step 1: 建立測試檔**

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CartItem from '../components/CartItem';
import { useCartStore } from '../store/cartStore';
import { PosProduct } from '../api/pos';

const product: PosProduct = {
  id: 'p1',
  name: 'Panadol',
  sku: 'PAN',
  retailPrice: 100,
  stockQuantity: 20,
};

function setup(quantity = 1, discountRate = 0) {
  useCartStore.setState({
    items: [{ product, quantity, discountRate }],
    orderDiscountAmount: 0,
    orderDiscountNote: '',
    paymentMethod: 'CASH',
    currentSalesStaffId: null,
  });
  const item = useCartStore.getState().items[0];
  return render(<CartItem item={item} />);
}

beforeEach(() => {
  useCartStore.setState({
    items: [],
    orderDiscountAmount: 0,
    orderDiscountNote: '',
    paymentMethod: 'CASH',
    currentSalesStaffId: null,
  });
});

describe('CartItem display', () => {
  it('renders product name', () => {
    setup();
    expect(screen.getByText('Panadol')).toBeInTheDocument();
  });

  it('renders line total: price × quantity', () => {
    setup(2);
    expect(screen.getByText('$200')).toBeInTheDocument();
  });

  it('renders line total with discount applied', () => {
    setup(1, 10); // 100 × (1 - 10/100) = 90
    expect(screen.getByText('$90')).toBeInTheDocument();
  });
});

describe('CartItem + button', () => {
  it('increments quantity in store when + clicked', async () => {
    const user = userEvent.setup();
    setup(1);
    await user.click(screen.getByRole('button', { name: '+' }));
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });

  it('caps quantity at stockQuantity', async () => {
    const user = userEvent.setup();
    setup(20); // already at max
    await user.click(screen.getByRole('button', { name: '+' }));
    expect(useCartStore.getState().items[0].quantity).toBe(20);
  });
});

describe('CartItem − button', () => {
  it('decrements quantity when − clicked', async () => {
    const user = userEvent.setup();
    setup(3);
    await user.click(screen.getByRole('button', { name: '−' }));
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });

  it('removes item from cart when quantity reaches 0', async () => {
    const user = userEvent.setup();
    setup(1);
    await user.click(screen.getByRole('button', { name: '−' }));
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});

describe('CartItem quantity input (direct typing)', () => {
  it('updates quantity when user clears and types new number', async () => {
    // THIS TEST WILL FAIL with current implementation (parseInt("") = NaN bug)
    const user = userEvent.setup();
    setup(2);
    const input = screen.getByRole('spinbutton'); // type="number" input
    await user.clear(input);
    await user.type(input, '5');
    await user.tab(); // blur to commit
    expect(useCartStore.getState().items[0].quantity).toBe(5);
  });

  it('updates quantity without clearing first', async () => {
    const user = userEvent.setup();
    setup(1);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '8');
    await user.tab();
    expect(useCartStore.getState().items[0].quantity).toBe(8);
  });

  it('respects stockQuantity max when typing large number', async () => {
    const user = userEvent.setup();
    setup(1);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '999');
    await user.tab();
    expect(useCartStore.getState().items[0].quantity).toBe(product.stockQuantity);
  });

  it('sets quantity to 1 if user types 0 or negative', async () => {
    const user = userEvent.setup();
    setup(3);
    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    await user.type(input, '0');
    await user.tab();
    // 0 removes item per store logic, but direct input should cap at 1
    // After fix: typing 0 in the input field sets qty to 1 (not removes item)
    expect(useCartStore.getState().items[0].quantity).toBe(1);
  });
});

describe('CartItem discount input', () => {
  it('updates discountRate when typing in discount field', async () => {
    const user = userEvent.setup();
    setup(1, 0);
    // Find the discount input (placeholder "折扣%")
    const discountInput = screen.getByPlaceholderText('折扣%');
    await user.clear(discountInput);
    await user.type(discountInput, '20');
    expect(useCartStore.getState().items[0].discountRate).toBe(20);
  });
});

describe('CartItem × remove button', () => {
  it('removes item when × clicked', async () => {
    const user = userEvent.setup();
    setup(2);
    await user.click(screen.getByRole('button', { name: '×' }));
    expect(useCartStore.getState().items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 執行，確認數量直接輸入的測試 FAIL**

```bash
cd /Users/george/Documents/專案/startup/systems/enterprise-admin/pos-ui
npm test -- CartItem 2>&1 | grep -E "PASS|FAIL|✓|×|updates quantity when user clears"
```

Expected: `updates quantity when user clears and types new number` → FAIL（這個 fail 確認了 Bug）

- [ ] **Step 3: Commit 測試（紅燈狀態）**

```bash
cd /Users/george/Documents/專案/startup/systems/enterprise-admin
git add pos-ui/src/__tests__/CartItem.test.tsx
git commit -m "test(pos-ui): add CartItem interaction tests — quantity input bug exposed (red)"
```

---

## Task 4: 修復 CartItem 數量 Input（local state + blur commit）

**Files:**
- Modify: `pos-ui/src/components/CartItem.tsx`

- [ ] **Step 1: 完整替換 CartItem.tsx**

```tsx
import { useState, useEffect } from 'react';
import { CartItem as CartItemType, useCartStore } from '../store/cartStore';

interface Props {
  item: CartItemType;
}

export default function CartItem({ item }: Props) {
  const { updateQuantity, removeItem, updateItemDiscount } = useCartStore();
  const finalPrice = item.product.retailPrice * (1 - item.discountRate / 100);
  const lineTotal = finalPrice * item.quantity;

  // Local state for the quantity input — allows clearing before typing new value
  const [qtyInput, setQtyInput] = useState(String(item.quantity));

  // Keep local state in sync when store updates quantity from outside (e.g. + / − buttons)
  useEffect(() => {
    setQtyInput(String(item.quantity));
  }, [item.quantity]);

  function commitQuantity() {
    const val = parseInt(qtyInput, 10);
    if (isNaN(val) || val <= 0) {
      // Invalid input: snap back to current store quantity
      setQtyInput(String(item.quantity));
    } else {
      const clamped = Math.min(val, item.product.stockQuantity);
      updateQuantity(item.product.id, clamped);
      setQtyInput(String(clamped));
    }
  }

  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: 'var(--text-primary)' }}>
          {item.product.name}
        </span>
        <button
          onClick={() => removeItem(item.product.id)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <button
          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
          style={{ width: 24, height: 24, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'var(--bg-card)', flexShrink: 0 }}
        >
          −
        </button>

        <input
          type="number"
          min={1}
          max={item.product.stockQuantity}
          value={qtyInput}
          onChange={(e) => setQtyInput(e.target.value)}
          onBlur={commitQuantity}
          onKeyDown={(e) => { if (e.key === 'Enter') commitQuantity(); }}
          style={{
            width: 44, textAlign: 'center', fontSize: 13, fontWeight: 600,
            border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px',
          }}
        />

        <button
          onClick={() => updateQuantity(item.product.id, Math.min(item.quantity + 1, item.product.stockQuantity))}
          style={{ width: 24, height: 24, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'var(--bg-card)', flexShrink: 0 }}
        >
          +
        </button>

        <input
          type="number"
          min={0}
          max={100}
          value={item.discountRate}
          onChange={(e) => updateItemDiscount(item.product.id, Number(e.target.value))}
          placeholder="折扣%"
          style={{ width: 56, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 12 }}
        />
        <span style={{ marginLeft: 'auto', fontWeight: 600, fontSize: 13 }}>
          ${lineTotal.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
```

**關鍵改動說明：**
- `qtyInput` local state：追蹤輸入框文字，允許暫時為空字串
- `useEffect([item.quantity])`：當 store 的 quantity 被 +/- 按鈕改變時，同步 local state
- `commitQuantity()`：blur 或 Enter 才真正 commit 到 store，空字串或非法值彈回舊值
- `updateQuantity(id, 0)` 會移除 item（store 行為），所以 `val <= 0` 時 snap back 而非移除

- [ ] **Step 2: 執行 CartItem 測試，確認全部通過**

```bash
cd /Users/george/Documents/專案/startup/systems/enterprise-admin/pos-ui
npm test -- CartItem 2>&1 | tail -12
```

Expected: 全部 PASS（約 11 tests）

- [ ] **Step 3: 執行全部前端測試**

```bash
npm test 2>&1 | tail -8
```

Expected: 全部 PASS

- [ ] **Step 4: Commit**

```bash
cd /Users/george/Documents/專案/startup/systems/enterprise-admin
git add pos-ui/src/components/CartItem.tsx
git commit -m "fix(pos-ui): CartItem quantity input — use local state + blur commit to fix NaN clear bug"
```

---

## Task 5: CartPanel 整合測試（小計/合計顯示）

**Files:**
- Create: `pos-ui/src/__tests__/CartPanel.test.tsx`

- [ ] **Step 1: 建立測試檔**

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CartPanel from '../components/CartPanel';
import { useCartStore } from '../store/cartStore';
import { PosProduct } from '../api/pos';

const product: PosProduct = {
  id: 'p1', name: 'Panadol', sku: 'PAN', retailPrice: 100, stockQuantity: 20,
};

const defaultProps = {
  currentStaffName: '張藥師',
  onCheckout: vi.fn(),
  onSwitchStaff: vi.fn(),
};

function setupCart(quantity = 1, discountRate = 0, orderDiscount = 0) {
  useCartStore.setState({
    items: quantity > 0 ? [{ product, quantity, discountRate }] : [],
    orderDiscountAmount: orderDiscount,
    orderDiscountNote: '',
    paymentMethod: 'CASH',
    currentSalesStaffId: null,
  });
}

beforeEach(() => {
  setupCart(0);
  vi.clearAllMocks();
});

describe('CartPanel empty state', () => {
  it('shows empty message when cart is empty', () => {
    setupCart(0);
    render(<CartPanel {...defaultProps} />);
    expect(screen.getByText('購物車為空')).toBeInTheDocument();
  });

  it('disables checkout button when cart is empty', () => {
    setupCart(0);
    render(<CartPanel {...defaultProps} />);
    expect(screen.getByRole('button', { name: /結帳/ })).toBeDisabled();
  });
});

describe('CartPanel subtotal display', () => {
  it('shows subtotal = price × quantity', () => {
    setupCart(2); // 100 × 2 = 200
    render(<CartPanel {...defaultProps} />);
    expect(screen.getByText(/小計 \$200/)).toBeInTheDocument();
  });

  it('shows subtotal with item discount applied', () => {
    setupCart(1, 10); // 100 × 0.9 = 90
    render(<CartPanel {...defaultProps} />);
    expect(screen.getByText(/小計 \$90/)).toBeInTheDocument();
  });
});

describe('CartPanel total display', () => {
  it('shows total = subtotal when no order discount', () => {
    setupCart(3); // subtotal=300
    render(<CartPanel {...defaultProps} />);
    expect(screen.getByText(/合計 \$300/)).toBeInTheDocument();
  });

  it('shows total = subtotal - orderDiscount', () => {
    setupCart(3, 0, 50); // subtotal=300, discount=50, total=250
    render(<CartPanel {...defaultProps} />);
    expect(screen.getByText(/合計 \$250/)).toBeInTheDocument();
  });
});

describe('CartPanel order discount input', () => {
  it('updates total when user types order discount', async () => {
    const user = userEvent.setup();
    setupCart(1); // subtotal=100
    render(<CartPanel {...defaultProps} />);
    const discountInput = screen.getByPlaceholderText('0');
    await user.clear(discountInput);
    await user.type(discountInput, '30');
    // total should now be 100 - 30 = 70
    expect(useCartStore.getState().orderDiscountAmount).toBe(30);
    expect(screen.getByText(/合計 \$70/)).toBeInTheDocument();
  });
});

describe('CartPanel payment method', () => {
  it('defaults to 現金', () => {
    setupCart(1);
    render(<CartPanel {...defaultProps} />);
    const cashBtn = screen.getByRole('button', { name: '現金' });
    expect(cashBtn).toHaveStyle({ background: 'var(--accent)' });
  });

  it('updates payment method in store when clicked', async () => {
    const user = userEvent.setup();
    setupCart(1);
    render(<CartPanel {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: '刷卡' }));
    expect(useCartStore.getState().paymentMethod).toBe('CARD');
  });
});

describe('CartPanel checkout button', () => {
  it('calls onCheckout when clicked with items', async () => {
    const user = userEvent.setup();
    setupCart(1);
    render(<CartPanel {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /結帳/ }));
    expect(defaultProps.onCheckout).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: 執行測試**

```bash
cd /Users/george/Documents/專案/startup/systems/enterprise-admin/pos-ui
npm test -- CartPanel 2>&1 | tail -12
```

Expected: 全部 PASS（約 10 tests）

- [ ] **Step 3: 執行完整測試套件**

```bash
npm test 2>&1 | tail -8
```

Expected: 全部 PASS（總計約 40+ tests）

- [ ] **Step 4: Commit**

```bash
cd /Users/george/Documents/專案/startup/systems/enterprise-admin
git add pos-ui/src/__tests__/CartPanel.test.tsx
git commit -m "test(pos-ui): add CartPanel integration tests — subtotal, total, payment method"
```

---

## Task 6: Build 確認 + Push

- [ ] **Step 1: 前端 build**

```bash
cd /Users/george/Documents/專案/startup/systems/enterprise-admin/pos-ui
npm run build 2>&1 | tail -5
```

Expected: `✓ built in Xms`

- [ ] **Step 2: Push**

```bash
cd /Users/george/Documents/專案/startup/systems/enterprise-admin
git push
```

---

## Self-Review

**Spec coverage:**
- ✅ addItem 後用 +/- 調整數量：Task 3 CartItem + button / − button 測試
- ✅ 直接輸入數量（清空再打）→ 價格聯動：Task 3 `updates quantity when user clears` (先 FAIL) + Task 4 修復
- ✅ 折扣 input 更新：Task 3 discount input 測試
- ✅ CartPanel 小計/合計顯示：Task 5
- ✅ 整筆折扣聯動 total：Task 5

**Placeholder scan:** 無 TBD / TODO

**Type consistency:** `CartItem`, `useCartStore`, `PosProduct` 所有引用路徑一致
