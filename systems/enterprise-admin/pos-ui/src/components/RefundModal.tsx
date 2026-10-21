import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOrderDialog } from '../hooks/useOrderDialog';
import './OrderDialogs.css';
import { PosOrderSummary } from '../api/pos';

interface Props {
  order: PosOrderSummary;
  onConfirm: (orderId: string, reason: string) => Promise<void>;
  onClose: () => void;
  loading: boolean;
  returnFocus?: HTMLElement | null;
}

export default function RefundModal({ order, onConfirm, onClose, loading, returnFocus }: Props) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const pending = loading || submitting;
  const titleId = useId(), reasonId = useId();
  const dialog = useOrderDialog(() => { if (!loading && !busy.current) onClose(); }, pending, returnFocus);
  async function confirm() {
    if (loading || busy.current) return;
    busy.current = true; setSubmitting(true);
    try { await onConfirm(order.id, reason); }
    finally { busy.current = false; setSubmitting(false); }
  }

  return createPortal(
    <div ref={dialog.overlayRef} data-pos-modal="refund" className="pos-order-overlay" onKeyDown={dialog.onKeyDown} onPointerDown={dialog.onPointerDown} onClick={event => { if (event.target === event.currentTarget) dialog.close(); }}>
      <div ref={dialog.dialogRef} role="dialog" aria-modal="true" aria-busy={pending} aria-labelledby={titleId} tabIndex={-1} className="pos-order-dialog">
        <div style={{ fontSize: 28, textAlign: 'center', marginBottom: 8 }}>↩️</div>
        <h3 id={titleId} style={{ margin: '0 0 4px', textAlign: 'center', fontSize: 16 }}>登記退款</h3>
        <p style={{ margin: '0 0 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
          訂單 {order.orderNumber} — 退款金額 ${Number(order.totalAmount).toFixed(0)} 元
        </p>

        {/* Items */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 18, background: 'var(--bg-app)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 700 }}>退款品項（全部）</div>
          {order.items.map((item) => (
            <div key={item.id} className="pos-refund-item" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
              <span>{item.product.name} × {item.quantity}</span>
              <span>${(Number(item.finalUnitPrice) * item.quantity).toFixed(0)}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 8, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 14 }}>
            <span>退款總計</span>
            <span style={{ color: 'var(--danger)' }}>-${Number(order.totalAmount).toFixed(0)}</span>
          </div>
        </div>

        {/* Reason */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }} htmlFor={reasonId}>
            退款原因（選填）
          </label>
          <input
            id={reasonId}
            disabled={pending}
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="顧客要求、商品瑕疵等..."
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--bg-app)' }}
          />
        </div>

        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#92400E' }}>
          此操作只登記退款，不會增加庫存。實體退回商品須另行驗收，才可處理回補。
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={dialog.close}
            disabled={pending}
            style={{ flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: 14 }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={pending}
            style={{ flex: 2, padding: '12px', background: pending ? 'var(--border)' : '#DC2626', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: pending ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700 }}
          >
            {pending ? '退款登記中...' : '確認退款'}
          </button>
        </div>
      </div>
    </div>, document.body
  );
}
