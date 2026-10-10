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
vi.mock('../components/CartPanel', () => ({ default: ({ onSplitCheckout, onCheckout }: { onSplitCheckout: () => void; onCheckout: () => void }) => <>
  <button onClick={onSplitCheckout}>開啟拆單</button><button onClick={onCheckout}>開始一般付款</button>
</> }));
// Keep the actual PaymentModal: native Enter/Space activation must reach its buttons.

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


describe('real-page split dialog ownership (independent review regression)', () => {
  it('keeps keyboard ownership after deleting the second row and does not hold the cart with F4', async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={client}><POSCheckoutPage /></QueryClientProvider>);
    await screen.findByTestId('product-card-p1');
    await user.click(screen.getByRole('button', { name: '開啟拆單' }));
    const dialog = screen.getByRole('dialog', { name: '拆單付款' });
    await user.click(within(dialog).getByRole('button', { name: '+ 加入第二付款方式' }));
    const beforeItems = useCartStore.getState().items;
    await user.click(within(dialog).getByRole('button', { name: '移除第 2 筆付款方式' }));
    const focusInsideAfterRemove = dialog.contains(document.activeElement);
    await user.keyboard('{F4}');
    expect({focusInsideAfterRemove, items: useCartStore.getState().items, held: useCartStore.getState().heldCarts.length})
      .toEqual({focusInsideAfterRemove: true, items: beforeItems, held: 0});
    expect(posApi.checkout).not.toHaveBeenCalled();
  });
  it('keeps keyboard ownership after the fourth entry removes the add button', async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={client}><POSCheckoutPage /></QueryClientProvider>);
    await screen.findByTestId('product-card-p1');
    await user.click(screen.getByRole('button', { name: '開啟拆單' }));
    const dialog = screen.getByRole('dialog', { name: '拆單付款' });
    for (let i=0;i<3;i++) await user.click(within(dialog).getByRole('button', {name: '+ 加入第二付款方式'}));
    const focusInsideAfterAdd = dialog.contains(document.activeElement);
    const beforeItems = useCartStore.getState().items;
    await user.keyboard('{F4}');
    expect({focusInsideAfterAdd, items: useCartStore.getState().items, held: useCartStore.getState().heldCarts.length})
      .toEqual({focusInsideAfterAdd: true, items: beforeItems, held: 0});
    expect(posApi.checkout).not.toHaveBeenCalled();
  });
  it('keeps keyboard ownership after clicking the non-dismissing backdrop', async () => {
    const user=userEvent.setup();
    render(<QueryClientProvider client={client}><POSCheckoutPage /></QueryClientProvider>);
    await screen.findByTestId('product-card-p1');
    await user.click(screen.getByRole('button',{name:'開啟拆單'}));
    const dialog=screen.getByRole('dialog',{name:'拆單付款'});
    const beforeItems=useCartStore.getState().items;
    await user.click(dialog.parentElement!);
    const focusInsideAfterBackdrop=dialog.contains(document.activeElement);
    await user.keyboard('{F4}');
    expect({focusInsideAfterBackdrop,items:useCartStore.getState().items,held:useCartStore.getState().heldCarts.length})
      .toEqual({focusInsideAfterBackdrop:true,items:beforeItems,held:0});
    expect(posApi.checkout).not.toHaveBeenCalled();
  });
  it('Escape and pointer cancel preserve real cart and never invoke checkout', async () => {
    const user = userEvent.setup();
    render(<QueryClientProvider client={client}><POSCheckoutPage /></QueryClientProvider>);
    await screen.findByTestId('product-card-p1');
    const beforeItems = useCartStore.getState().items;
    const opener=screen.getByRole('button',{name:'開啟拆單'});
    for (const method of ['keyboard', 'pointer']) {
      await user.click(opener);
      expect(screen.getByRole('dialog', {name:'拆單付款'})).toBeInTheDocument();
      if(method === 'keyboard') await user.keyboard('{Escape}');
      else await user.click(screen.getByRole('button',{name:'取消'}));
      expect(screen.queryByRole('dialog', {name:'拆單付款'})).toBeNull();
      expect(opener).toHaveFocus();
      expect(opener.closest('[inert], [aria-hidden="true"]')).toBeNull();
      expect(useCartStore.getState().items).toBe(beforeItems);
      expect(useCartStore.getState().heldCarts).toHaveLength(0);
      expect(posApi.checkout).not.toHaveBeenCalled();
    }
  });
});


