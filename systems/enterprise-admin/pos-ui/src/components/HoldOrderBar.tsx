import { useState } from 'react';
import { useCartStore, HeldCart } from '../store/cartStore';
import { PosToastMessage } from './PosToast';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';

interface Props {
  onFeedback: (msg: PosToastMessage) => void;
}

export default function HoldOrderBar({ onFeedback }: Props) {
  const heldCarts = useCartStore((state) => state.heldCarts);
  const [expanded, setExpanded] = useState(false);

  function canEdit() {
    // Read live state at activation, including transitions before React rerenders.
    if (useCheckoutRecoveryStore.getState().pending) {
      onFeedback({ type: 'warning', message: '結帳結果尚待確認，暫時無法變更掛單' });
      return false;
    }
    return true;
  }

  function handleHold() {
    if (!canEdit()) return;
    const before = useCartStore.getState();
    if (before.items.length === 0) {
      onFeedback({ type: 'info', message: '購物車是空的，無法掛單' });
      return;
    }
    before.holdCurrentCart();
    if (useCartStore.getState().draftRevision !== before.draftRevision) {
      onFeedback({ type: 'success', message: '已掛單，購物車已清空' });
    }
  }

  function currentHeldCart(cart: HeldCart) {
    if (!canEdit()) return null;
    const current = useCartStore.getState().heldCarts.find((held) => held.id === cart.id);
    if (current !== cart) {
      onFeedback({ type: 'info', message: '掛單已變更，請重新選擇' });
      return null;
    }
    return current;
  }

  function handleRecall(cart: HeldCart) {
    const current = currentHeldCart(cart);
    if (!current) return;
    const before = useCartStore.getState();
    before.recallHeldCart(current.id);
    if (useCartStore.getState().draftRevision !== before.draftRevision) {
      setExpanded(false);
      onFeedback({ type: 'success', message: `已叫回「${current.label}」` });
    }
  }

  function handleDelete(cart: HeldCart) {
    const current = currentHeldCart(cart);
    if (!current) return;
    useCartStore.getState().deleteHeldCart(current.id);
    if (!useCartStore.getState().heldCarts.some((held) => held.id === current.id)) {
      onFeedback({ type: 'info', message: `已刪除「${current.label}」` });
    }
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
