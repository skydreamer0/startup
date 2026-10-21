import '@testing-library/jest-dom/vitest';
import { Component, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BatchListPage from '../pages/Inventory/BatchListPage';
import { AuthContext } from '../hooks/authContext';
import { parseReceiptProductPage } from '../api/receiptProducts';

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), delete: vi.fn() }));
vi.mock('../api/client', () => ({ default: http }));
const product = { id: 'owned-first', sku: 'SYNTHETIC-FIRST', name: '合成第一頁商品', stockQuantity: 0, safetyStock: 1, costPrice: '10', retailPrice: '20' };
const second = { ...product, id: 'owned-last', sku: 'SYNTHETIC-LAST', name: '合成後續頁商品' };
const clients: QueryClient[] = [];
let products: (page: number) => Promise<unknown>;
class CrashBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <p role="alert">頁面崩潰</p> : this.props.children; }
}
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const permissions = ['read:products', 'create:products'];
  const result = render(<AuthContext.Provider value={{ user: { id: 'synthetic-reader', email: 'batch@synthetic.test', fullName: 'Synthetic reader', roles: [], permissions }, loading: false, login: async () => {}, demoLogin: () => {}, logout: () => {}, hasPermission: permission => permissions.includes(permission) }}><QueryClientProvider client={client}><CrashBoundary><BatchListPage /></CrashBoundary></QueryClientProvider></AuthContext.Provider>);
  const opener = screen.getByRole('button', { name: '+ 登記批次進貨' }); opener.focus(); fireEvent.click(opener);
  return { ...result, client, opener };
}
beforeEach(() => {
  vi.resetAllMocks();
  products = async page => ({ total: 2, page, limit: 1, data: [page === 1 ? product : second] });
  http.get.mockImplementation(async (path: string, options?: { params?: { page?: string } }) => {
    if (path === '/product-batches') return { data: { success: true, data: [] } };
    if (path === '/inventory/products') return { data: { success: true, data: await products(Number(options?.params?.page ?? 1)) } };
    throw new Error('Unexpected synthetic read');
  });
});
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.restoreAllMocks(); });

describe('existing batch form read boundary and cancellation', () => {
  it.each([
    undefined, null, [], { total: -1, page: 1, limit: 50, data: [] },
    { total: 1, page: 1, limit: 0, data: [product] },
    { total: 1, page: 1, limit: 50, data: {} },
    { total: 0, page: 1, limit: 50, data: [product] },
    { total: 2, page: 1, limit: 1, data: [product, second] },
    { total: 2, page: 1, limit: 50, data: [product, product] },
    { total: 1, page: 1, limit: 50, data: [{ ...product, id: '' }] },
    { total: 1, page: 1, limit: 50, data: [{ ...product, sku: null }] },
    { total: 1, page: 1, limit: 50, data: [{ ...product, name: '  ' }] },
  ])('rejects malformed choice/page data without reflecting response values', value => {
    expect(() => parseReceiptProductPage(value, 1)).toThrow('可收貨商品資料格式不符，請重新載入。');
  });
  it('projects only identity/visible label and accepts a genuine empty result', () => {
    expect(parseReceiptProductPage({ total: 1, page: 1, limit: 50, data: [product] }, 1).data).toEqual([{ id: product.id, sku: product.sku, name: product.name }]);
    expect(parseReceiptProductPage({ total: 0, page: 1, limit: 50, data: [] }, 1).data).toEqual([]);
  });
  it.each(['repeated row', 'early empty'])('rejects a non-progressing %s later page before publishing partial choices', async mode => {
    products = async page => ({ total: 2, page, limit: 1, data: page === 1 || mode === 'repeated row' ? [product] : [] });
    setup();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('無法載入商品'));
    expect(screen.queryByRole('option', { name: 'SYNTHETIC-FIRST - 合成第一頁商品' })).not.toBeInTheDocument();
    expect(http.get.mock.calls.filter(([path]) => path === '/inventory/products')).toHaveLength(2);
    expect(http.post).not.toHaveBeenCalled();
  });
  it('selects a real later-page choice then cancels without a write and restores entry focus', async () => {
    const { opener } = setup();
    await screen.findByRole('option', { name: 'SYNTHETIC-LAST - 合成後續頁商品' });
    fireEvent.change(screen.getByLabelText('商品'), { target: { value: second.id } });
    expect(screen.getByLabelText('商品')).toHaveValue(second.id);
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(opener).toHaveFocus();
    expect(http.post).not.toHaveBeenCalled(); expect(http.delete).not.toHaveBeenCalled();
    expect(http.get.mock.calls.filter(([path]) => path === '/inventory/products').map(([, options]) => options.params.page)).toEqual(['1', '2']);
  });
  it.each([
    ['null row', { total: 1, page: 1, limit: 50, data: [null] }],
    ['object label', { total: 1, page: 1, limit: 50, data: [{ ...product, name: { injected: 'not a name' } }] }],
    ['missing total', { page: 1, limit: 50, data: [] }],
    ['wrong page', { total: 1, page: 2, limit: 50, data: [product] }],
    ['fractional total', { total: 0.5, page: 1, limit: 50, data: [] }],
  ])('keeps malformed %s inside the form read error and permits a safe retry', async (_name, value) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    products = async () => value; setup();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('無法載入商品'));
    expect(screen.queryByText('頁面崩潰')).not.toBeInTheDocument();
    expect(screen.queryByText('目前沒有可收貨商品，請先建立商品資料。')).not.toBeInTheDocument();
    expect(screen.getByLabelText('商品')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('批號'), { target: { value: 'SYNTHETIC-PRESERVED' } });
    products = async page => ({ total: 2, page, limit: 1, data: [page === 1 ? product : second] });
    fireEvent.click(screen.getByRole('button', { name: '重新載入商品' }));
    await screen.findByRole('option', { name: 'SYNTHETIC-LAST - 合成後續頁商品' });
    expect(screen.getByLabelText('批號')).toHaveValue('SYNTHETIC-PRESERVED');
    expect(screen.getByLabelText('驗收狀態')).toHaveValue('QUARANTINE');
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(http.post).not.toHaveBeenCalled(); expect(http.delete).not.toHaveBeenCalled();
  });
});

for (const field of ['total', 'limit'] as const) it(`rejects changing pagination ${field} without publishing partial choices`, async () => {
    products = async page => page === 1 ? {total:2,page,limit:1,data:[product]} : {total:2,page,limit:1,data:[second],[field]:3};
    setup(); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('無法載入商品'));
    expect(screen.getByLabelText('商品')).toBeDisabled(); expect(http.post).not.toHaveBeenCalled();
});