it.each(['split', 'payment', 'pin'])('blocks background shortcuts after focus escapes the %s modal', async (modal) => {
  const user = userEvent.setup();
  if (modal === 'pin') useCartStore.setState({ orderDiscountAmount: 500 });
  render(<QueryClientProvider client={client}><POSCheckoutPage /></QueryClientProvider>);
  await screen.findByTestId('product-card-p1');
  await user.click(screen.getByRole('button', { name: modal === 'payment' ? '開始一般付款' : '開啟拆單' }));
  if (modal === 'pin') await user.click(screen.getByRole('button', { name: '確認付款' }));
  const name = modal === 'pin' ? '管理員授權' : modal === 'payment' ? '確認結帳' : '拆單付款';
  expect(screen.getByRole('dialog', { name })).toBeInTheDocument();
  const beforeItems = useCartStore.getState().items;
  // Deliberate synthetic focus loss tests the page-level backstop independently
  // of the component focus-restoration handlers.
  for (const key of ['F4', 'F2', 'F3', 'F5', 'F6', 'F7', 'F8', 'Enter']) {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    expect(document.activeElement).toBe(document.body);
    await user.keyboard(`{${key}}`);
    expect(useCartStore.getState().items).toBe(beforeItems);
    expect(useCartStore.getState().heldCarts).toHaveLength(0);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name })).toBeInTheDocument();
    expect(posApi.checkout).not.toHaveBeenCalled();
  }
});

it('retains the existing page Escape cancellation for ordinary payment', async () => {
  const user = userEvent.setup();
  render(<QueryClientProvider client={client}><POSCheckoutPage /></QueryClientProvider>);
  await screen.findByTestId('product-card-p1');
  const beforeItems = useCartStore.getState().items;
  await user.click(screen.getByRole('button', { name: '開始一般付款' }));
  expect(screen.getByRole('dialog', { name: '確認結帳' })).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog', { name: '確認結帳' })).not.toBeInTheDocument();
  expect(useCartStore.getState().items).toBe(beforeItems);
  expect(posApi.checkout).not.toHaveBeenCalled();
});


it.each(['{Enter}', ' '])('preserves actual ordinary-payment Cancel native %s activation', async (key) => {
  const user = userEvent.setup();
  render(<QueryClientProvider client={client}><POSCheckoutPage /></QueryClientProvider>);
  await screen.findByTestId('product-card-p1');
  const beforeItems = useCartStore.getState().items;
  const opener = screen.getByRole('button', { name: '開始一般付款' });
  await user.click(opener);
  const dialog = screen.getByRole('dialog', { name: '確認結帳' });
  const cancel = within(dialog).getByRole('button', { name: '取消' });
  cancel.focus();
  await user.keyboard(key);
  expect(screen.queryByRole('dialog', { name: '確認結帳' })).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
  expect(useCartStore.getState().items).toBe(beforeItems);
  expect(useCartStore.getState().heldCarts).toHaveLength(0);
  expect(posApi.checkout).not.toHaveBeenCalled();
});

it('preserves actual payment-method and confirmation button Enter activation exactly once', async () => {
  const user = userEvent.setup();
  vi.mocked(posApi.checkout).mockImplementation(() => new Promise(() => {}));
  render(<QueryClientProvider client={client}><POSCheckoutPage /></QueryClientProvider>);
  await screen.findByTestId('product-card-p1');
  await user.click(screen.getByRole('button', { name: '開始一般付款' }));
  const dialog = screen.getByRole('dialog', { name: '確認結帳' });
  within(dialog).getByRole('button', { name: '信用卡' }).focus();
  await user.keyboard('{Enter}');
  expect(useCartStore.getState().paymentMethod).toBe('CARD');
  expect(posApi.checkout).not.toHaveBeenCalled();
  within(dialog).getByRole('button', { name: '確認付款' }).focus();
  await user.keyboard('{Enter}');
  await waitFor(() => expect(posApi.checkout).toHaveBeenCalledOnce());
  expect(posApi.checkout).toHaveBeenCalledWith(expect.objectContaining({
    paymentMethod: 'CARD', cartItems: [{ productId: existing.id, quantity: 1, discountRate: 0 }],
  }));
  expect(useCheckoutRecoveryStore.getState().pending).not.toBeNull();
});
