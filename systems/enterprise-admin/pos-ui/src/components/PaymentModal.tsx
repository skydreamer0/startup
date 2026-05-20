import { useState } from 'react';
import { useCartStore } from '../store/cartStore';
import { PAYMENT_LABELS, PaymentMethod } from '../constants';

interface Props {
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
  salesStaffName?: string;
}

export default function PaymentModal({ onConfirm, onClose, loading, salesStaffName }: Props) {
  const [tendered, setTendered] = useState(0);
  const { items, subtotal, total, orderDiscountAmount, paymentMethod, setPaymentMethod } = useCartStore();
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const checkoutTotal = total();
  const cashUnderpaid = paymentMethod === 'CASH' && tendered < checkoutTotal;
  const confirmDisabled = loading || cashUnderpaid;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 32, width: 400, boxShadow: 'var(--shadow-lg)' }} onClick={(event) => event.stopPropagation()}>
        <h3 style={{ margin: '0 0 8px' }}>確認結帳</h3>

        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16, margin: '16px 0 20px', background: 'var(--bg-app)' }}>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>
            品項數：{itemCount} 件
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 8 }}>
            小計：${subtotal().toFixed(0)} 元
          </div>
          {orderDiscountAmount > 0 && (
            <div style={{ fontSize: 14, color: 'var(--danger)', marginBottom: 8 }}>
              折扣：-${orderDiscountAmount.toFixed(0)} 元
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 10, marginTop: 10, borderTop: '1px solid var(--border)' }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>合計</span>
            <span style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent)' }}>${checkoutTotal.toFixed(0)} 元</span>
          </div>
          {salesStaffName && (
            <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 10 }}>
              人員：{salesStaffName}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
            <button
              type="button"
              key={value}
              onClick={() => setPaymentMethod(value as PaymentMethod)}
              style={{
                padding: '8px 16px', borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--border)',
                background: paymentMethod === value ? 'var(--accent)' : 'var(--bg-card)',
                color: paymentMethod === value ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 14,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {paymentMethod === 'CASH' && (
          <div style={{ marginBottom: 24, padding: 16, borderRadius: 'var(--radius-sm)', background: 'var(--bg-app)', border: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 8 }} htmlFor="payment-tendered">
              收取金額
            </label>
            <input
              id="payment-tendered"
              data-testid="payment-tendered-input"
              type="number"
              min={0}
              value={tendered}
              onChange={(event) => setTendered(Number(event.target.value) || 0)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontSize: 24, fontWeight: 700, textAlign: 'right' }}
            />
            <div style={{ marginTop: 10, fontSize: 22, fontWeight: 700, color: 'var(--accent)', textAlign: 'right' }}>
              找零：${Math.max(0, tendered - checkoutTotal).toFixed(0)} 元
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{ flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: 15 }}
          >
            取消
          </button>
          <button
            type="button"
            data-testid="payment-confirm-button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            style={{ flex: 2, padding: '12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: confirmDisabled ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700, opacity: confirmDisabled ? 0.7 : 1 }}
          >
            {loading ? '付款處理中...' : '確認付款'}
          </button>
        </div>
      </div>
    </div>
  );
}
