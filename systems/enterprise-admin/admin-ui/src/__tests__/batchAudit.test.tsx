import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BatchAuditPanel from '../pages/Inventory/BatchAuditPanel';
import type { ProductBatch } from '../api/batches';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../api/client', () => ({ default: http }));
const batch: ProductBatch = { id: 'batch', productId: 'product', tenantId: 'tenant', batchNumber: 'LOT', expiryDate: '2099-01-01T00:00:00Z', quantity: 4, status: 'QUARANTINE', costPrice: '20', receivedAt: '2026-01-01T00:00:00Z' };
const clients: QueryClient[] = [];
function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
    const close = vi.fn();
    render(<QueryClientProvider client={client}><BatchAuditPanel batch={batch} onClose={close} /></QueryClientProvider>);
    return { close, client };
}
beforeEach(() => {
    vi.resetAllMocks();
    http.get.mockResolvedValue({ data: { success: true, data: { items: [], nextCursor: null } } });
    http.post.mockResolvedValue({ data: { success: true, data: batch } });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });
function fillReason() { fireEvent.change(screen.getByLabelText('更正原因（必填）'), { target: { value: '  Verified invoice  ' } }); }

describe('batch correction UI through real API clients', () => {
    it('uses the dedicated status endpoint and a required reason', async () => {
        setup();
        expect(screen.getByRole('button', { name: '保存更正與稽核紀錄' })).toBeDisabled();
        fillReason(); fireEvent.change(screen.getByLabelText('變更後狀態'), { target: { value: 'RELEASED' } });
        fireEvent.click(screen.getByRole('button', { name: '保存更正與稽核紀錄' }));
        await waitFor(() => expect(http.post).toHaveBeenCalledWith('/product-batches/batch/status', { status: 'RELEASED', reason: 'Verified invoice' }));
        expect(await screen.findByText('更正已保存，並留下不可覆寫的稽核紀錄')).toBeVisible();
    });
    it('shows clear permission denial and preserves the draft without false success', async () => {
        http.post.mockRejectedValue({ response: { status: 403 } }); setup(); fillReason();
        fireEvent.click(screen.getByRole('button', { name: '保存更正與稽核紀錄' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('權限不足');
        expect(screen.queryByText('更正已保存，並留下不可覆寫的稽核紀錄')).not.toBeInTheDocument();
        expect(screen.getByLabelText('更正原因（必填）')).toHaveValue('  Verified invoice  ');
    });
    it('blocks repeat submission and close until the request settles', async () => {
        let resolve!: (value: unknown) => void;
        http.post.mockImplementation(() => new Promise(r => { resolve = r; }));
        const { close } = setup(); fillReason();
        fireEvent.click(screen.getByRole('button', { name: '保存更正與稽核紀錄' }));
        expect(screen.getByRole('button', { name: '保存中…' })).toBeDisabled();
        fireEvent.click(screen.getByRole('button', { name: '保存中…' }));
        fireEvent.click(screen.getByRole('button', { name: '關閉' }));
        expect(close).not.toHaveBeenCalled(); expect(http.post).toHaveBeenCalledTimes(1);
        await act(async () => resolve({ data: { success: true, data: batch } }));
    });
    it('sends precise cost and expiry corrections through their own routes', async () => {
        setup(); fireEvent.change(screen.getByLabelText('更正項目'), { target: { value: 'COST' } });
        fireEvent.change(screen.getByLabelText('更正後成本'), { target: { value: '22.1234' } }); fillReason();
        fireEvent.click(screen.getByRole('button', { name: '保存更正與稽核紀錄' }));
        await waitFor(() => expect(http.post).toHaveBeenCalledWith('/product-batches/batch/cost-corrections', { costPrice: 22.1234, reason: 'Verified invoice' }));
        await waitFor(() => expect(screen.getByRole('button', { name: '關閉' })).toBeEnabled());
        fireEvent.change(screen.getByLabelText('更正項目'), { target: { value: 'EXPIRY' } });
        fireEvent.change(screen.getByLabelText('更正後到期日'), { target: { value: '2099-02-01' } }); fillReason();
        fireEvent.click(screen.getByRole('button', { name: '保存更正與稽核紀錄' }));
        await waitFor(() => expect(http.post).toHaveBeenCalledWith('/product-batches/batch/expiry-corrections', { expiryDate: '2099-02-01T00:00:00.000Z', reason: 'Verified invoice' }));
    });
    it('distinguishes history errors from empty results and offers retry', async () => {
        http.get.mockRejectedValueOnce(new Error('Offline')); setup();
        expect(await screen.findByRole('alert')).toHaveTextContent('無法載入更正歷史');
        expect(screen.queryByText('目前沒有更正紀錄')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '重新載入歷史' }));
        expect(await screen.findByText('目前沒有更正紀錄')).toBeVisible();
    });
    it('renders initial release as a receipt event without inventing a before state', async () => {
        http.get.mockResolvedValueOnce({ data: { success: true, data: { items: [{ id: 'initial', actorId: 'trusted-staff', operation: 'INITIAL_RELEASE', before: { exists: false }, after: { status: 'RELEASED', expiryDate: '2099-01-01T00:00:00Z', costPrice: '20' }, reason: 'Label inspected', createdAt: '2026-10-08T16:00:00Z' }], nextCursor: null } } });
        setup(); expect(await screen.findByText('尚未收貨 → 已驗收可售')).toBeVisible();
        expect(screen.getByText(/初次放行/)).toBeVisible();
        expect(screen.queryByText(/undefined/)).not.toBeInTheDocument();
    });
    it('renders actor reason before after and retrieves older history with its cursor', async () => {
        http.get.mockResolvedValueOnce({ data: { success: true, data: { items: [{ id: 'change', actorId: 'synthetic-staff', operation: 'COST', before: { costPrice: '20' }, after: { costPrice: '22' }, reason: 'Verified invoice', createdAt: '2026-10-08T16:00:00Z' }], nextCursor: 'change' } } });
        setup(); expect(await screen.findByText('$20 → $22')).toBeVisible();
        expect(screen.getByText(/synthetic-staff/)).toBeVisible(); expect(screen.getByText('原因：Verified invoice')).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: '更早的紀錄' }));
        await waitFor(() => expect(http.get).toHaveBeenCalledWith('/product-batches/batch/history', { params: { cursor: 'change' } }));
    });
});
