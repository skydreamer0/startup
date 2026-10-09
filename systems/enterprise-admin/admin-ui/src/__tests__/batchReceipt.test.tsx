import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@pharmasaas/types';
import BatchListPage from '../pages/Inventory/BatchListPage';
import { AuthProvider } from '../hooks/useAuth';
import type { User } from '../hooks/authContext';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../api/client', () => ({ default: http }));
const product: Product = { id: 'synthetic-product', sku: 'SYNTHETIC', name: 'Synthetic receipt product', stockQuantity: 0, safetyStock: 1, costPrice: '20', retailPrice: '30' };
const profile: User = { id: 'synthetic-actor', email: 'receipt@synthetic.test', fullName: 'Synthetic actor', roles: [], permissions: ['read:products', 'create:products', 'release:product_batches'] };
const clients: QueryClient[] = [];
function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    render(<AuthProvider><QueryClientProvider client={client}><BatchListPage /></QueryClientProvider></AuthProvider>);
    return client;
}
async function openReceipt() {
    const open = screen.getByRole('button', { name: '+ 登記批次進貨' });
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(open);
    await screen.findByRole('option', { name: 'SYNTHETIC - Synthetic receipt product' });
    fireEvent.change(screen.getByLabelText('商品'), { target: { value: product.id } });
    fireEvent.change(screen.getByLabelText('批號'), { target: { value: 'SYNTHETIC-LOT' } });
    fireEvent.change(screen.getByLabelText('到期日'), { target: { value: '2099-01-01' } });
    fireEvent.change(screen.getByLabelText('數量'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('進貨成本'), { target: { value: '20' } });
}
function selectRelease() { fireEvent.change(screen.getByLabelText('驗收狀態'), { target: { value: 'RELEASED' } }); }
function fillReason(value = '  Label and invoice inspected  ') { fireEvent.change(screen.getByLabelText('初次放行原因（必填）'), { target: { value } }); }
beforeEach(() => {
    vi.resetAllMocks();
    localStorage.setItem('accessToken', 'synthetic-token');
    profile.permissions = ['read:products', 'create:products', 'release:product_batches'];
    http.get.mockImplementation(async (path: string) => {
        if (path === '/auth/me') return { data: { success: true, data: profile } };
        if (path === '/inventory/products') return { data: { success: true, data: { total: 1, page: 1, limit: 50, data: [product] } } };
        if (path === '/product-batches') return { data: { success: true, data: [] } };
        throw new Error(`Unexpected synthetic request: ${path}`);
    });
    http.post.mockResolvedValue({ data: { success: true, data: { id: 'synthetic-batch' } } });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); localStorage.clear(); sessionStorage.clear(); });

