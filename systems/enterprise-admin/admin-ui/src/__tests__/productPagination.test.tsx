import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ApiFailure, ApiSuccess, InventoryProductPage, Product } from '@pharmasaas/types';
import { inventoryApi } from '../api/inventory';
import ProductListPage from '../pages/Inventory/ProductListPage';
import BatchListPage from '../pages/Inventory/BatchListPage';
import { AuthProvider } from '../hooks/useAuth';

type Params = { page?: string; lowStock?: string };
const { httpGet, httpPost, httpPut } = vi.hoisted(() => ({
    httpGet: vi.fn<(path: string, options?: { params?: Params }) => Promise<{ data: ApiSuccess<unknown> }>>(),
    httpPost: vi.fn(), httpPut: vi.fn(),
}));
vi.mock('../api/client', () => ({ default: { get: httpGet, post: httpPost, put: httpPut } }));

const product = (number: number): Product => ({
    id: `synthetic-${number}`, sku: `SKU-${number}`, name: `Synthetic product ${number}`,
    costPrice: '10', retailPrice: '20', stockQuantity: number === 51 ? 0 : 10, safetyStock: 1,
});
function envelope(page = 1, total = 51) {
    const start = (page - 1) * 50;
    return { data: { success: true as const, data: {
        total, page, limit: 50,
        data: Array.from({ length: Math.max(0, Math.min(50, total - start)) }, (_, index) => product(start + index + 1)),
    } } };
}
const productsRequest = vi.fn<(params: Params) => Promise<ReturnType<typeof envelope>>>();
function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}
function requestFailure(status: number) {
    return new AxiosError<ApiFailure>('Synthetic product request failed', undefined, undefined, undefined, {
        status, statusText: 'Synthetic failure', headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() },
        data: { success: false, error: { code: 'SYNTHETIC_FAILURE', message: 'Synthetic product request failed' } },
    });
}
const failures = [403, 500, 'offline', 'request failure'] as const;
function failureFor(kind: typeof failures[number]) {
    return typeof kind === 'number' ? requestFailure(kind)
        : kind === 'offline' ? new AxiosError('Network Error', 'ERR_NETWORK') : new Error('Synthetic product request failed');
}
const clients: QueryClient[] = [];
function setup(page = <ProductListPage />, staleTime = 0) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime } } });
    clients.push(client);
    render(<QueryClientProvider client={client}>{page}</QueryClientProvider>);
    return client;
}
beforeEach(() => {
    vi.resetAllMocks();
    productsRequest.mockImplementation(async (params) => {
        const page = Number(params.page ?? 1);
        if (params.lowStock === 'true') {
            const response = envelope(page, 1);
            response.data.data.data = page === 1 ? [product(51)] : [];
            return response;
        }
        return envelope(page);
    });
    httpGet.mockImplementation(async (path, options) => {
        if (path === '/inventory/products') return productsRequest(options?.params ?? {});
        if (path === '/inventory/suppliers') return { data: { success: true, data: [] } };
        if (path === '/product-batches') return { data: { success: true, data: [] } };
        if (path === '/auth/me') return { data: { success: true, data: { id: 'synthetic-reader', permissions: ['read:products', 'create:products'] } } };
        if (path === '/tenants/me/plan') return { data: { success: true, data: { plan: 'free', features: [] } } };
        throw new Error(`Unexpected synthetic request: ${path}`);
    });
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); localStorage.clear(); });

