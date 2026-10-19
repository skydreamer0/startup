import { useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from 'react';

// This bounded hook owns only the order lookup/refund surfaces. Do not make
// earlier modal cleanup release a later surface's background or scroll lock.
const locks = new WeakMap<HTMLElement, { owners: number; inert: string | null; hidden: string | null }>();
let scrollOwners = 0;
let originalOverflow = '';

export function useOrderDialog(onClose: () => void, loading = false, returnFocus?: HTMLElement | null) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const loadingRef = useRef(loading);
  const returnRef = useRef(returnFocus);
  useLayoutEffect(() => { closeRef.current = onClose; loadingRef.current = loading; }, [onClose, loading]);
  const controls = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)') ?? []);
  const ownsFocus = () => dialogRef.current?.contains(document.activeElement) || document.activeElement === document.body;
  const focusEntry = () => (loadingRef.current ? dialogRef.current : dialogRef.current?.querySelector<HTMLElement>('input:not(:disabled)') ?? controls()[0] ?? dialogRef.current)?.focus();

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const overlay = overlayRef.current!;
    const opener = returnRef.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const backgrounds = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay && !element.hasAttribute('data-pos-modal'));
    for (const element of backgrounds) {
      const lock = locks.get(element) ?? { owners: 0, inert: element.getAttribute('inert'), hidden: element.getAttribute('aria-hidden') };
      lock.owners++; locks.set(element, lock); element.setAttribute('inert', ''); element.setAttribute('aria-hidden', 'true');
    }
    if (scrollOwners++ === 0) { originalOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    focusEntry();
    function repairFocus(event: FocusEvent) {
      if (event.target instanceof HTMLElement && !dialog.contains(event.target) && !event.target.closest('[data-pos-modal]')) focusEntry();
    }
    document.addEventListener('focusin', repairFocus);
    return () => {
      const restore = ownsFocus();
      document.removeEventListener('focusin', repairFocus);
      for (const element of backgrounds) {
        const lock = locks.get(element);
        if (!lock || --lock.owners > 0) continue;
        locks.delete(element);
        if (lock.inert === null) element.removeAttribute('inert'); else element.setAttribute('inert', lock.inert);
        if (lock.hidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', lock.hidden);
      }
      if (--scrollOwners === 0) document.body.style.overflow = originalOverflow;
      queueMicrotask(() => {
        // The closing commit may enable the toolbar. StrictMode replay and a
        // newer modal must keep their focus rather than being stolen by cleanup.
        if (restore && !overlay.isConnected && opener?.isConnected && !opener.matches(':disabled') && !opener.closest('[inert]') && !document.activeElement?.closest('[data-pos-modal]')) opener.focus();
      });
    };
  }, []);
  useLayoutEffect(() => { if (ownsFocus()) focusEntry(); }, [loading]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const alreadyHandled = event.defaultPrevented;
    event.stopPropagation();
    if (/^F[2-8]$/.test(event.key)) event.preventDefault();
    if (event.key === 'Enter' && !event.nativeEvent.isComposing && !(event.target instanceof HTMLElement && event.target.closest('button'))) event.preventDefault();
    if (event.key === 'Escape') {
      if (alreadyHandled || event.nativeEvent.isComposing) return;
      event.preventDefault();
      if (!loadingRef.current) closeRef.current();
    } else if (event.key === 'Tab') {
      const all = controls(), first = all[0], last = all[all.length - 1];
      if (!first) { event.preventDefault(); dialogRef.current?.focus(); }
      else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
    }
  }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest('input:not(:disabled), button:not(:disabled)')) return;
    event.preventDefault();
    if (ownsFocus()) focusEntry();
  }
  function close() { if (!loadingRef.current) closeRef.current(); }
  return { overlayRef, dialogRef, onKeyDown, onPointerDown, close };
}
