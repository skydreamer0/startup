import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosHeaders, type AxiosResponse } from 'axios';
import type { ApiSuccess, PosCustomerLookup } from '@pharmasaas/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
import OrderLookupModal from '../components/OrderLookupModal';
import { posApi, type PosOrderSummary } from '../api/pos';

vi.mock('../api/pos', () => ({ posApi: { getTodayOrders: vi.fn() } }));
const beforeMidnight = new Date('2026-12-31T15:59:59.000Z');
const midnight = new Date('2026-12-31T16:00:00.000Z');
const clients: QueryClient[] = [];
const key = (day: string, scope = 'tenant-a:user-a', shift: string | undefined = 'shift-a') =>
  ['pos-today-orders', scope, shift, day];
function order(id: string): PosOrderSummary {
  return {
    id, orderNumber: id, status: 'completed', createdAt: beforeMidnight.toISOString(),
    totalAmount: '100', paymentMethod: 'CASH', discountAmount: 0,
    items: [{ id: `item-${id}`, productId: 'product-1', product: { id: 'product-1', name: 'Synthetic product', sku: 'SYNTHETIC' }, quantity: 1, unitPrice: '100', finalUnitPrice: '100' }],
  };
}
function response(rows: PosOrderSummary[]): AxiosResponse<ApiSuccess<PosOrderSummary[]>> {
  return { data: { success: true, data: rows }, status: 200, statusText: 'OK', headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() } };
}
function deferred() {
  let resolve!: (value: ReturnType<typeof response>) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<ReturnType<typeof response>>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })) {
  clients.push(client);
  const onRefund = vi.fn();
  const onClose = vi.fn();
  const modal = (scope = 'tenant-a:user-a', shift: string | undefined = 'shift-a') =>
    <QueryClientProvider client={client}><OrderLookupModal checkoutScope={scope} shiftId={shift} onRefund={onRefund} onClose={onClose} /></QueryClientProvider>;
  return { ...render(modal()), client, modal, onRefund, onClose };
}
async function flush() {
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
}
beforeEach(() => {
  localStorage.clear();
  useCheckoutRecoveryStore.setState({ scope: null, pending: null });
  vi.useFakeTimers(); vi.setSystemTime(beforeMidnight); vi.resetAllMocks();
  vi.mocked(posApi.getTodayOrders).mockResolvedValue(response([order('yesterday')]));
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('today orders cache at Asia/Taipei midnight (synthetic API, real QueryClient)', () => {
  it('refreshes an open modal at Taipei year rollover while its 10-second cache is fresh', async () => {
    const next = deferred();
    vi.mocked(posApi.getTodayOrders).mockResolvedValueOnce(response([order('yesterday')])).mockReturnValueOnce(next.promise);
    const { client } = mount(); await flush();
    expect(screen.getByText('yesterday')).toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(screen.queryByText('yesterday')).not.toBeInTheDocument();
    expect(screen.getByText('載入中...')).toBeInTheDocument();
    expect(posApi.getTodayOrders).toHaveBeenCalledTimes(2);
    await act(async () => { next.resolve(response([order('today')])); }); await flush();
    expect(screen.getByText('today')).toBeInTheDocument();
    expect(client.getQueryData(key('2026-12-31'))).toEqual([order('yesterday')]);
    expect(client.getQueryData(key('2027-01-01'))).toEqual([order('today')]);
  });

  it('does not reuse yesterday when closed just before midnight and reopened within staleTime', async () => {
    const first = mount(); await flush(); first.unmount();
    vi.setSystemTime(midnight);
    vi.mocked(posApi.getTodayOrders).mockResolvedValue(response([order('today')]));
    mount(first.client);
    expect(screen.queryByText('yesterday')).not.toBeInTheDocument(); await flush();
    expect(screen.getByText('today')).toBeInTheDocument();
    expect(posApi.getTodayOrders).toHaveBeenCalledTimes(2);
  });

  it.each(['visibilitychange', 'focus', 'pageshow'])('rechecks the day on %s after suspended timers', async (event) => {
    mount(); await flush();
    vi.setSystemTime(new Date('2027-01-02T17:00:00.000Z'));
    vi.mocked(posApi.getTodayOrders).mockResolvedValue(response([order('resumed-day')]));
    act(() => { (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event)); });
    expect(screen.queryByText('yesterday')).not.toBeInTheDocument(); await flush();
    expect(screen.getByText('resumed-day')).toBeInTheDocument();
    expect(posApi.getTodayOrders).toHaveBeenCalledTimes(2);
  });

  it('rejects an old-day success resolving across midnight even before the rollover timer runs', async () => {
    const old = deferred();
    vi.mocked(posApi.getTodayOrders).mockReturnValueOnce(old.promise).mockResolvedValue(response([order('new-day')]));
    const { client } = mount();
    vi.setSystemTime(midnight);
    await act(async () => { old.resolve(response([order('late-yesterday')])); }); await flush();
    expect(screen.queryByText('late-yesterday')).not.toBeInTheDocument();
    expect(screen.getByText('new-day')).toBeInTheDocument();
    expect(client.getQueryData(key('2026-12-31'))).toBeUndefined();
  });

  it('keeps yesterday hidden on new-day failure, distinguishes error from empty, and retries', async () => {
    vi.mocked(posApi.getTodayOrders).mockResolvedValueOnce(response([order('yesterday')])).mockRejectedValueOnce(new Error('offline'));
    mount(); await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); await flush();
    expect(screen.queryByText('yesterday')).not.toBeInTheDocument();
    expect(screen.queryByText('今日無訂單紀錄')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('今日訂單載入失敗');
    vi.mocked(posApi.getTodayOrders).mockResolvedValue(response([]));
    fireEvent.click(screen.getByRole('button', { name: '重新載入' })); await flush();
    expect(screen.getByText('今日無訂單紀錄')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it.each([
    ['tenant-b:user-b', 'shift-a'],
    ['tenant-a:user-a', 'shift-b'],
  ])('isolates late results when scope changes to %s / %s, including return to the original scope', async (scope, shift) => {
    const old = deferred();
    vi.mocked(posApi.getTodayOrders).mockReturnValueOnce(old.promise).mockResolvedValueOnce(response([order('other-scope')])).mockResolvedValue(response([order('fresh-original')]));
    const view = mount();
    view.rerender(view.modal(scope, shift)); await flush();
    expect(screen.getByText('other-scope')).toBeInTheDocument();
    await act(async () => { old.resolve(response([order('late-original')])); }); await flush();
    expect(screen.queryByText('late-original')).not.toBeInTheDocument();
    view.rerender(view.modal()); await flush();
    expect(screen.getByText('fresh-original')).toBeInTheDocument();
    expect(view.client.getQueryData(key('2026-12-31'))).toEqual([order('fresh-original')]);
  });

  it('cleans up timers/listeners on close and does not cache a late response', async () => {
    const pending = deferred(); vi.mocked(posApi.getTodayOrders).mockReturnValue(pending.promise);
    const view = mount(); view.unmount();
    vi.setSystemTime(midnight);
    act(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    await act(async () => { pending.resolve(response([order('after-close')])); await vi.advanceTimersByTimeAsync(120_000); });
    expect(posApi.getTodayOrders).toHaveBeenCalledTimes(1);
    expect(view.client.getQueryData(key('2026-12-31'))).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves held A, active B, customer/payment/revision and a frozen intent through rollover', async () => {
    const product = { id: 'p1', name: 'Synthetic product', sku: 'SYNTHETIC', retailPrice: 100, stockQuantity: 3 };
    const customer: PosCustomerLookup = { id: 'A', name: 'Synthetic A', phone: null, rfmSegment: 'new', totalSpent: 0, purchaseCount: 0, lastPurchaseDate: null, daysSinceLastPurchase: null, recentPurchases: [], supplementDueItems: [] };
    const draft = { items: [{ product, quantity: 1, discountRate: 0 }], paymentMethod: 'CARD' as const, orderDiscountAmount: 0, orderDiscountNote: 'held', currentSalesStaffId: 'user-a', customerId: 'A', selectedCustomer: customer, draftRevision: 7 };
    useCartStore.setState({ ...draft, draftScope: 'tenant-a:user-a', customerId: 'B', selectedCustomer: { ...customer, id: 'B', name: 'Synthetic B' }, paymentMethod: 'CASH', draftRevision: 8, heldCarts: [{ ...draft, id: 'held-A', label: 'A', heldAt: beforeMidnight }] });
    useCheckoutRecoveryStore.setState({ scope: 'tenant-a:user-a', pending: { status: 'unknown', payload: { commandId: 'frozen-B', shiftId: 'shift-a', cartItems: [{ productId: 'p1', quantity: 1, discountRate: 0 }], paymentMethod: 'CASH', orderDiscountAmount: 0, customerId: 'B' }, draft: { ...draft, paymentMethod: 'CASH' } } });
    const cart = useCartStore.getState();
    const recovery = useCheckoutRecoveryStore.getState();
    mount(); await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); }); await flush();
    expect(useCartStore.getState()).toBe(cart);
    expect(useCheckoutRecoveryStore.getState()).toBe(recovery);
  });

  it('does not poll the API during the same day and preserves search/refund interaction', async () => {
    vi.setSystemTime(new Date('2027-01-01T01:00:00.000Z'));
    const view = mount(); await flush();
    fireEvent.change(screen.getByPlaceholderText('搜尋訂單號或商品名稱...'), { target: { value: 'yesterday' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(posApi.getTodayOrders).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue('yesterday')).toBeInTheDocument();
    fireEvent.click(screen.getByText('yesterday'));
    fireEvent.click(screen.getByRole('button', { name: '退款此訂單' }));
    expect(view.onRefund).toHaveBeenCalledWith(order('yesterday'));
  });
});