describe('product list pagination through the real inventory client', () => {
    it('has an exact typed page and unwraps the real envelope once, retaining nullable relations', async () => {
        const payload: InventoryProductPage = { total: 1, page: 1, limit: 50, data: [{
            ...product(1), stockQuantity: 0, description: null, categoryId: null, supplierId: null,
            supplier: null, category: null, isLowStock: true,
        }] };
        httpGet.mockResolvedValueOnce({ data: { success: true, data: payload } });
        expectTypeOf<ReturnType<typeof inventoryApi.getProducts>>().toEqualTypeOf<Promise<InventoryProductPage>>();
        expect(await inventoryApi.getProducts({ page: '1', lowStock: 'true' })).toEqual(payload);
    });

    it('shows page two and the last-page boundary with the complete catalog total', async () => {
        setup();
        await screen.findByText('Synthetic product 1');
        expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
        expect(await screen.findByText('Synthetic product 51')).toBeInTheDocument();
        expect(screen.getByText('51 SKUs in catalog')).toBeInTheDocument();
        expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
        expect(httpGet).toHaveBeenCalledWith('/inventory/products', { params: { page: '2', lowStock: '' } });
        expect(httpPost).not.toHaveBeenCalled();
        expect(httpPut).not.toHaveBeenCalled();
    });

    it('resets to page one when the low-stock filter changes and shows filtered total', async () => {
        setup();
        await screen.findByText('Synthetic product 1');
        fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
        await screen.findByText('Synthetic product 51');
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'true' } });
        await waitFor(() => expect(httpGet).toHaveBeenCalledWith('/inventory/products', { params: { page: '1', lowStock: 'true' } }));
        expect(await screen.findByText('1 SKUs in catalog')).toBeInTheDocument();
        expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
    });

    it.each(failures)('shows %s instead of an empty catalog and recovers only on a non-submitting retry', async (kind) => {
        productsRequest.mockRejectedValueOnce(failureFor(kind));
        setup();
        expect(await screen.findByRole('alert')).toHaveTextContent(typeof kind === 'number' ? String(kind) : 'Check your connection');
        expect(screen.queryByText('No products found')).not.toBeInTheDocument();
        expect(screen.queryByText('0 SKUs in catalog')).not.toBeInTheDocument();
        productsRequest.mockResolvedValueOnce(envelope());
        fireEvent.click(screen.getByRole('button', { name: 'Retry products' }));
        expect(await screen.findByText('Synthetic product 1')).toBeInTheDocument();
        expect(httpPost).not.toHaveBeenCalled();
        expect(httpPut).not.toHaveBeenCalled();
    });

    it('hides cached results during refetch and keeps a refetch failure unavailable until retry confirms it', async () => {
        const client = setup();
        await screen.findByText('Synthetic product 1');
        const refresh = deferred<ReturnType<typeof envelope>>();
        productsRequest.mockReturnValueOnce(refresh.promise);
        act(() => { void client.invalidateQueries({ queryKey: ['inventory', 'products'] }); });
        await waitFor(() => expect(productsRequest).toHaveBeenCalledTimes(2));
        expect(screen.queryByText('Synthetic product 1')).not.toBeInTheDocument();
        expect(screen.queryByText('51 SKUs in catalog')).not.toBeInTheDocument();
        expect(screen.getByText('Loading products...')).toBeInTheDocument();
        await act(async () => { refresh.reject(requestFailure(500)); });
        expect(await screen.findByRole('alert')).toHaveTextContent('500');
        expect(screen.queryByText('Synthetic product 1')).not.toBeInTheDocument();
        expect(screen.queryByText('No products found')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry products' }));
        expect(await screen.findByText('Synthetic product 1')).toBeInTheDocument();
    });

    it('recovers to the new last page once when the total shrinks instead of remaining beyond the end', async () => {
        productsRequest.mockImplementation(async (params) => envelope(Number(params.page), 101));
        const client = setup();
        await screen.findByText('Synthetic product 1');
        fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
        await screen.findByText('Synthetic product 51');
        fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
        await screen.findByText('Synthetic product 101');
        productsRequest.mockImplementation(async (params) => envelope(Number(params.page), 51));
        act(() => { void client.invalidateQueries({ queryKey: ['inventory', 'products'] }); });
        expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
        expect(screen.getByText('Synthetic product 51')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
        await waitFor(() => expect(client.isFetching({ queryKey: ['inventory', 'products'] })).toBe(0));
        expect(productsRequest.mock.calls.map(([params]) => params.page)).toEqual(['1', '2', '3', '3', '2']);
        expect(httpPost).not.toHaveBeenCalled();
        expect(httpPut).not.toHaveBeenCalled();
    });

    it('distinguishes a pending request from a confirmed empty page and disables both boundaries', async () => {
        const pending = deferred<ReturnType<typeof envelope>>();
        productsRequest.mockReturnValueOnce(pending.promise);
        setup();
        expect(screen.getByText('Loading products...')).toBeInTheDocument();
        expect(screen.queryByText('No products found')).not.toBeInTheDocument();
        expect(screen.queryByText('0 SKUs in catalog')).not.toBeInTheDocument();
        await act(async () => { pending.resolve(envelope(1, 0)); });
        expect(await screen.findByText('No products found')).toBeInTheDocument();
        expect(screen.getByText('0 SKUs in catalog')).toBeInTheDocument();
        expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();
        expect(productsRequest).toHaveBeenCalledTimes(1);
    });

    it('keeps the selected filter when two deferred responses finish in reverse order', async () => {
        const client = setup();
        await screen.findByText('Synthetic product 1');
        const old = deferred<ReturnType<typeof envelope>>();
        const current = deferred<ReturnType<typeof envelope>>();
        productsRequest.mockImplementation((params) => params.lowStock === 'true' ? current.promise : old.promise);
        fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
        await waitFor(() => expect(productsRequest).toHaveBeenCalledWith({ page: '2', lowStock: '' }));
        expect(screen.queryByText('Synthetic product 1')).not.toBeInTheDocument();
        fireEvent.change(screen.getByRole('combobox', { name: 'Inventory filter' }), { target: { value: 'true' } });
        await waitFor(() => expect(productsRequest).toHaveBeenCalledWith({ page: '1', lowStock: 'true' }));
        const filtered = envelope(1, 1);
        filtered.data.data.data = [{ ...product(51), name: 'Current filtered product' }];
        await act(async () => { current.resolve(filtered); });
        await screen.findByText('Current filtered product');
        const late = envelope(2);
        late.data.data.data[0].name = 'Late page two';
        await act(async () => { old.resolve(late); });
        await waitFor(() => expect(client.isFetching()).toBe(0));
        expect(screen.getByText('Current filtered product')).toBeInTheDocument();
        expect(screen.queryByText('Late page two')).not.toBeInTheDocument();
        expect(screen.getByText('1 SKUs in catalog')).toBeInTheDocument();
        expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Inventory filter' })).toHaveValue('true');
        expect(httpPost).not.toHaveBeenCalled();
        expect(httpPut).not.toHaveBeenCalled();
    });

    it('handles rapid next/previous without presenting cached first-page data or the late second page as current', async () => {
        const client = setup(undefined, 60_000);
        await screen.findByText('Synthetic product 1');
        const second = deferred<ReturnType<typeof envelope>>();
        const first = deferred<ReturnType<typeof envelope>>();
        productsRequest.mockImplementation((params) => params.page === '2' ? second.promise : first.promise);
        fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
        await waitFor(() => expect(productsRequest).toHaveBeenCalledWith({ page: '2', lowStock: '' }));
        fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
        await waitFor(() => expect(productsRequest).toHaveBeenCalledTimes(3));
        expect(screen.getByText('Page 1 (loading)')).toBeInTheDocument();
        expect(screen.queryByText('Synthetic product 1')).not.toBeInTheDocument();
        const refreshed = envelope();
        refreshed.data.data.data[0].name = 'Refreshed first page';
        await act(async () => { first.resolve(refreshed); });
        await screen.findByText('Refreshed first page');
        const late = envelope(2);
        late.data.data.data[0].name = 'Late second page';
        await act(async () => { second.resolve(late); });
        await waitFor(() => expect(client.isFetching()).toBe(0));
        expect(screen.getByText('Refreshed first page')).toBeInTheDocument();
        expect(screen.queryByText('Late second page')).not.toBeInTheDocument();
        expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
        expect(httpPost).not.toHaveBeenCalled();
        expect(httpPut).not.toHaveBeenCalled();
    });

    it('recovers to page one when all products disappear without a request loop', async () => {
        const client = setup();
        await screen.findByText('Synthetic product 1');
        fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
        await screen.findByText('Synthetic product 51');
        productsRequest.mockImplementation(async (params) => envelope(Number(params.page), 0));
        act(() => { void client.invalidateQueries({ queryKey: ['inventory', 'products'] }); });
        await screen.findByText('Page 1 of 1');
        expect(screen.getByText('No products found')).toBeInTheDocument();
        await waitFor(() => expect(client.isFetching({ queryKey: ['inventory', 'products'] })).toBe(0));
        expect(productsRequest.mock.calls.map(([params]) => params.page)).toEqual(['1', '2', '2', '1']);
    });

    it('lets existing BatchList collect product options across real client envelopes without posting a receipt', async () => {
        localStorage.setItem('accessToken', 'synthetic-token');
        setup(<AuthProvider><BatchListPage /></AuthProvider>);
        await waitFor(() => expect(screen.getByRole('button', { name: '+ 登記批次進貨' })).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: '+ 登記批次進貨' }));
        expect(await screen.findByRole('option', { name: 'SKU-51 - Synthetic product 51' })).toHaveValue('synthetic-51');
        expect(screen.getByRole('option', { name: 'SKU-1 - Synthetic product 1' })).toHaveValue('synthetic-1');
        expect(productsRequest.mock.calls.map(([params]) => params.page)).toEqual(['1', '2']);
        expect(httpPost).not.toHaveBeenCalled();
        expect(httpPut).not.toHaveBeenCalled();
    });

    it('preserves the open product draft and current supplier through product refetch failure and retry', async () => {
        const supplier = { id: 'saved-supplier', name: 'Saved supplier' };
        const originalGet = httpGet.getMockImplementation()!;
        httpGet.mockImplementation((path, options) => path === '/inventory/suppliers'
            ? Promise.resolve({ data: { success: true, data: [supplier] } }) : originalGet(path, options));
        const first = envelope();
        first.data.data.data[0] = { ...product(1), supplierId: supplier.id, supplier };
        productsRequest.mockResolvedValueOnce(first);
        const client = setup();
        await screen.findByText('Synthetic product 1');
        fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]);
        fireEvent.change(screen.getByDisplayValue('Synthetic product 1'), { target: { value: 'Retained draft name' } });
        expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveValue(supplier.id);
        productsRequest.mockRejectedValueOnce(requestFailure(500));
        act(() => { void client.invalidateQueries({ queryKey: ['inventory', 'products'] }); });
        expect(await screen.findByRole('alert')).toHaveTextContent('500');
        expect(screen.getByDisplayValue('Retained draft name')).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveValue(supplier.id);
        productsRequest.mockResolvedValueOnce(first);
        fireEvent.click(screen.getByRole('button', { name: 'Retry products' }));
        await screen.findByText('Synthetic product 1');
        expect(screen.getByDisplayValue('Retained draft name')).toBeInTheDocument();
        expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveValue(supplier.id);
        expect(httpPost).not.toHaveBeenCalled();
        expect(httpPut).not.toHaveBeenCalled();
    });
});
