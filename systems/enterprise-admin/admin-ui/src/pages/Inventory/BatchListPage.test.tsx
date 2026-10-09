import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inventoryApi } from '../../api/inventory';
import { batchesApi } from '../../api/batches';
import BatchListPage from './BatchListPage';
import { AuthContext } from '../../hooks/authContext';

vi.mock('../../api/inventory', () => ({ inventoryApi: { getProducts: vi.fn() } }));
vi.mock('../../api/batches', () => ({ batchesApi: { getAll: vi.fn(), create: vi.fn() } }));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const permissions = ['read:products', 'create:products'];
  render(<AuthContext.Provider value={{
    user: { id: 'synthetic-reader', email: 'receipt@synthetic.test', fullName: 'Synthetic reader', roles: [], permissions },
    loading: false, login: async () => {}, demoLogin: () => {}, logout: () => {}, hasPermission: permission => permissions.includes(permission),
  }}><QueryClientProvider client={client}><BatchListPage /></QueryClientProvider></AuthContext.Provider>);
  return invalidate;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(batchesApi.getAll).mockResolvedValue({ data: [] });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('Batch receipt screen', () => {
  it('loads all product pages and posts a complete date with quarantine as the safe default', async () => {
    vi.mocked(inventoryApi.getProducts)
      .mockResolvedValueOnce({ total: 2, page: 1, limit: 1, data: [{ id: 'first', sku: 'FIRST', name: 'First', costPrice: 40, retailPrice: 100, stockQuantity: 0, safetyStock: 1 }] })
      .mockResolvedValueOnce({ total: 2, page: 2, limit: 1, data: [{ id: 'second', sku: 'SECOND', name: 'Second', costPrice: 40, retailPrice: 100, stockQuantity: 0, safetyStock: 1 }] });
    vi.mocked(batchesApi.create).mockResolvedValue({ data: { id: 'receipt' } });
    const invalidate = setup();
    fireEvent.click(screen.getByRole('button', { name: '+ 登記批次進貨' }));
    await screen.findByRole('option', { name: 'SECOND - Second' });
    fireEvent.change(screen.getByLabelText('商品'), { target: { value: 'second' } });
    fireEvent.change(screen.getByLabelText('批號'), { target: { value: 'LOT-2' } });
    fireEvent.change(screen.getByLabelText('到期日'), { target: { value: '2099-02-01' } });
    fireEvent.change(screen.getByLabelText('數量'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('進貨成本'), { target: { value: '40' } });
    expect(screen.getByLabelText('驗收狀態')).toHaveValue('QUARANTINE');
    fireEvent.click(screen.getByRole('button', { name: '登記進貨' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: '登記批次進貨' })).not.toBeInTheDocument());
    expect(batchesApi.create).toHaveBeenCalledExactlyOnceWith({ productId: 'second', batchNumber: 'LOT-2', expiryDate: '2099-02-01T00:00:00.000Z', quantity: 3, costPrice: 40, status: 'QUARANTINE' });
    expect(inventoryApi.getProducts).toHaveBeenNthCalledWith(2, { page: '2' });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['inventory', 'products'] });
  });
  it('shows expiry-day stock as unusable at Taipei midnight and distinguishes quarantined stock', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T16:00:00Z'));
    vi.mocked(inventoryApi.getProducts).mockResolvedValue({ total: 0, page: 1, limit: 50, data: [] });
    vi.mocked(batchesApi.getAll).mockResolvedValue({ data: [
      { id: 'expiry', batchNumber: 'EXPIRY', expiryDate: '2026-10-06T00:00:00Z', quantity: 1, costPrice: 40, status: 'RELEASED' },
      { id: 'quarantine', batchNumber: 'UNREVIEWED', expiryDate: '2099-02-01T00:00:00Z', quantity: 3, costPrice: 40, status: 'QUARANTINE' },
    ] });
    setup();
    expect(await screen.findByText('到期不可出庫')).toBeVisible();
    expect(screen.getByText('待驗收隔離')).toBeVisible();
  });
  it('reports a failed batch query instead of claiming empty inventory', async () => {
    vi.mocked(inventoryApi.getProducts).mockResolvedValue({ total: 0, page: 1, limit: 50, data: [] });
    vi.mocked(batchesApi.getAll).mockRejectedValue(new Error('Request failed'));
    setup();
    expect(await screen.findByRole('alert')).toHaveTextContent('無法載入批次資料');
    expect(screen.queryByText('目前沒有批號資料。')).not.toBeInTheDocument();
  });
});
