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
    const [preview, setPreview] = useState<LabelPreview | null>(null);
    const [job, setJob] = useState<LabelJob | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const keyRef = useRef<string | null>(null);
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
        width_mm: 50, height_mm: 30,
        medicine: {
            name: product.name,
            english_name: product.englishName ?? '',
            strength: product.strength ?? '',
            dosage_form: product.dosageForm ?? '',
            generic_name: product.genericName ?? '',
            nhi_code: product.nhiCode ?? '',
            license_number: product.licenseNumber ?? '',
            sku: product.sku,
            storage_location: product.storageLocation ?? '',
        },
        trim_blank_bottom: false,
    };
    const missing = [
        !product.name.trim() && '中文品名', !product.englishName?.trim() && '英文商品名',
        !product.strength?.trim() && '規格',
        !product.dosageForm?.trim() && '劑型', !product.genericName?.trim() && '學名',
        !product.nhiCode?.trim() && '健保碼', !product.licenseNumber?.trim() && '完整藥證',
        !product.storageLocation?.trim() && '預設倉儲位置',
        !/^[A-Za-z0-9._-]{1,24}$/.test(product.sku) && '1–24 碼 ASCII SKU',
    ].filter((item): item is string => Boolean(item));
    async function runPreview() {
        setBusy(true); setError(null);
        try {
            const result = await previewLabel(token.trim(), draft);
            if (result.layout !== 'medicine-landscape-v3') throw new Error('本機代理版本不支援三行藥品標籤。');
            setPreview(result);
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : '無法產生預覽。');
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
            <p>50 × 30 mm 三行藥品識別標籤 · DL-720W NEW。這是店內品項標籤，不含批次或效期；縮小的 QR 需實際掃描驗收。</p>
            <label htmlFor={`${id}-token`}>本機代理權杖</label>
            <input id={`${id}-token`} ref={tokenRef} type="password" autoComplete="off" value={token} disabled={!!job}
                onChange={event => { setToken(event.target.value); setError(null); }} />
            <p className="medicine-label-help">從本機私有 token 檔取得；只在本視窗記憶，關閉後清除。</p>
            <section aria-label="資料庫藥品標籤內容">
                <dl className="medicine-label-fields">
                    <dt>中文品名</dt><dd>{[product.name, product.strength, product.dosageForm].filter(Boolean).join(' ')}</dd>
                    <dt>英文商品名</dt><dd>{product.englishName || '未填'}</dd>
                    <dt>學名</dt><dd>{product.genericName || '未填'}</dd>
                    <dt>健保碼</dt><dd>{product.nhiCode || '未填'}</dd>
                    <dt>藥品許可證</dt><dd>{product.licenseNumber || '未填'}</dd>
                    <dt>SKU</dt><dd>{product.sku}</dd>
                    <dt>預設倉儲位置</dt><dd>{product.storageLocation || '未填'}</dd>
                    <dt>QR 內容</dt><dd><code>P1:{product.sku}</code>（店內識別）</dd>
                </dl>
            </section>
            {missing.length > 0 && <p role="alert" className="medicine-label-error">商品資料尚缺：{missing.join('、')}。請關閉視窗並編輯商品，補齊後重新開啟。</p>}
            {!job && <div className="medicine-label-actions">
                <button type="button" onClick={() => void runPreview()} disabled={busy || !token.trim() || missing.length > 0 || !!keyRef.current}>取得列印預覽雜湊</button>
                <button type="button" onClick={onClose} disabled={busy}>關閉</button>
            </div>}
            {preview && !job && <section aria-label="標籤預覽資料">
                <h3>送印前核對</h3>
                <img className="medicine-label-preview" src={`data:image/png;base64,${preview.preview_png_base64}`} alt="本機渲染的 50 × 30 mm 橫式藥品標籤預覽" />
                <p>本機渲染工作：{preview.job_bytes} bytes · SHA-256 <code>{preview.job_sha256}</code></p>
                <p>此為正向閱讀預覽；本機代理依實機選定方向轉成送印點陣，雜湊對應實際工作。仍請核對紙張。</p>
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
