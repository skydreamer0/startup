import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { decodeImageScan, ImageScanError } from '../services/imageScanDecoder';
import type { ImageScanEvidence } from '../services/imageScanResult';
import './ImageScanDialog.css';

type ImagePreview = { name: string; url: string; results: readonly ImageScanEvidence[] };

function errorMessage(error: unknown): string {
  if (error instanceof ImageScanError) {
    switch (error.code) {
      case 'cancelled': return '這次辨識已取消，請重新選取圖片。';
      case 'empty-image': return '圖片是空白檔案，請重新選擇。';
      case 'image-too-large': return '圖片超過限制，請使用 10 MiB 以內、1600 萬像素以內的圖片。';
      case 'invalid-image': return '無法讀取這張圖片，請選擇有效的 PNG 或 JPEG。';
      case 'decoder-unavailable': return '本地辨識元件載入失敗，請重新選取圖片再試。';
      case 'decode-failed': return '圖片辨識失敗，請重新選取圖片再試。';
    }
  }
  return '圖片辨識失敗，請重新選取圖片再試。';
}

/** Temporary local evidence only. No business callback, storage or product lookup. */
export default function ImageScanDialog({ onClose }: { onClose: () => void }) {
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef(onClose);
  const requestRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const overlay = overlayRef.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    const backgrounds = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
      .map(element => ({ element, inert: element.getAttribute('inert'), hidden: element.getAttribute('aria-hidden') }));
    for (const { element } of backgrounds) {
      element.setAttribute('inert', ''); element.setAttribute('aria-hidden', 'true');
    }
    document.body.style.overflow = 'hidden';
    fileRef.current?.focus();
    function repairFocus(event: FocusEvent) {
      if (!(event.target instanceof Node) || !dialog.contains(event.target)) fileRef.current?.focus();
    }
    function ownKeyboard(event: KeyboardEvent) {
      event.stopPropagation();
      const inside = event.target instanceof Node && dialog.contains(event.target);
      if (event.key === 'Escape') {
        event.preventDefault(); closeRef.current();
      } else if (event.key === 'Tab') {
        const controls = Array.from(dialog.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled), summary'));
        const index = controls.indexOf(document.activeElement as HTMLElement);
        if (!inside || index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1)) {
          event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
        }
      } else if (/^F[2-8]$/.test(event.key) || !inside) {
        event.preventDefault(); if (!inside) fileRef.current?.focus();
      }
    }
    window.addEventListener('keydown', ownKeyboard, true);
    document.addEventListener('focusin', repairFocus);
    return () => {
      ++requestRef.current;
      abortRef.current?.abort();
      abortRef.current = null;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
      window.removeEventListener('keydown', ownKeyboard, true);
      document.removeEventListener('focusin', repairFocus);
      document.body.style.overflow = overflow;
      for (const { element, inert, hidden } of backgrounds) {
        if (inert === null) element.removeAttribute('inert'); else element.setAttribute('inert', inert);
        if (hidden === null) element.removeAttribute('aria-hidden'); else element.setAttribute('aria-hidden', hidden);
      }
      if (opener?.isConnected && !opener.matches(':disabled') && !opener.closest('[inert]')) opener.focus();
    };
  }, []);

  async function readImage(file: File) {
    const request = ++requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setPreview(null); setSelected(null); setConfirmed(false); setError(null); setPending(true);
    try {
      const results = await decodeImageScan(file, controller.signal);
      if (requestRef.current !== request) return;
      // The decoder has validated the actual format, dimensions and byte limit.
      const url = URL.createObjectURL(file);
      objectUrlRef.current = url;
      setPreview({ name: file.name, url, results });
    } catch (failure: unknown) {
      if (requestRef.current === request) setError(errorMessage(failure));
    } finally {
      if (requestRef.current === request) { abortRef.current = null; setPending(false); }
    }
  }

  const chosen = selected === null ? null : preview?.results[selected];
  return createPortal(
    <div className="image-scan-overlay" ref={overlayRef} onPointerDown={event => {
      if (event.target === event.currentTarget) { event.preventDefault(); fileRef.current?.focus(); }
    }}>
      <div className="image-scan-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-help`}>
        <h2 id={`${id}-title`}>圖片掃碼</h2>
        <p id={`${id}-help`}>在本機辨識 QR、EAN／UPC、Code128、Data Matrix。圖片不會上傳；結果僅供本次檢視，關閉後清除。</p>
        <p>請核對原圖與辨識文字。確認不會查詢商品、加入購物車或變更庫存。</p>
        <label htmlFor={`${id}-file`}>選擇條碼或 QR Code 圖片</label>
        <input id={`${id}-file`} ref={fileRef} type="file" accept="image/png,image/jpeg" aria-describedby={`${id}-limits`}
          onChange={event => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file) void readImage(file);
          }} />
        <p id={`${id}-limits`}>PNG／JPEG，10 MiB 以內、1600 萬像素以內。相機與文字 OCR 尚未包含在此入口。</p>
        <p role="status">{pending ? '正在本機辨識，可重新選圖或關閉取消本次檢視。' : confirmed ? '已人工確認本次辨識文字；商品與包裝尚未核對，沒有寫入交易或庫存。' : ''}</p>
        {error && <p role="alert">{error}</p>}
        {preview && <section aria-label="圖片辨識預覽">
          <p>{preview.name}</p>
          <img className="image-scan-preview" src={preview.url} alt="本次匯入圖片，供人工核對條碼" />
          {preview.results.length === 0 ? <p>未找到支援的條碼，請換一張清楚的圖片；也可關閉後使用手動貼碼。</p> : <>
            <fieldset className="image-scan-candidates">
              <legend>辨識到 {preview.results.length} 個結果，請逐一核對並選擇</legend>
              {preview.results.map((result, index) => <label className="image-scan-candidate" key={index}>
                <input type="radio" name={`${id}-candidate`} checked={selected === index} onChange={() => { setSelected(index); setConfirmed(false); }} />
                <span>結果 {index + 1} · {result.decoderObservation.format}
                  <span className="image-scan-literal">{JSON.stringify(result.scan.literal)}</span>
                  {result.decoderObservation.sequenceSize >= 0 && <span className="image-scan-segment">分段條碼：第 {result.decoderObservation.sequenceIndex + 1} 段，總段數 {result.decoderObservation.sequenceSize || '未知'}。此處未合併其他段。</span>}
                </span>
              </label>)}
            </fieldset>
            <p>文字以 JSON 表示保留空白與控制字元。GS1、批號與效期尚未解析；連結不會自動開啟。</p>
          </>}
          {chosen && <details><summary>查看選定結果的完整辨識證據</summary><pre aria-label="圖片掃描證據 JSON">{JSON.stringify(chosen, null, 2)}</pre></details>}
        </section>}
        <div className="image-scan-actions">
          <button type="button" disabled={!chosen || pending || confirmed} onClick={() => setConfirmed(true)}>確認這段辨識文字</button>
          <button type="button" onClick={onClose}>關閉</button>
        </div>
      </div>
    </div>, document.body,
  );
}
