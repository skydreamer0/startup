import { webcrypto } from 'node:crypto';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosHeaders, type AxiosResponse } from 'axios';
import type { ApiSuccess, PosProduct } from '@pharmasaas/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import POSCheckoutPage from '../pages/POSCheckoutPage';
import type { PosCustomerLookup } from '../api/pos';
import { posApi } from '../api/pos';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';

// Keep the real page, hook, decoder, candidate controls and cart store together.
// Synthetic API/shift and unrelated panels isolate native keyboard ownership.
vi.mock('../api/pos', () => ({ posApi: {
  getCheckoutContext: vi.fn(), checkout: vi.fn(), getCheckoutCommand: vi.fn(),
  getCategories: vi.fn(), getStaff: vi.fn(), getProducts: vi.fn(), getHotRecommendations: vi.fn(),
  getRecommendations: vi.fn(), lookupCustomer: vi.fn(), createCustomer: vi.fn(), getReorderForecast: vi.fn(), getTodayOrders: vi.fn(), refundOrder: vi.fn(),
} }));
vi.mock('../api/productLookup', () => ({ lookupProduct: vi.fn() }));
vi.mock('../hooks/useShift', () => ({ useShift: () => ({
  activeShift: { id: 'shift-1', staff: { fullName: 'Synthetic cashier' } },
}) }));
vi.mock('../hooks/useCustomerDisplay', () => ({ useCustomerDisplay: vi.fn(), openCustomerDisplay: vi.fn() }));
vi.mock('../components/OfflineStatus', () => ({ default: () => null }));
vi.mock('../components/PrinterStatus', () => ({ default: () => null }));
// Keep the actual PaymentModal: native Enter/Space activation must reach its buttons.

const customer = (id: string): PosCustomerLookup => ({ id, name: `Synthetic ${id}`, phone: null, rfmSegment: 'new',
  totalSpent: 0, purchaseCount: 0, lastPurchaseDate: null, daysSinceLastPurchase: null, recentPurchases: [], supplementDueItems: [] });
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
  useCartStore.setState({ items: [{ product: existing, quantity: 1, discountRate: 0 }], orderDiscountAmount: 0, orderDiscountNote: '', paymentMethod: 'CASH', currentSalesStaffId: 'cashier-1', heldCarts: [], draftScope: null, selectedCustomer: null, customerId: null });
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


