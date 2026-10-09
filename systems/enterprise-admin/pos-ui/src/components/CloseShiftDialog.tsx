import { useId, useLayoutEffect, useRef, type KeyboardEvent } from 'react';

// Leases prevent an older instance's cleanup from undoing a newer instance's
// background lock. Original attributes are restored only by the final owner.
const backgroundLocks = new WeakMap<HTMLElement, { owners: number; inert: string | null; hidden: string | null }>();

interface Props {
  closingCash: number;
  onClosingCashChange: (val: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}

export default function CloseShiftDialog({ closingCash, onClosingCashChange, onConfirm, onCancel, loading }: Props) {
  const titleId = useId();
  const cashId = useId();
  const cashRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (cashRef.current?.disabled) dialog.focus();
    else cashRef.current?.focus();
    const backgrounds: HTMLElement[] = [];
    // Only sibling branches are hidden; the dialog and its ancestors stay exposed.
    for (let branch: HTMLElement | null = overlayRef.current; branch && branch !== document.body; branch = branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement?.children ?? [])) {
        if (!(sibling instanceof HTMLElement) || sibling === branch || sibling.hasAttribute('data-pos-modal')) continue;
        const lock = backgroundLocks.get(sibling) ?? { owners: 0, inert: sibling.getAttribute('inert'), hidden: sibling.getAttribute('aria-hidden') };
        lock.owners += 1;
        backgroundLocks.set(sibling, lock);
        backgrounds.push(sibling);
        sibling.setAttribute('inert', '');
        sibling.setAttribute('aria-hidden', 'true');
      }
    }
    return () => {
      const ownsFocus = dialog.contains(document.activeElement) || document.activeElement === document.body;
      for (const element of backgrounds) {
        const lock = backgroundLocks.get(element);
        if (!lock || --lock.owners > 0) continue;
        backgroundLocks.delete(element);
        const { inert, hidden } = lock;
        if (inert === null) element.removeAttribute('inert'); else element.setAttribute('inert', inert);
        if (hidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', hidden);
      }
      if (ownsFocus && opener?.isConnected && !opener.closest('[inert]')) opener.focus();
    };
  }, []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    // A late settlement cannot take keyboard ownership back from a newer screen.
    if (!dialog || !(dialog.contains(document.activeElement) || document.activeElement === document.body)) return;
    if (loading) dialog.focus();
    else cashRef.current?.focus();
  }, [loading]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    // Keep text/scanner input and POS shortcuts within this modal. Native button
    // Enter/Space still produce their own click; amount Enter never submits.
    event.stopPropagation();
    if (/^F[2-8]$/.test(event.key)) event.preventDefault();
    if (event.key === 'Enter' && !(event.target instanceof HTMLElement && event.target.closest('button'))) event.preventDefault();
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!loading) onCancel();
    } else if (event.key === 'Tab') {
      const dialog = dialogRef.current!;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)'));
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    }
  }

  return (
    <div ref={overlayRef} data-pos-modal="close-shift" onKeyDown={handleKeyDown} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-busy={loading} aria-labelledby={titleId} style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 32, width: 360, boxShadow: 'var(--shadow-lg)' }}>
        <h3 id={titleId} style={{ margin: '0 0 16px' }}>確認交班</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
          <label htmlFor={cashId} style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>結帳金額</label>
          <input ref={cashRef} id={cashId} disabled={loading} type="number" min={0} value={closingCash} onChange={(e) => { if (!loading) onClosingCashChange(Number(e.target.value)); }} style={{ flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-xs)', fontSize: 14 }} />
          <span style={{ fontSize: 13 }}>元</span>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={() => { if (!loading) onCancel(); }} disabled={loading} style={{ flex: 1, padding: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-card)', cursor: 'pointer', fontSize: 14 }}>取消</button>
          <button type="button" onClick={() => { if (!loading) onConfirm(); }} disabled={loading} style={{ flex: 1, padding: '10px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 'var(--radius-sm)', cursor: loading ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, opacity: loading ? 0.7 : 1 }}>
            {loading ? '交班中...' : '確認交班'}
          </button>
        </div>
      </div>
    </div>
  );
}
