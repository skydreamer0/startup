import { useState, useEffect } from 'react';
import { CartItem as CartItemType, useCartStore } from '../store/cartStore';

interface Props {
  item: CartItemType;
}

const DISCOUNT_WARN_THRESHOLD = 20;

export default function CartItem({ item }: Props) {
  const { updateQuantity, removeItem, updateItemDiscount } = useCartStore();
  const storeItem = useCartStore((state) =>
    state.items.find((candidate) => candidate.product.id === item.product.id),
  );
  const cur = storeItem ?? item;

  const unitPrice = cur.product.retailPrice;
  const discountedUnit = unitPrice * (1 - cur.discountRate / 100);
  const lineTotal = discountedUnit * cur.quantity;

  const [qtyInput, setQtyInput] = useState(String(cur.quantity));

  useEffect(() => {
    setQtyInput(String(cur.quantity));
  }, [cur.quantity]);

  function commitQuantity() {
    const val = parseInt(qtyInput, 10);
    if (isNaN(val) || val <= 0) {
      setQtyInput(String(cur.quantity));
      return;
    }

    const clamped = Math.min(val, cur.product.stockQuantity);
    updateQuantity(cur.product.id, clamped);
    setQtyInput(String(clamped));
  }

  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 500, flex: 1, color: 'var(--text-primary)', lineHeight: 1.3 }}>
          {cur.product.name}
        </span>
        <button
          type="button"
          aria-label={`移除 ${cur.product.name}`}
          onClick={() => removeItem(cur.product.id)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, paddingLeft: 8, minHeight: 40, minWidth: 40 }}
        >
          x
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          aria-label="減少數量"
          onClick={() => updateQuantity(cur.product.id, cur.quantity - 1)}
          style={{ width: 24, height: 24, minHeight: 40, minWidth: 40, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'var(--bg-card)', flexShrink: 0, fontSize: 14 }}
        >
          -
        </button>

        <input
          aria-label="商品數量"
          type="number"
          min={1}
          max={cur.product.stockQuantity}
          value={qtyInput}
          onChange={(event) => setQtyInput(event.target.value)}
          onBlur={commitQuantity}
          onKeyDown={(event) => { if (event.key === 'Enter') commitQuantity(); }}
          style={{
            width: 44, textAlign: 'center', fontSize: 13, fontWeight: 600,
            border: '1px solid var(--border)', borderRadius: 4, padding: '2px 4px',
          }}
        />

        <button
          type="button"
          aria-label="增加數量"
          onClick={() => updateQuantity(cur.product.id, Math.min(cur.quantity + 1, cur.product.stockQuantity))}
          style={{ width: 24, height: 24, minHeight: 40, minWidth: 40, border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer', background: 'var(--bg-card)', flexShrink: 0, fontSize: 14 }}
        >
          +
        </button>

        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          @${unitPrice.toFixed(0)}
        </span>

        <span style={{ marginLeft: 'auto', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
          ${lineTotal.toFixed(0)}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>折扣</span>
        <input
          type="text"
          inputMode="numeric"
          value={cur.discountRate === 0 ? '' : cur.discountRate}
          onChange={(event) => {
            const value = Number(event.target.value);
            updateItemDiscount(cur.product.id, isNaN(value) ? 0 : Math.min(Math.max(value, 0), 100));
          }}
          placeholder="0"
          style={{ width: 40, padding: '2px 4px', border: `1px solid ${cur.discountRate >= DISCOUNT_WARN_THRESHOLD ? '#F59E0B' : 'var(--border)'}`, borderRadius: 4, fontSize: 11, textAlign: 'center' }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
        {cur.discountRate > 0 && (
          <span style={{ fontSize: 11, color: 'var(--danger)', marginLeft: 2 }}>
            -${(unitPrice * (cur.discountRate / 100) * cur.quantity).toFixed(0)}
          </span>
        )}
        {cur.discountRate >= DISCOUNT_WARN_THRESHOLD && (
          <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 600, whiteSpace: 'nowrap' }}>高折扣</span>
        )}
      </div>
    </div>
  );
}