describe('editable held draft (synthetic API)', () => {
  async function selectCustomer(user: ReturnType<typeof userEvent.setup>, id: string) {
    vi.mocked(posApi.lookupCustomer).mockResolvedValueOnce(response(customer(id)));
    const input = screen.getByLabelText('客戶查詢'); await user.clear(input); await user.type(input, id);
    await user.click(screen.getByRole('button', { name: '查詢客戶' })); await screen.findByText(`Synthetic ${id}`);
  }
  async function mountPage() {
    vi.mocked(posApi.getRecommendations).mockResolvedValue(response([]));
    render(<QueryClientProvider client={client}><POSCheckoutPage /></QueryClientProvider>);
    await screen.findByTestId('product-card-p1');
  }
  it.each(['F4', 'pointer'])('holds A with %s, confirms B CASH, recalls A CARD and cancels payment with no extra submit', async (method) => {
    const user = userEvent.setup(); await mountPage(); await selectCustomer(user, 'A');
    await user.click(screen.getByRole('button', { name: '信用卡' }));
    if (method === 'F4') await user.keyboard('{F4}');
    else await user.click(screen.getByRole('button', { name: '📋 掛單' }));
    expect(screen.queryByText('Synthetic A')).not.toBeInTheDocument();
    await selectCustomer(user, 'B'); await user.click(screen.getByTestId('product-card-p1'));
    vi.mocked(posApi.checkout).mockResolvedValue(response({ id: 'synthetic-order-B', orderNumber: 'SYNTHETIC-B', paymentMethod: 'CASH',
      totalAmount: '100', items: [{ productId: 'p1', quantity: 1, unitPrice: '100', finalUnitPrice: '100' }] }));
    await user.click(screen.getByTestId('cart-checkout-button'));
    await user.type(screen.getByLabelText('收取金額'), '100');
    await user.click(within(screen.getByRole('dialog', { name: '確認結帳' })).getByRole('button', { name: '確認付款' }));
    await screen.findByTestId('receipt-next-button');
    expect(vi.mocked(posApi.checkout).mock.calls[0][0]).toMatchObject({ customerId: 'B', paymentMethod: 'CASH' });
    expect(useCartStore.getState()).toMatchObject({ customerId: null, selectedCustomer: null, items: [] });
    expect(useCartStore.getState().heldCarts[0]).toMatchObject({ customerId: 'A', paymentMethod: 'CARD' });
    await user.click(screen.getByTestId('receipt-next-button'));
    await user.click(screen.getByRole('button', { name: '📌 1 筆掛單' })); await user.click(screen.getByRole('button', { name: '叫回' }));
    expect(screen.getByText('Synthetic A')).toBeInTheDocument(); expect(useCartStore.getState().paymentMethod).toBe('CARD');
    await user.click(screen.getByTestId('cart-checkout-button')); await user.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(useCartStore.getState().customerId).toBe('A');
    expect(posApi.checkout).toHaveBeenCalledTimes(1);
  });
  it('confirmed clear of B preserves held A and PIN/payment cancellation preserves recalled A', async () => {
    const user = userEvent.setup(); await mountPage(); await selectCustomer(user, 'A');
    await user.click(screen.getByRole('button', { name: '信用卡' }));
    act(() => useCartStore.getState().updateItemDiscount(existing.id, 20));
    await user.click(screen.getByRole('button', { name: '📋 掛單' }));
    await selectCustomer(user, 'B'); await user.click(screen.getByTestId('product-card-p1'));
    await user.click(screen.getByRole('button', { name: '清空購物車 (F5)' }));
    expect(screen.getByText('Synthetic B')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '再按一次確認清空' }));
    expect(screen.queryByText('Synthetic B')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '📌 1 筆掛單' })); await user.click(screen.getByRole('button', { name: '叫回' }));
    await user.click(screen.getByTestId('cart-checkout-button'));
    await user.click(within(screen.getByRole('dialog', { name: '確認結帳' })).getByRole('button', { name: '確認付款' }));
    const pin = screen.getByRole('dialog', { name: '管理員授權' });
    await user.click(within(pin).getByRole('button', { name: '取消' }));
    expect(useCartStore.getState()).toMatchObject({ customerId: 'A', paymentMethod: 'CARD', items: [{ discountRate: 20 }] });
    expect(posApi.checkout).not.toHaveBeenCalled();
    await user.keyboard('{Escape}'); expect(useCartStore.getState().customerId).toBe('A');
  });
  it('recalls A CARD after B CASH without carrying B customer into A checkout', async () => {
    const user = userEvent.setup();
    vi.mocked(posApi.lookupCustomer).mockResolvedValueOnce(response(customer('A'))).mockResolvedValueOnce(response(customer('B')));
    vi.mocked(posApi.getRecommendations).mockResolvedValue(response([]));
    render(<QueryClientProvider client={client}><POSCheckoutPage /></QueryClientProvider>);
    await screen.findByTestId('product-card-p1');
    const lookup = screen.getByLabelText('客戶查詢');
    await user.type(lookup, 'A'); await user.click(screen.getByRole('button', { name: '查詢客戶' }));
    await screen.findByText('Synthetic A');
    await user.click(screen.getByRole('button', { name: '信用卡' }));
    await user.click(screen.getByRole('button', { name: '📋 掛單' }));
    await user.clear(lookup); await user.type(lookup, 'B'); await user.click(screen.getByRole('button', { name: '查詢客戶' }));
    await screen.findByText('Synthetic B');
    await user.click(screen.getByTestId('product-card-p1'));
    await user.click(screen.getByRole('button', { name: '📌 1 筆掛單' }));
    await user.click(screen.getByRole('button', { name: '叫回' }));
    expect(screen.queryByText('Synthetic B')).not.toBeInTheDocument();
    expect(screen.getByText('Synthetic A')).toBeInTheDocument();
    expect(useCartStore.getState().paymentMethod).toBe('CARD');
    expect(useCartStore.getState().heldCarts[0]).toMatchObject({ customerId: 'B', paymentMethod: 'CASH' });
    await user.click(screen.getByTestId('cart-checkout-button'));
    await user.click(within(screen.getByRole('dialog', { name: '確認結帳' })).getByRole('button', { name: /確認付款/ }));
    await waitFor(() => expect(posApi.checkout).toHaveBeenCalledTimes(1));
    expect(vi.mocked(posApi.checkout).mock.calls[0][0]).toMatchObject({ customerId: 'A', paymentMethod: 'CARD' });
  });
});
