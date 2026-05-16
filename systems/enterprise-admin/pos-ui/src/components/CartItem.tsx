import { useState, useEffect } from 'react';
import { CartItem as CartItemType, useCartStore } from '../store/cartStore';

interface Props {
  item: CartItemType;
}

export default function CartItem({ item }: Props) {
  const { updateQuantity, removeItem, updateItemDiscount } = useCartStore();
  const storeItem = useCartStore((state) =>
    state.items.find((cartItem) => cartItem.product.id === item.product.id),
  );
  const currentItem = storeItem ?? item;
  const finalPrice = currentItem.product.retailPrice * (1 - currentItem.discountRate / 100);
  const lineTotal = finalPrice * currentItem.quantity;

  // Local state allows clearing before typing new value (fixes NaN bug)
  const [qtyInput, setQtyInput] = useState(String(currentItem.quantity));

  // Sync when store quantity changes from +/- buttons
  useEffect(() => {
    setQtyInput(String(currentItem.quantity));
  }, [currentItem.quantity]);

  function commitQuantity() {
    const val = parseInt(qtyInput, 10);
    if (isNaN(val)) {
      setQtyInput(String(currentItem.quantity));
    } else {
      const clamped = Math.min(Math.max(val, 1), currentItem.product.stockQuantity);
      updateQuantity(currentItem.product.id, clamped);
      setQtyInput(String(clamped));
    }
  }

  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: 'var(--text-primary)' }}>
          {currentItem.product.name}
        </span>
        <button
          onClick={() => removeItem(currentItem.product.id)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16 }}
        >
          ×
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <button
          onClick={() => updateQuantity(currentItem.product.id, currentItem.quantity - 1)}
          style={{ width: 24, height: 24, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'var(--bg-card)', flexShrink: 0 }}
        >
          −
        </button>

        <input
          type="number"
          min={1}
          max={currentItem.product.stockQuantity}
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
          onClick={() => updateQuantity(currentItem.product.id, Math.min(currentItem.quantity + 1, currentItem.product.stockQuantity))}
          style={{ width: 24, height: 24, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'var(--bg-card)', flexShrink: 0 }}
        >
          +
        </button>

        <input
          type="text"
          inputMode="numeric"
          value={currentItem.discountRate}
          onChange={(e) => updateItemDiscount(currentItem.product.id, Number(e.target.value))}
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
