import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useCartStore } from '../store/cartStore';
import type { PaymentEntry, PaymentMethod } from '@pharmasaas/types';
import { PAYMENT_LABELS } from '../constants';

interface Props {
  onConfirm: (payments: PaymentEntry[]) => void;
  onClose: () => void;
  loading: boolean;
  suspended?: boolean;
  salesStaffName?: string;
}

export default function SplitPaymentModal({ onConfirm, onClose, loading, salesStaffName, suspended = false }: Props) {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const wasSuspended = useRef(false);
  const nextPaymentFocus = useRef<number | null>(null);

  useLayoutEffect(() => {
    const overlay = overlayRef.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLInputElement>('input')?.focus();
    const backgrounds: { element: HTMLElement; inert: string | null; hidden: string | null }[] = [];
    // Keep the existing sibling PIN overlay outside the hidden background.
    // Do not hide an ancestor containing this dialog or a later PIN overlay.
    for (let branch: HTMLElement | null = overlay; branch && branch !== document.body; branch = branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement?.children ?? [])) {
        if (!(sibling instanceof HTMLElement) || sibling === branch || sibling.hasAttribute('data-pos-modal')) continue;
        backgrounds.push({ element: sibling, inert: sibling.getAttribute('inert'), hidden: sibling.getAttribute('aria-hidden') });
        sibling.setAttribute('inert', '');
        sibling.setAttribute('aria-hidden', 'true');
      }
    }
    return () => {
      const ownsFocus = overlay.contains(document.activeElement) || document.activeElement === document.body;
      for (const { element, inert, hidden } of backgrounds) {
        if (inert === null) element.removeAttribute('inert'); else element.setAttribute('inert', inert);
        if (hidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', hidden);
      }
      if (ownsFocus && opener?.isConnected && !opener.closest('[inert]')) opener.focus();
    };
  }, []);

  useLayoutEffect(() => {
    if (suspended) { wasSuspended.current = true; return; }
    if (wasSuspended.current) { confirmRef.current?.focus(); wasSuspended.current = false; }
    if (loading) dialogRef.current?.focus();
  }, [loading, suspended]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (suspended) return;
    // Dialog input and function keys must not reach page/scanner shortcuts.
    event.stopPropagation();
    if (/^F[2-8]$/.test(event.key)) event.preventDefault();
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!loading) onClose();
    } else if (event.key === 'Tab') {
      const controls = Array.from(dialogRef.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)'));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
    }
  }

  const { items, subtotal, total, orderDiscountAmount } = useCartStore();
  const checkoutTotal = total();
  const itemCount = items.reduce((s, i) => s + i.quantity, 0);

  const [payments, setPayments] = useState<PaymentEntry[]>([
    { method: 'CASH', amount: checkoutTotal },
  ]);

  useLayoutEffect(() => {
    const index = nextPaymentFocus.current;
    nextPaymentFocus.current = null;
    if (index === null || suspended) return;
    const amount = dialogRef.current?.querySelectorAll<HTMLInputElement>('input')[index];
    (amount && !loading ? amount : dialogRef.current)?.focus();
  }, [payments.length, loading, suspended]);

  function restoreDialogFocus() {
    const dialog = dialogRef.current;
    if (!suspended && dialog && !dialog.contains(document.activeElement)) dialog.focus();
  }

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
    nextPaymentFocus.current = payments.length;
    setPayments((prev) => [...prev, { method: 'CARD', amount: remaining }]);
  }

  function removePayment(index: number) {
    nextPaymentFocus.current = Math.min(index, payments.length - 2);
    setPayments((prev) => prev.filter((_, i) => i !== index));
  }

  const usedMethods = payments.map((p) => p.method);

  return (
    <div ref={overlayRef} data-pos-modal="split-payment" inert={suspended} aria-hidden={suspended || undefined} onKeyDown={handleKeyDown} onClick={restoreDialogFocus} onPointerDown={(event) => {
      if (event.target === event.currentTarget) { event.preventDefault(); restoreDialogFocus(); }
    }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div ref={dialogRef} role="dialog" aria-modal={!suspended} aria-labelledby={titleId} tabIndex={-1} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 32, width: 'min(440px, calc(100vw - 32px))', boxSizing: 'border-box', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto', boxShadow: 'var(--shadow-lg)' }} onClick={(event) => { event.stopPropagation(); restoreDialogFocus(); }}>
        <h3 id={titleId} style={{ margin: '0 0 8px' }}>拆單付款</h3>

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
                aria-label={`第 ${i + 1} 筆付款方式`}
                disabled={loading}
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
                  aria-label={`第 ${i + 1} 筆付款金額`}
                  disabled={loading}
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
                  aria-label={`移除第 ${i + 1} 筆付款方式`}
                  disabled={loading}
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
              disabled={loading}
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
            disabled={loading}
            onClick={onClose}
            style={{ flex: 1, padding: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: 15 }}
          >
            取消
          </button>
          <button
            type="button"
            ref={confirmRef}
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
