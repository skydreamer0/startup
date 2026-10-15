import { useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Product } from '../api/inventory';
import { getLabelJob, previewLabel, submitLabel, type LabelDraft, type LabelJob, type LabelPreview } from '../services/localLabelPrinter';
import './MedicineLabelDialog.css';

function jobMessage(status: LabelJob['status']): string {
    switch (status) {
        case 'queued': return '已排入本機佇列，尚未送至標籤機。';
        case 'printing': return '正在傳送至標籤機；請勿重複送印。';
        case 'submitted_unverified': return 'BLE 傳輸已提交，請檢查實際標籤；系統無法確認紙張已印出。';
        case 'failed_no_bytes_sent': return '本次沒有傳送標籤資料；請檢查本機代理與標籤機。';
        case 'outcome_unknown_after_restart': return '本機代理曾重啟，實體結果未知。請先檢查標籤與傳輸紀錄。';
        case 'outcome_unknown': return '傳輸結果未知。請先檢查是否已有標籤，勿直接建立新工作重印。';
    }
}

export default function MedicineLabelDialog({ product, onClose }: { product: Product; onClose: () => void }) {
    const id = useId();
    const dialogRef = useRef<HTMLDivElement>(null);
    const overlayRef = useRef<HTMLDivElement>(null);
    const tokenRef = useRef<HTMLInputElement>(null);
    const closeRef = useRef(onClose);
    const busyRef = useRef(false);
    const [token, setToken] = useState('');
    const [name, setName] = useState(product.name);
    const [sku, setSku] = useState(product.sku);
    const [extra, setExtra] = useState('');
    const [qr, setQr] = useState('');
    const [preview, setPreview] = useState<LabelPreview | null>(null);
    const [job, setJob] = useState<LabelJob | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const keyRef = useRef<string | null>(null);
    const draftRevisionRef = useRef(0);
    useLayoutEffect(() => { closeRef.current = onClose; }, [onClose]);
    useLayoutEffect(() => { busyRef.current = busy; }, [busy]);

    useLayoutEffect(() => {
        const dialog = dialogRef.current!;
        const overlay = overlayRef.current!;
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const backgrounds = Array.from(document.body.children)
            .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== overlay)
            .map(element => ({ element, inert: element.getAttribute('inert'), hidden: element.getAttribute('aria-hidden') }));
        tokenRef.current?.focus();
        for (const { element } of backgrounds) { element.setAttribute('inert', ''); element.setAttribute('aria-hidden', 'true'); }
        const repairFocus = (event: FocusEvent) => {
            if (!(event.target instanceof Node) || !dialog.contains(event.target)) tokenRef.current?.focus();
        };
        const ownKeyboard = (event: KeyboardEvent) => {
            event.stopPropagation();
            const inside = event.target instanceof Node && dialog.contains(event.target);
            if (event.key === 'Escape') { event.preventDefault(); if (!busyRef.current) closeRef.current(); return; }
            if (event.key === 'Tab') {
                const controls = Array.from(dialog.querySelectorAll<HTMLElement>('input:not(:disabled), textarea:not(:disabled), button:not(:disabled)'));
                const index = controls.indexOf(document.activeElement as HTMLElement);
                if (!inside || index < 0 || (event.shiftKey ? index === 0 : index === controls.length - 1)) {
                    event.preventDefault(); controls[event.shiftKey ? controls.length - 1 : 0]?.focus();
                }
            } else if (!inside) { event.preventDefault(); tokenRef.current?.focus(); }
        };
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

    const draft: LabelDraft = {
        width_mm: 30, height_mm: 50,
        text: [name, sku && `SKU ${sku}`, extra].filter(Boolean),
        ...(qr ? { qr } : {}), trim_blank_bottom: true,
    };
    function change(set: (value: string) => void, value: string) {
        draftRevisionRef.current += 1;
        set(value); setPreview(null); setConfirmed(false); setError(null);
    }
    async function runPreview() {
        const revision = draftRevisionRef.current;
        setBusy(true); setError(null);
        try {
            const result = await previewLabel(token.trim(), draft);
            if (revision === draftRevisionRef.current) setPreview(result);
        } catch (cause) {
            if (revision === draftRevisionRef.current) setError(cause instanceof Error ? cause.message : '無法產生預覽。');
        }
        finally { setBusy(false); }
    }
    async function runSend() {
        if (!preview) return;
        setBusy(true); setError(null);
        keyRef.current ??= crypto.randomUUID();
        try { setJob(await submitLabel(token.trim(), draft, preview.job_sha256, keyRef.current)); }
        catch (cause) { setError(`${cause instanceof Error ? cause.message : '無法連接本機代理。'} 若請求已送出，請用同一工作鍵查詢，勿建立新工作重印。`); }
        finally { setBusy(false); }
    }
    async function refreshJob() {
        if (!job) return;
        setBusy(true); setError(null);
        try { setJob(await getLabelJob(token.trim(), job.job_id)); }
        catch (cause) { setError(cause instanceof Error ? cause.message : '無法查詢工作狀態。'); }
        finally { setBusy(false); }
    }

    return createPortal(<div ref={overlayRef} className="medicine-label-overlay">
        <div ref={dialogRef} className="medicine-label-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
            <h2 id={`${id}-title`}>建立藥品標籤</h2>
            <p>30 × 50 mm · DL-720W NEW。先核對內容並取得本機渲染雜湊，再送出一張。這是商品識別草稿，請依店內核定樣式確認內容。</p>
            <label htmlFor={`${id}-token`}>本機代理權杖</label>
            <input id={`${id}-token`} ref={tokenRef} type="password" autoComplete="off" value={token} disabled={!!job}
                onChange={event => { setToken(event.target.value); setError(null); }} />
            <p className="medicine-label-help">從本機私有 token 檔取得；只在本視窗記憶，關閉後清除。</p>
            <label htmlFor={`${id}-name`}>藥品／商品名稱</label>
            <input id={`${id}-name`} value={name} maxLength={100} disabled={busy || !!job || !!keyRef.current}
                onChange={event => change(setName, event.target.value)} />
            <label htmlFor={`${id}-sku`}>SKU</label>
            <input id={`${id}-sku`} value={sku} maxLength={80} disabled={busy || !!job || !!keyRef.current}
                onChange={event => change(setSku, event.target.value)} />
            <label htmlFor={`${id}-extra`}>補充資訊（選填，單行）</label>
            <input id={`${id}-extra`} value={extra} maxLength={100} disabled={busy || !!job || !!keyRef.current}
                onChange={event => change(setExtra, event.target.value)} />
            <label htmlFor={`${id}-qr`}>QR 內容（選填）</label>
            <input id={`${id}-qr`} value={qr} maxLength={120} disabled={busy || !!job || !!keyRef.current}
                onChange={event => change(setQr, event.target.value)} />
            <p className="medicine-label-help">不自動產生 QR 或 Code128；QR 內容需由人員核對。Code128 掃碼仍待驗收。</p>
            {!job && <div className="medicine-label-actions">
                <button type="button" onClick={() => void runPreview()} disabled={busy || !token.trim() || !name.trim() || !!keyRef.current}>取得列印預覽雜湊</button>
                <button type="button" onClick={onClose} disabled={busy}>關閉</button>
            </div>}
            {preview && !job && <section aria-label="標籤預覽資料">
                <h3>送印前核對</h3>
                <img className="medicine-label-preview" src={`data:image/png;base64,${preview.preview_png_base64}`} alt="本機渲染的 30 × 50 mm 標籤預覽" />
                <pre>{draft.text.join('\n')}{qr && `\nQR: ${qr}`}</pre>
                <p>本機渲染工作：{preview.job_bytes} bytes · SHA-256 <code>{preview.job_sha256}</code></p>
                <p>預覽由與送印相同的本機點陣產生；仍請核對實際紙張。</p>
                <label className="medicine-label-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />內容及版面已核對，送印一張</label>
                <button type="button" disabled={busy || !confirmed} onClick={() => void runSend()}>{keyRef.current ? '用同一工作鍵確認送出結果' : '確認送印一張'}</button>
            </section>}
            {job && <section aria-label="標籤工作狀態" role="status">
                <h3>工作狀態</h3><p>{jobMessage(job.status)}</p><p>工作編號：<code>{job.job_id}</code></p>
                <button type="button" disabled={busy} onClick={() => void refreshJob()}>重新查詢狀態</button>
                <button type="button" onClick={onClose} disabled={busy}>關閉</button>
            </section>}
            {error && <p role="alert" className="medicine-label-error">{error}</p>}
        </div>
    </div>, document.body);
}
