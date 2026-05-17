import { useEffect, useState } from 'react';
import { useCartStore } from '../store/cartStore';
import CartItemComponent from './CartItem';
import { PosToastMessage } from './PosToast';

interface Props {
  currentStaffName: string;
  onCheckout: () => void;
  onSwitchStaff: () => void;
  onFeedback?: (toast: PosToastMessage) => void;
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: '現金',
  CARD: '信用卡',
  LINE_PAY: 'LINE Pay',
  TRANSFER: '轉帳',
  OTHER: '其他',
};

export default function CartPanel({ currentStaffName, onCheckout, onSwitchStaff, onFeedback }: Props) {
  const {
    items, orderDiscountAmount, paymentMethod,
    setOrderDiscount, setPaymentMethod, clearCart, subtotal, total,
  } = useCartStore();
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [panelMessage, setPanelMessage] = useState('');

  useEffect(() => {
    if (!confirmingClear) return;
    const timeout = window.setTimeout(() => setConfirmingClear(false), 3000);
    return () => window.clearTimeout(timeout);
  }, [confirmingClear]);

  function handleClearCart() {
    if (items.length === 0) {
      setPanelMessage('購物車目前沒有商品');
      onFeedback?.({ type: 'info', message: '購物車目前沒有商品' });
      return;
    }

    if (!confirmingClear) {
      setConfirmingClear(true);
      setPanelMessage('再按一次清空購物車');
      onFeedback?.({ type: 'warning', message: '再按一次清空購物車' });
      return;
    }

    clearCart();
    setConfirmingClear(false);
    setPanelMessage('購物車已清空');
    onFeedback?.({ type: 'success', message: '購物車已清空' });
  }

  return (
    <div className="pos-cart-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>銷售人員</span>
        <button onClick={onSwitchStaff} style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
          {currentStaffName} (F6)
        </button>
      </div>

      {items.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingBottom: 2, borderBottom: '1px solid var(--border)' }}>
          共 {totalQty} 件商品
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {items.length === 0
          ? <div style={{ textAlign: 'center', color: 'var(--text-muted)', paddingTop: 32, fontSize: 13 }}>購物車目前沒有商品</div>
          : items.map((item) => <CartItemComponent key={item.product.id} item={item} />)
        }
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>整筆折扣</span>
        <input
          id="order-discount"
          type="number"
          min={0}
          value={orderDiscountAmount || ''}
          onChange={(e) => setOrderDiscount(Number(e.target.value))}
          placeholder="0"
          style={{ flex: 1, padding: '4px 8px', border: `1px solid ${orderDiscountAmount >= 500 ? '#F59E0B' : 'var(--border)'}`, borderRadius: 4, fontSize: 13 }}
        />
        <span style={{ fontSize: 12 }}>元</span>
        {orderDiscountAmount >= 500 && <span style={{ fontSize: 10, color: '#F59E0B', fontWeight: 600, whiteSpace: 'nowrap' }}>高折扣</span>}
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {(['CASH', 'CARD', 'LINE_PAY', 'TRANSFER'] as const).map((method) => (
          <button
            key={method}
            onClick={() => setPaymentMethod(method)}
            style={{
              padding: '4px 10px', fontSize: 12, borderRadius: 'var(--radius-xs)',
              border: '1px solid var(--border)',
              background: paymentMethod === method ? 'var(--accent)' : 'var(--bg-card)',
              color: paymentMethod === method ? '#fff' : 'var(--text-secondary)',
              cursor: 'pointer',
            }}
          >
            {PAYMENT_LABELS[method]}
          </button>
        ))}
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        小計 ${subtotal().toFixed(0)}
        {orderDiscountAmount > 0 && <span style={{ color: 'var(--danger)' }}> -${orderDiscountAmount.toFixed(0)}</span>}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>
        總計 ${total().toFixed(0)}
      </div>

      {panelMessage && (
        <div role="status" style={{ fontSize: 12, color: 'var(--text-secondary)', minHeight: 18 }}>
          {panelMessage}
        </div>
      )}

      <button
        onClick={onCheckout}
        disabled={items.length === 0}
        style={{
          padding: '12px', background: 'var(--accent)', color: '#fff', border: 'none',
          borderRadius: 'var(--radius-sm)', fontSize: 16, fontWeight: 700,
          minHeight: 56,
          cursor: items.length === 0 ? 'not-allowed' : 'pointer',
          opacity: items.length === 0 ? 0.5 : 1,
        }}
      >
        結帳 (Enter)
      </button>
      <button
        onClick={handleClearCart}
        style={{ padding: '6px', background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontSize: 12, cursor: 'pointer', color: confirmingClear ? 'var(--danger)' : 'var(--text-muted)' }}
      >
        {confirmingClear ? '再按一次清空購物車' : '清空購物車 (F5)'}
      </button>
    </div>
  );
}
