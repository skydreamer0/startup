import { useState } from 'react';
import { useCartStore, HeldCart } from '../store/cartStore';
import { PosToastMessage } from './PosToast';

interface Props {
  onFeedback: (msg: PosToastMessage) => void;
}

export default function HoldOrderBar({ onFeedback }: Props) {
  const { items, heldCarts, holdCurrentCart, recallHeldCart, deleteHeldCart } = useCartStore();
  const [expanded, setExpanded] = useState(false);

  function handleHold() {
    if (items.length === 0) {
      onFeedback({ type: 'info', message: '購物車是空的，無法掛單' });
      return;
    }
    holdCurrentCart();
    onFeedback({ type: 'success', message: '已掛單，購物車已清空' });
  }

  function handleRecall(cart: HeldCart) {
    recallHeldCart(cart.id);
    setExpanded(false);
    onFeedback({ type: 'success', message: `已叫回「${cart.label}」` });
  }

  function handleDelete(cart: HeldCart) {
    deleteHeldCart(cart.id);
    onFeedback({ type: 'info', message: `已刪除「${cart.label}」` });
  }

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          onClick={handleHold}
          title="掛單暫存 (F4)"
          style={{ background: 'none', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-full)', padding: '6px 14px', cursor: 'pointer', fontSize: 12, color: 'var(--text-secondary)', fontWeight: 500 }}
        >
          📋 掛單
        </button>
        {heldCarts.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{
              position: 'relative',
              background: expanded ? 'var(--accent-subtle)' : 'none',
              border: `1.5px solid ${expanded ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-full)',
              padding: '6px 14px',
              cursor: 'pointer',
              fontSize: 12,
              color: expanded ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: 600,
            }}
          >
            📌 {heldCarts.length} 筆掛單
          </button>
        )}
      </div>

      {expanded && heldCarts.length > 0 && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            background: 'var(--bg-card)',
            border: '1.5px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            minWidth: 260,
            zIndex: 500,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>
            掛單列表
          </div>
          {heldCarts.map((cart) => (
            <div
              key={cart.id}
              style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {cart.label}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {cart.items.length} 件 · ${cart.items.reduce((s, i) => s + Number(i.product.retailPrice) * i.quantity, 0).toFixed(0)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRecall(cart)}
                style={{ padding: '5px 12px', fontSize: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-xs)', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
              >
                叫回
              </button>
              <button
                type="button"
                onClick={() => handleDelete(cart)}
                style={{ padding: '5px 8px', fontSize: 12, background: '#FEF2F2', color: 'var(--danger)', border: '1px solid #FECACA', borderRadius: 'var(--radius-xs)', cursor: 'pointer', flexShrink: 0 }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
