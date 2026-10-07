import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { ApiFailure, ApiSuccess, Product, Supplier } from '@pharmasaas/types';
import { inventoryApi } from '../api/inventory';
import ProductListPage from '../pages/Inventory/ProductListPage';
import SupplierListPage from '../pages/Inventory/SupplierListPage';

const { httpGet, httpPost, httpPut } = vi.hoisted(() => ({
    httpGet: vi.fn<(path: string) => Promise<{ data: ApiSuccess<unknown> }>>(),
    httpPost: vi.fn<(path: string, payload: unknown) => Promise<{ data: ApiSuccess<unknown> }>>(),
    httpPut: vi.fn<(path: string, payload: unknown) => Promise<{ data: ApiSuccess<unknown> }>>(),
}));
vi.mock('../api/client', () => ({ default: { get: httpGet, post: httpPost, put: httpPut } }));

const supplier: Supplier = { id: 'synthetic-supplier', name: 'Synthetic Supplier', email: 'supplier@example.test' };
const supplierResponse: ApiSuccess<Supplier[]> = { success: true, data: [supplier] };
const suppliersRequest = vi.fn<() => Promise<{ data: ApiSuccess<Supplier[]> }>>();
const product: Product = {
    id: 'synthetic-product', sku: 'SYNTHETIC-1', name: 'Synthetic Product',
    costPrice: '10', retailPrice: '20', stockQuantity: 0, safetyStock: 1,
    supplierId: supplier.id, supplier,
};

