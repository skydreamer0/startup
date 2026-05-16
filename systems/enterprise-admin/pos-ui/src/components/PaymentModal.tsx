import { useCartStore } from '../store/cartStore';

interface Props {
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}

const METHODS = [
  { value: 'CASH', label: '現金' },
  { value: 'CARD', label: '信用卡' },
  { value: 'LINE_PAY', label: 'LINE Pay' },
  { value: 'TRANSFER', label: '轉帳' },
  { value: 'OTHER', label: '其他' },
] as const;

export default function PaymentModal({ onConfirm, onClose, loading }: Props) {
  const { total, paymentMethod, setPaymentMethod } = useCartStore();

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 32, width: 400, boxShadow: 'var(--shadow-lg)' }} onClick={(event) => event.stopPropagation()}>
        <h3 style={{ margin: '0 0 8px' }}>確認結帳</h3>
        <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--accent)', margin: '16px 0' }}>
          ${total().toFixed(0)} 元
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {METHODS.map((method) => (
            <button
              type="button"
              key={method.value}
              onClick={() => setPaymentMethod(method.value)}
              style={{
                padding: '8px 16px', borderRadius: 'var(--radius-xs)',
                border: '1px solid var(--border)',
                background: paymentMethod === method.value ? 'var(--accent)' : 'var(--bg-card)',
                color: paymentMethod === method.value ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer', fontSize: 14,
              }}
            >
              {method.label}
            </button>
          ))}
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
            onClick={onConfirm}
            disabled={loading}
            style={{ flex: 2, padding: '12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 15, fontWeight: 700, opacity: loading ? 0.7 : 1 }}
          >
            {loading ? '付款處理中...' : '確認付款'}
          </button>
        </div>
      </div>
    </div>
  );
}
