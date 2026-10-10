import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getBatchTrace } from '../../api/batchTrace';
import type { ProductBatch } from '../../api/batches';
import { useAuth } from '../../hooks/authContext';

function failureMessage(error: unknown): string {
    const status = error && typeof error === 'object' && 'response' in error
        && error.response && typeof error.response === 'object' && 'status' in error.response ? error.response.status : undefined;
    if (status === 403) return '權限不足，無法讀取批次來源。請洽有權限的管理者。';
    if (status === 404) return '找不到此批次或無法存取，請關閉後重新載入批次清單。';
    return '無法載入批次來源，請重試。讀取失敗不代表沒有歷史紀錄。';
}
const dateTime = (value: string) => new Date(value).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
const dateOnly = (value: string) => new Date(value).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' });

export default function BatchTraceDialog({ batch, onClose }: { batch: ProductBatch; onClose: () => void }) {
    const { user, loading, hasPermission } = useAuth();
    const allowed = !loading && !!user && hasPermission('read:products');
    const dialogRef = useRef<HTMLDialogElement>(null);
    const trace = useQuery({
        queryKey: ['batch-trace', user?.id, batch.tenantId, batch.id],
        queryFn: ({ signal }) => getBatchTrace(batch.id, batch.tenantId, signal),
        enabled: allowed,
        retry: false,
        gcTime: 0,
        staleTime: 0,
    });
    useEffect(() => {
        const dialog = dialogRef.current;
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (dialog?.showModal) dialog.showModal();
        else dialog?.setAttribute('open', '');
        dialog?.querySelector<HTMLElement>('#batch-trace-title')?.focus();
        return () => { dialog?.close?.(); if (opener?.isConnected) opener.focus(); };
    }, []);

    return <dialog ref={dialogRef} className="receipt-dialog batch-trace-dialog" aria-labelledby="batch-trace-title" aria-describedby="batch-trace-description" aria-modal="true"
        onCancel={event => { event.preventDefault(); onClose(); }}
        onClick={event => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
        }}
        onKeyDown={event => {
            if (event.key !== 'Tab') return;
            const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'));
            const first = controls[0]; const last = controls[controls.length - 1];
            if (!first) return;
            const active = document.activeElement;
            if (event.shiftKey && (active === first || !controls.some(control => control === active))) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && (active === last || !controls.some(control => control === active))) { event.preventDefault(); first.focus(); }
        }}>
        <header className="batch-trace-heading">
            <h2 id="batch-trace-title" className="modal-title" tabIndex={-1}>批次 {batch.batchNumber}：來源與售出分攤</h2>
            <button type="button" className="btn btn-ghost" onClick={onClose}>關閉來源明細</button>
        </header>
        <p id="batch-trace-description" className="batch-help">唯讀追溯，不變更庫存。日期採台北時間；已登記退款不代表實物退回，原售出分攤仍保留。</p>
        {loading ? <p role="status">正在確認讀取權限…</p> : !allowed ? <p role="alert">權限不足，無法讀取批次來源。</p>
            : trace.isPending ? <p role="status">正在載入批次來源…</p>
            : trace.isError ? <div><p role="alert">{failureMessage(trace.error)}{trace.data && ' 先前結果已過期，暫停顯示。'}</p>
                <button type="button" className="btn btn-ghost" disabled={trace.isFetching} onClick={() => void trace.refetch({ cancelRefetch: false })}>重新載入來源</button></div>
            : <>
                <p>{trace.data.product.name}（{trace.data.product.sku}）</p>
                <p className="batch-help">上次讀取：{dateTime(new Date(trace.dataUpdatedAt).toISOString())}（台北時間）。此明細不保證與清單同一庫存快照。</p>
                {trace.isFetching && <p role="status">正在更新來源，以下為上次載入結果。</p>}
                <button type="button" className="btn btn-ghost" disabled={trace.isFetching} onClick={() => void trace.refetch({ cancelRefetch: false })}>重新載入來源</button>
                <section aria-labelledby="batch-trace-receipts"><h3 id="batch-trace-receipts">已連結進貨紀錄</h3>
                    {trace.data.receiptMovements.length === 0 ? <p>目前沒有已連結的進貨紀錄；歷史來源未能追溯，不代表從未進貨。</p>
                        : <ol className="batch-trace-records">{trace.data.receiptMovements.map(receipt => <li key={receipt.id}>
                            <p>{dateTime(receipt.createdAt)}・實收數量 {receipt.quantity.toLocaleString()}</p>
                            <p className="batch-help">進貨紀錄：{receipt.id}</p>
                        </li>)}</ol>}
                </section>
                <section aria-labelledby="batch-trace-sales"><h3 id="batch-trace-sales">已連結售出分攤</h3>
                    <p>顯示 {trace.data.saleAllocations.length.toLocaleString()} / {trace.data.totalAllocations.toLocaleString()} 筆分攤（最新在前）。筆數不是訂單數。</p>
                    {trace.data.totalAllocations > trace.data.saleAllocations.length && <p className="batch-message" role="status">僅顯示最近 100 筆，並非完整售出歷史；本頁不提供更早紀錄。</p>}
                    {trace.data.saleAllocations.length === 0 ? <p>目前沒有已連結的售出分攤；舊單可能未能追溯，不代表從未售出。</p>
                        : <ol className="batch-trace-records">{trace.data.saleAllocations.map(allocation => <li key={allocation.id}>
                            <p>訂單 {allocation.order.orderNumber}・本批實扣數量 {allocation.quantity.toLocaleString()}</p>
                            <p>{dateTime(allocation.createdAt)}・出庫時效期 {dateOnly(allocation.expiryDateAtSale)}</p>
                            <p className="batch-help">訂單識別：{allocation.order.id}<br />訂單明細：{allocation.orderItemId}<br />出庫紀錄：{allocation.movementId}</p>
                        </li>)}</ol>}
                </section>
                <p className="batch-message">此處只呈現已連結紀錄，不能據此重建完整歷史、推算期初庫存或判定帳量已對平。</p>
            </>}
    </dialog>;
}
