import { CheckoutResult } from '../api/pos';

interface Props {
  order: CheckoutResult;
  onClose: () => void;
  onPrint: () => void;
}

const PAYMENT_LABELS: Record<string, string> = {
  CASH: '現金', CARD: '刷卡', LINE_PAY: 'LINE Pay', TRANSFER: '轉帳', OTHER: '其他',
};

export default function ReceiptModal({ order, onClose, onPrint }: Props) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 32, width: 400, boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
        <h3 style={{ margin: '0 0 4px' }}>結帳完成</h3>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>{order.orderNumber}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
          ${order.totalAmount.toFixed(0)} 元
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>
          付款方式：{PAYMENT_LABELS[order.paymentMethod] ?? order.paymentMethod}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onPrint}
            style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: 14 }}
          >
            列印收據
          </button>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 14, fontWeight: 700 }}
          >
            繼續結帳
          </button>
        </div>
      </div>
    </div>
  );
}
