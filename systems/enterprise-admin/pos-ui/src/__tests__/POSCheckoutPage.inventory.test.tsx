import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosHeaders, type AxiosResponse } from 'axios';
import type { ApiSuccess } from '@pharmasaas/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import POSCheckoutPage from '../pages/POSCheckoutPage';
import { posApi } from '../api/pos';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
import { checkoutPayloadHash } from '../services/checkoutPayloadHash';

vi.mock('../api/pos', () => ({ posApi: {
  getCheckoutContext: vi.fn(), checkout: vi.fn(), getCheckoutCommand: vi.fn(),
  getCategories: vi.fn(), getStaff: vi.fn(), getProducts: vi.fn(), getHotRecommendations: vi.fn(),
  getRecommendations: vi.fn(), getReorderForecast: vi.fn(),
  getTodayOrders: vi.fn(), refundOrder: vi.fn(),
} }));
vi.mock('../hooks/useShift', () => ({ useShift: () => ({
  activeShift: { id: 'shift-1', staff: { fullName: 'Synthetic cashier' } },
}) }));
vi.mock('../hooks/useBarcodeScanner', () => ({ useBarcodeScanner: () => vi.fn() }));
vi.mock('../hooks/useCustomerDisplay', () => ({ useCustomerDisplay: vi.fn(), openCustomerDisplay: vi.fn() }));
vi.mock('../components/OfflineStatus', () => ({ default: () => null }));
vi.mock('../components/PrinterStatus', () => ({ default: () => null }));
vi.mock('../components/CustomerLookupPanel', () => ({ default: () => null }));
vi.mock('../components/CartPanel', () => ({ default: ({ onCheckout }: { onCheckout: () => void }) =>
  <button onClick={onCheckout}>開始結帳</button>,
}));
vi.mock('../components/PaymentModal', () => ({ default: ({ onConfirm }: { onConfirm: () => void }) =>
  <button onClick={onConfirm}>確認結帳</button>,
}));
vi.mock('../components/ReceiptModal', () => ({ default: () => <div>已確認的收據</div> }));

const scope = 'tenant-1:cashier-1';
const otherScope = 'tenant-2:cashier-2';
const product = { id: 'product-1', name: 'Synthetic product', sku: 'SYNTHETIC', retailPrice: 100, stockQuantity: 3 };
const checkoutResult = { id: 'order-1', orderNumber: 'SYNTHETIC-1', totalAmount: '100', paymentMethod: 'CASH', items: [{ productId: product.id, quantity: 1, unitPrice: '100', finalUnitPrice: '100' }] };
const order = { ...checkoutResult, status: 'completed', discountAmount: 0, createdAt: '2026-10-08T12:00:00Z', items: [{ id: 'item-1', productId: product.id, product: { id: product.id, name: product.name, sku: product.sku }, quantity: 1, unitPrice: '100', finalUnitPrice: '100' }] };
const productKey = (keyScope = scope, search = '', category: string | null = null) => ['pos-products', keyScope, search, category];
const clients: QueryClient[] = [];