const clients: QueryClient[] = [];
function requestFailure(status: number) {
    return new AxiosError<ApiFailure>('Synthetic request failed', undefined, undefined, undefined, {
        status, statusText: 'Synthetic failure', headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() },
        data: { success: false, error: { code: 'SYNTHETIC_FAILURE', message: 'Synthetic request failed' } },
    });
}
const failures = [403, 500, 'offline', 'request failure'] as const;
function failureFor(kind: typeof failures[number]) {
    if (kind === 'offline') return new AxiosError('Network Error', 'ERR_NETWORK');
    if (kind === 'request failure') return new Error('Synthetic request failed');
    return requestFailure(kind);
}
function failureText(kind: typeof failures[number]) {
    return typeof kind === 'number' ? String(kind) : 'Check your connection';
}
function setup(page: ReactElement) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}>{page}</QueryClientProvider>);
    return client;
}
beforeEach(() => {
    vi.resetAllMocks();
    suppliersRequest.mockResolvedValue({ data: supplierResponse });
    httpGet.mockImplementation(async (path) => {
        if (path === '/inventory/suppliers') return suppliersRequest();
        if (path === '/inventory/products') return { data: { success: true, data: { data: [product], total: 1, page: 1, limit: 50 } } };
        if (path === '/tenants/me/plan') return { data: { success: true, data: { plan: 'free', features: [] } } };
        throw new Error(`Unexpected synthetic API request: ${path}`);
    });
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

describe('supplier list contract and consumers', () => {
    it('unwraps a real success envelope to Supplier[] at the client boundary', async () => {
        expectTypeOf<ReturnType<typeof inventoryApi.getSuppliers>>().toEqualTypeOf<Promise<Supplier[]>>();
        expect(await inventoryApi.getSuppliers()).toEqual([supplier]);
    });

    it('returns a genuine successful empty supplier array', async () => {
        suppliersRequest.mockResolvedValueOnce({ data: { success: true, data: [] } });
        expect(await inventoryApi.getSuppliers()).toEqual([]);
    });

    it.each(failures)('propagates the client %s failure rather than returning an empty array', async (kind) => {
        const error = failureFor(kind);
        suppliersRequest.mockRejectedValueOnce(error);
        await expect(inventoryApi.getSuppliers()).rejects.toBe(error);
    });

    it('shows the returned supplier in new and existing product options', async () => {
        setup(<ProductListPage />);
        await screen.findByText(product.name);
        fireEvent.click(screen.getByRole('button', { name: 'Add Product' }));
        expect(await screen.findByRole('option', { name: supplier.name })).toHaveValue(supplier.id);
        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(await screen.findByRole('option', { name: supplier.name })).toHaveValue(supplier.id);
        expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveValue(supplier.id);
    });

    it('shows the returned supplier in the supplier table', async () => {
        setup(<SupplierListPage />);
        expect(await screen.findByText(supplier.name)).toBeInTheDocument();
        expect(screen.queryByText('No suppliers found')).not.toBeInTheDocument();
    });

    it.each(failures)('keeps the original supplier visible and saved through %s and a non-submitting retry', async (kind) => {
        suppliersRequest.mockRejectedValueOnce(failureFor(kind));
        httpPut.mockResolvedValue({ data: { success: true, data: product } });
        setup(<ProductListPage />);
        await screen.findByText(product.name);
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveValue(supplier.id);
        expect(await screen.findByRole('alert')).toHaveTextContent(failureText(kind));
        expect(screen.queryByText('No suppliers found')).not.toBeInTheDocument();
        fireEvent.change(screen.getByDisplayValue(product.name), { target: { value: 'Draft Product' } });
        const other: Supplier = { id: 'synthetic-other', name: 'Another Supplier' };
        suppliersRequest.mockResolvedValueOnce({ data: { success: true, data: [other, supplier] } });
        fireEvent.click(screen.getByRole('button', { name: 'Retry suppliers' }));
        expect(httpPost).not.toHaveBeenCalled();
        expect(httpPut).not.toHaveBeenCalled();
        expect(await screen.findByRole('option', { name: supplier.name })).toHaveValue(supplier.id);
        expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveValue(supplier.id);
        expect(screen.getByDisplayValue('Draft Product')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
        await waitFor(() => expect(httpPut).toHaveBeenCalledWith(`/inventory/products/${product.id}`,
            expect.objectContaining({ supplierId: supplier.id, name: 'Draft Product' })));
    });

    it.each(failures)('shows the supplier %s error and recovers the table on retry', async (kind) => {
        suppliersRequest.mockRejectedValueOnce(failureFor(kind));
        setup(<SupplierListPage />);
        expect(await screen.findByRole('alert')).toHaveTextContent(failureText(kind));
        expect(screen.queryByText('No suppliers found')).not.toBeInTheDocument();
        expect(screen.queryByText('0 active suppliers')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry suppliers' }));
        expect(await screen.findByText(supplier.name)).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(httpPost).not.toHaveBeenCalled();
        expect(httpPut).not.toHaveBeenCalled();
    });

    it.each(['products', 'suppliers'])('distinguishes %s loading from successful empty', async (page) => {
        let resolve!: (response: { data: ApiSuccess<Supplier[]> }) => void;
        suppliersRequest.mockReturnValueOnce(new Promise((res) => { resolve = res; }));
        setup(page === 'products' ? <ProductListPage /> : <SupplierListPage />);
        if (page === 'products') fireEvent.click(screen.getByRole('button', { name: 'Add Product' }));
        expect(screen.getByText('Loading suppliers...', { selector: '[role="status"]' })).toBeInTheDocument();
        expect(screen.queryByText('No suppliers found')).not.toBeInTheDocument();
        if (page === 'products') expect(screen.getByRole('combobox', { name: 'Supplier' })).toBeDisabled();
        await act(async () => { resolve({ data: { success: true, data: [] } }); });
        expect(await screen.findByText('No suppliers found')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        if (page === 'products') {
            expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveValue('');
            expect(screen.getByRole('combobox', { name: 'Supplier' })).toBeEnabled();
        }
    });

    it.each(failures)('keeps a valid new-product draft through %s and retry without choosing the first supplier', async (kind) => {
        suppliersRequest.mockRejectedValueOnce(failureFor(kind));
        httpPost.mockResolvedValue({ data: { success: true, data: product } });
        setup(<ProductListPage />);
        fireEvent.click(screen.getByRole('button', { name: 'Add Product' }));
        const [sku, name] = screen.getAllByRole('textbox');
        fireEvent.change(sku, { target: { value: 'SYNTHETIC-NEW' } });
        fireEvent.change(name, { target: { value: 'New Draft Product' } });
        expect(await screen.findByRole('alert')).toHaveTextContent(failureText(kind));
        expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveValue('');
        expect(screen.queryByText('No suppliers found')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Retry suppliers' }));
        expect(await screen.findByRole('option', { name: supplier.name })).toHaveValue(supplier.id);
        expect(httpPost).not.toHaveBeenCalled();
        expect(httpPut).not.toHaveBeenCalled();
        expect(screen.getByRole('heading', { name: 'Add Product' })).toBeInTheDocument();
        expect(sku).toHaveValue('SYNTHETIC-NEW');
        expect(name).toHaveValue('New Draft Product');
        expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveValue('');
    });

    it.each(failures)('saves the original supplierId while the supplier %s error remains', async (kind) => {
        suppliersRequest.mockRejectedValueOnce(failureFor(kind));
        httpPut.mockResolvedValue({ data: { success: true, data: product } });
        setup(<ProductListPage />);
        await screen.findByText(product.name);
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        await screen.findByRole('alert');
        expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveValue(supplier.id);
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
        await waitFor(() => expect(httpPut).toHaveBeenCalledWith(`/inventory/products/${product.id}`,
            expect.objectContaining({ supplierId: supplier.id })));
        expect(httpPost).not.toHaveBeenCalled();
    });

    it('keeps and saves the existing supplier when the successful list is empty', async () => {
        suppliersRequest.mockResolvedValueOnce({ data: { success: true, data: [] } });
        httpPut.mockResolvedValue({ data: { success: true, data: product } });
        setup(<ProductListPage />);
        await screen.findByText(product.name);
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        await screen.findByText('No suppliers found');
        expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveValue(supplier.id);
        expect(screen.getByRole('option', { name: `${supplier.name} (current selection)` })).toHaveValue(supplier.id);
        fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
        await waitFor(() => expect(httpPut).toHaveBeenCalledWith(`/inventory/products/${product.id}`,
            expect.objectContaining({ supplierId: supplier.id })));
    });

    it('preserves the current selection and edited draft through a failed background refetch and retry', async () => {
        const other: Supplier = { id: 'synthetic-other', name: 'Another Supplier' };
        suppliersRequest.mockResolvedValueOnce({ data: { success: true, data: [supplier, other] } });
        const client = setup(<ProductListPage />);
        await screen.findByText(product.name);
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        await screen.findByRole('option', { name: other.name });
        fireEvent.change(screen.getByRole('combobox', { name: 'Supplier' }), { target: { value: other.id } });
        fireEvent.change(screen.getByDisplayValue(product.name), { target: { value: 'Changed Draft' } });
        suppliersRequest.mockRejectedValueOnce(requestFailure(500));
        await act(async () => { await client.invalidateQueries({ queryKey: ['inventory', 'suppliers'] }); });
        expect(await screen.findByRole('alert')).toHaveTextContent('500');
        expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveValue(other.id);
        expect(screen.getByDisplayValue('Changed Draft')).toBeInTheDocument();
        // Recovery no longer includes the chosen supplier: keep its ID, never silently replace it.
        fireEvent.click(screen.getByRole('button', { name: 'Retry suppliers' }));
        await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
        expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveValue(other.id);
        expect(screen.getByDisplayValue('Changed Draft')).toBeInTheDocument();
        expect(httpPost).not.toHaveBeenCalled();
        expect(httpPut).not.toHaveBeenCalled();
    });

    it.each(['products', 'suppliers'])('does not turn a failed %s refetch into successful-empty state', async (page) => {
        suppliersRequest.mockResolvedValueOnce({ data: { success: true, data: [] } });
        const client = setup(page === 'products' ? <ProductListPage /> : <SupplierListPage />);
        if (page === 'products') fireEvent.click(screen.getByRole('button', { name: 'Add Product' }));
        await screen.findByText('No suppliers found');
        suppliersRequest.mockRejectedValueOnce(requestFailure(500));
        await act(async () => { await client.invalidateQueries({ queryKey: ['inventory', 'suppliers'] }); });
        expect(await screen.findByRole('alert')).toHaveTextContent('500');
        expect(screen.queryByText('No suppliers found')).not.toBeInTheDocument();
    });

    it('retains cached supplier rows with an explicit failed-refresh state', async () => {
        const client = setup(<SupplierListPage />);
        await screen.findByText(supplier.name);
        suppliersRequest.mockRejectedValueOnce(new AxiosError('Network Error', 'ERR_NETWORK'));
        await act(async () => { await client.invalidateQueries({ queryKey: ['inventory', 'suppliers'] }); });
        expect(await screen.findByRole('alert')).toHaveTextContent('Check your connection');
        expect(screen.getByText(supplier.name)).toBeInTheDocument();
        expect(screen.getByText('Last loaded: 1 suppliers')).toBeInTheDocument();
        expect(screen.queryByText('No suppliers found')).not.toBeInTheDocument();
    });
});
