import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextType } from '../hooks/authContext';
import ProductBatchesView from '../pages/Inventory/ProductBatchesView';
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../api/client', () => ({ default: { get, post, put: post, delete: post } }));
const row = (id: string) => ({ id: `batch-${id}`, productId: id, tenantId: 'tenant-a', batchNumber: `LOT-${id}`, expiryDate: '2099-01-01', quantity: 7, status: 'QUARANTINE', product: { id, name: `商品 ${id}`, sku: id } });
const detail = (id: string) => ({ success: true, data: { ...row(id), receiptMovements: [], saleAllocations: [], _count: { saleAllocations: 0 } } });
let traceRead: (id: string, signal: AbortSignal) => Promise<unknown>;
let client: QueryClient;
function Harness() {
    const [productId, setProduct] = useState('a');
    const [userId, setUser] = useState('reader-a');
    const [allowed, setAllowed] = useState(true);
    const auth: AuthContextType = { user: { id: userId, email: 'synthetic@example.test', fullName: 'Reader', roles: [], permissions: allowed ? ['read:products'] : [] }, loading: false, hasPermission: () => allowed, login: vi.fn(), demoLogin: vi.fn(), logout: vi.fn() };
    return <AuthContext.Provider value={auth}>
        <button onClick={() => setProduct('b')}>Navigate B</button>
        <button onClick={() => setUser('reader-b')}>Change identity</button>
        <button onClick={() => setAllowed(false)}>Revoke</button>
        <ProductBatchesView productId={productId} onBack={() => setProduct('b')} />
    </AuthContext.Provider>;
}
function setup() { client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>); }
beforeEach(() => {
    vi.resetAllMocks();
    traceRead = async id => ({ data: detail(id) });
    get.mockImplementation(async (path: string, options: { params?: { productId: string }; signal: AbortSignal }) => path === '/product-batches'
        ? { data: { success: true, data: [row(options.params!.productId)] } }
        : traceRead(path.replace('/product-batches/batch-', ''), options.signal));
});
afterEach(() => { expect(post).not.toHaveBeenCalled(); cleanup(); client?.clear(); });
const open = async () => { const button = await screen.findByRole('button', { name: '查看批次 LOT-a 的來源與售出分攤' }); button.focus(); fireEvent.click(button); return button; };
describe('product scoped batch trace entry', () => {
    it('opens the existing read-only trace from the product row and restores its exact opener', async () => {
        setup(); const button = await open();
        expect(await screen.findByText('歷史來源未能追溯', { exact: false })).toBeInTheDocument();
        expect(screen.getByRole('dialog')).toHaveAccessibleName('批次 LOT-a：來源與售出分攤');
        expect(screen.getByRole('heading', { name: '批次 LOT-a：來源與售出分攤' })).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: '關閉來源明細' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(button).toHaveFocus();
    });
    it.each(['Navigate B', 'Change identity', 'Revoke'])('invalidates a pending detail on %s without late publication', async action => {
        let release!: (value: unknown) => void; let signal!: AbortSignal;
        traceRead = async (_id, current) => { signal = current; return new Promise(done => { release = done; }); };
        setup(); await open(); await waitFor(() => expect(signal).toBeDefined());
        fireEvent.click(screen.getByRole('button', { name: action }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(signal.aborted).toBe(true);
        await act(async () => release({ data: detail('a') }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.queryByText('歷史來源未能追溯', { exact: false })).not.toBeInTheDocument();
    });
});

describe('batch-list request generation invalidates trace selection', () => {
    it.each(['updated row', 'structurally shared same-millisecond body', 'failed list'])('cancels pending detail on immediate refetch: %s', async mode => {
        let release!: (value: unknown) => void; let pendingSignal!: AbortSignal;
        traceRead = async (_id, signal) => { pendingSignal = signal; return new Promise(done => { release = done; }); };
        setup(); await open(); await waitFor(() => expect(pendingSignal).toBeDefined());
        const key = ['product-batches-read', 'reader-a', 'a'];
        const previous = client.getQueryState(key)!;
        const sameTimestamp = mode === 'structurally shared same-millisecond body' ? vi.spyOn(Date, 'now').mockReturnValue(previous.dataUpdatedAt) : null;
        get.mockImplementationOnce(async () => {
            if (mode === 'failed list') throw new Error('Synthetic list refetch failure');
            return { data: { success: true, data: [{ ...row('a'), ...(mode === 'updated row' ? { batchNumber: 'UPDATED-LOT-a' } : {}) }] } };
        });
        try {
            await act(async () => { await client.invalidateQueries({ queryKey: key }); });
            if (mode === 'failed list') expect(await screen.findByRole('alert')).toHaveTextContent('讀取失敗不代表沒有批次');
            else await screen.findByRole('button', { name: `查看批次 ${mode === 'updated row' ? 'UPDATED-LOT-a' : 'LOT-a'} 的來源與售出分攤` });
            await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
            expect(pendingSignal.aborted).toBe(true);
            if (sameTimestamp) {
                expect(client.getQueryState(key)!.dataUpdatedAt).toBe(previous.dataUpdatedAt);
                expect(client.getQueryData(key)).toBe(previous.data);
            }
            await act(async () => release({ data: detail('a') }));
            expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
            expect(screen.queryByText('歷史來源未能追溯', { exact: false })).not.toBeInTheDocument();
        } finally { sameTimestamp?.mockRestore(); }
    });
    it('does not invalidate the current trace when another product fetches', async () => {
        setup(); await open(); await screen.findByText('歷史來源未能追溯', { exact: false });
        await act(async () => { await client.fetchQuery({ queryKey: ['product-batches-read', 'reader-a', 'other-product'], queryFn: async () => [] }); });
        expect(screen.getByRole('dialog')).toHaveAccessibleName('批次 LOT-a：來源與售出分攤');
        fireEvent.click(screen.getByRole('button', { name: '關閉來源明細' }));
        expect(screen.getByRole('button', { name: '查看批次 LOT-a 的來源與售出分攤' })).toHaveFocus();
    });
});