function response<T>(data: T): AxiosResponse<ApiSuccess<T>> {
  return {
    data: { success: true, data },
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  };
}
function renderPage(client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })) {
  if (!clients.includes(client)) clients.push(client);
  const view = render(<QueryClientProvider client={client}><POSCheckoutPage /></QueryClientProvider>);
  return { client, ...view };
}
async function checkout() {
  fireEvent.click(screen.getByRole('button', { name: '開始結帳' }));
  fireEvent.click(await screen.findByRole('button', { name: '確認結帳' }));
}
async function openRefund() {
  fireEvent.click(screen.getByRole('button', { name: '📋 訂單 (F7)' }));
  fireEvent.click(await screen.findByText(order.orderNumber));
  fireEvent.click(screen.getByRole('button', { name: '退款此訂單' }));
  expect(screen.getByText(/此操作只登記退款，不會增加庫存/)).toBeInTheDocument();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); vi.stubGlobal('crypto', webcrypto);
  useCheckoutRecoveryStore.setState({ scope: null, pending: null });
  useCartStore.setState({ items: [{ product, quantity: 1, discountRate: 0 }], orderDiscountAmount: 0, orderDiscountNote: '', paymentMethod: 'CASH', currentSalesStaffId: 'cashier-1', heldCarts: [] });
  vi.mocked(posApi.getCheckoutContext).mockResolvedValue(response({ tenantId: 'tenant-1', userId: 'cashier-1' }) as Awaited<ReturnType<typeof posApi.getCheckoutContext>>);
  vi.mocked(posApi.getCategories).mockResolvedValue(response([]));
  vi.mocked(posApi.getStaff).mockResolvedValue(response([]));
  vi.mocked(posApi.getProducts).mockResolvedValue(response([product]) as Awaited<ReturnType<typeof posApi.getProducts>>);
  vi.mocked(posApi.getHotRecommendations).mockResolvedValue(response([]));
  vi.mocked(posApi.getReorderForecast).mockResolvedValue(response([]));
  vi.mocked(posApi.checkout).mockResolvedValue(response(checkoutResult) as Awaited<ReturnType<typeof posApi.checkout>>);
  vi.mocked(posApi.getTodayOrders).mockResolvedValue(response([order]) as Awaited<ReturnType<typeof posApi.getTodayOrders>>);
  vi.mocked(posApi.refundOrder).mockResolvedValue(response({ ...order, status: 'refunded' }) as Awaited<ReturnType<typeof posApi.refundOrder>>);
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); });

