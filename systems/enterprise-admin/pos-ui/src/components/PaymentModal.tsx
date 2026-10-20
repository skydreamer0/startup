import { useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useCartStore } from '../store/cartStore';
import { PAYMENT_LABELS, PaymentMethod } from '../constants';

interface Props {
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
  suspended?: boolean;
  salesStaffName?: string;
  hasHighDiscount?: boolean;
  pinAuthorized?: boolean;
}

export default function PaymentModal({ onConfirm, onClose, loading, suspended = false, salesStaffName, hasHighDiscount, pinAuthorized }: Props) {
  const [tendered, setTendered] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null), dialogRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ loading, suspended });
  useLayoutEffect(() => { stateRef.current = { loading, suspended }; }, [loading, suspended]);
  const controls = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? []);
  const focusEntry = () => (stateRef.current.loading ? dialogRef.current : dialogRef.current?.querySelector<HTMLElement>('input:not(:disabled)') ?? controls()[0] ?? dialogRef.current)?.focus();
  useLayoutEffect(() => {
    const overlay = overlayRef.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backgrounds: { element: HTMLElement; inert: string | null; hidden: string | null }[] = [];
    for (let branch: HTMLElement | null = overlay; branch && branch !== document.body; branch = branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement?.children ?? [])) {
        if (!(sibling instanceof HTMLElement) || sibling === branch || sibling.hasAttribute('data-pos-modal')) continue;
        backgrounds.push({ element: sibling, inert: sibling.getAttribute('inert'), hidden: sibling.getAttribute('aria-hidden') });
        sibling.setAttribute('inert', ''); sibling.setAttribute('aria-hidden', 'true');
      }
    }
    if (!stateRef.current.suspended) focusEntry();
    const repairFocus = (event: FocusEvent) => {
      if (!stateRef.current.suspended && event.target instanceof HTMLElement && !dialogRef.current?.contains(event.target) && !event.target.closest('[data-pos-modal]')) focusEntry();
    };
    document.addEventListener('focusin', repairFocus);
    return () => {
      const ownsFocus = overlay.contains(document.activeElement) || document.activeElement === document.body;
      document.removeEventListener('focusin', repairFocus);
      for (const { element, inert, hidden } of backgrounds) {
        if (inert === null) element.removeAttribute('inert'); else element.setAttribute('inert', inert);
        if (hidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', hidden);
      }
      queueMicrotask(() => {
        if (ownsFocus && !overlay.isConnected && opener?.isConnected && !opener.matches(':disabled') && !opener.closest('[inert]') && !document.activeElement?.closest('[data-pos-modal]')) opener.focus();
      });
    };
  }, []);
  useLayoutEffect(() => { if (!suspended) focusEntry(); }, [loading, suspended]);
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const handled = event.defaultPrevented;
    event.stopPropagation();
    if (suspended) return;
    if (/^F[2-8]$/.test(event.key)) event.preventDefault();
    if (event.key === 'Escape') {
      if (handled || event.nativeEvent.isComposing) return;
      event.preventDefault(); if (!loading) onClose();
    } else if (event.key === 'Tab') {
      const all = controls(), first = all[0], last = all[all.length - 1];
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing && !(event.target instanceof HTMLElement && event.target.closest('button'))) event.preventDefault();
  }
  function restoreDialogFocus() { if (!suspended && !dialogRef.current?.contains(document.activeElement)) focusEntry(); }
  const { items, subtotal, total, orderDiscountAmount, paymentMethod, setPaymentMethod } = useCartStore();
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const checkoutTotal = total();
  const cashUnderpaid = paymentMethod === 'CASH' && tendered < checkoutTotal;
  const confirmDisabled = loading || cashUnderpaid;

  return (
    <div ref={overlayRef} data-pos-modal="payment" inert={suspended} aria-hidden={suspended || undefined} onKeyDown={handleKeyDown} onClick={restoreDialogFocus} onPointerDown={event => { if (event.target === event.currentTarget) { event.preventDefault(); restoreDialogFocus(); } }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div ref={dialogRef} role="dialog" aria-modal={!suspended} aria-busy={loading} aria-labelledby="payment-title" tabIndex={-1} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 24, width: 'min(400px, calc(100vw - 32px))', maxHeight: 'calc(100dvh - 32px)', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' }} onClick={event => { event.stopPropagation(); restoreDialogFocus(); }}>
        <div style={{ minHeight: 0, overflowY: 'auto' }}>
        <h3 id="payment-title" style={{ margin: '0 0 8px' }}>確認結帳</h3>

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
          {hasHighDiscount && (
            <div style={{ marginTop: 10, padding: '6px 10px', borderRadius: 'var(--radius-xs)', background: pinAuthorized ? 'var(--success-bg)' : 'var(--warning-bg)', fontSize: 12, color: pinAuthorized ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
              {pinAuthorized ? '✓ 管理員已授權高折扣' : '⚠ 高折扣：確認後將要求管理員 PIN'}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
            <button
              type="button"
              key={value}
              disabled={loading}
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
              disabled={loading}
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

        </div>
        <div style={{ display: 'flex', gap: 12, flexShrink: 0, paddingTop: 12 }}>
          <button
            type="button"
            disabled={loading}
            onClick={() => { if (!loading && !suspended) onClose(); }}
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
