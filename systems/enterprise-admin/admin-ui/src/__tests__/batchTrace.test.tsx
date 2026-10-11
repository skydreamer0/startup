import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BatchTraceDialog from '../pages/Inventory/BatchTraceDialog';
import BatchListPage from '../pages/Inventory/BatchListPage';
import { AuthContext, type AuthContextType } from '../hooks/authContext';
import { parseBatchTrace } from '../api/batchTrace';
import type { ProductBatch } from '../api/batches';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock('../api/client', () => ({ default: http }));
const batch: ProductBatch = { id: 'batch-a', tenantId: 'tenant-a', productId: 'product-a', batchNumber: 'LOT-A',
    quantity: 4, status: 'RELEASED', expiryDate: '2099-01-01T00:00:00Z', receivedAt: '2026-10-01T00:00:00Z', costPrice: '20', product: { name: 'Synthetic product', sku: 'SYN-A' } };
function wire(target = batch, count = 1) {
    return { success: true, data: { ...target,
        receiptMovements: [{ id: 'receipt-a', type: 'IN', quantity: 7, batchId: target.id, tenantId: target.tenantId, createdAt: '2026-09-30T16:00:00Z' }],
        saleAllocations: Array.from({ length: Math.min(count, 100) }, (_, i) => ({ id: `allocation-${i}`, batchId: target.id, tenantId: target.tenantId,
            orderId: `order-${i}`, orderItemId: `line-${i}`, movementId: `out-${i}`, quantity: 3, createdAt: '2026-10-01T16:00:00Z', expiryDateAtSale: '2099-01-01T00:00:00Z',
            order: { id: `order-${i}`, orderNumber: `SYN-ORDER-${i}`, createdAt: '2026-10-01T16:00:00Z' } })), _count: { saleAllocations: count } } };
}
function auth(userId = 'reader'): AuthContextType {
    return { user: { id: userId, email: 'synthetic@example.test', fullName: 'Synthetic reader', roles: [], permissions: ['read:products'] },
        loading: false, hasPermission: permission => permission === 'read:products', login: vi.fn(), logout: vi.fn(), demoLogin: vi.fn() };
}
const clients: QueryClient[] = [];
function setup({ page = false, target = batch, context = auth() } = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
    const close = vi.fn();
    const view = render(<AuthContext.Provider value={context}><QueryClientProvider client={client}>
        {page ? <BatchListPage /> : <BatchTraceDialog batch={target} onClose={close} />}
    </QueryClientProvider></AuthContext.Provider>);
    return { ...view, client, close, rerenderPage: (nextAuth: AuthContextType) => view.rerender(
        <AuthContext.Provider value={nextAuth}><QueryClientProvider client={client}><BatchListPage /></QueryClientProvider></AuthContext.Provider>), rerenderDialog: (next: ProductBatch, nextAuth = context) => view.rerender(
        <AuthContext.Provider value={nextAuth}><QueryClientProvider client={client}><BatchTraceDialog batch={next} onClose={close} /></QueryClientProvider></AuthContext.Provider>) };
}
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(r => { resolve = r; }); return { promise, resolve }; }
beforeEach(() => {
    vi.resetAllMocks();
    http.get.mockImplementation(async (path: string) => {
        if (path === '/product-batches') return { data: { success: true, data: [batch] } };
        if (path === '/inventory/products') return { data: { success: true, data: { total: 0, page: 1, limit: 50, data: [] } } };
        if (path === `/product-batches/${batch.id}`) return { data: wire() };
        throw new Error(`Unexpected synthetic GET: ${path}`);
    });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

function noWrites() { expect(http.post).not.toHaveBeenCalled(); expect(http.patch).not.toHaveBeenCalled(); expect(http.delete).not.toHaveBeenCalled(); }

describe('batch source read contract', () => {
    it('validates and projects the real existing envelope without requiring money or receipt notes', () => {
        const result = parseBatchTrace(wire(), batch.id, batch.tenantId);
        expect(result.receiptMovements[0]).toEqual({ id: 'receipt-a', quantity: 7, createdAt: '2026-09-30T16:00:00Z' });
        expect(result.saleAllocations[0].order.orderNumber).toBe('SYN-ORDER-0');
        expect(result.totalAllocations).toBe(1);
    });
    it('accepts general-order allocations whose order number is null', () => {
        const input = wire();
        (input.data.saleAllocations[0].order as { orderNumber: string | null }).orderNumber = null;
        expect(parseBatchTrace(input, batch.id, batch.tenantId).saleAllocations[0].order).toEqual({ id: 'order-0', orderNumber: null });
    });
    it.each(['envelope', 'batch', 'tenant', 'receipt', 'allocation', 'count', 'missing', 'duplicates', 'date', 'orderNumber'])('rejects malformed or mismatched %s instead of showing empty history', kind => {
        const input = wire();
        if (kind === 'envelope') input.success = false;
        if (kind === 'batch') input.data.id = 'another-batch';
        if (kind === 'tenant') input.data.tenantId = 'another-tenant';
        if (kind === 'receipt') input.data.receiptMovements[0].tenantId = 'another-tenant';
        if (kind === 'allocation') input.data.saleAllocations[0].orderId = 'different-order';
        if (kind === 'count') input.data._count.saleAllocations = -1;
        if (kind === 'missing') input.data.saleAllocations = [];
        if (kind === 'duplicates') input.data.receiptMovements.push(input.data.receiptMovements[0]);
        if (kind === 'date') input.data.saleAllocations[0].createdAt = 'not-a-date';
        if (kind === 'orderNumber') input.data.saleAllocations[0].order.orderNumber = '';
        expect(() => parseBatchTrace(input, batch.id, batch.tenantId)).toThrow('格式不符');
    });
});

describe('batch source dialog through real read client and synthetic HTTP', () => {
    it('shows actual receipt and allocation identities with Taipei dates and no financial claims', async () => {
        setup(); expect(await screen.findByText('訂單 SYN-ORDER-0・本批實扣數量 3')).toBeVisible();
        expect(screen.getByText(/2026\/10\/1 00:00:00・實收數量 7/)).toBeVisible();
        expect(screen.getByText(/進貨紀錄：receipt-a/)).toBeVisible();
        expect(screen.getByText(/出庫紀錄：out-0/)).toBeVisible();
        expect(screen.getByText(/筆數不是訂單數/)).toBeVisible();
        expect(screen.getByText(/不能據此重建完整歷史/)).toBeVisible();
        expect(http.get).toHaveBeenCalledWith('/product-batches/batch-a', { signal: expect.any(AbortSignal) }); noWrites();
    });
    it('shows a general-order allocation without an order number instead of failing the trace', async () => {
        const input = wire();
        (input.data.saleAllocations[0].order as { orderNumber: string | null }).orderNumber = null;
        http.get.mockResolvedValue({ data: input }); setup();
        expect(await screen.findByText('訂單 未編號（order-0）・本批實扣數量 3')).toBeVisible();
        expect(screen.getByText(/進貨紀錄：receipt-a/)).toBeVisible(); noWrites();
    });
    it('states unknown historical provenance for successful empty arrays', async () => {
        const input = wire(batch, 0); input.data.receiptMovements = [];
        http.get.mockResolvedValue({ data: input }); setup();
        expect(await screen.findByText(/歷史來源未能追溯，不代表從未進貨/)).toBeVisible();
        expect(screen.getByText(/舊單可能未能追溯，不代表從未售出/)).toBeVisible(); noWrites();
    });
    it('discloses the 100-row cap and actual total without inventing older rows', async () => {
        http.get.mockResolvedValue({ data: wire(batch, 132) }); setup();
        expect(await screen.findByText('顯示 100 / 132 筆分攤（最新在前）。筆數不是訂單數。')).toBeVisible();
        expect(screen.getByText(/僅顯示最近 100 筆/)).toBeVisible();
        expect(screen.getAllByText(/訂單 SYN-ORDER-/)).toHaveLength(100); noWrites();
    });
    it.each([403, 404, 500, 'network', 'malformed'])('keeps %s separate from empty, hides server details, then retries the same read', async kind => {
        if (kind === 'malformed') http.get.mockResolvedValueOnce({ data: { success: true, data: {} } });
        else http.get.mockRejectedValueOnce(kind === 'network' ? new Error('secret-server-detail') : { response: { status: kind, data: { error: { message: 'secret-server-detail' } } } });
        setup();
        const alert = await screen.findByRole('alert');
        expect(alert).toHaveTextContent(kind === 403 ? '權限不足' : kind === 404 ? '找不到此批次' : '無法載入批次來源');
        expect(screen.queryByText(/secret-server-detail|目前沒有已連結/)).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '重新載入來源' }));
        expect(await screen.findByText(/訂單 SYN-ORDER-0/)).toBeVisible(); noWrites();
    });
    it('makes a loading close available and aborts an unmounted read', async () => {
        const pending = deferred<{ data: ReturnType<typeof wire> }>(); http.get.mockReturnValueOnce(pending.promise);
        const view = setup(); expect(screen.getByRole('status')).toHaveTextContent('正在載入');
        fireEvent.click(screen.getByRole('button', { name: '關閉來源明細' })); expect(view.close).toHaveBeenCalledOnce();
        const signal = http.get.mock.calls[0][1].signal; view.unmount(); expect(signal.aborted).toBe(true);
        await act(async () => pending.resolve({ data: wire() })); expect(screen.queryByText(/SYN-ORDER-0/)).not.toBeInTheDocument(); noWrites();
    });
    it('ignores late old-batch results after selecting a different batch', async () => {
        const pending = deferred<{ data: ReturnType<typeof wire> }>(); http.get.mockReturnValueOnce(pending.promise);
        const view = setup(); const other = { ...batch, id: 'batch-b', batchNumber: 'LOT-B' }; const next = wire(other);
        next.data.saleAllocations[0].order.orderNumber = 'SYN-B'; http.get.mockResolvedValueOnce({ data: next });
        view.rerenderDialog(other); expect(await screen.findByText(/訂單 SYN-B/)).toBeVisible();
        await act(async () => pending.resolve({ data: wire() }));
        expect(screen.queryByText(/SYN-ORDER-0/)).not.toBeInTheDocument(); expect(screen.getByText(/訂單 SYN-B/)).toBeVisible(); noWrites();
    });
    it('hides a prior success when refresh fails and recovers without writes or duplicate pending retry', async () => {
        setup(); await screen.findByText(/訂單 SYN-ORDER-0/);
        http.get.mockRejectedValueOnce({ response: { status: 403 } }); fireEvent.click(screen.getByRole('button', { name: '重新載入來源' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('先前結果已過期'); expect(screen.queryByText(/SYN-ORDER-0/)).not.toBeInTheDocument();
        const pending = deferred<{ data: ReturnType<typeof wire> }>(); http.get.mockReturnValueOnce(pending.promise);
        const retry = screen.getByRole('button', { name: '重新載入來源' }); fireEvent.click(retry); fireEvent.click(retry);
        await waitFor(() => expect(screen.getByRole('button', { name: '重新載入來源' })).toBeDisabled()); expect(http.get).toHaveBeenCalledTimes(3);
        await act(async () => pending.resolve({ data: wire() })); expect(await screen.findByText(/SYN-ORDER-0/)).toBeVisible(); noWrites();
    });
    it('does not query for missing read permission or unresolved auth', () => {
        const context = auth(); context.hasPermission = () => false;
        const view = setup({ context }); expect(screen.getByRole('alert')).toHaveTextContent('權限不足'); expect(http.get).not.toHaveBeenCalled();
        view.rerenderDialog(batch, { ...auth(), loading: true }); expect(screen.getByRole('status')).toHaveTextContent('正在確認'); expect(http.get).not.toHaveBeenCalled(); noWrites();
    });
    it('separates user-scoped results while another reader request is pending', async () => {
        const view = setup(); await screen.findByText(/SYN-ORDER-0/);
        const pending = deferred<{ data: ReturnType<typeof wire> }>(); http.get.mockReturnValueOnce(pending.promise);
        view.rerenderDialog(batch, auth('another-reader')); expect(screen.getByRole('status')).toHaveTextContent('正在載入');
        expect(screen.queryByText(/SYN-ORDER-0/)).not.toBeInTheDocument();
        await act(async () => pending.resolve({ data: wire() })); await screen.findByText(/SYN-ORDER-0/); noWrites();
    });
    it('names and focuses the modal, contains Tab and handles native Escape cancellation', async () => {
        const view = setup(); const dialog = screen.getByRole('dialog', { name: '批次 LOT-A：來源與售出分攤' });
        expect(within(dialog).getByRole('heading', { level: 2 })).toHaveFocus();
        await screen.findByText(/SYN-ORDER-0/); const close = within(dialog).getByRole('button', { name: '關閉來源明細' });
        const retry = within(dialog).getByRole('button', { name: '重新載入來源' });
        retry.focus(); fireEvent.keyDown(retry, { key: 'Tab' }); expect(close).toHaveFocus();
        fireEvent.keyDown(close, { key: 'Tab', shiftKey: true }); expect(retry).toHaveFocus();
        fireEvent(dialog, new Event('cancel', { cancelable: true })); expect(view.close).toHaveBeenCalledOnce(); noWrites();
    });
    it('closes and forgets the trace selection after authentication A/B/A', async () => {
        const view = setup({ page: true }); const opener = await screen.findByRole('button', { name: '來源／售出分攤' });
        fireEvent.click(opener); await screen.findByText(/訂單 SYN-ORDER-0/);
        view.rerenderPage(auth('another-reader')); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        view.rerenderPage(auth()); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); noWrites();
    });
    it('does not expose detail values from a mismatched tenant response', async () => {
        const mismatched = wire({ ...batch, tenantId: 'another-tenant' }); mismatched.data.product = { name: 'OTHER-TENANT-SECRET', sku: 'OTHER' };
        http.get.mockResolvedValueOnce({ data: mismatched }); setup();
        expect(await screen.findByRole('alert')).toHaveTextContent('無法載入批次來源');
        expect(screen.queryByText(/OTHER-TENANT-SECRET|SYN-ORDER-0/)).not.toBeInTheDocument(); noWrites();
    });
    it('opens from the filtered real batch page and closing preserves filter and returns focus', async () => {
        setup({ page: true }); await screen.findByText('LOT-A');
        fireEvent.click(screen.getByRole('button', { name: '到期／30天內需處理' }));
        const opener = await screen.findByRole('button', { name: '來源／售出分攤' }); await waitFor(() => expect(opener).toBeEnabled());
        opener.focus(); fireEvent.click(opener); await screen.findByText(/訂單 SYN-ORDER-0/);
        fireEvent.click(screen.getByRole('button', { name: '關閉來源明細' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(opener).toHaveFocus();
        expect(screen.getByRole('button', { name: '到期／30天內需處理' })).toHaveAttribute('aria-pressed', 'true');
        expect(http.get).toHaveBeenCalledWith('/product-batches', { params: { expiringSoon: 'true' } }); noWrites();
    });
});