describe('POS inventory refresh after confirmed mutations (synthetic API, real query cache)', () => {
  it('refetches confirmed checkout stock and invalidates every same-scope search/category cache only', async () => {
    const { client } = renderPage();
    expect(await screen.findByText('✓ 3 件')).toBeInTheDocument();
    const variants = [productKey(scope, 'vitamin'), productKey(scope, '', 'category-1'), productKey(scope, 'vitamin', 'category-1')];
    variants.forEach((key) => client.setQueryData(key, [product]));
    client.setQueryData(productKey(otherScope), [product]);
    vi.mocked(posApi.getProducts).mockResolvedValue(response([{ ...product, stockQuantity: 2 }]) as Awaited<ReturnType<typeof posApi.getProducts>>);

    await checkout();

    expect(await screen.findByText('✓ 2 件')).toBeInTheDocument();
    expect(screen.getByText('已確認的收據')).toBeInTheDocument();
    variants.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true));
    expect(client.getQueryState(productKey(otherScope))?.isInvalidated).toBe(false);
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCheckoutRecoveryStore.getState().pending).toBeNull();
    expect(posApi.getHotRecommendations).toHaveBeenCalledTimes(2);
    expect(posApi.getReorderForecast).toHaveBeenCalledTimes(2);
    fireEvent.change(screen.getByTestId('product-search-input'), { target: { value: 'vitamin' } });
    await waitFor(() => expect(posApi.getProducts).toHaveBeenCalledWith('vitamin', undefined));
    await waitFor(() => expect(client.getQueryData(productKey(scope, 'vitamin'))).toEqual([{ ...product, stockQuantity: 2 }]));
  });

  it('removes a sold-out product using the server response, without estimating stock locally', async () => {
    renderPage(); await screen.findByText('✓ 3 件');
    vi.mocked(posApi.getProducts).mockResolvedValue(response([]));
    await checkout();
    expect(await screen.findByText('沒有符合條件的商品')).toBeInTheDocument();
    expect(screen.queryByTestId('product-card-product-1')).not.toBeInTheDocument();
  });

  it.each([
    ['unknown transport', new Error('Lost response'), 'unknown'],
    ['rejected checkout', { response: { status: 400 } }, 'unknown'],
    ['conflicting command', { response: { status: 409 } }, 'conflict'],
  ])('does not refresh or claim success after %s', async (_name, failure, status) => {
    vi.mocked(posApi.checkout).mockRejectedValue(failure);
    const { client } = renderPage(); await screen.findByText('✓ 3 件');
    await checkout();
    await waitFor(() => expect(useCheckoutRecoveryStore.getState().pending?.status).toBe(status));
    expect(posApi.getProducts).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(productKey())?.isInvalidated).toBe(false);
    expect(screen.queryByText('已確認的收據')).not.toBeInTheDocument();
    expect(screen.queryByText('結帳完成')).not.toBeInTheDocument();
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(localStorage.getItem(`pos-checkout-intent-v1:${scope}`)).not.toBeNull();
  });

  it.each(['query', 'replay'] as const)('refreshes stock only after the frozen command is confirmed by %s', async (mode) => {
    vi.mocked(posApi.checkout).mockRejectedValueOnce(new Error('Lost response'));
    renderPage(); await screen.findByText('✓ 3 件');
    await checkout();
    await waitFor(() => expect(useCheckoutRecoveryStore.getState().pending?.status).toBe('unknown'));
    const payload = vi.mocked(posApi.checkout).mock.calls[0][0];
    expect(posApi.getProducts).toHaveBeenCalledTimes(1);
    vi.mocked(posApi.getProducts).mockResolvedValue(response([{ ...product, stockQuantity: 1 }]) as Awaited<ReturnType<typeof posApi.getProducts>>);
    if (mode === 'query') {
      vi.mocked(posApi.getCheckoutCommand).mockResolvedValue(response({ commandId: payload.commandId, status: 'SUCCEEDED', payloadHash: await checkoutPayloadHash(payload), result: checkoutResult }) as Awaited<ReturnType<typeof posApi.getCheckoutCommand>>);
      fireEvent.click(screen.getByRole('button', { name: '查詢原訂單' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: '重送同一意圖' }));
    }
    expect(await screen.findByText('✓ 1 件')).toBeInTheDocument();
    expect(screen.getByText('已確認的收據')).toBeInTheDocument();
    expect(useCheckoutRecoveryStore.getState().pending).toBeNull();
    if (mode === 'replay') expect(vi.mocked(posApi.checkout).mock.calls[1][0]).toEqual(payload);
    else expect(posApi.getCheckoutCommand).toHaveBeenCalledWith(payload.commandId);
  });

  it.each(['UNKNOWN', 'mismatched hash', 'known conflict'] as const)('keeps %s lookup frozen without refreshing inventory', async (outcome) => {
    vi.mocked(posApi.checkout).mockRejectedValueOnce(outcome === 'known conflict' ? { response: { status: 409 } } : new Error('Lost response'));
    renderPage(); await screen.findByText('✓ 3 件');
    await checkout();
    await waitFor(() => expect(useCheckoutRecoveryStore.getState().pending?.status).toBe(outcome === 'known conflict' ? 'conflict' : 'unknown'));
    const payload = vi.mocked(posApi.checkout).mock.calls[0][0];
    vi.mocked(posApi.getCheckoutCommand).mockResolvedValue(response(outcome === 'UNKNOWN'
      ? { commandId: payload.commandId, status: 'UNKNOWN' }
      : { commandId: payload.commandId, status: 'SUCCEEDED', payloadHash: outcome === 'mismatched hash' ? 'different' : await checkoutPayloadHash(payload), result: checkoutResult }) as Awaited<ReturnType<typeof posApi.getCheckoutCommand>>);
    fireEvent.click(screen.getByRole('button', { name: '查詢原訂單' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '查詢原訂單' })).toBeEnabled());
    expect(posApi.getProducts).toHaveBeenCalledTimes(1);
    expect(useCheckoutRecoveryStore.getState().pending?.payload).toEqual(payload);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(screen.queryByText('已確認的收據')).not.toBeInTheDocument();
  });

  it('refreshes a late confirmed sale without clearing a newer cart', async () => {
    const sale = deferred<Awaited<ReturnType<typeof posApi.checkout>>>();
    vi.mocked(posApi.checkout).mockReturnValue(sale.promise);
    renderPage(); await screen.findByText('✓ 3 件');
    await checkout();
    act(() => { useCartStore.setState({ items: [{ product, quantity: 2, discountRate: 0 }], orderDiscountNote: 'new draft' }); });
    vi.mocked(posApi.getProducts).mockResolvedValue(response([{ ...product, stockQuantity: 2 }]) as Awaited<ReturnType<typeof posApi.getProducts>>);
    await act(async () => { sale.resolve(response(checkoutResult) as Awaited<ReturnType<typeof posApi.checkout>>); });
    await screen.findByText('✓ 2 件');
    expect(useCartStore.getState().items[0].quantity).toBe(2);
    expect(useCartStore.getState().orderDiscountNote).toBe('new draft');
    expect(useCheckoutRecoveryStore.getState().pending).toBeNull();
  });

  it('does not load cached tenant stock or fetch products before authenticated context is known', async () => {
    const context = deferred<Awaited<ReturnType<typeof posApi.getCheckoutContext>>>();
    vi.mocked(posApi.getCheckoutContext).mockReturnValue(context.promise);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    client.setQueryData(productKey(otherScope), [{ ...product, name: 'Other tenant private product' }]);
    renderPage(client);
    expect(posApi.getProducts).not.toHaveBeenCalled();
    expect(screen.queryByText('Other tenant private product')).not.toBeInTheDocument();
    await act(async () => { context.resolve(response({ tenantId: 'tenant-1', userId: 'cashier-1' }) as Awaited<ReturnType<typeof posApi.getCheckoutContext>>); });
    await screen.findByText('✓ 3 件');
    expect(client.getQueryData(productKey())).toEqual([product]);
  });

  it('does not refresh or clear a replacement pending intent when an older command returns', async () => {
    const sale = deferred<Awaited<ReturnType<typeof posApi.checkout>>>();
    vi.mocked(posApi.checkout).mockReturnValue(sale.promise);
    renderPage(); await screen.findByText('✓ 3 件');
    await checkout();
    const original = useCheckoutRecoveryStore.getState().pending!;
    const replacement = { ...original, payload: { ...original.payload, commandId: 'replacement-command' } };
    act(() => { useCheckoutRecoveryStore.setState({ pending: replacement }); });
    await act(async () => { sale.resolve(response(checkoutResult) as Awaited<ReturnType<typeof posApi.checkout>>); });
    expect(useCheckoutRecoveryStore.getState().pending).toEqual(replacement);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(posApi.getProducts).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('已確認的收據')).not.toBeInTheDocument();
  });

  it('ignores an old tenant checkout success after reauthentication without refreshing the new tenant', async () => {
    const sale = deferred<Awaited<ReturnType<typeof posApi.checkout>>>();
    vi.mocked(posApi.checkout).mockReturnValue(sale.promise);
    const oldPage = renderPage(); await screen.findByText('✓ 3 件');
    await checkout();
    const oldIntent = localStorage.getItem(`pos-checkout-intent-v1:${scope}`);
    oldPage.unmount();
    vi.mocked(posApi.getCheckoutContext).mockResolvedValue(response({ tenantId: 'tenant-2', userId: 'cashier-2' }) as Awaited<ReturnType<typeof posApi.getCheckoutContext>>);
    vi.mocked(posApi.getProducts).mockResolvedValue(response([{ ...product, name: 'Tenant two product', stockQuantity: 8 }]) as Awaited<ReturnType<typeof posApi.getProducts>>);
    renderPage(oldPage.client); await screen.findByText('✓ 8 件');
    expect(screen.queryByText('Synthetic product')).not.toBeInTheDocument();
    const fetches = vi.mocked(posApi.getProducts).mock.calls.length;
    await act(async () => { sale.resolve(response(checkoutResult) as Awaited<ReturnType<typeof posApi.checkout>>); });
    expect(posApi.getProducts).toHaveBeenCalledTimes(fetches);
    expect(oldPage.client.getQueryState(productKey(otherScope))?.isInvalidated).toBe(false);
    expect(screen.queryByText('已確認的收據')).not.toBeInTheDocument();
    expect(localStorage.getItem(`pos-checkout-intent-v1:${scope}`)).toBe(oldIntent);
  });

  it('refreshes successful refund stock and orders without adding inventory or touching a pending checkout', async () => {
    const refund = deferred<Awaited<ReturnType<typeof posApi.refundOrder>>>();
    vi.mocked(posApi.refundOrder).mockReturnValue(refund.promise);
    const { client } = renderPage(); await screen.findByText('✓ 3 件');
    client.setQueryData(productKey(scope, 'vitamin', 'category-1'), [product]);
    client.setQueryData(productKey(otherScope), [product]);
    client.setQueryData(['pos-today-orders', otherScope, 'shift-1'], [order]);
    await openRefund();
    fireEvent.click(screen.getByRole('button', { name: '確認退款' }));
    const draft = { items: useCartStore.getState().items, paymentMethod: 'CASH' as const, orderDiscountAmount: 0, orderDiscountNote: '', currentSalesStaffId: 'cashier-1' };
    act(() => { useCheckoutRecoveryStore.getState().prepare({ commandId: 'new-pending-command', cartItems: [{ productId: product.id, quantity: 1, discountRate: 0 }], shiftId: 'shift-1', paymentMethod: 'CASH', orderDiscountAmount: 0 }, draft); });
    const pending = useCheckoutRecoveryStore.getState().pending;
    await act(async () => { refund.resolve(response({ ...order, status: 'refunded' }) as Awaited<ReturnType<typeof posApi.refundOrder>>); });
    expect(await screen.findByText('退款已登記，庫存不變')).toBeInTheDocument();
    await waitFor(() => expect(posApi.getProducts).toHaveBeenCalledTimes(2));
    expect(within(screen.getByTestId('product-card-product-1')).getByText('✓ 3 件')).toBeInTheDocument();
    expect(client.getQueryState(productKey(scope, 'vitamin', 'category-1'))?.isInvalidated).toBe(true);
    expect(client.getQueryState(['pos-today-orders', scope, 'shift-1'])?.isInvalidated).toBe(true);
    expect(client.getQueryState(productKey(otherScope))?.isInvalidated).toBe(false);
    expect(client.getQueryState(['pos-today-orders', otherScope, 'shift-1'])?.isInvalidated).toBe(false);
    expect(useCheckoutRecoveryStore.getState().pending).toEqual(pending);
    expect(useCartStore.getState().items).toEqual(draft.items);
  });

  it.each([new Error('Lost response'), { response: { status: 400 } }, { response: { status: 409 } }])('does not refresh or claim a failed refund succeeded: %j', async (failure) => {
    vi.mocked(posApi.refundOrder).mockRejectedValue(failure);
    const { client } = renderPage(); await screen.findByText('✓ 3 件');
    await openRefund();
    fireEvent.click(screen.getByRole('button', { name: '確認退款' }));
    expect(await screen.findByText('退款登記失敗，請稍後再試')).toBeInTheDocument();
    expect(screen.queryByText('退款已登記，庫存不變')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '確認退款' })).toBeEnabled();
    expect(posApi.getProducts).toHaveBeenCalledTimes(1);
    expect(client.getQueryState(productKey())?.isInvalidated).toBe(false);
    expect(client.getQueryState(['pos-today-orders', scope, 'shift-1'])?.isInvalidated).toBe(false);
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it('marks only the old tenant refund cache stale without refetching through a new login', async () => {
    const refund = deferred<Awaited<ReturnType<typeof posApi.refundOrder>>>();
    vi.mocked(posApi.refundOrder).mockReturnValue(refund.promise);
    const oldPage = renderPage(); await screen.findByText('✓ 3 件');
    await openRefund(); fireEvent.click(screen.getByRole('button', { name: '確認退款' }));
    oldPage.unmount();
    vi.mocked(posApi.getCheckoutContext).mockResolvedValue(response({ tenantId: 'tenant-2', userId: 'cashier-2' }) as Awaited<ReturnType<typeof posApi.getCheckoutContext>>);
    vi.mocked(posApi.getProducts).mockResolvedValue(response([{ ...product, stockQuantity: 8 }]) as Awaited<ReturnType<typeof posApi.getProducts>>);
    renderPage(oldPage.client); await screen.findByText('✓ 8 件');
    const fetches = vi.mocked(posApi.getProducts).mock.calls.length;
    await act(async () => { refund.resolve(response({ ...order, status: 'refunded' }) as Awaited<ReturnType<typeof posApi.refundOrder>>); });
    expect(posApi.getProducts).toHaveBeenCalledTimes(fetches);
    expect(oldPage.client.getQueryState(productKey())?.isInvalidated).toBe(true);
    expect(oldPage.client.getQueryState(productKey(otherScope))?.isInvalidated).toBe(false);
    expect(screen.queryByText('退款已登記，庫存不變')).not.toBeInTheDocument();
  });

  it.each(['checkout', 'refund'] as const)('warns on stock refetch failure after confirmed %s without undoing success, and supports retry', async (action) => {
    renderPage(); await screen.findByText('✓ 3 件');
    vi.mocked(posApi.getProducts).mockRejectedValue(new Error('Stock fetch unavailable'));
    if (action === 'checkout') await checkout();
    else { await openRefund(); fireEvent.click(screen.getByRole('button', { name: '確認退款' })); }
    expect(await screen.findByRole('alert')).toHaveTextContent('顯示資訊可能已過期');
    expect(screen.getByText(action === 'checkout' ? '已確認的收據' : '退款已登記，庫存不變')).toBeInTheDocument();
    expect(useCheckoutRecoveryStore.getState().pending).toBeNull();
    expect(useCartStore.getState().items).toHaveLength(action === 'checkout' ? 0 : 1);
    expect(screen.queryByText('退款登記失敗，請稍後再試')).not.toBeInTheDocument();
    vi.mocked(posApi.getProducts).mockResolvedValue(response([{ ...product, stockQuantity: action === 'checkout' ? 2 : 3 }]) as Awaited<ReturnType<typeof posApi.getProducts>>);
    fireEvent.click(screen.getByRole('button', { name: '重新整理庫存' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.getByText(action === 'checkout' ? '✓ 2 件' : '✓ 3 件')).toBeInTheDocument();
  });
});

