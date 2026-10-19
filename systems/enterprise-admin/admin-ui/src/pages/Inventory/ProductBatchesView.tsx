import { useEffect, useRef, useState } from 'react';
import BatchTraceDialog, { type BatchTraceSubject } from './BatchTraceDialog';
import './BatchListPage.css';
import { isAxiosError } from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getProductBatches } from '../../api/productBatches';
import { useAuth } from '../../hooks/authContext';

export default function ProductBatchesView({ productId, onBack }: { productId: string; onBack: () => void }) {
    const { user, loading, hasPermission } = useAuth();
    const allowed = !loading && !!user && hasPermission('read:products');
    const heading = useRef<HTMLHeadingElement>(null);
    const queryClient = useQueryClient();
    const [selection, setSelection] = useState<{ batch: BatchTraceSubject; productId: string; userId: string } | null>(null);
    useEffect(() => { setSelection(null); }, [productId, user?.id, allowed]);
    useEffect(() => { heading.current?.focus(); }, []);
    useEffect(() => queryClient.getQueryCache().subscribe(event => {
        // Query-cache fetch actions are synchronous request-generation events.
        // Observer fetching/success notifications can coalesce; equal bodies may
        // also share identity and dataUpdatedAt can repeat within a millisecond.
        if (event.type === 'updated' && event.action.type === 'fetch'
            && event.query.queryKey[0] === 'product-batches-read'
            && event.query.queryKey[1] === user?.id && event.query.queryKey[2] === productId) {
            setSelection(null);
        }
    }), [queryClient, user?.id, productId]);
    const batches = useQuery({
        queryKey: ['product-batches-read', user?.id, productId],
        queryFn: ({ signal }) => getProductBatches(productId, signal),
        enabled: allowed,
        retry: false,
        staleTime: 0,
        gcTime: 0,
    });
    useEffect(() => {
        if (batches.isFetching || batches.isError) setSelection(null);
    }, [batches.isFetching, batches.isError]);
    const status = isAxiosError(batches.error) ? batches.error.response?.status : undefined;
    const message = status === 403 ? '權限不足，無法讀取此商品的批次。'
        : status === 404 ? '找不到此商品的批次資料或無法存取。'
            : '無法載入商品批次，請重試。讀取失敗不代表沒有批次。';
    const negativeBatchCount = batches.data?.filter(batch => batch.quantity < 0).length ?? 0;
    return <div className="inventory-product-page product-batches-view">
        <header className="page-header product-header">
            <div className="product-heading">
                <h1 ref={heading} className="page-title" tabIndex={-1}>商品批次</h1>
                <p className="page-subtitle">商品識別：{productId}</p>
            </div>
            <button type="button" className="btn btn-ghost product-batches-button" onClick={onBack}>返回商品清單</button>
        </header>
        <p>唯讀查詢。數量為各批次帳量；已驗收不代表尚未到期或可出庫。</p>
        {loading ? <p role="status">正在確認讀取權限…</p>
            : !allowed ? <p role="alert">權限不足，無法讀取此商品的批次。</p>
                : batches.isPending || batches.isFetching ? <p role="status">正在載入商品批次…</p>
                    : batches.isError ? <div role="alert"><p>{message}</p>
                        <button type="button" className="btn btn-ghost product-batches-button" onClick={() => void batches.refetch()}>重新載入商品批次</button></div>
                        : batches.data.length === 0 ? <p role="status">此商品目前沒有批次資料。</p>
                            : <>
                                <h2>{batches.data[0].product.name}（{batches.data[0].product.sku}）</h2>
                                <p>{batches.data.length} 筆批次（本次載入）</p>
                                {negativeBatchCount > 0 && <p role="alert"><strong>{negativeBatchCount} 個批次帳量為負數，需人工核對。</strong> 此頁保留原始帳量，不修正庫存；不得以假批次補平。</p>}
                                <p id="product-batches-scroll-hint">欄位較多時可在表格內左右捲動；鍵盤可聚焦表格後使用方向鍵。</p>
                                <div className="table-container product-table-scroll" role="region" aria-label="商品批次清單" aria-describedby="product-batches-scroll-hint" tabIndex={0}>
                                    <table className="table"><thead><tr>
                                        <th scope="col">批號</th><th scope="col">到期日（台北）</th><th scope="col">驗收狀態</th><th scope="col">批次帳量</th><th scope="col">唯讀追溯</th>
                                    </tr></thead><tbody>{batches.data.map(batch => <tr key={batch.id}>
                                        <td>{batch.batchNumber}</td>
                                        <td>{new Date(batch.expiryDate).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' })}</td>
                                        <td>{batch.status === 'RELEASED' ? '已驗收' : batch.status === 'BLOCKED' ? '封鎖' : '待驗收隔離'}</td>
                                        <td>{batch.quantity < 0 ? <><strong>{batch.quantity.toLocaleString()}</strong><br /><strong>負數帳量，需核對</strong></> : batch.quantity.toLocaleString()}</td>
                                        <td><button type="button" className="btn btn-ghost product-batches-button" aria-label={`查看批次 ${batch.batchNumber} 的來源與售出分攤`} onClick={() => { if (user && allowed) setSelection({ batch, productId, userId: user.id }); }}>來源／售出分攤</button></td>
                                    </tr>)}</tbody></table>
                                </div>
                            </>}
        {selection && allowed && selection.productId === productId && selection.userId === user?.id && !batches.isFetching && !batches.isError && batches.data?.some(batch => batch.id === selection.batch.id && batch.tenantId === selection.batch.tenantId) && <div className="batch-list-page"><BatchTraceDialog key={`${selection.userId}:${selection.productId}:${selection.batch.id}`} batch={selection.batch} onClose={() => setSelection(null)} /></div>}
    </div>;
}
