import { useEffect, useRef, useState } from 'react';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
import CartItemComponent from './CartItem';
import { PosToastMessage } from './PosToast';
import { PAYMENT_LABELS } from '../constants';

interface Props {
  currentStaffName: string;
  onCheckout: () => void;
  onSplitCheckout: () => void;
  onSwitchStaff: () => void;
  onFeedback?: (toast: PosToastMessage) => void;
}

interface ClearConfirmation {
  draftRevision: number;
  draftScope: string | null;
}

export default function CartPanel({ currentStaffName, onCheckout, onSplitCheckout, onSwitchStaff, onFeedback }: Props) {
  const {
    items, orderDiscountAmount, paymentMethod, draftRevision, draftScope,
    setOrderDiscount, setPaymentMethod, subtotal, total,
  } = useCartStore();
  const checkoutPending = useCheckoutRecoveryStore((state) => state.pending !== null);
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
  const [clearConfirmation, setClearConfirmation] = useState<ClearConfirmation | null>(null);
  const clearConfirmationRef = useRef<ClearConfirmation | null>(null);
  function updateClearConfirmation(value: ClearConfirmation | null) {
    clearConfirmationRef.current = value;
    setClearConfirmation(value);
  }
  const confirmingClear = clearConfirmation !== null
    && clearConfirmation.draftRevision === draftRevision
    && clearConfirmation.draftScope === draftScope
    && items.length > 0 && !checkoutPending;

  useEffect(() => {
    if (!clearConfirmation) return;
    const timeout = window.setTimeout(() => {
      if (clearConfirmationRef.current === clearConfirmation) updateClearConfirmation(null);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [clearConfirmation]);

  useEffect(() => {
    // Observe every transition, including hold/recall or pending/unlocked ABA
    // transitions batched before React renders the next editable draft.
    const unsubscribeCart = useCartStore.subscribe((state, previous) => {
      if (state.draftRevision !== previous.draftRevision
        || state.draftScope !== previous.draftScope || state.items.length === 0) {
        updateClearConfirmation(null);
      }
    });
    const unsubscribeRecovery = useCheckoutRecoveryStore.subscribe((state) => {
      if (state.pending) updateClearConfirmation(null);
    });
    return () => { unsubscribeCart(); unsubscribeRecovery(); };
  }, []);

  function handleClearCart() {
    const cart = useCartStore.getState();
    const confirmation = clearConfirmationRef.current;
    if (useCheckoutRecoveryStore.getState().pending) {
      updateClearConfirmation(null);
      return;
    }
    if (cart.items.length === 0) {
      updateClearConfirmation(null);
      onFeedback?.({ type: 'info', message: '購物車目前沒有商品' });
      return;
    }
    if (!confirmation || confirmation.draftRevision !== cart.draftRevision
      || confirmation.draftScope !== cart.draftScope) {
      updateClearConfirmation({ draftRevision: cart.draftRevision, draftScope: cart.draftScope });
      onFeedback?.({ type: 'warning', message: '再按一次清空購物車' });
      return;
    }
    cart.clearCart();
    updateClearConfirmation(null);
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

        {confirmingClear && (
          <div role="status" style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>再按一次確認清空</div>
        )}

        {/* Checkout button */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button
            data-testid="cart-checkout-button"
            onClick={onCheckout}
            disabled={items.length === 0}
            style={{
              flex: 3, padding: '14px', border: 'none',
              borderRadius: 'var(--radius-full)',
              background: items.length === 0 ? 'var(--border)' : 'linear-gradient(135deg, #D97706, #F59E0B)',
              color: items.length === 0 ? 'var(--text-muted)' : '#fff',
              fontSize: 15, fontWeight: 800,
              cursor: items.length === 0 ? 'not-allowed' : 'pointer',
              boxShadow: items.length === 0 ? 'none' : '0 4px 14px rgba(217,119,6,0.35)',
              letterSpacing: '0.01em',
            }}
          >
            確認結帳 (Enter)
          </button>
          <button
            onClick={onSplitCheckout}
            disabled={items.length === 0}
            title="拆單付款"
            style={{
              flex: 1, padding: '14px', border: `1.5px solid ${items.length === 0 ? 'var(--border)' : 'var(--accent)'}`,
              borderRadius: 'var(--radius-full)',
              background: 'var(--bg-card)',
              color: items.length === 0 ? 'var(--text-muted)' : 'var(--accent)',
              fontSize: 13, fontWeight: 700,
              cursor: items.length === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            拆單
          </button>
        </div>
        <button
          onClick={handleClearCart}
          disabled={checkoutPending}
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
