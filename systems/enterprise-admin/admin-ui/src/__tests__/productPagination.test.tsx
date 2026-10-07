import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiSuccess, Product } from '@pharmasaas/types';
import ProductListPage from '../pages/Inventory/ProductListPage';

type Params = { page?: string; lowStock?: string };
const { httpGet, httpPost, httpPut } = vi.hoisted(() => ({
    httpGet: vi.fn<(path: string, options?: { params?: Params }) => Promise<{ data: ApiSuccess<unknown> }>>(),
    httpPost: vi.fn(), httpPut: vi.fn(),
}));
vi.mock('../api/client', () => ({ default: { get: httpGet, post: httpPost, put: httpPut } }));

const product = (number: number): Product => ({
    id: `synthetic-${number}`, sku: `SKU-${number}`, name: `Synthetic product ${number}`,
    costPrice: '10', retailPrice: '20', stockQuantity: 0, safetyStock: 1,
});
function envelope(page = 1, total = 51) {
    const start = (page - 1) * 50;
    return { data: { success: true as const, data: {
        total, page, limit: 50,
        data: Array.from({ length: Math.max(0, Math.min(50, total - start)) }, (_, index) => product(start + index + 1)),
    } } };
}
const clients: QueryClient[] = [];
function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    render(<QueryClientProvider client={client}><ProductListPage /></QueryClientProvider>);
    return client;
}
beforeEach(() => {
    vi.resetAllMocks();
    httpGet.mockImplementation(async (path, options) => {
        if (path === '/inventory/products') return envelope(Number(options?.params?.page ?? 1));
        if (path === '/inventory/suppliers') return { data: { success: true, data: [] } };
        if (path === '/tenants/me/plan') return { data: { success: true, data: { plan: 'free', features: [] } } };
        throw new Error(`Unexpected synthetic request: ${path}`);
    });
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

describe('product list pagination through the real inventory client', () => {
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
});
