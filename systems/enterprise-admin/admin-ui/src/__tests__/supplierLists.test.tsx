import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
        if (path === '/inventory/products') return { data: { success: true, data: { data: [product], total: 1 } } };
        if (path === '/tenants/me/plan') return { data: { success: true, data: { plan: 'free', features: [] } } };
        throw new Error(`Unexpected synthetic API request: ${path}`);
    });
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

describe('supplier list contract and consumers', () => {
    it('unwraps a real success envelope to Supplier[] at the client boundary', async () => {
        expect(await inventoryApi.getSuppliers()).toEqual([supplier]);
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

    it('keeps the original supplier visible and saved through a 403 and a non-submitting retry', async () => {
        suppliersRequest.mockRejectedValueOnce(requestFailure(403));
        httpPut.mockResolvedValue({ data: { success: true, data: product } });
        setup(<ProductListPage />);
        await screen.findByText(product.name);
        fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
        expect(screen.getByRole('combobox', { name: 'Supplier' })).toHaveValue(supplier.id);
        expect(await screen.findByRole('alert')).toHaveTextContent('403');
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

    it('shows a supplier permission error instead of a successful empty table', async () => {
        suppliersRequest.mockRejectedValueOnce(requestFailure(403));
        setup(<SupplierListPage />);
        expect(await screen.findByRole('alert')).toHaveTextContent('403');
        expect(screen.queryByText('No suppliers found')).not.toBeInTheDocument();
    });
});