describe('POS independent category navigation (synthetic API, real query cache)', () => {
  const categories = [{ id: 'pain', name: '止痛用品' }, { id: 'cold', name: '感冒用品' }, { id: 'empty', name: '空分類' }];
  const categoryNav = () => within(screen.getByRole('navigation', { name: '商品分類' }));

  it('keeps every category after search, empty results and repeated category selections', async () => {
    vi.mocked(posApi.getCategories).mockResolvedValue(response(categories));
    renderPage();
    await screen.findByRole('button', { name: '止痛用品' });
    vi.mocked(posApi.getProducts).mockResolvedValue(response([]));
    fireEvent.change(screen.getByTestId('product-search-input'), { target: { value: 'no-match' } });
    await waitFor(() => expect(posApi.getProducts).toHaveBeenLastCalledWith('no-match', undefined));
    for (const category of categories) {
      fireEvent.click(categoryNav().getByRole('button', { name: category.name }));
      await waitFor(() => expect(posApi.getProducts).toHaveBeenLastCalledWith('no-match', category.id));
      categories.forEach(({ name }) => expect(categoryNav().getByRole('button', { name })).toBeVisible());
      expect(categoryNav().getByRole('button', { name: category.name })).toHaveAttribute('aria-pressed', 'true');
    }
    const productCallsBeforeAll = vi.mocked(posApi.getProducts).mock.calls.length;
    fireEvent.click(categoryNav().getByRole('button', { name: '全部' }));
    expect(categoryNav().getByRole('button', { name: '全部' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('product-search-input')).toHaveValue('no-match');
    expect(await screen.findByText('沒有符合條件的商品')).toBeInTheDocument();
    categories.forEach(({ name }) => expect(categoryNav().getByRole('button', { name })).toBeVisible());
    // The All/search key is still fresh; returning to it should reuse its cache.
    expect(posApi.getProducts).toHaveBeenCalledTimes(productCallsBeforeAll);
    expect(posApi.getCategories).toHaveBeenCalledTimes(1);
  });

  it('keeps All usable while categories load and distinguishes an empty category list', async () => {
    const pendingCategories = deferred<Awaited<ReturnType<typeof posApi.getCategories>>>();
    vi.mocked(posApi.getCategories).mockReturnValue(pendingCategories.promise);
    renderPage();
    expect(await screen.findByText('分類載入中...')).toBeInTheDocument();
    expect(categoryNav().getByRole('button', { name: '全部' })).toBeEnabled();
    expect(screen.queryByText('尚無商品分類，可使用全部商品與搜尋。')).not.toBeInTheDocument();
    await act(async () => pendingCategories.resolve(response([])));
    expect(await screen.findByText('尚無商品分類，可使用全部商品與搜尋。')).toBeInTheDocument();
    expect(screen.queryByText('分類載入中...')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '重新載入分類' })).not.toBeInTheDocument();
  });

  it('shows failed initial load separately from empty and retries without clearing search', async () => {
    vi.mocked(posApi.getCategories).mockRejectedValue(new Error('Synthetic failure'));
    renderPage();
    const retry = await screen.findByRole('button', { name: '重新載入分類' });
    expect(screen.getByText(/分類載入失敗/)).toBeInTheDocument();
    expect(screen.queryByText('尚無商品分類，可使用全部商品與搜尋。')).not.toBeInTheDocument();
    expect(categoryNav().getByRole('button', { name: '全部' })).toBeEnabled();
    fireEvent.change(screen.getByTestId('product-search-input'), { target: { value: 'vitamin' } });
    vi.mocked(posApi.getCategories).mockResolvedValue(response(categories));
    fireEvent.click(retry);
    expect(await screen.findByRole('button', { name: '感冒用品' })).toBeInTheDocument();
    expect(screen.getByTestId('product-search-input')).toHaveValue('vitamin');
    expect(screen.queryByText(/分類載入失敗/)).not.toBeInTheDocument();
  });

  it('distinguishes forbidden access from an empty list or temporary failure', async () => {
    vi.mocked(posApi.getCategories).mockRejectedValue({ isAxiosError: true, response: { status: 403 } });
    renderPage();
    expect(await screen.findByText('沒有讀取商品分類的權限，請聯絡管理員確認 POS 權限。')).toBeInTheDocument();
    expect(screen.queryByText('尚無商品分類，可使用全部商品與搜尋。')).not.toBeInTheDocument();
    expect(screen.queryByText(/分類載入失敗/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重新載入分類' })).toBeEnabled();
  });

  it('ignores a slow old product response after a newer category selection without altering the cart', async () => {
    vi.mocked(posApi.getCategories).mockResolvedValue(response(categories));
    renderPage();
    await screen.findByRole('button', { name: '止痛用品' });
    const originalCart = useCartStore.getState().items;
    const slow = deferred<Awaited<ReturnType<typeof posApi.getProducts>>>();
    vi.mocked(posApi.getProducts).mockImplementation((_q, category) => category === 'pain'
      ? slow.promise : Promise.resolve(response([])));
    fireEvent.click(categoryNav().getByRole('button', { name: '止痛用品' }));
    await waitFor(() => expect(posApi.getProducts).toHaveBeenLastCalledWith(undefined, 'pain'));
    fireEvent.click(categoryNav().getByRole('button', { name: '感冒用品' }));
    await waitFor(() => expect(posApi.getProducts).toHaveBeenLastCalledWith(undefined, 'cold'));
    expect(await screen.findByText('沒有符合條件的商品')).toBeInTheDocument();
    await act(async () => slow.resolve(response([{ ...product, name: '過時搜尋結果' }])));
    expect(screen.queryByText('過時搜尋結果')).not.toBeInTheDocument();
    categories.forEach(({ name }) => expect(categoryNav().getByRole('button', { name })).toBeVisible());
    expect(useCartStore.getState().items).toEqual(originalCart);
    expect(posApi.checkout).not.toHaveBeenCalled();
  });

  it('retains cached category entrances with an explicit warning after refresh failure', async () => {
    vi.mocked(posApi.getCategories).mockResolvedValue(response(categories));
    const { client } = renderPage();
    await screen.findByRole('button', { name: '止痛用品' });
    vi.mocked(posApi.getCategories).mockRejectedValue(new Error('Synthetic failure'));
    await act(async () => { await client.invalidateQueries({ queryKey: ['pos-categories', scope] }); });
    expect(await screen.findByText(/分類載入失敗/)).toBeInTheDocument();
    categories.forEach(({ name }) => expect(categoryNav().getByRole('button', { name })).toBeVisible());
    expect(categoryNav().getByRole('button', { name: '全部' })).toBeEnabled();
  });

  it('uses a scope-specific category cache and ignores another tenant category list', async () => {
    vi.mocked(posApi.getCategories).mockResolvedValue(response(categories));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    client.setQueryData(['pos-categories', otherScope], [{ id: 'foreign', name: '另一門店分類' }]);
    renderPage(client);
    await screen.findByRole('button', { name: '止痛用品' });
    expect(screen.queryByRole('button', { name: '另一門店分類' })).not.toBeInTheDocument();
    expect(client.getQueryData(['pos-categories', scope])).toEqual(categories);
  });
});
