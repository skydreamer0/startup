import { useState } from 'react';
import { PosOrderSummary } from '../api/pos';

interface Props {
  order: PosOrderSummary;
  onConfirm: (orderId: string, reason: string) => Promise<void>;
  onClose: () => void;
  loading: boolean;
}

export default function RefundModal({ order, onConfirm, onClose, loading }: Props) {
  const [reason, setReason] = useState('');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 32, width: 420, boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 28, textAlign: 'center', marginBottom: 8 }}>↩️</div>
        <h3 style={{ margin: '0 0 4px', textAlign: 'center', fontSize: 16 }}>確認退貨</h3>
        <p style={{ margin: '0 0 20px', textAlign: 'center', fontSize: 13, color: 'var(--text-muted)' }}>
          訂單 {order.orderNumber} — 將退還 ${Number(order.totalAmount).toFixed(0)} 元
        </p>

        {/* Items */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14, marginBottom: 18, background: 'var(--bg-app)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 700 }}>退貨品項（全部）</div>
          {order.items.map((item) => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
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
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }} htmlFor="refund-reason">
            退貨原因（選填）
          </label>
          <input
            id="refund-reason"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="顧客要求、商品瑕疵等..."
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13, background: 'var(--bg-app)' }}
          />
        </div>

        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 'var(--radius-sm)', padding: '10px 14px', marginBottom: 20, fontSize: 12, color: '#92400E' }}>
          ⚠ 退貨後庫存將自動還原，此操作無法撤銷。
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{ flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: 14 }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => onConfirm(order.id, reason)}
            disabled={loading}
            style={{ flex: 2, padding: '12px', background: loading ? 'var(--border)' : '#DC2626', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700 }}
          >
            {loading ? '退貨處理中...' : '確認退貨'}
          </button>
        </div>
      </div>
    </div>
  );
}
