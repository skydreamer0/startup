import type { PendingCheckout } from '../store/checkoutRecoveryStore';
import type { CSSProperties } from 'react';

const buttonStyle: CSSProperties = { border: '1px solid #ad6e15', borderRadius: 8, background: 'white', padding: '8px 12px', fontWeight: 600 };

interface Props {
  pending: PendingCheckout | null;
  error: string | null;
  loading: boolean;
  onQuery: () => void;
  onRetry: () => void;
}

export default function CheckoutRecovery({ pending, error, loading, onQuery, onRetry }: Props) {
  if (!pending && !error) return null;
  return (
    <section role="status" aria-live="polite" data-testid="checkout-recovery" style={{ padding: 16, background: '#fff4d6', color: '#572e00', fontSize: 14, lineHeight: 1.5 }}>
      <strong>{pending?.status === 'conflict' ? '結帳意圖衝突，請保留紀錄並聯絡管理員' : '尚未確認結帳結果'}</strong>
      <p>{error ?? '購物車已保留。請查詢原訂單，或重送同一意圖。'}</p>
      {pending && <>
        <p>原意圖 {pending.payload.commandId} · {pending.payload.cartItems.length} 項商品</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button type="button" style={buttonStyle} onClick={onQuery} disabled={loading}>查詢原訂單</button>
          <button type="button" style={{ ...buttonStyle, opacity: pending.status === 'conflict' ? 0.5 : 1 }} onClick={onRetry} disabled={loading || pending.status === 'conflict'}>重送同一意圖</button>
        </div>
      </>}
    </section>
  );
}
