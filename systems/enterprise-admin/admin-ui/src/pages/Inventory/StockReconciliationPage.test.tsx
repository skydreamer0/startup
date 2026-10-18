import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StockReconciliationPage from './StockReconciliationPage';

const state = vi.hoisted(() => ({ query: {} as Record<string, unknown>, permitted: true, page: '1', queryOptions: {} as Record<string, unknown> }));
vi.mock('../../hooks/authContext', () => ({ useAuth: () => ({ user: { id: 'synthetic-reader' }, hasPermission: () => state.permitted }) }));
vi.mock('../../api/stock-reconciliation', () => ({ getStockReconciliation: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: Record<string, unknown>) => { state.queryOptions = options; return state.query; } }));
vi.mock('react-router-dom', () => ({
    useSearchParams: () => [new URLSearchParams({ page: state.page }), vi.fn()],
    Link: ({ to, children }: { to: string; children: string }) => createElement('a', { href: to }, children),
}));

const fixture = () => ({ total: 52, page: 1, limit: 50, observedAt: '2026-10-18T12:00:00.000Z', expiryCutoff: '2026-10-18T16:00:00.000Z', data: [{
    id: 'synthetic/id', sku: 'SYNTHETIC-SKU', name: '合成商品', stockUnitLabel: null,
    stockQuantity: 9, physicalBatchQuantity: 4, difference: 5, batchCount: 4,
    releasedQuantity: 2, quarantineQuantity: 1, blockedQuantity: 1, expiredQuantity: 1,
    eligibleReleasedQuantity: 1, negativeBatchCount: 0, untracedReceiptCount: 1,
    reservedQuantity: null, availableQuantity: null, historyComplete: null,
}] });
const render = () => renderToStaticMarkup(createElement(StockReconciliationPage));
beforeEach(() => {
    state.query = { data: fixture(), isError: false, error: null, isPending: false, isFetching: false, refetch: vi.fn() };
    state.permitted = true; state.page = '1';
});
describe('stock reconciliation read states (synthetic SSR, not browser acceptance)', () => {
    it('shows physical discrepancy, bounded trace link and explicit unknowns', () => {
        const html = render();
        expect(html).toContain('需核對：5'); expect(html).toContain('未能追溯批次');
        expect(html).toContain('保留量／可承諾量：未知'); expect(html).toContain('歷史完整性：未驗證');
        expect(html).toContain('/inventory?productId=synthetic%2Fid');
        expect(html).not.toContain('type="submit"');
    });
    it('does not show cached rows when permission is absent and disables the request', () => {
        state.permitted = false; const html = render();
        expect(html).toContain('存取被拒絕'); expect(html).not.toContain('SYNTHETIC-SKU');
        expect(state.queryOptions.enabled).toBe(false);
    });
    it.each([401, 403])('hides retained rows after HTTP %s', status => {
        state.query.isError = true; state.query.error = { response: { status } };
        const html = render(); expect(html).toContain('存取被拒絕'); expect(html).not.toContain('SYNTHETIC-SKU');
    });
    it('labels retained rows stale on a general refresh error and keeps explicit retry', () => {
        state.query.isError = true; state.query.error = { response: { status: 500 } };
        const html = render(); expect(html).toContain('可能已過期'); expect(html).toContain('SYNTHETIC-SKU'); expect(html).toContain('重試庫存對帳');
    });
    it('distinguishes initial error from empty data', () => {
        state.query.data = undefined; state.query.isError = true;
        const html = render(); expect(html).toContain('資料尚不可用'); expect(html).not.toContain('尚無商品資料');
    });
    it('distinguishes loading from empty data', () => {
        state.query.data = undefined; state.query.isPending = true;
        const html = render(); expect(html).toContain('載入中'); expect(html).not.toContain('尚無商品資料');
    });
    it('distinguishes an empty catalog from a beyond-end page', () => {
        state.query.data = { ...fixture(), data: [], total: 0 }; expect(render()).toContain('尚無商品資料');
        state.query.data = { ...fixture(), data: [] }; expect(render()).toContain('本頁沒有商品');
    });
    it('flags absent history and negative batches without creating corrections', () => {
        const data = fixture(); Object.assign(data.data[0], { batchCount: 0, negativeBatchCount: 1, difference: 0 });
        state.query.data = data; const html = render();
        expect(html).toContain('數量相符'); expect(html).toContain('歷史未能追溯'); expect(html).toContain('批次為負數');
        expect(html).toContain('數量相符不代表歷史完整');
    });
    it('normalizes invalid URL pages and scopes query keys to the signed-in actor', () => {
        state.page = '-1'; render(); expect(state.queryOptions.queryKey).toEqual(['inventory', 'stock-reconciliation', 'synthetic-reader', 1]);
        state.page = '2'; render(); expect(state.queryOptions.queryKey).toEqual(['inventory', 'stock-reconciliation', 'synthetic-reader', 2]);
    });
});
