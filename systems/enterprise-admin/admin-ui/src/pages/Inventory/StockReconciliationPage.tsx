import './StockReconciliationPage.css';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getStockReconciliation } from '../../api/stock-reconciliation';
import { useAuth } from '../../hooks/authContext';
import ReportReadNotice, { isReportAccessDenied } from '../../components/ReportReadNotice';

export default function StockReconciliationPage() {
    const [params, setParams] = useSearchParams();
    const raw = params.get('page') ?? '1';
    const parsed = /^[1-9]\d*$/.test(raw) ? Number(raw) : 1;
    const page = Number.isSafeInteger(parsed) && parsed <= 1_000_000 ? parsed : 1;
    const { user, hasPermission } = useAuth();
    const permitted = hasPermission('read:products');
    const query = useQuery({
        queryKey: ['inventory', 'stock-reconciliation', user?.id, page],
        queryFn: ({ signal }) => getStockReconciliation(page, signal),
        enabled: permitted,
        retry: false,
    });
    const data = permitted && !isReportAccessDenied(query.error) ? query.data : undefined;
    const setPage = (next: number) => setParams({ page: String(next) });
    return <div className="admin-page stock-reconciliation-page">
        <header className="page-header"><div><h1 className="page-title">庫存差異對帳（唯讀）</h1>
            <p>商品總量與全部批次實體量比較，不會修正庫存。</p></div></header>
        <section role="note" className="card" style={{ padding: 16 }}>
            <p>實體量含已放行、隔離、封鎖及過期批次；差異＝商品總量－全部批次實體量。</p>
            <p>可出庫候選量僅計已放行、正數且未到期批次；到期當天不可出庫，依 Asia/Taipei 日界線。過期量與狀態量重疊，不可再相加。</p>
            <p>保留量與可承諾量尚無資料，不以零代替。數量相符不代表歷史完整或實地盤點通過；歷史未能追溯須人工核對，禁止用假批次補平。</p>
        </section>
        {!permitted ? <p role="alert">存取被拒絕，請確認登入與商品讀取權限。</p> : <>
            <ReportReadNotice label="庫存對帳" isError={query.isError} error={query.error}
                hasData={data !== undefined} isFetching={query.isFetching} onRetry={() => { void query.refetch(); }} />
            {query.isPending && <p role="status">庫存對帳載入中…</p>}
            {data && <>
                <p role="status">本頁快照時間：{data.observedAt}；共 {data.total} 個商品。跨頁非同一快照。</p>
                <button type="button" className="btn btn-ghost" disabled={query.isFetching} onClick={() => { void query.refetch(); }}>更新本頁對帳</button>
                <div role="region" aria-label="庫存對帳表" tabIndex={0} className="stock-reconciliation-scroll">
                    <table className="table"><thead><tr><th>商品／單位</th><th>商品總量</th><th>批次實體量</th><th>差異</th><th>批次狀態／效期</th><th>追查</th></tr></thead>
                        <tbody>{data.data.map(row => <tr key={row.id}>
                            <td>{row.name}<br />{row.sku}<br />{row.stockUnitLabel ?? '基本庫存單位（未標示）'}</td>
                            <td>{row.stockQuantity}</td><td>{row.physicalBatchQuantity}</td>
                            <td>{row.difference === 0 ? '數量相符' : `需核對：${row.difference}`}</td>
                            <td>已放行 {row.releasedQuantity}／隔離 {row.quarantineQuantity}／封鎖 {row.blockedQuantity}<br />
                                過期 {row.expiredQuantity}／可出庫候選 {row.eligibleReleasedQuantity}<br />保留量／可承諾量：未知</td>
                            <td>{row.batchCount === 0 && <p>沒有批次，歷史未能追溯。</p>}
                                {row.untracedReceiptCount > 0 && <p>{row.untracedReceiptCount} 筆進貨未能追溯批次。</p>}
                                {row.negativeBatchCount > 0 && <p>{row.negativeBatchCount} 個批次為負數，需核對。</p>}
                                <p>歷史完整性：未驗證</p>
                                <Link to={`/inventory?productId=${encodeURIComponent(row.id)}`}>查看 {row.name} 的批次</Link>
                            </td>
                        </tr>)}</tbody></table>
                </div>
                {data.data.length === 0 && <p>{data.total === 0 ? '尚無商品資料。' : '本頁沒有商品，請返回前頁。'}</p>}
            </>}
            <nav aria-label="庫存對帳分頁">
                <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一頁</button>
                <span>第 {page} 頁</span>
                <button type="button" className="btn btn-ghost" disabled={!data || query.isFetching || query.isError || page * data.limit >= data.total} onClick={() => setPage(page + 1)}>下一頁</button>
            </nav>
        </>}
    </div>;
}
