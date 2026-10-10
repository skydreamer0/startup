import BatchAuditPanel from './BatchAuditPanel';
import BatchTraceDialog from './BatchTraceDialog';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { batchesApi, ProductBatch } from '../../api/batches';
import { inventoryApi, Product } from '../../api/inventory';
import { useAuth } from '../../hooks/authContext';
import './BatchListPage.css';

type ApiError = {
    response?: {
        status?: number;
        data?: {
            error?: {
                message?: string;
            };
        };
    };
};

type BatchForm = {
    productId: string;
    batchNumber: string;
    expiryDate: string;
    quantity: string;
    costPrice: string;
    status: ProductBatch['status'];
    reason: string;
};

const emptyBatchForm: BatchForm = {
    productId: '',
    batchNumber: '',
    expiryDate: '',
    quantity: '',
    costPrice: '',
    status: 'QUARANTINE',
    reason: '',
};

function getExpiryStatus(expiryDate: string): { label: string; badgeClass: string } {
    const calendar = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' });
    const today = new Date(`${calendar.format(new Date())}T00:00:00Z`);
    const expiry = new Date(`${calendar.format(new Date(expiryDate))}T00:00:00Z`);

    if (expiry <= today) {
        return { label: '到期不可出庫', badgeClass: 'badge-danger' };
    }

    const diffMs = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 30) {
        return { label: '即將到期', badgeClass: 'badge-warning' };
    }

    return { label: '效期有效', badgeClass: 'badge-success' };
}

