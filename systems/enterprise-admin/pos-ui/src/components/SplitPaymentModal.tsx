import { useState } from 'react';
import { useCartStore } from '../store/cartStore';
import { PAYMENT_LABELS, PaymentMethod } from '../constants';

export interface PaymentEntry {
  method: PaymentMethod;
  amount: number;
}

interface Props {
  onConfirm: (payments: PaymentEntry[]) => void;
  onClose: () => void;
  loading: boolean;
  salesStaffName?: string;
}

export default function SplitPaymentModal({ onConfirm, onClose, loading, salesStaffName }: Props) {
  const { items, subtotal, total, orderDiscountAmount } = useCartStore();
  const checkoutTotal = total();
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  const [payments, setPayments] = useState<PaymentEntry[]>([
    { method: 'CASH', amount: checkoutTotal },
  ]);

  const paymentsTotal = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const remaining = Math.max(0, checkoutTotal - paymentsTotal);
  const isBalanced = Math.abs(paymentsTotal - checkoutTotal) < 0.01;

  function updateMethod(index: number, method: PaymentMethod) {
    setPayments((prev) => prev.map((p, i) => i === index ? { ...p, method } : p));
  }

  function updateAmount(index: number, amount: number) {
    setPayments((prev) => prev.map((p, i) => i === index ? { ...p, amount } : p));
  }

  function addPayment() {
    setPayments((prev) => [...prev, { method: 'CARD', amount: remaining }]);
  }

  function removePayment(index: number) {
    setPayments((prev) => prev.filter((_, i) => i !== index));
  }

  const usedMethods = payments.map((p) => p.method);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 32, width: 440, boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: '0 0 8px' }}>拆單付款</h3>

        {/* Summary */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 16, marginBottom: 20, background: 'var(--bg-app)' }}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>品項：{itemCount} 件 · 小計 ${subtotal().toFixed(0)}</div>
          {orderDiscountAmount > 0 && (
            <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 4 }}>折扣：-${orderDiscountAmount.toFixed(0)}</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 8 }}>
            <span style={{ fontWeight: 700 }}>應付總計</span>
            <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)' }}>${checkoutTotal.toFixed(0)}</span>
          </div>
          {salesStaffName && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>人員：{salesStaffName}</div>}
        </div>

        {/* Payment entries */}
        <div style={{ marginBottom: 16 }}>
          {payments.map((entry, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
              <select
                value={entry.method}
                onChange={(e) => updateMethod(i, e.target.value as PaymentMethod)}
                style={{ flex: 1, padding: '9px 10px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--bg-app)' }}
              >
                {(Object.keys(PAYMENT_LABELS) as PaymentMethod[])
                  .filter((m) => m === entry.method || !usedMethods.includes(m))
                  .map((m) => (
                    <option key={m} value={m}>{PAYMENT_LABELS[m]}</option>
                  ))}
              </select>
              <div style={{ position: 'relative', flex: 1 }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: 13 }}>$</span>
                <input
                  type="number"
                  min={0}
                  value={entry.amount || ''}
                  onChange={(e) => updateAmount(i, Number(e.target.value) || 0)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '9px 10px 9px 22px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 14, fontWeight: 700, background: 'var(--bg-app)' }}
                />
              </div>
              {payments.length > 1 && (
                <button
                  type="button"
                  onClick={() => removePayment(i)}
                  style={{ width: 32, height: 36, flexShrink: 0, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius-xs)', color: 'var(--danger)', cursor: 'pointer', fontSize: 16 }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Add payment + balance indicator */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          {payments.length < 4 && usedMethods.length < Object.keys(PAYMENT_LABELS).length ? (
            <button
              type="button"
              onClick={addPayment}
              style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
            >
              + 加入第二付款方式
            </button>
          ) : <div />}
          <div style={{ fontSize: 13, fontWeight: 700, color: isBalanced ? 'var(--success)' : remaining > 0 ? 'var(--danger)' : 'var(--warning)' }}>
            {isBalanced ? '✓ 金額相符' : remaining > 0 ? `尚差 $${remaining.toFixed(0)}` : `超出 $${(paymentsTotal - checkoutTotal).toFixed(0)}`}
          </div>
        </div>

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
            onClick={() => onConfirm(payments)}
            disabled={!isBalanced || loading}
            style={{ flex: 2, padding: '12px', background: !isBalanced || loading ? 'var(--border)' : 'var(--accent)', color: !isBalanced || loading ? 'var(--text-muted)' : '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: !isBalanced || loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700 }}
          >
            {loading ? '付款處理中...' : '確認付款'}
          </button>
        </div>
      </div>
    </div>
  );
}
