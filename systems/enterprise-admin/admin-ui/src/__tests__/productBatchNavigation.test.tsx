import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextType } from '../hooks/authContext';
import ProductListPage from '../pages/Inventory/ProductListPage';
import { parseProductBatches } from '../api/productBatches';

const { httpGet, httpPost, httpPut, httpDelete } = vi.hoisted(() => ({
    httpGet: vi.fn(), httpPost: vi.fn(), httpPut: vi.fn(), httpDelete: vi.fn(),
}));
vi.mock('../api/client', () => ({ default: { get: httpGet, post: httpPost, put: httpPut, delete: httpDelete } }));
const batch = (productId = 'product-a', number = 'LOT-A') => ({
    id: `batch-${number}`, productId, tenantId: 'tenant-a', batchNumber: number,
    expiryDate: '2027-01-01T00:00:00.000Z', quantity: 7, status: 'QUARANTINE',
    product: { id: productId, name: `商品 ${productId}`, sku: `SKU-${productId}` },
});
const envelope = (productId = 'product-a', number = 'LOT-A') => ({ success: true, data: [batch(productId, number)] });
function failure(status: number) {
    return new AxiosError('Synthetic failure', undefined, undefined, undefined, {
        status, statusText: 'Synthetic failure', headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() }, data: {},
    });
}
function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}
const batchRequest = vi.fn<(id: string, signal: AbortSignal) => Promise<{ data: unknown }>>();
const clients: QueryClient[] = [];
const readCount = (path: string) => httpGet.mock.calls.filter(([requestedPath]) => requestedPath === path).length;
function Harness() {
    const location = useLocation();
    const navigate = useNavigate();
    const [identity, setIdentity] = useState('reader-a');
    const [allowed, setAllowed] = useState(true);
    const context: AuthContextType = {
        user: { id: identity, email: 'synthetic@example.test', fullName: 'Synthetic reader', roles: [], permissions: allowed ? ['read:products'] : [] },
        loading: false, login: vi.fn(), demoLogin: vi.fn(), logout: vi.fn(), hasPermission: () => allowed,
    };
    return <AuthContext.Provider value={context}>
        <button onClick={() => navigate(-1)}>Browser Back</button>
        <button onClick={() => navigate(1)}>Browser Forward</button>
        <button onClick={() => navigate('/inventory?page=2&lowStock=true&productId=product-b')}>Navigate B</button>
        <button onClick={() => setIdentity('reader-b')}>Switch identity</button>
        <button onClick={() => setAllowed(false)}>Revoke permission</button>
        <button onClick={() => setAllowed(true)}>Restore permission</button>
        <output aria-label="Current URL">{location.pathname}{location.search}</output>
        <ProductListPage />
    </AuthContext.Provider>;
}
function setup(entry = '/inventory?page=2&lowStock=true') {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const view = render(<MemoryRouter initialEntries={[entry]}><QueryClientProvider client={client}><Harness /></QueryClientProvider></MemoryRouter>);
    return { ...view, client };
}
beforeEach(() => {
    vi.resetAllMocks();
    batchRequest.mockImplementation(async id => ({ data: envelope(id, id === 'product-a' ? 'LOT-A' : 'LOT-B') }));
    httpGet.mockImplementation(async (path: string, options?: { params?: Record<string, string>; signal?: AbortSignal }) => {
        if (path === '/inventory/products') return { data: { success: true, data: {
            page: Number(options?.params?.page ?? 1), limit: 50, total: 101,
            data: ['product-a', 'product-b'].map(id => ({ id, name: `商品 ${id}`, sku: `SKU-${id}`, costPrice: '10', retailPrice: '20', stockQuantity: 0, safetyStock: 1 })),
        } } };
        if (path === '/inventory/suppliers') return { data: { success: true, data: [] } };
        if (path === '/tenants/me/plan') return { data: { success: true, data: { plan: 'free', features: [] } } };
        if (path === '/product-batches') return batchRequest(options?.params?.productId ?? '', options?.signal as AbortSignal);
        throw new Error(`Unexpected synthetic read: ${path}`);
    });
});
afterEach(() => {
    expect(httpPost).not.toHaveBeenCalled(); expect(httpPut).not.toHaveBeenCalled(); expect(httpDelete).not.toHaveBeenCalled();
    cleanup(); clients.splice(0).forEach(client => client.clear());
});

