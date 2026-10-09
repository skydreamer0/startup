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

// Keep the real page, scanner, cart panel/store and payment dialog together.
// Synthetic API/shift and unrelated status panels isolate DOM interaction checks.
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

async function openPage() {
  const user = userEvent.setup();
  render(<QueryClientProvider client={client}><POSCheckoutPage /></QueryClientProvider>);
  await screen.findByTestId('product-card-p1');
  await waitFor(() => expect(screen.getByTestId('product-search-input')).toBeEnabled());
  return user;
}

describe('POS header keyboard accessibility (synthetic DOM, not scroll geometry)', () => {
  it('provides a named keyboard-focusable header region and persistent scrolling instructions', async () => {
    await openPage();
    const header = screen.getByRole('region', { name: '收銀工具列' });
    expect(header).toHaveAttribute('tabindex', '0');
    expect(header).toHaveAccessibleDescription(/左右滑動.*方向鍵/);
    header.focus();
    expect(header).toHaveFocus();
    expect(within(header).getByTestId('product-search-input')).toBeInTheDocument();
    expect(within(header).getByRole('button', { name: '交班' })).toBeInTheDocument();
  });

  it('retains F2 search and F7 order lookup from the focused header without submitting', async () => {
    const user = await openPage();
    const header = screen.getByRole('region', { name: '收銀工具列' });
    header.focus();
    await user.keyboard('{F2}');
    expect(screen.getByTestId('product-search-input')).toHaveFocus();
    header.focus();
    await user.keyboard('{F7}');
    expect(await screen.findByRole('heading', { name: '今日訂單' })).toBeInTheDocument();
    expect(posApi.checkout).not.toHaveBeenCalled();
    expect(useCartStore.getState().items[0].product.id).toBe('existing');
  });

  it('preserves pointer hold/recall and cart quantity across payment cancellation', async () => {
    const user = await openPage();
    await user.click(screen.getByTitle('掛單暫存 (F4)'));
    expect(useCartStore.getState().items).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: /1 筆掛單/ }));
    await user.click(screen.getByRole('button', { name: '叫回' }));
    expect(useCartStore.getState().items[0]).toMatchObject({ product: { id: 'existing' }, quantity: 1 });
    await user.click(screen.getByTestId('cart-checkout-button'));
    await user.click(screen.getByRole('button', { name: '取消' }));
    expect(useCartStore.getState().items[0].quantity).toBe(1);
    expect(posApi.checkout).not.toHaveBeenCalled();
    expect(screen.getByTestId('cart-checkout-button')).toHaveFocus();
  });
});
