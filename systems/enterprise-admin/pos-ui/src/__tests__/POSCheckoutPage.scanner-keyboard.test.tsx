import { webcrypto } from 'node:crypto';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosHeaders, type AxiosResponse } from 'axios';
import type { ApiSuccess, PosProduct } from '@pharmasaas/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import POSCheckoutPage from '../pages/POSCheckoutPage';
import { posApi } from '../api/pos';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';

// Keep the real page, hook, decoder, candidate controls and cart store together.
// Synthetic API/shift and unrelated panels isolate native keyboard ownership.
vi.mock('../api/pos', () => ({ posApi: {
  getCheckoutContext: vi.fn(), checkout: vi.fn(), getCheckoutCommand: vi.fn(),
  getCategories: vi.fn(), getStaff: vi.fn(), getProducts: vi.fn(), getHotRecommendations: vi.fn(),
  getRecommendations: vi.fn(), getReorderForecast: vi.fn(), getTodayOrders: vi.fn(), refundOrder: vi.fn(),
} }));
vi.mock('../api/productLookup', () => ({ lookupProduct: vi.fn() }));
vi.mock('../hooks/useShift', () => ({ useShift: () => ({
  activeShift: { id: 'shift-1', staff: { fullName: 'Synthetic cashier' } },
}) }));
vi.mock('../hooks/useCustomerDisplay', () => ({ useCustomerDisplay: vi.fn(), openCustomerDisplay: vi.fn() }));
vi.mock('../components/OfflineStatus', () => ({ default: () => null }));
vi.mock('../components/PrinterStatus', () => ({ default: () => null }));
vi.mock('../components/CustomerLookupPanel', () => ({ default: () => null }));
vi.mock('../components/CartPanel', () => ({ default: ({ onCheckout }: { onCheckout: () => void }) =>
  <button onClick={onCheckout}>開始結帳</button>,
}));
vi.mock('../components/PaymentModal', () => ({ default: () => <div role="dialog" aria-label="付款">付款中</div> }));

const first: PosProduct = { id: 'p1', name: '候選一', sku: 'ONE', barcode: '4711', retailPrice: 100, stockQuantity: 5 };
const second: PosProduct = { ...first, id: 'p2', name: '候選二', sku: 'TWO' };
const existing: PosProduct = { ...first, id: 'existing', name: '原有商品', sku: 'OLD', barcode: undefined };
let client: QueryClient;
function response<T>(data: T): AxiosResponse<ApiSuccess<T>> {
  return { data: { success: true, data }, status: 200, statusText: 'OK', headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() } };
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); vi.stubGlobal('crypto', webcrypto);
  useCheckoutRecoveryStore.setState({ scope: null, pending: null });
  useCartStore.setState({ items: [{ product: existing, quantity: 1, discountRate: 0 }], orderDiscountAmount: 0, orderDiscountNote: '', paymentMethod: 'CASH', currentSalesStaffId: 'cashier-1', heldCarts: [] });
  vi.mocked(posApi.getCheckoutContext).mockResolvedValue(response({ tenantId: 'tenant-1', userId: 'cashier-1' }));
  vi.mocked(posApi.getCategories).mockResolvedValue(response([]));
  vi.mocked(posApi.getStaff).mockResolvedValue(response([]));
  vi.mocked(posApi.getProducts).mockResolvedValue(response([first, second]));
  vi.mocked(posApi.getHotRecommendations).mockResolvedValue(response([]));
  vi.mocked(posApi.getReorderForecast).mockResolvedValue(response([]));
  vi.mocked(posApi.getTodayOrders).mockResolvedValue(response([]));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

async function openCandidates() {
  const user = userEvent.setup();
  render(<QueryClientProvider client={client}><POSCheckoutPage /></QueryClientProvider>);
  await screen.findByTestId('product-card-p1');
  const search = screen.getByTestId('product-search-input');
  await user.click(search);
  await user.keyboard('4711{Enter}');
  const region = await screen.findByRole('region', { name: '掃碼候選商品' });
  return { user, region };
}
async function tabTo(user: ReturnType<typeof userEvent.setup>, target: HTMLElement) {
  for (let index = 0; index < 40 && document.activeElement !== target; index += 1) await user.tab();
  expect(target).toHaveFocus();
  expect(screen.getByRole('region', { name: '掃碼候選商品' })).toBeInTheDocument();
}

describe('real POS page + scanner native candidate keyboard integration', () => {
  it.each(['{Enter}', ' '])('Tab then %s selects once without opening payment or losing the candidate', async (key) => {
    const { user, region } = await openCandidates();
    expect(screen.queryByRole('dialog', { name: '付款' })).not.toBeInTheDocument();
    await tabTo(user, within(region).getByRole('button', { name: /候選一/ }));
    await user.keyboard(key);
    await waitFor(() => expect(useCartStore.getState().items.find((item) => item.product.id === 'p1')?.quantity).toBe(1));
    expect(useCartStore.getState().items.find((item) => item.product.id === 'existing')?.quantity).toBe(1);
    expect(useCartStore.getState().items.some((item) => item.product.id === 'p2')).toBe(false);
    expect(screen.queryByRole('region', { name: '掃碼候選商品' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '付款' })).not.toBeInTheDocument();
    expect(posApi.checkout).not.toHaveBeenCalled();
  });

  it.each(['{Enter}', ' '])('Tab then %s cancels only the choice without submitting or changing the cart', async (key) => {
    const { user, region } = await openCandidates();
    await tabTo(user, within(region).getByRole('button', { name: '取消選擇' }));
    await user.keyboard(key);
    expect(screen.queryByRole('region', { name: '掃碼候選商品' })).not.toBeInTheDocument();
    expect(useCartStore.getState().items).toEqual([{ product: existing, quantity: 1, discountRate: 0 }]);
    expect(screen.queryByRole('dialog', { name: '付款' })).not.toBeInTheDocument();
    expect(posApi.checkout).not.toHaveBeenCalled();
  });
});


it.each(['category', 'product'])('keeps F2 and F7 available after a %s button receives focus', async (target) => {
  const user = userEvent.setup();
  render(<QueryClientProvider client={client}><POSCheckoutPage /></QueryClientProvider>);
  await screen.findByTestId('product-card-p1');
  const button = target === 'category'
    ? within(screen.getByRole('navigation', { name: '商品分類' })).getByRole('button', { name: '全部' })
    : screen.getByTestId('product-card-p1');
  await user.click(button);
  expect(button).toHaveFocus();
  await user.keyboard('{F2}');
  expect(screen.getByTestId('product-search-input')).toHaveFocus();
  await user.click(button);
  expect(button).toHaveFocus();
  await user.keyboard('{F7}');
  expect(await screen.findByRole('heading', { name: '今日訂單' })).toBeInTheDocument();
  expect(await screen.findByText('今日無訂單紀錄')).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: '付款' })).not.toBeInTheDocument();
  expect(posApi.checkout).not.toHaveBeenCalled();
});
