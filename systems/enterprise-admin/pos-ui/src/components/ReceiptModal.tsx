import { useState } from 'react';
import { CheckoutResult } from '../api/pos';
import { PAYMENT_LABELS } from '../constants';

interface Props {
  order: CheckoutResult;
  onClose: () => void;
  onPrint: () => Promise<void>;
}

export default function ReceiptModal({ order, onClose, onPrint }: Props) {
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState(false);

  return (
    <div data-testid="receipt-modal" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 32, width: 400, boxShadow: 'var(--shadow-lg)', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>完成</div>
        <h3 style={{ margin: '0 0 4px' }}>結帳完成</h3>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>{order.orderNumber}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
          ${Number(order.totalAmount).toFixed(0)} 元
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>
          付款方式：{PAYMENT_LABELS[order.paymentMethod as keyof typeof PAYMENT_LABELS] ?? order.paymentMethod}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={async () => {
              setPrinting(true);
              setPrintError(false);
              try {
                await onPrint();
              } catch {
                setPrintError(true);
              } finally {
                setPrinting(false);
              }
            }}
            disabled={printing}
            style={{ flex: 1, padding: '10px', border: printError ? '1px solid #dc2626' : '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: printError ? '#fef2f2' : 'var(--bg-card)', color: printError ? '#b91c1c' : 'inherit', cursor: printing ? 'not-allowed' : 'pointer', fontSize: 14 }}
          >
            {printing ? '列印中...' : printError ? '重試列印' : '列印收據'}
          </button>
          <button
            type="button"
            data-testid="receipt-next-button"
            onClick={onClose}
            style={{ flex: 1, padding: '14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 15, fontWeight: 700 }}
          >
            下一筆交易
          </button>
        </div>
        {printError && (
          <div style={{ marginTop: 10, color: '#b91c1c', fontSize: 12 }}>
            列印失敗，請確認印表機後重試
          </div>
        )}
      </div>
    </div>
  );
}