describe('product → product-scoped batches → original product list', () => {
    it('defers hidden catalog and supplier reads on direct batch URLs until returning', async () => {
        const pending = deferred<{ data: unknown }>();
        batchRequest.mockImplementationOnce(() => pending.promise);
        setup('/inventory?page=2&lowStock=true&productId=product-a');
        await waitFor(() => expect(batchRequest).toHaveBeenCalledTimes(1));
        expect(readCount('/inventory/products')).toBe(0);
        expect(readCount('/inventory/suppliers')).toBe(0);
        await act(async () => pending.resolve({ data: envelope() }));
        await screen.findByText('LOT-A');
        fireEvent.click(screen.getByRole('button', { name: 'Navigate B' }));
        await screen.findByText('LOT-B');
        expect(readCount('/inventory/products')).toBe(0);
        expect(readCount('/inventory/suppliers')).toBe(0);
        fireEvent.click(screen.getByRole('button', { name: '返回商品清單' }));
        expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Inventory filter' })).toHaveValue('true');
        expect(httpGet).toHaveBeenCalledWith('/inventory/products', { params: { page: '2', lowStock: 'true' } });
        expect(readCount('/inventory/products')).toBe(1);
        expect(readCount('/inventory/suppliers')).toBe(1);
    });
    it('keeps cached list reads paused during batch invalidation and resumes them on Back', async () => {
        const { client } = setup();
        const opener = await screen.findByRole('button', { name: '查看 商品 product-a 的批次' });
        await waitFor(() => expect(client.getQueryState(['inventory', 'suppliers'])?.status).toBe('success'));
        const productKey = ['inventory', 'products', { page: 2, lowStock: 'true' }];
        const savedProducts = client.getQueryData(productKey);
        const savedSuppliers = client.getQueryData(['inventory', 'suppliers']);
        fireEvent.click(opener);
        await screen.findByText('LOT-A');
        httpGet.mockClear();
        await act(async () => { await client.invalidateQueries({ queryKey: ['inventory'] }); });
        expect(readCount('/inventory/products')).toBe(0);
        expect(readCount('/inventory/suppliers')).toBe(0);
        expect(client.getQueryData(productKey)).toBe(savedProducts);
        expect(client.getQueryData(['inventory', 'suppliers'])).toBe(savedSuppliers);
        fireEvent.click(screen.getByRole('button', { name: 'Browser Back' }));
        expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Inventory filter' })).toHaveValue('true');
        expect(readCount('/inventory/products')).toBe(1);
        expect(readCount('/inventory/suppliers')).toBe(1);
        expect(screen.getByRole('button', { name: '查看 商品 product-a 的批次' })).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: 'Browser Forward' }));
        await screen.findByText('LOT-A');
        await act(async () => { await client.invalidateQueries({ queryKey: ['inventory'] }); });
        expect(readCount('/inventory/products')).toBe(1);
        expect(readCount('/inventory/suppliers')).toBe(1);
    });
    it('keeps failed batch reads independent from the deferred catalog and supplier reads', async () => {
        batchRequest.mockRejectedValueOnce(failure(500));
        setup('/inventory?page=2&lowStock=true&productId=product-a');
        expect(await screen.findByRole('alert')).toHaveTextContent('無法載入');
        expect(readCount('/inventory/products')).toBe(0);
        expect(readCount('/inventory/suppliers')).toBe(0);
        fireEvent.click(screen.getByRole('button', { name: '返回商品清單' }));
        expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
        expect(readCount('/inventory/products')).toBe(1);
        expect(readCount('/inventory/suppliers')).toBe(1);
    });
    it('reads the selected product only and returns to the original filter, page and opener', async () => {
        setup();
        const opener = await screen.findByRole('button', { name: '查看 商品 product-a 的批次' });
        opener.focus(); fireEvent.click(opener);
        expect(await screen.findByText('LOT-A')).toBeInTheDocument();
        expect(batchRequest).toHaveBeenCalledWith('product-a', expect.any(AbortSignal));
        expect(screen.getByRole('heading', { name: '商品批次' })).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: '返回商品清單' }));
        expect(await screen.findByRole('combobox', { name: 'Inventory filter' })).toHaveValue('true');
        expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '查看 商品 product-a 的批次' })).toHaveFocus();
        expect(screen.getByLabelText('Current URL')).toHaveTextContent('/inventory?page=2&lowStock=true');
    });
    it('Back closes the read view and Forward reopens the same product without resetting the list', async () => {
        setup();
        fireEvent.click(await screen.findByRole('button', { name: '查看 商品 product-b 的批次' }));
        await screen.findByText('LOT-B');
        fireEvent.click(screen.getByRole('button', { name: 'Browser Back' }));
        expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Browser Forward' }));
        expect(await screen.findByText('LOT-B')).toBeInTheDocument();
        expect(screen.queryByText('LOT-A')).not.toBeInTheDocument();
    });
    it('a direct/reloaded product URL returns locally with its saved filter and page', async () => {
        setup('/inventory?page=2&lowStock=true&productId=product-a');
        await screen.findByText('LOT-A');
        fireEvent.click(screen.getByRole('button', { name: '返回商品清單' }));
        expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Inventory filter' })).toHaveValue('true');
        expect(screen.getByLabelText('Current URL')).not.toHaveTextContent('productId');
    });
    it('an old product response cannot replace a newer selection', async () => {
        const old = deferred<{ data: unknown }>();
        batchRequest.mockImplementationOnce(() => old.promise);
        setup('/inventory?page=2&lowStock=true&productId=product-a');
        await waitFor(() => expect(batchRequest).toHaveBeenCalledTimes(1));
        const signal = batchRequest.mock.calls[0][1];
        fireEvent.click(screen.getByRole('button', { name: 'Navigate B' }));
        await screen.findByText('LOT-B');
        expect(signal.aborted).toBe(true);
        await act(async () => old.resolve({ data: envelope('product-a', 'LATE-A') }));
        expect(screen.queryByText('LATE-A')).not.toBeInTheDocument();
        expect(screen.getByText('LOT-B')).toBeInTheDocument();
    });
    it('returning while a read is pending aborts it and never reopens the view', async () => {
        const old = deferred<{ data: unknown }>();
        batchRequest.mockImplementationOnce(() => old.promise);
        setup('/inventory?page=2&lowStock=true&productId=product-a');
        await waitFor(() => expect(batchRequest).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: '返回商品清單' }));
        expect(batchRequest.mock.calls[0][1].aborted).toBe(true);
        await act(async () => old.resolve({ data: envelope('product-a', 'LATE-A') }));
        expect(await screen.findByText('Page 2 of 3')).toBeInTheDocument();
        expect(screen.queryByText('LATE-A')).not.toBeInTheDocument();
    });
    it.each([403, 404, 500])('keeps %s distinct from empty and retries without writes', async status => {
        batchRequest.mockRejectedValueOnce(failure(status));
        setup('/inventory?productId=product-a');
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(screen.queryByText('此商品目前沒有批次資料。')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '重新載入商品批次' }));
        expect(await screen.findByText('LOT-A')).toBeInTheDocument();
    });
    it('shows a successful empty result without inventing stock', async () => {
        batchRequest.mockResolvedValueOnce({ data: { success: true, data: [] } });
        setup('/inventory?productId=product-a');
        expect(await screen.findByText('此商品目前沒有批次資料。')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
    it('does not retain another identity’s cached result or a late response', async () => {
        const old = deferred<{ data: unknown }>();
        batchRequest.mockImplementationOnce(() => old.promise);
        setup('/inventory?productId=product-a');
        await waitFor(() => expect(batchRequest).toHaveBeenCalledTimes(1));
        fireEvent.click(screen.getByRole('button', { name: 'Switch identity' }));
        expect(await screen.findByText('LOT-A')).toBeInTheDocument();
        expect(batchRequest.mock.calls[0][1].aborted).toBe(true);
        await act(async () => old.resolve({ data: envelope('product-a', 'OLD-IDENTITY') }));
        expect(screen.queryByText('OLD-IDENTITY')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Revoke permission' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('權限不足');
        expect(screen.queryByText('LOT-A')).not.toBeInTheDocument();
        expect(batchRequest).toHaveBeenCalledTimes(2);
    });
    it('same-identity permission restoration refetches before exposing old rows', async () => {
        setup('/inventory?productId=product-a');
        await screen.findByText('LOT-A');
        fireEvent.click(screen.getByRole('button', { name: 'Revoke permission' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('權限不足');
        expect(screen.queryByText('LOT-A')).not.toBeInTheDocument();
        expect(batchRequest).toHaveBeenCalledTimes(1);
        const fresh = deferred<{ data: unknown }>();
        batchRequest.mockImplementationOnce(() => fresh.promise);
        fireEvent.click(screen.getByRole('button', { name: 'Restore permission' }));
        await waitFor(() => expect(batchRequest).toHaveBeenCalledTimes(2));
        expect(screen.queryByText('LOT-A')).not.toBeInTheDocument();
        await act(async () => fresh.resolve({ data: envelope('product-a', 'FRESH-A') }));
        expect(await screen.findByText('FRESH-A')).toBeInTheDocument();
    });
    it('a failed background refetch hides the old result until explicit retry succeeds', async () => {
        const { client } = setup('/inventory?productId=product-a');
        await screen.findByText('LOT-A');
        batchRequest.mockRejectedValueOnce(failure(500));
        await act(async () => { await client.invalidateQueries({ queryKey: ['product-batches-read'] }); });
        expect(await screen.findByRole('alert')).toHaveTextContent('無法載入');
        expect(screen.queryByText('LOT-A')).not.toBeInTheDocument();
        expect(screen.queryByText('此商品目前沒有批次資料。')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '重新載入商品批次' }));
        expect(await screen.findByText('LOT-A')).toBeInTheDocument();
    });
    it.each(['0', '-1', '1e3', 'NaN', '9007199254740992'])('bounds malformed page %s to page one', async page => {
        setup(`/inventory?page=${page}`);
        expect(await screen.findByText('Page 1 of 3')).toBeInTheDocument();
    });
});

describe('product batch read contract', () => {
    it('accepts the current API envelope and preserves the product identity', () => {
        expect(parseProductBatches(envelope(), 'product-a')).toEqual([batch()]);
    });
    it.each([
        { success: true, data: [batch('product-b')] },
        { success: true, data: [{ ...batch(), product: { ...batch().product, id: 'product-b' } }] },
        { success: true, data: [{ ...batch(), quantity: -1 }] },
        { success: true, data: [{ ...batch(), expiryDate: 'unknown' }] },
        { success: true, data: [{ ...batch(), status: 'unknown' }] },
        { success: true, data: [batch(), batch()] },
        { success: true, data: [batch(), { ...batch('product-a', 'B'), tenantId: 'foreign' }] },
        { success: false, data: [] }, { success: true, data: {} },
    ])('rejects mismatched or malformed rows rather than displaying an empty success', value => {
        expect(() => parseProductBatches(value, 'product-a')).toThrow('資料格式不符');
    });
});
