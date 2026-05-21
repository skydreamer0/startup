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

  const unitPrice = Number(cur.product.retailPrice);
  const discountedUnit = unitPrice * (1 - cur.discountRate / 100);
  const lineTotal = discountedUnit * cur.quantity;

  const [qtyInput, setQtyInput] = useState(String(cur.quantity));

  useEffect(() => {
    setQtyInput(String(cur.quantity));
  }, [cur.quantity]);

  function commitQuantity() {
    const val = parseInt(qtyInput, 10);
    if (isNaN(val) || val <= 0) { setQtyInput(String(cur.quantity)); return; }
    const clamped = Math.min(val, cur.product.stockQuantity);
    updateQuantity(cur.product.id, clamped);
    setQtyInput(String(clamped));
  }

  return (
    <div style={{
      padding: '10px 14px',
      marginBottom: 8,
      background: 'var(--bg-card)',
      borderRadius: 'var(--radius-sm)',
      border: '1.5px solid var(--border)',
    }}>
      {/* Name + remove */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, flex: 1, color: 'var(--text-primary)', lineHeight: 1.3, paddingRight: 8 }}>
          {cur.product.name}
        </span>
        <button
          type="button"
          aria-label={`移除 ${cur.product.name}`}
          onClick={() => removeItem(cur.product.id)}
          style={{ background: '#FEE2E2', border: 'none', color: '#DC2626', cursor: 'pointer', fontSize: 13, lineHeight: 1, borderRadius: 8, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          ×
        </button>
      </div>

      {/* Qty controls + line total */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          type="button"
          aria-label="減少數量"
          onClick={() => updateQuantity(cur.product.id, cur.quantity - 1)}
          style={{ width: 28, height: 28, border: '1.5px solid var(--border)', borderRadius: 10, cursor: 'pointer', background: 'var(--bg-app)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}
        >
          −
        </button>
        <input
          aria-label="商品數量"
          type="number"
          min={1}
          max={cur.product.stockQuantity}
          value={qtyInput}
          onChange={(e) => setQtyInput(e.target.value)}
          onBlur={commitQuantity}
          onKeyDown={(e) => { if (e.key === 'Enter') commitQuantity(); }}
          style={{ width: 44, textAlign: 'center', fontSize: 14, fontWeight: 700, border: '1.5px solid var(--border)', borderRadius: 10, padding: '4px', background: 'var(--bg-app)', color: 'var(--text-primary)' }}
        />
        <button
          type="button"
          aria-label="增加數量"
          onClick={() => updateQuantity(cur.product.id, Math.min(cur.quantity + 1, cur.product.stockQuantity))}
          style={{ width: 28, height: 28, border: '1.5px solid var(--border)', borderRadius: 10, cursor: 'pointer', background: 'var(--bg-app)', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}
        >
          +
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>@${unitPrice.toFixed(0)}</span>
        <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 15, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
          ${lineTotal.toFixed(0)}
        </span>
      </div>

      {/* Discount row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>折扣</span>
        <input
          type="text"
          inputMode="numeric"
          value={cur.discountRate === 0 ? '' : cur.discountRate}
          onChange={(e) => {
            const v = Number(e.target.value);
            updateItemDiscount(cur.product.id, isNaN(v) ? 0 : Math.min(Math.max(v, 0), 100));
          }}
          placeholder="0"
          style={{ width: 44, padding: '3px 6px', border: `1.5px solid ${cur.discountRate >= DISCOUNT_WARN_THRESHOLD ? 'var(--warning)' : 'var(--border)'}`, borderRadius: 8, fontSize: 11, textAlign: 'center', background: 'var(--bg-app)' }}
        />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
        {cur.discountRate > 0 && (
          <span style={{ fontSize: 11, color: 'var(--danger)', marginLeft: 2 }}>
            −${(unitPrice * (cur.discountRate / 100) * cur.quantity).toFixed(0)}
          </span>
        )}
        {cur.discountRate >= DISCOUNT_WARN_THRESHOLD && (
          <span style={{ fontSize: 10, color: 'var(--warning)', fontWeight: 700, whiteSpace: 'nowrap', background: 'var(--warning-bg)', padding: '1px 6px', borderRadius: 999 }}>高折扣</span>
        )}
      </div>
    </div>
  );
}
