import { useEffect, useState } from 'react';
import { useCartStore } from '../store/cartStore';
import CartItemComponent from './CartItem';
import { PosToastMessage } from './PosToast';
import { PAYMENT_LABELS } from '../constants';

interface Props {
  currentStaffName: string;
  onCheckout: () => void;
  onSwitchStaff: () => void;
  onFeedback?: (toast: PosToastMessage) => void;
}

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
      onFeedback?.({ type: 'info', message: '購物車目前沒有商品' });
      return;
    }
    if (!confirmingClear) {
      setConfirmingClear(true);
      setPanelMessage('再按一次確認清空');
      onFeedback?.({ type: 'warning', message: '再按一次清空購物車' });
      return;
    }
    clearCart();
    setConfirmingClear(false);
    setPanelMessage('');
    onFeedback?.({ type: 'success', message: '購物車已清空' });
  }

  return (
    <div className="pos-cart-panel">
      {/* Staff header */}
      <div style={{ padding: '14px 20px 12px', background: 'var(--bg-card)', borderBottom: '1.5px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>目前銷售人員</div>
        <button onClick={onSwitchStaff} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
          👤 {currentStaffName} (F6)
        </button>
        {totalQty > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>共 {totalQty} 件商品</div>
        )}
      </div>

      {/* Cart items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {items.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, opacity: 0.5 }}>
            <div style={{ fontSize: 44 }}>🛍️</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>點擊商品加入購物車</div>
          </div>
        ) : (
          items.map((item) => <CartItemComponent key={item.product.id} item={item} />)
        )}
      </div>

      {/* Bottom controls */}
      <div style={{ padding: '14px 16px', background: 'var(--bg-card)', borderTop: '1.5px solid var(--border)' }}>
        {/* Order discount */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>整筆折扣</span>
          <input
            id="order-discount"
            type="number"
            min={0}
            value={orderDiscountAmount || ''}
            onChange={(e) => setOrderDiscount(Number(e.target.value))}
            placeholder="0"
            style={{ flex: 1, padding: '6px 10px', border: `1.5px solid ${orderDiscountAmount >= 500 ? 'var(--warning)' : 'var(--border)'}`, borderRadius: 'var(--radius-xs)', fontSize: 13, background: 'var(--bg-app)', color: 'var(--text-primary)' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>元</span>
          {orderDiscountAmount >= 500 && <span style={{ fontSize: 10, color: 'var(--warning)', fontWeight: 700, background: 'var(--warning-bg)', padding: '1px 6px', borderRadius: 999, whiteSpace: 'nowrap' }}>高折扣</span>}
        </div>

        {/* Payment method pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {(['CASH', 'CARD', 'LINE_PAY', 'TRANSFER'] as const).map((method) => (
            <button
              key={method}
              onClick={() => setPaymentMethod(method)}
              style={{
                padding: '6px 14px', fontSize: 12, borderRadius: 'var(--radius-full)',
                border: `1.5px solid ${paymentMethod === method ? 'var(--accent)' : 'var(--border)'}`,
                background: paymentMethod === method ? 'var(--accent-subtle)' : 'var(--bg-app)',
                color: paymentMethod === method ? 'var(--accent)' : 'var(--text-muted)',
                fontWeight: paymentMethod === method ? 700 : 500,
                cursor: 'pointer',
                transition: 'all var(--transition-fast)',
              }}
            >
              {PAYMENT_LABELS[method]}
            </button>
          ))}
        </div>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-muted)', marginBottom: 4 }}>
          <span>小計</span>
          <span>${subtotal().toFixed(0)}</span>
        </div>
        {orderDiscountAmount > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--danger)', marginBottom: 4 }}>
            <span>折扣</span>
            <span>−${orderDiscountAmount.toFixed(0)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>總計金額</span>
          <span style={{ fontSize: 24, fontWeight: 900, color: 'var(--accent)', letterSpacing: '-0.02em' }}>
            ${total().toFixed(0)}
          </span>
        </div>

        {panelMessage && (
          <div role="status" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{panelMessage}</div>
        )}

        {/* Checkout button */}
        <button
          data-testid="cart-checkout-button"
          onClick={onCheckout}
          disabled={items.length === 0}
          style={{
            width: '100%', padding: '14px', border: 'none',
            borderRadius: 'var(--radius-full)',
            background: items.length === 0 ? 'var(--border)' : 'linear-gradient(135deg, #D97706, #F59E0B)',
            color: items.length === 0 ? 'var(--text-muted)' : '#fff',
            fontSize: 15, fontWeight: 800,
            cursor: items.length === 0 ? 'not-allowed' : 'pointer',
            boxShadow: items.length === 0 ? 'none' : '0 4px 14px rgba(217,119,6,0.35)',
            letterSpacing: '0.01em',
            marginBottom: 8,
          }}
        >
          確認結帳 (Enter)
        </button>
        <button
          onClick={handleClearCart}
          style={{
            width: '100%', padding: '10px', background: 'transparent',
            border: `1.5px solid ${confirmingClear ? 'var(--danger)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-full)', fontSize: 13, cursor: 'pointer',
            color: confirmingClear ? 'var(--danger)' : 'var(--text-muted)',
            transition: 'all var(--transition-fast)',
          }}
        >
          {confirmingClear ? '再按一次確認清空' : '清空購物車 (F5)'}
        </button>
      </div>
    </div>
  );
}
