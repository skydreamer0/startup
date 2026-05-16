import { useCartStore } from '../store/cartStore';
import CartItemComponent from './CartItem';

interface Props {
  currentStaffName: string;
  onCheckout: () => void;
  onSwitchStaff: () => void;
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: '現金',
  CARD: '刷卡',
  LINE_PAY: 'LINE Pay',
  TRANSFER: '轉帳',
  OTHER: '其他',
};

export default function CartPanel({ currentStaffName, onCheckout, onSwitchStaff }: Props) {
  const {
    items, orderDiscountAmount, paymentMethod,
    setOrderDiscount, setPaymentMethod, clearCart, subtotal, total,
  } = useCartStore();
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      borderLeft: '1px solid var(--border)', padding: 12, gap: 8,
    }}>
      {/* Staff */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>收銀員</span>
        <button onClick={onSwitchStaff} style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
          {currentStaffName} (F6)
        </button>
      </div>

      {/* Items header with total qty */}
      {items.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingBottom: 2, borderBottom: '1px solid var(--border)' }}>
          共 {totalQty} 件商品
        </div>
      )}

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {items.length === 0
          ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 32, fontSize: 13 }}>購物車為空</div>
          : items.map((item) => <CartItemComponent key={item.product.id} item={item} />)
        }
      </div>

      {/* Discount */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>整筆折扣</span>
        <input
          id="order-discount"
          type="number"
          min={0}
          value={orderDiscountAmount || ''}
          onChange={(e) => setOrderDiscount(Number(e.target.value))}
          placeholder="0"
          style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 4, fontSize: 13 }}
        />
        <span style={{ fontSize: 12 }}>元</span>
      </div>

      {/* Payment method */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(['CASH', 'CARD', 'LINE_PAY', 'TRANSFER'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setPaymentMethod(m)}
            style={{
              padding: '4px 10px', fontSize: 12, borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border)',
              background: paymentMethod === m ? 'var(--accent)' : 'var(--bg-card)',
              color: paymentMethod === m ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {PAYMENT_LABELS[m]}
          </button>
        ))}
      </div>

      {/* Totals */}
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        小計 ${subtotal().toFixed(0)}
        {orderDiscountAmount > 0 && <span style={{ color: 'var(--danger)' }}> − ${orderDiscountAmount.toFixed(0)}</span>}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
        合計 ${total().toFixed(0)}
      </div>

      {/* Actions */}
      <button
        onClick={onCheckout}
        disabled={items.length === 0}
        style={{
          padding: '12px', background: 'var(--accent)', color: '#fff', border: 'none',
          borderRadius: 'var(--radius-sm)', fontSize: 16, fontWeight: 700,
          cursor: items.length === 0 ? 'not-allowed' : 'pointer',
          opacity: items.length === 0 ? 0.5 : 1,
        }}
      >
        結帳 (Enter ↵)
      </button>
      <button
        onClick={clearCart}
        style={{ padding: '6px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontSize: 12, cursor: 'pointer', color: 'var(--text-muted)' }}
      >
        清空購物車 (F5)
      </button>
    </div>
  );
}