export default function BatchListPage() {
    const { user, loading: authLoading, hasPermission } = useAuth();
    const canTrace = !authLoading && !!user && hasPermission('read:products');
    const canReceive = !authLoading && hasPermission('create:products');
    const canRelease = !authLoading && hasPermission('release:product_batches');
    const [expiringSoon, setExpiringSoon] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [batchForm, setBatchForm] = useState<BatchForm>(emptyBatchForm);
    const releaseReason = batchForm.reason.trim();
    const invalidRelease = batchForm.status === 'RELEASED' && (!canRelease || !releaseReason || releaseReason.length > 1000);
    const [saving, setSaving] = useState(false);
    const submitting = useRef(false);
    const [receiptError, setReceiptError] = useState('');
    const [receiptSuccess, setReceiptSuccess] = useState('');
    const dialogRef = useRef<HTMLDialogElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const receiptErrorRef = useRef<HTMLParagraphElement>(null);

    useEffect(() => {
        if (!showCreate) return;
        const dialog = dialogRef.current;
        const trigger = triggerRef.current;
        if (dialog?.showModal) dialog.showModal();
        else dialog?.setAttribute('open', '');
        dialog?.querySelector<HTMLElement>('#receipt-title')?.focus();
        return () => { dialog?.close?.(); trigger?.focus(); };
    }, [showCreate]);

    useEffect(() => {
        if (saving) dialogRef.current?.querySelector<HTMLElement>('#receipt-title')?.focus();
    }, [saving]);

    useEffect(() => {
        if (receiptError) receiptErrorRef.current?.focus();
    }, [receiptError]);
    const [traceSelection, setTraceSelection] = useState<{ batch: ProductBatch; userId: string } | null>(null);
    useEffect(() => {
        if (traceSelection && (!canTrace || user?.id !== traceSelection.userId)) setTraceSelection(null);
    }, [canTrace, user?.id, traceSelection]);
    const [auditBatchId, setAuditBatchId] = useState<string | null>(null);
    const queryClient = useQueryClient();

    const { data: batchesData, isLoading: loading, isError: batchError, error: batchFailure, isFetching: batchesFetching, refetch: refetchBatches } = useQuery({
        queryKey: ['batches', expiringSoon],
        queryFn: () => batchesApi.getAll({ expiringSoon: expiringSoon || undefined }),
    });

    const { data: products, isError: productError, isPending: productsPending, error: productFailure, isFetching: productsFetching, refetch: refetchProducts } = useQuery({
        queryKey: ['inventory', 'products', 'batches'],
        queryFn: async () => {
            const all: Product[] = [];
            let page = 1;
            while (true) {
                const result = await inventoryApi.getProducts({ page: String(page) });
                all.push(...result.data);
                if (all.length >= result.total || result.data.length === 0) return all;
                page++;
            }
        },
    });

    const batches: ProductBatch[] = batchesData?.data || [];
    const productList: Product[] = products || [];

    function openCreate() {
        if (!canReceive || submitting.current) return;
        setBatchForm(emptyBatchForm);
        setReceiptError('');
        setReceiptSuccess('');
        setShowCreate(true);
    }

    function closeCreate() {
        setShowCreate(false);
        setBatchForm(emptyBatchForm);
        setReceiptError('');
    }

    function requestClose() {
        if (!submitting.current) closeCreate();
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault();
        if (submitting.current || !canReceive || productsPending || productError || productList.length === 0 || invalidRelease) return;
        submitting.current = true;
        setSaving(true);
        setReceiptError('');
        try {
            await batchesApi.create({
                productId: batchForm.productId,
                batchNumber: batchForm.batchNumber,
                expiryDate: `${batchForm.expiryDate}T00:00:00.000Z`,
                quantity: Number(batchForm.quantity),
                costPrice: Number(batchForm.costPrice),
                status: batchForm.status,
                ...(batchForm.status === 'RELEASED' ? { reason: releaseReason } : {}),
            });
            closeCreate();
            setReceiptSuccess('批次進貨已登記，正在更新批次與商品帳量。');
            queryClient.invalidateQueries({ queryKey: ['batches'] });
            queryClient.invalidateQueries({ queryKey: ['inventory', 'products'] });
        } catch (err) {
            const response = (err as ApiError).response;
            setReceiptError(response?.status === 403 ? '權限不足，無法登記進貨或初次放行。請洽有權限的管理者。'
                : `${response?.data?.error?.message || '未能確認收貨成功。請先核對批次與庫存，再決定是否重新登記。'}${!response?.status || response.status >= 500 ? ' 結果尚未確認，請勿直接重送；先核對批次與庫存。' : ''}`);
        } finally {
            submitting.current = false;
            setSaving(false);
        }
    }

    async function handleDelete(id: string, batchNumber: string) {
        if (!confirm(`確定要刪除批號「${batchNumber}」嗎？`)) return;
        try {
            await batchesApi.delete(id);
            queryClient.invalidateQueries({ queryKey: ['batches'] });
        } catch (err) {
            const message = (err as ApiError).response?.data?.error?.message || 'Failed to delete batch';
            alert(message);
        }
    }

    return (
        <div className="batch-list-page">
            <header className="page-header">
                <div>
                    <h1 className="page-title">批號效期管理</h1>
                    <p className="page-subtitle">管理商品批號與效期，追蹤庫存有效期限</p>
                </div>
                <button ref={triggerRef} className="btn btn-primary" onClick={openCreate} disabled={!canReceive || saving}>+ 登記批次進貨</button>
            </header>
            <section className="batch-toolbar" aria-label="批次篩選">
                <div className="batch-filters">
                    <button className="btn btn-ghost" aria-pressed={!expiringSoon} onClick={() => setExpiringSoon(false)}>全部</button>
                    <button className="btn btn-ghost" aria-pressed={expiringSoon} onClick={() => setExpiringSoon(true)}>到期／30天內需處理</button>
                </div>
                <p className="batch-help">效期與驗收分開判斷；隔離、封鎖或到期批次不可出庫。</p>
            </section>
            {receiptSuccess && <p className="batch-message" role="status">{receiptSuccess}</p>}
            {!authLoading && !canReceive && <p className="batch-message">缺少登記進貨權限，請洽有權限的管理者。</p>}

            <div className="batch-list-heading">
                <h2 id="batch-table-title">{expiringSoon ? '需處理批次' : '批次清單'}</h2>
                <span>{!batchError && !loading && `${batches.length} 筆（本次載入）`}</span>
            </div>
            {batchesFetching && !loading && <p className="batch-message" role="status">正在更新批次資料，以下為上次載入結果；更新完成後可操作。</p>}
            <p id="batch-scroll-hint" className="batch-help">欄位較多時，可在表格內左右捲動；鍵盤可聚焦表格後使用方向鍵。</p>
            <div className="card table-container" role="region" aria-labelledby="batch-table-title" aria-describedby="batch-scroll-hint" tabIndex={0} aria-busy={batchesFetching}>
                {batchError ? <div className="batch-empty"><p role="alert">{(batchFailure as ApiError)?.response?.status === 403 ? '權限不足，無法讀取批次資料。請洽有權限的管理者。' : '無法載入批次資料，請重新整理後再試。'}{batchesData && '先前結果已過期，暫停顯示。'}</p><button type="button" className="btn btn-ghost" onClick={() => void refetchBatches()} disabled={batchesFetching}>重新載入批次</button></div> : loading ? (
                    <div className="batch-empty"><p role="status">正在載入批次資料…</p></div>
                ) : batches.length === 0 ? (
                    <div className="batch-empty"><p role="status">{expiringSoon ? '目前沒有到期或 30 天內需處理的批次，可切換「全部」查看。' : '目前沒有批號資料。'}</p></div>
                ) : (
                    <table className="table">
                        <thead>
                            <tr>
                                <th scope="col">批號</th>
                                <th scope="col">商品名稱</th>
                                <th scope="col">到期日</th>
                                <th scope="col">狀態</th>
                                <th scope="col" className="batch-numeric">剩餘數量</th>
                                <th scope="col" className="batch-numeric">進貨成本</th>
                                <th scope="col" className="batch-numeric">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            {batches.map((batch) => {
                                    const { label, badgeClass } = getExpiryStatus(batch.expiryDate);
                                    return (
                                        <tr key={batch.id}>
                                            <td>
                                                <div className="batch-number">
                                                    {batch.batchNumber}
                                                </div>
                                            </td>
                                            <td>
                                                <div className="batch-product-name">{batch.product?.name || '-'}</div>
                                                <div className="batch-sku">{batch.product?.sku}</div>
                                            </td>
                                            <td>
                                                {new Date(batch.expiryDate).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}
                                            </td>
                                            <td className="batch-status">
                                                <span className={`badge ${badgeClass}`}>{label}</span>
                                                <span className="badge">{batch.status === 'RELEASED' ? '已驗收' : batch.status === 'BLOCKED' ? '封鎖' : '待驗收隔離'}</span>
                                            </td>
                                            <td className="batch-numeric">{batch.quantity.toLocaleString()}</td>
                                            <td className="batch-numeric">${Number(batch.costPrice).toLocaleString()}</td>
                                            <td className="batch-row-actions">
                                                <button type="button" className="btn btn-ghost" disabled={batchesFetching || !canTrace} onClick={() => { if (user) setTraceSelection({ batch, userId: user.id }); }}>來源／售出分攤</button>
                                                <button type="button" className="btn btn-ghost" disabled={batchesFetching} onClick={() => setAuditBatchId(batch.id)}>更正／歷史</button>
                                                <button
                                                    className="btn btn-danger btn-sm"
                                                    disabled={batchesFetching}
                                                    onClick={() => handleDelete(batch.id, batch.batchNumber)}
                                                >
                                                    刪除
                                                </button>
                                            </td>
                                        </tr>
                                    );
                            })}
                        </tbody>
                    </table>
                )}
            </div>

            {!batchError && auditBatchId && batches.find(batch => batch.id === auditBatchId) && <BatchAuditPanel key={auditBatchId} batch={batches.find(batch => batch.id === auditBatchId)!} onClose={() => setAuditBatchId(null)} />}

            {traceSelection && canTrace && user?.id === traceSelection.userId && <BatchTraceDialog key={traceSelection.batch.id} batch={traceSelection.batch} onClose={() => setTraceSelection(null)} />}

            {showCreate && (
                <div className="modal-overlay" onClick={requestClose}>
                    <dialog ref={dialogRef} className="modal-content card receipt-dialog" aria-labelledby="receipt-title" aria-describedby="receipt-description" aria-modal="true" onKeyDown={e => {
                        if (e.key !== 'Tab') return;
                        const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
                        const first = controls[0];
                        const last = controls[controls.length - 1];
                        if (!first) { e.preventDefault(); e.currentTarget.querySelector<HTMLElement>('#receipt-title')?.focus(); return; }
                        const active = document.activeElement;
                        if (e.shiftKey && (active === first || !controls.some(control => control === active))) { e.preventDefault(); last.focus(); }
                        else if (!e.shiftKey && (active === last || !controls.some(control => control === active))) { e.preventDefault(); first.focus(); }
                    }} onCancel={e => { e.preventDefault(); requestClose(); }} onClick={e => {
                        e.stopPropagation();
                        if (e.target !== e.currentTarget) return;
                        const bounds = e.currentTarget.getBoundingClientRect();
                        if (e.clientX < bounds.left || e.clientX > bounds.right || e.clientY < bounds.top || e.clientY > bounds.bottom) requestClose();
                    }}>
                        <h2 id="receipt-title" className="modal-title" tabIndex={-1}>登記批次進貨</h2>
                        <p id="receipt-description" className="batch-message">登記後同步增加商品與批次帳量。未驗收的商品保持隔離，不可出庫；到期當日不可出庫。</p>
                        {saving && <p role="status" className="batch-message">正在登記，請稍候；完成前暫停編輯與取消。</p>}
                        {productsPending && <p role="status" className="batch-message">正在載入可收貨商品…</p>}
                        {productError && <div className="batch-message batch-message-error"><p role="alert">{(productFailure as ApiError)?.response?.status === 403 ? '權限不足，無法讀取商品。請洽有權限的管理者。' : '無法載入商品，請重新整理後再試。'} 草稿已保留。</p><button type="button" className="btn btn-ghost" disabled={productsFetching || saving} onClick={() => void refetchProducts()}>重新載入商品</button></div>}
                        {!productsPending && !productError && productList.length === 0 && <p className="batch-message" role="status">目前沒有可收貨商品，請先建立商品資料。</p>}
                        {receiptError && <p ref={receiptErrorRef} id="receipt-error" tabIndex={-1} className="batch-message batch-message-error" role="alert">{receiptError} 草稿已保留。</p>}
                        <form onSubmit={handleCreate} aria-busy={saving} aria-describedby={receiptError ? 'receipt-error' : undefined}>
                            <fieldset disabled={saving} className="receipt-fields">
                            <legend>收貨資料（除驗收狀態外皆必填）</legend>
                            <div className="receipt-form-grid">
                                <div className="input-group">
                                    <label className="input-label" htmlFor="receipt-product">商品</label>
                                    <select
                                        id="receipt-product"
                                        disabled={productsPending || productError || productList.length === 0}
                                        className="input-field"
                                        required
                                        value={batchForm.productId}
                                        onChange={(e) => setBatchForm({ ...batchForm, productId: e.target.value })}
                                    >
                                        <option value="">選擇商品</option>
                                        {productList.map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.sku} - {p.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="input-group">
                                    <label className="input-label" htmlFor="receipt-batch">批號</label>
                                    <input
                                        id="receipt-batch"
                                        className="input-field"
                                        type="text"
                                        required
                                        placeholder="例：BATCH-20260101"
                                        value={batchForm.batchNumber}
                                        onChange={(e) => setBatchForm({ ...batchForm, batchNumber: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label" htmlFor="receipt-expiry">到期日</label>
                                    <input
                                        id="receipt-expiry"
                                        aria-describedby="receipt-expiry-help"
                                        className="input-field"
                                        type="date"
                                        required
                                        value={batchForm.expiryDate}
                                        onChange={(e) => setBatchForm({ ...batchForm, expiryDate: e.target.value })}
                                    />
                                    <p id="receipt-expiry-help" className="batch-help">以台北日期判斷效期，到期當日不可出庫。</p>
                                </div>
                                <div className="input-group">
                                    <label className="input-label" htmlFor="receipt-quantity">數量</label>
                                    <input
                                        id="receipt-quantity"
                                        inputMode="numeric"
                                        className="input-field"
                                        type="number"
                                        min="1"
                                        step="1"
                                        required
                                        value={batchForm.quantity}
                                        onChange={(e) => setBatchForm({ ...batchForm, quantity: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label" htmlFor="receipt-cost">進貨成本</label>
                                    <input
                                        id="receipt-cost"
                                        inputMode="decimal"
                                        className="input-field"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        required
                                        value={batchForm.costPrice}
                                        onChange={(e) => setBatchForm({ ...batchForm, costPrice: e.target.value })}
                                    />
                                </div>
                                <div className="input-group">
                                    <label className="input-label" htmlFor="receipt-status">驗收狀態</label>
                                    <select id="receipt-status" aria-describedby="receipt-status-help" className="input-field" value={batchForm.status} onChange={(e) => {
                                        const status = e.target.value;
                                        if (status === 'QUARANTINE' || status === 'RELEASED' || status === 'BLOCKED') setBatchForm({ ...batchForm, status });
                                    }}>
                                        <option value="QUARANTINE">待驗收隔離</option>
                                        <option value="RELEASED" disabled={!canRelease}>已驗收可售</option>
                                        <option value="BLOCKED">封鎖</option>
                                    </select>
                                    <p id="receipt-status-help" className="batch-help">{!canRelease ? '缺少初次放行權限，可先登記待驗收隔離或封鎖批次，再洽有權限者驗收放行。' : '預設隔離；已驗收可售需要獨立放行權限與原因。'}</p>
                                </div>
                                {batchForm.status === 'RELEASED' && <div className="input-group receipt-wide">
                                    <label className="input-label" htmlFor="receipt-reason">初次放行原因（必填）</label>
                                    <textarea id="receipt-reason" aria-describedby="receipt-reason-help receipt-reason-validation" aria-invalid={invalidRelease} rows={3} className="input-field" required maxLength={1000} value={batchForm.reason} onChange={e => setBatchForm({ ...batchForm, reason: e.target.value })} />
                                    <p id="receipt-reason-help" className="batch-help">請記錄本次驗收與放行依據；原因會與收貨一併保存至稽核歷史。</p>
                                    <p id="receipt-reason-validation" className="batch-help">{invalidRelease ? '請填寫 1–1000 字的放行原因，且需具備初次放行權限。' : `${releaseReason.length} / 1000 字`}</p>
                                </div>}
                            </div>
                            </fieldset>
                            <div className="modal-actions receipt-actions">
                                <button type="button" className="btn btn-ghost" onClick={requestClose} disabled={saving}>取消</button>
                                <button type="submit" className="btn btn-primary" disabled={saving || !canReceive || productsPending || productError || productList.length === 0 || invalidRelease}>
                                    {saving ? '登記中...' : '登記進貨'}
                                </button>
                            </div>
                        </form>
                    </dialog>
                </div>
            )}
        </div>
    );
}
