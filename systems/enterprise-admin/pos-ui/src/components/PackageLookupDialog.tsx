import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isAxiosError } from 'axios';
import type { PackageCandidate, PackageIdentifier, ScanResultV1 } from '@pharmasaas/types';
import { productPackagesApi } from '../api/productPackages';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
import { BarcodeCandidateButton } from './BarcodeCandidates';
import { gs1Proposal } from '../services/gs1Proposal';
import './ManualScanDialog.css';
import './PackageLookupDialog.css';

function failureMessage(error: unknown) {
  const status = isAxiosError(error) ? error.response?.status : undefined;
  if (status === 403) return '權限不足，無法查找包裝。請洽管理員。';
  if (status === 409) return '包裝對照已變更或失效，請重新查找。';
  if (status === 400 || status === 422) return '請核對識別碼種類、格式與包裝換算；此內容不能加車。';
  return '包裝查找或確認失敗，購物車未變更。請重試或回到商品搜尋。';
}

export default function PackageLookupDialog({ onClose, scan }: { onClose: () => void; scan?: ScanResultV1 }) {
  const proposal = gs1Proposal(scan);
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const closeRef = useRef(onClose);
  const request = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const invalid = useRef(false);
  const selection = useRef<PackageCandidate[] | null>(null);
  const [literal, setLiteral] = useState(proposal.status === 'proposal' ? proposal.gtin : scan?.literal ?? '');
  const [namespace, setNamespace] = useState<PackageIdentifier['namespace']>(proposal.status === 'proposal' ? 'GTIN' : 'MANUFACTURER');
  const [rows, setRows] = useState<PackageCandidate[] | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [contextChanged, setContextChanged] = useState(false);
  const unsupportedGs1 = proposal.status === 'unsupported' && literal === scan?.literal;
  const lookupRef = useRef<() => void>(() => {});
  useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);

  useLayoutEffect(() => {
    invalid.current = false;
    const dialog = dialogRef.current!;
    const overlay = overlayRef.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const backgrounds = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
      .map(element => ({ element, inert: element.getAttribute('inert'), hidden: element.getAttribute('aria-hidden') }));
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    for (const { element } of backgrounds) { element.setAttribute('inert', ''); element.setAttribute('aria-hidden', 'true'); }
    inputRef.current?.focus();
    function invalidateContext() {
      invalid.current = true; selection.current = null; ++request.current; abort.current?.abort(); busy.current = false;
      setPending(false); setRows(null); setContextChanged(true);
      setMessage('工作區、結帳身分或草稿已變更，請關閉後重新查找。');
    }
    const unsubscribeCart = useCartStore.subscribe((next, previous) => {
      if (next.draftRevision !== previous.draftRevision || next.draftScope !== previous.draftScope) invalidateContext();
    });
    const unsubscribeRecovery = useCheckoutRecoveryStore.subscribe((next, previous) => {
      if (next.scope !== previous.scope || next.pending !== previous.pending) invalidateContext();
    });
    if (useCheckoutRecoveryStore.getState().pending) invalidateContext();
    function ownKeyboard(event: KeyboardEvent) {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('textarea:not(:disabled), select:not(:disabled), button:not(:disabled), summary'));
      const index = controls.indexOf(document.activeElement as HTMLElement);
      const inside = event.target instanceof Node && dialog.contains(event.target);
      if (event.key === 'Enter' && event.target === inputRef.current && !event.shiftKey && !event.isComposing) {
        event.preventDefault(); lookupRef.current(); return;
      }
      if (event.key === 'Tab' && (index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1))) {
        event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
      } else if (/^F[2-8]$/.test(event.key) || !inside) { event.preventDefault(); controls[0]?.focus(); }
    }
    function repairFocus(event: FocusEvent) {
      if (!(event.target instanceof Node) || !dialog.contains(event.target)) dialog.querySelector<HTMLElement>('button:not(:disabled), textarea:not(:disabled)')?.focus();
    }
    window.addEventListener('keydown', ownKeyboard, true);
    document.addEventListener('focusin', repairFocus);
    return () => {
      invalid.current = true; ++request.current; abort.current?.abort();
      unsubscribeCart(); unsubscribeRecovery();
      window.removeEventListener('keydown', ownKeyboard, true); document.removeEventListener('focusin', repairFocus);
      document.body.style.overflow = overflow;
      for (const { element, inert, hidden } of backgrounds) {
        if (inert === null) element.removeAttribute('inert'); else element.setAttribute('inert', inert);
        if (hidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', hidden);
      }
      if (opener?.isConnected && !opener.matches(':disabled') && !opener.closest('[inert]')) opener.focus();
    };
  }, []);

  function edit() {
    selection.current = null;
    ++request.current; abort.current?.abort(); busy.current = false;
    setPending(false); setRows(null); setMessage('');
  }
  async function lookup() {
    if (invalid.current || busy.current || literal.length === 0 || unsupportedGs1) return;
    const current = ++request.current;
    const controller = new AbortController(); abort.current?.abort(); abort.current = controller;
    busy.current = true; selection.current = null; setPending(true); setRows(null); setMessage('正在查找完全相符的包裝…');
    try {
      const result = await productPackagesApi.lookup({ namespace, value: literal }, controller.signal);
      if (current !== request.current || invalid.current) return;
      selection.current = result; setRows(result); setMessage(result.length ? `找到 ${result.length} 個包裝；請核對後人工確認。` : '沒有完全相符且有效的包裝。請核對種類與原碼，或回到商品搜尋。');
    } catch (error) { if (current === request.current && !invalid.current) setMessage(failureMessage(error)); }
    finally { if (current === request.current) { busy.current = false; setPending(false); } }
  }
  useLayoutEffect(() => { lookupRef.current = () => { void lookup(); }; });
  async function confirm(selected: PackageCandidate) {
    if (invalid.current || busy.current || selected.unitsPerPackage === null || !selection.current?.includes(selected)) return;
    selection.current = null;
    const current = ++request.current;
    const controller = new AbortController(); abort.current = controller;
    busy.current = true; setPending(true); setMessage('正在重新確認包裝版本與換算…');
    try {
      const fresh = await productPackagesApi.resolve({ namespace, value: literal }, selected, controller.signal);
      if (current !== request.current || invalid.current) return;
      if (fresh.unitsPerPackage === null || !useCartStore.getState().addPackage(fresh.product, fresh.unitsPerPackage)) {
        setRows(null); setMessage('目前庫存不足或結帳已鎖定，未加入任何數量。請重新查找。'); return;
      }
      // Consume the choice before publishing success: repeat confirmation has
      // no second chance to mutate the cart, even before React rerenders.
      setRows(null); setMessage(`已加入 1 個 ${fresh.label}：${fresh.unitsPerPackage} ${fresh.stockUnitLabel}。`);
    } catch (error) { if (current === request.current && !invalid.current) { setRows(null); setMessage(failureMessage(error)); } }
    finally { if (current === request.current) { busy.current = false; setPending(false); } }
  }

  return createPortal(<div ref={overlayRef} className="manual-scan-overlay">
    <div ref={dialogRef} className="manual-scan-dialog package-lookup-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>商品／包裝查找</h2>
      <p>依原碼完整查找。查找本身不加車；請核對商品、規格、包裝與庫存換算後，明確確認 1 個包裝。</p>
      <label htmlFor={`${id}-namespace`}>識別碼種類</label>
      <select id={`${id}-namespace`} value={namespace} disabled={contextChanged} onChange={event => { edit(); setNamespace(event.target.value as PackageIdentifier['namespace']); }}>
        <option value="MANUFACTURER">原廠碼（保留大小寫與空白）</option><option value="GTIN">GTIN（完整數字與校驗位）</option>
      </select>
      <label htmlFor={`${id}-literal`}>原始識別碼</label>
      <textarea ref={inputRef} id={`${id}-literal`} rows={3} value={literal} disabled={contextChanged} spellCheck={false} autoComplete="off"
        onChange={event => { edit(); setLiteral(event.target.value); }}
        onPaste={event => { event.preventDefault(); edit(); setLiteral(event.clipboardData.getData('text/plain')); }} />
      <pre aria-label="查找原碼">{JSON.stringify(literal)}</pre>
      {proposal.status === 'proposal' && <p>已確認 GS1 的唯讀提案：GTIN {proposal.gtin}；批號 {proposal.lot ?? '未提供'}；效期 YYMMDD {proposal.expiryYYMMDD ?? '未提供'}；序號 {proposal.serial ?? '未提供'}。批效不會填入收貨或庫存，也不代表可銷售判定。</p>}
      {unsupportedGs1 && <p role="alert">已確認 GS1，但欄位或分隔資訊不支援／不完整。禁止將整段資料降級為原廠碼；請人工核對後另輸入識別碼。</p>}
      {scan && <details><summary>本次輸入來源與原始證據</summary><pre>{JSON.stringify(scan, null, 2)}</pre><p>此證據保留原始輸入；修改欄位後，以目前欄位文字查找。未知 bytes／GS1 不推測補齊。</p></details>}
      <div className="manual-scan-actions"><button type="button" disabled={pending || contextChanged || literal.length === 0 || unsupportedGs1} onClick={() => void lookup()}>查找完全相符包裝</button>
        <button type="button" onClick={onClose}>關閉包裝查找</button></div>
      <p role="status" aria-live="polite">{message}</p>
      {rows && <ul className="package-lookup-results">{rows.map(row => <li key={row.packageId}>
        <BarcodeCandidateButton product={row.product} disabled={pending || contextChanged || row.unitsPerPackage === null
          || (row.unitsPerPackage ?? 0) + (useCartStore.getState().items.find(item => item.product.id === row.product.id)?.quantity ?? 0) > row.product.stockQuantity}
          onSelect={() => void confirm(row)}>
          <span className="block"><strong>{row.label}</strong> · {row.contents}</span>
          <span className="block">{row.unitsPerPackage === null ? '換算未知：禁止加車' : `確認加入 1 個包裝 = ${row.unitsPerPackage} ${row.stockUnitLabel}`}</span>
          <span className="block text-sm">包裝 {row.packageId} · revision {row.revision} · 來源 {row.source}</span>
        </BarcodeCandidateButton>
      </li>)}</ul>}
    </div>
  </div>, document.body);
}
