import { CartItem as CartItemType, useCartStore } from '../store/cartStore';

interface Props {
  item: CartItemType;
}

export default function CartItem({ item }: Props) {
  const { updateQuantity, removeItem, updateItemDiscount } = useCartStore();
  const finalPrice = item.product.retailPrice * (1 - item.discountRate / 100);
  const lineTotal = finalPrice * item.quantity;

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
          value={item.quantity}
          onChange={(e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) updateQuantity(item.product.id, Math.min(Math.max(1, val), item.product.stockQuantity));
          }}
          style={{
            width: 40, textAlign: 'center', fontSize: 13, fontWeight: 600,
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
