import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ScanResultV1 } from '@pharmasaas/types';
import { captureManualScan } from '../services/scanInput';
import './ManualScanDialog.css';

/** Local evidence only. Deliberately has no product, cart or persistence callback. */
export default function ManualScanDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const inputId = useId();
  const helpId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef(onClose);
  const [literal, setLiteral] = useState('');
  const [result, setResult] = useState<ScanResultV1 | null>(null);
  useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const overlay = overlayRef.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backgrounds = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
      .map(element => ({ element, inert: element.getAttribute('inert'), hidden: element.getAttribute('aria-hidden') }));
    inputRef.current?.focus();
    for (const { element } of backgrounds) {
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    }
    function repairFocus(event: FocusEvent) {
      if (!(event.target instanceof Node) || !dialog.contains(event.target)) inputRef.current?.focus();
    }
    function ownKeyboard(event: KeyboardEvent) {
      // Capture before the document scanner, including accidental body focus.
      // Keep native typing and button Enter/Space activation inside the dialog.
      event.stopPropagation();
      const inside = event.target instanceof Node && dialog.contains(event.target);
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
      } else if (event.key === 'Tab') {
        const controls = Array.from(dialog.querySelectorAll<HTMLElement>('textarea, button:not(:disabled), summary'));
        const index = controls.indexOf(document.activeElement as HTMLElement);
        if (!inside || index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1)) {
          event.preventDefault();
          controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
        }
      } else if (/^F[2-8]$/.test(event.key) || !inside) {
        event.preventDefault();
        if (!inside) inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', ownKeyboard, true);
    document.addEventListener('focusin', repairFocus);
    return () => {
      window.removeEventListener('keydown', ownKeyboard, true);
      document.removeEventListener('focusin', repairFocus);
      for (const { element, inert, hidden } of backgrounds) {
        if (inert === null) element.removeAttribute('inert'); else element.setAttribute('inert', inert);
        if (hidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', hidden);
      }
      if (opener?.isConnected && !opener.matches(':disabled') && !opener.closest('[inert]')) opener.focus();
    };
  }, []);

  return createPortal(
    <div ref={overlayRef} className="manual-scan-overlay" onPointerDown={event => {
      if (event.target === event.currentTarget) { event.preventDefault(); inputRef.current?.focus(); }
    }}>
      <div ref={dialogRef} className="manual-scan-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={helpId}>
        <h2 id={titleId}>手動貼碼</h2>
        <p id={helpId}>僅在此視窗檢視掃描文字；不查詢商品、不開啟連結，也不變更購物車或庫存。關閉後清除本次內容。</p>
        <label htmlFor={inputId}>掃描文字</label>
        <textarea id={inputId} ref={inputRef} rows={4} value={literal} spellCheck={false} autoComplete="off"
          onChange={event => { setLiteral(event.target.value); setResult(null); }}
          onPaste={event => {
            // The textarea DOM normalizes CR/CRLF. Capture clipboard text before
            // that normalization, replacing the whole draft without trimming.
            event.preventDefault();
            setLiteral(event.clipboardData.getData('text/plain'));
            setResult(null);
          }} aria-describedby={`${helpId} ${inputId}-paste`} />
        <p id={`${inputId}-paste`}>貼上會取代整段輸入，保留剪貼簿文字的前後空白、大小寫與控制字元。</p>
        <div className="manual-scan-actions">
          <button type="button" disabled={literal.length === 0} onClick={() => setResult(captureManualScan(literal))}>檢視掃描結果</button>
          <button type="button" onClick={onClose}>關閉</button>
        </div>
        {result && <section aria-label="只讀掃描結果" aria-live="polite">
          <h3>只讀掃描結果</h3>
          <p>來源：手動（manual） · 碼制、原始 bytes、GS1：未知（unknown） · 硬體未驗證</p>
          <p>以下為原始 literal 的 JSON 表示；引號與跳脫字元用於顯示，不會改寫原文。</p>
          <pre aria-label="原始 literal">{JSON.stringify(result.literal)}</pre>
          <details><summary>完整掃描證據</summary><pre aria-label="掃描證據 JSON">{JSON.stringify(result, null, 2)}</pre></details>
        </section>}
      </div>
    </div>, document.body,
  );
}