describe('initial receipt release through real auth and API clients', () => {
    it('requires a release reason and posts the trimmed reason with the existing receipt contract', async () => {
        const client = setup();
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        await openReceipt(); selectRelease();
        expect(screen.getByLabelText('初次放行原因（必填）')).toBeRequired();
        expect(screen.getByRole('button', { name: '登記進貨' })).toBeDisabled();
        fillReason(); fireEvent.click(screen.getByRole('button', { name: '登記進貨' }));
        await waitFor(() => expect(http.post).toHaveBeenCalledWith('/product-batches', {
            productId: product.id, batchNumber: 'SYNTHETIC-LOT', expiryDate: '2099-01-01T00:00:00.000Z', quantity: 4, costPrice: 20,
            status: 'RELEASED', reason: 'Label and invoice inspected',
        }));
        await waitFor(() => expect(screen.queryByLabelText('初次放行原因（必填）')).not.toBeInTheDocument());
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['batches'] });
        expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'products'] });
    });
    it('keeps ordinary receipt available but disables release without its independent permission', async () => {
        profile.permissions = ['read:products', 'create:products']; setup(); await openReceipt();
        expect(screen.getByLabelText('驗收狀態')).toHaveValue('QUARANTINE');
        expect(screen.getByRole('option', { name: '已驗收可售' })).toBeDisabled();
        expect(screen.getByText(/缺少初次放行權限/)).toBeVisible();
        expect(screen.queryByLabelText('初次放行原因（必填）')).not.toBeInTheDocument();
        selectRelease();
        fireEvent.submit(screen.getByRole('button', { name: '登記進貨' }).closest('form')!);
        expect(http.post).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText('驗收狀態'), { target: { value: 'QUARANTINE' } });
        fireEvent.click(screen.getByRole('button', { name: '登記進貨' }));
        await waitFor(() => expect(http.post).toHaveBeenCalledWith('/product-batches', {
            productId: product.id, batchNumber: 'SYNTHETIC-LOT', expiryDate: '2099-01-01T00:00:00.000Z', quantity: 4, costPrice: 20, status: 'QUARANTINE',
        }));
    });
    it('does not open receipt for a reader even when that reader has release permission', async () => {
        profile.permissions = ['read:products', 'release:product_batches']; setup();
        await waitFor(() => expect(http.get).toHaveBeenCalledWith('/auth/me'));
        expect(screen.getByRole('button', { name: '+ 登記批次進貨' })).toBeDisabled();
        expect(screen.getByText(/缺少登記進貨權限/)).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: '+ 登記批次進貨' }));
        expect(screen.queryByLabelText('商品')).not.toBeInTheDocument();
        expect(http.post).not.toHaveBeenCalled();
    });
    it('rejects blank or overlong release reasons even if the form is submitted directly', async () => {
        setup(); await openReceipt(); selectRelease();
        const reason = screen.getByLabelText('初次放行原因（必填）');
        expect(reason).toHaveAttribute('maxLength', '1000');
        for (const value of ['', ' \t\n ', 'x'.repeat(1001)]) {
            fillReason(value);
            expect(screen.getByRole('button', { name: '登記進貨' })).toBeDisabled();
            fireEvent.submit(reason.closest('form')!);
            expect(http.post).not.toHaveBeenCalled();
        }
        fillReason('x'.repeat(1000));
        expect(screen.getByRole('button', { name: '登記進貨' })).toBeEnabled();
    });
    it('shows a server permission denial inline, preserves the draft and does not report receipt success', async () => {
        http.post.mockRejectedValueOnce({ response: { status: 403 } });
        const client = setup(); const invalidate = vi.spyOn(client, 'invalidateQueries');
        await openReceipt(); selectRelease(); fillReason();
        fireEvent.click(screen.getByRole('button', { name: '登記進貨' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('權限不足');
        expect(screen.getByLabelText('初次放行原因（必填）')).toHaveValue('  Label and invoice inspected  ');
        expect(screen.getByLabelText('批號')).toHaveValue('SYNTHETIC-LOT');
        expect(screen.getByLabelText('驗收狀態')).toHaveValue('RELEASED');
        expect(screen.getByRole('button', { name: '登記進貨' })).toBeEnabled();
        expect(invalidate).not.toHaveBeenCalled();
    });
    it('sends only one request for immediate repeated submits and blocks edits, cancel and reopening while pending', async () => {
        let resolve!: (value: unknown) => void;
        http.post.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
        setup(); await openReceipt(); selectRelease(); fillReason();
        const reason = screen.getByLabelText('初次放行原因（必填）');
        const form = reason.closest('form')!;
        act(() => { fireEvent.submit(form); fireEvent.submit(form); });
        expect(http.post).toHaveBeenCalledTimes(1);
        expect(reason).toBeDisabled();
        expect(screen.getByRole('button', { name: '登記中...' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '+ 登記批次進貨' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '取消' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: '取消' }));
        fireEvent.click(form.closest('.modal-overlay')!);
        fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
        expect(reason).toBeInTheDocument();
        fireEvent.submit(form);
        expect(http.post).toHaveBeenCalledTimes(1);
        await act(async () => resolve({ data: { success: true, data: { id: 'synthetic-batch' } } }));
        expect(screen.queryByLabelText('初次放行原因（必填）')).not.toBeInTheDocument();
    });
    it.each([
        [409, { response: { status: 409, data: { error: { message: 'Synthetic duplicate lot' } } } }, 'Synthetic duplicate lot'],
        [500, { response: { status: 500, data: { error: { message: 'Synthetic receipt failure' } } } }, 'Synthetic receipt failure'],
        ['network', new Error('Synthetic network failure'), '未能確認收貨成功'],
    ])('preserves failed receipt reason for %s without retrying or refreshing stock', async (_kind, failure, message) => {
        http.post.mockRejectedValueOnce(failure);
        const client = setup(); const invalidate = vi.spyOn(client, 'invalidateQueries');
        await openReceipt(); selectRelease(); fillReason();
        fireEvent.click(screen.getByRole('button', { name: '登記進貨' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(message);
        expect(screen.getByLabelText('初次放行原因（必填）')).toHaveValue('  Label and invoice inspected  ');
        expect(screen.getByLabelText('數量')).toHaveValue(4);
        expect(http.post).toHaveBeenCalledTimes(1); expect(invalidate).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: '取消' })).toBeEnabled();
    });
    it.each(['cancel', 'backdrop'])('clears a cancelled release draft using %s and sends nothing', async method => {
        setup(); await openReceipt(); selectRelease(); fillReason();
        if (method === 'cancel') fireEvent.click(screen.getByRole('button', { name: '取消' }));
        else fireEvent.click(screen.getByLabelText('初次放行原因（必填）').closest('.modal-overlay')!);
        expect(http.post).not.toHaveBeenCalled();
        await openReceipt();
        expect(screen.getByLabelText('驗收狀態')).toHaveValue('QUARANTINE'); selectRelease();
        expect(screen.getByLabelText('初次放行原因（必填）')).toHaveValue('');
        expect(screen.getByRole('button', { name: '登記進貨' })).toBeDisabled();
    });
    it.each(['QUARANTINE', 'BLOCKED'])('omits a previous release reason when receipt is submitted as %s', async status => {
        setup(); await openReceipt(); selectRelease(); fillReason();
        fireEvent.change(screen.getByLabelText('驗收狀態'), { target: { value: status } });
        expect(screen.queryByLabelText('初次放行原因（必填）')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '登記進貨' }));
        await waitFor(() => expect(http.post).toHaveBeenCalledWith('/product-batches', {
            productId: product.id, batchNumber: 'SYNTHETIC-LOT', expiryDate: '2099-01-01T00:00:00.000Z', quantity: 4, costPrice: 20, status,
        }));
    });
    it('names the modal, focuses its title and returns focus to the entry on cancel', async () => {
        setup(); await openReceipt();
        const dialog = screen.getByRole('dialog', { name: '登記批次進貨' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(screen.getByRole('heading', { name: '登記批次進貨' })).toHaveFocus();
        fireEvent(dialog, new Event('cancel', { cancelable: true }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: '+ 登記批次進貨' })).toHaveFocus();
        expect(http.post).not.toHaveBeenCalled();
    });
    it('focuses submission errors and keeps field helper and validation associations', async () => {
        http.post.mockRejectedValueOnce(new Error('Synthetic lost response'));
        setup(); await openReceipt(); selectRelease(); fillReason();
        expect(screen.getByLabelText('到期日')).toHaveAttribute('aria-describedby', 'receipt-expiry-help');
        expect(screen.getByLabelText('初次放行原因（必填）')).toHaveAttribute('aria-invalid', 'false');
        fireEvent.click(screen.getByRole('button', { name: '登記進貨' }));
        const error = await screen.findByRole('alert');
        expect(error).toHaveFocus();
        expect(error).toHaveTextContent('請勿直接重送');
        expect(screen.getByLabelText('批號')).toHaveValue('SYNTHETIC-LOT');
        expect(http.post).toHaveBeenCalledTimes(1);
    });
    it('retries product reads without submitting or clearing the receipt draft', async () => {
        const client = setup(); await openReceipt(); selectRelease(); fillReason();
        const original = http.get.getMockImplementation()!;
        http.get.mockImplementation((path: string) => path === '/inventory/products' ? Promise.reject({ response: { status: 403 } }) : original(path));
        await act(async () => { await client.invalidateQueries({ queryKey: ['inventory', 'products', 'batches'] }); });
        expect(await screen.findByRole('alert')).toHaveTextContent('權限不足');
        expect(screen.getByRole('button', { name: '登記進貨' })).toBeDisabled();
        http.get.mockImplementation(original);
        fireEvent.click(screen.getByRole('button', { name: '重新載入商品' }));
        await waitFor(() => expect(screen.getByRole('button', { name: '登記進貨' })).toBeEnabled());
        expect(screen.getByLabelText('商品')).toHaveValue(product.id);
        expect(screen.getByLabelText('批號')).toHaveValue('SYNTHETIC-LOT');
        expect(screen.getByLabelText('初次放行原因（必填）')).toHaveValue('  Label and invoice inspected  ');
        expect(http.post).not.toHaveBeenCalled();
    });
    it('distinguishes expired batch results after a failed refresh and recovers through an explicit read', async () => {
        const original = http.get.getMockImplementation()!;
        http.get.mockImplementation(async (path: string) => path === '/product-batches' ? { data: { success: true, data: [{ id: 'old-lot', batchNumber: 'OLD-RESULT', expiryDate: '2099-01-01', quantity: 2, costPrice: 20, status: 'QUARANTINE' }] } } : original(path));
        const client = setup(); await screen.findByText('OLD-RESULT');
        http.get.mockImplementation((path: string) => path === '/product-batches' ? Promise.reject(new Error('Synthetic refetch failure')) : original(path));
        await act(async () => { await client.invalidateQueries({ queryKey: ['batches'] }); });
        expect(await screen.findByRole('alert')).toHaveTextContent('先前結果已過期');
        expect(screen.queryByText('OLD-RESULT')).not.toBeInTheDocument();
        expect(screen.queryByText('目前沒有批號資料。')).not.toBeInTheDocument();
        http.get.mockImplementation(original);
        fireEvent.click(screen.getByRole('button', { name: '重新載入批次' }));
        expect(await screen.findByText('目前沒有批號資料。')).toBeVisible();
        expect(http.post).not.toHaveBeenCalled();
    });
    it('honors the existing wildcard permission without inferring authority from role names', async () => {
        profile.permissions = ['*']; setup(); await openReceipt();
        expect(screen.getByRole('option', { name: '已驗收可售' })).toBeEnabled();
        selectRelease(); fillReason(); expect(screen.getByRole('button', { name: '登記進貨' })).toBeEnabled();
    });
    it('disables receipt until the actual profile load resolves', async () => {
        let resolve!: (value: unknown) => void;
        const original = http.get.getMockImplementation()!;
        http.get.mockImplementation((path: string) => path === '/auth/me' ? new Promise(r => { resolve = r; }) : original(path));
        setup(); expect(screen.getByRole('button', { name: '+ 登記批次進貨' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: '+ 登記批次進貨' }));
        expect(screen.queryByLabelText('商品')).not.toBeInTheDocument();
        await act(async () => resolve({ data: { success: true, data: profile } }));
        expect(screen.getByRole('button', { name: '+ 登記批次進貨' })).toBeEnabled();
    });
});
