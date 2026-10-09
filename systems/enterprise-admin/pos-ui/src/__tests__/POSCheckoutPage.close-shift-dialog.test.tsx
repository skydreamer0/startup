import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosHeaders, type AxiosResponse } from 'axios';
import type { ActiveShift, ApiSuccess, PosProduct } from '@pharmasaas/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import POSCheckoutPage from '../pages/POSCheckoutPage';
import PaymentModal from '../components/PaymentModal';
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from 'react-router-dom';
import { posApi } from '../api/pos';
import { lookupProduct } from '../api/productLookup';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';

// Actual page, useShift, useCheckout, scanner, dialog, other modals and cart.
// Only service adapters and unrelated hardware/display widgets are synthetic.
vi.mock('../api/pos', () => ({ posApi: {
  getCheckoutContext: vi.fn(), checkout: vi.fn(), getCheckoutCommand: vi.fn(),
  getActiveShift: vi.fn(), closeShift: vi.fn(), openShift: vi.fn(), getShiftReport: vi.fn(),
  getCategories: vi.fn(), getStaff: vi.fn(), getProducts: vi.fn(), getHotRecommendations: vi.fn(),
  getRecommendations: vi.fn(), getReorderForecast: vi.fn(), getTodayOrders: vi.fn(), refundOrder: vi.fn(),
} }));
vi.mock('../api/productLookup', () => ({ lookupProduct: vi.fn() }));
vi.mock('../hooks/useCustomerDisplay', () => ({ useCustomerDisplay: vi.fn(), openCustomerDisplay: vi.fn() }));
vi.mock('../components/OfflineStatus', () => ({ default: () => null }));
vi.mock('../components/PrinterStatus', () => ({ default: () => null }));

const product: PosProduct = { id: 'synthetic-product', name: '合成商品', sku: '4711234', retailPrice: 100, stockQuantity: 5 };
const shift: ActiveShift = { id: 'synthetic-shift', status: 'OPEN', openedAt: '2026-10-09T00:00:00Z', staff: { id: 'synthetic-cashier', fullName: '合成收銀員' } };
const items = [{ product, quantity: 2, discountRate: 0 }];
let client: QueryClient;
function response<T>(data: T): AxiosResponse<ApiSuccess<T>> {
  return { data: { success: true, data }, status: 200, statusText: 'OK', headers: new AxiosHeaders(), config: { headers: new AxiosHeaders() } };
}
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); vi.stubGlobal('crypto', webcrypto);
  useCheckoutRecoveryStore.setState({ scope: null, pending: null });
  useCartStore.setState({ items, orderDiscountAmount: 0, orderDiscountNote: '', paymentMethod: 'CASH', currentSalesStaffId: shift.staff.id, heldCarts: [] });
  vi.mocked(posApi.getCheckoutContext).mockResolvedValue(response({ tenantId: 'synthetic-tenant', userId: shift.staff.id }));
  vi.mocked(posApi.getActiveShift).mockResolvedValue(response(shift));
  vi.mocked(posApi.getCategories).mockResolvedValue(response([]));
  vi.mocked(posApi.getStaff).mockResolvedValue(response([{ ...shift.staff, email: 'synthetic@example.invalid' }]));
  vi.mocked(posApi.getProducts).mockResolvedValue(response([product]));
  vi.mocked(posApi.getHotRecommendations).mockResolvedValue(response([]));
  vi.mocked(posApi.getRecommendations).mockResolvedValue(response([]));
  vi.mocked(posApi.getReorderForecast).mockResolvedValue(response([]));
  vi.mocked(posApi.getTodayOrders).mockResolvedValue(response([]));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

async function setup() {
  const user = userEvent.setup();
  let navigate!: NavigateFunction;
  function Navigation() { navigate = useNavigate(); return null; }
  const view = render(<QueryClientProvider client={client}><MemoryRouter><Navigation /><Routes>
    <Route path="/" element={<POSCheckoutPage />} />
    <Route path="/next" element={<section><h1>下一頁</h1><PaymentModal loading={false} onConfirm={vi.fn()} onClose={vi.fn()} /></section>} />
  </Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByTestId('product-card-synthetic-product');
  const opener = screen.getByRole('button', { name: '交班' });
  await user.click(opener);
  const dialog = screen.getByRole('dialog', { name: '確認交班' });
  const cash = within(dialog).getByRole('spinbutton', { name: '結帳金額' });
  fireEvent.change(cash, { target: { value: '1234' } });
  return { user, view, opener, dialog, cash, navigate };
}
function expectNoWrite() {
  expect(posApi.closeShift).not.toHaveBeenCalled();
  expect(posApi.checkout).not.toHaveBeenCalled();
  expect(posApi.refundOrder).not.toHaveBeenCalled();
  expect(posApi.openShift).not.toHaveBeenCalled();
}

describe('real close-shift dialog lifecycle in POS', () => {
  it.each(['pointer', 'Escape', 'Enter', 'Space'])('%s cancel preserves cash and cart with zero service writes', async (method) => {
    const { user, opener, dialog } = await setup();
    if (method === 'pointer') await user.click(within(dialog).getByRole('button', { name: '取消' }));
    else if (method === 'Escape') await user.keyboard('{Escape}');
    else { await user.tab(); await user.keyboard(method === 'Enter' ? '{Enter}' : ' '); }
    expect(screen.queryByRole('dialog', { name: '確認交班' })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(useCartStore.getState().items).toEqual(items);
    expectNoWrite();
    await user.click(opener);
    expect(screen.getByRole('spinbutton', { name: '結帳金額' })).toHaveValue(1234);
    expect(useCartStore.getState().items).toEqual(items);
    expectNoWrite();
  });

  it('contains F2/F8 and scan-like Enter across input and buttons without opening another modal', async () => {
    const { user, dialog, cash } = await setup();
    await user.keyboard('{F2}{F3}{F4}{F5}{F6}{F7}{F8}4711234{Enter}');
    expect(cash).toHaveFocus();
    await user.tab(); await user.keyboard('{F2}{F3}{F4}{F5}{F6}{F7}{F8}');
    expect(within(dialog).getByRole('button', { name: '取消' })).toHaveFocus();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: '班別報表' })).not.toBeInTheDocument();
    expect(lookupProduct).not.toHaveBeenCalled();
    expect(posApi.getShiftReport).not.toHaveBeenCalled();
    expect(useCartStore.getState().items).toEqual(items);
    expectNoWrite();
  });

  it('holds one request and its amount while pending, keeps draft after failure, then permits one retry', async () => {
    const first = deferred<AxiosResponse<ApiSuccess<ActiveShift>>>();
    const retry = deferred<AxiosResponse<ApiSuccess<ActiveShift>>>();
    vi.mocked(posApi.closeShift).mockReturnValueOnce(first.promise).mockReturnValueOnce(retry.promise);
    const { user, dialog, cash } = await setup();
    await user.tab({ shift: true }); await user.keyboard('{Enter}');
    expect(posApi.closeShift).toHaveBeenCalledExactlyOnceWith(shift.id, 1234);
    expect(cash).toBeDisabled(); expect(dialog).toHaveFocus();
    await user.keyboard('{Escape}{F2}{F8}{Enter} ');
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    await user.click(within(dialog).getByRole('button', { name: '交班中...' }));
    fireEvent.change(cash, { target: { value: '9' } });
    expect(posApi.closeShift).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: '確認交班' })).toBeInTheDocument();
    expect(useCartStore.getState().items).toEqual(items);
    await act(async () => { first.reject(new Error('synthetic failure')); });
    expect(await screen.findByText('交班失敗，請稍後再試')).toBeInTheDocument();
    expect(cash).toBeEnabled(); expect(cash).toHaveValue(1234); expect(cash).toHaveFocus();
    await user.tab({ shift: true }); await user.keyboard(' ');
    expect(posApi.closeShift).toHaveBeenCalledTimes(2);
    expect(posApi.closeShift).toHaveBeenLastCalledWith(shift.id, 1234);
    await act(async () => { retry.resolve(response({ ...shift, status: 'CLOSED' })); });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '確認交班' })).not.toBeInTheDocument());
    expect(await screen.findByRole('button', { name: /開班/ })).toBeInTheDocument();
    expect(useCartStore.getState().items).toEqual(items);
    expect(posApi.checkout).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'])('late %s after real page navigation preserves the newer modal focus and cart', async (result) => {
    const pending = deferred<AxiosResponse<ApiSuccess<ActiveShift>>>();
    vi.mocked(posApi.closeShift).mockReturnValue(pending.promise);
    const { user, navigate, dialog } = await setup();
    await user.click(within(dialog).getByRole('button', { name: '確認交班' }));
    await act(async () => { navigate('/next'); });
    expect(screen.getByRole('heading', { name: '下一頁' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '確認交班' })).not.toBeInTheDocument();
    const newer = screen.getByRole('spinbutton', { name: '收取金額' });
    expect(newer).toHaveFocus(); expect(newer.closest('[inert]')).toBeNull();
    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    await act(async () => {
      if (result === 'success') pending.resolve(response({ ...shift, status: 'CLOSED' }));
      else pending.reject(new Error('synthetic late failure'));
    });
    expect(newer).toHaveFocus(); expect(useCartStore.getState().items).toEqual(items);
    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    expect(posApi.closeShift).toHaveBeenCalledExactlyOnceWith(shift.id, 1234);
    expect(posApi.checkout).not.toHaveBeenCalled();
  });

  it('does not leave inert locks on the existing split-payment cancellation flow', async () => {
    const { user } = await setup();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: '拆單' }));
    const heading = screen.getByRole('heading', { name: '拆單付款' });
    expect(heading.closest('[inert]')).toBeNull();
    const split = heading.parentElement!;
    await user.click(within(split).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('heading', { name: '拆單付款' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    expect(useCartStore.getState().items).toEqual(items); expectNoWrite();
  });

  it('does not leave inert locks on the existing manager approval cancellation flow', async () => {
    const { user } = await setup();
    await user.keyboard('{Escape}');
    const discounted = items.map(item => ({ ...item, discountRate: 20 }));
    act(() => { useCartStore.setState({ items: discounted }); });
    await user.click(screen.getByTestId('cart-checkout-button'));
    fireEvent.change(screen.getByRole('spinbutton', { name: '收取金額' }), { target: { value: '200' } });
    await user.click(screen.getByRole('button', { name: '確認付款' }));
    const heading = screen.getByRole('heading', { name: '管理員授權' });
    expect(heading.closest('[inert]')).toBeNull();
    await user.click(within(heading.parentElement!).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('heading', { name: '管理員授權' })).not.toBeInTheDocument();
    expect(document.querySelectorAll('[inert]')).toHaveLength(0);
    expect(useCartStore.getState().items).toEqual(discounted); expectNoWrite();
  });

  it('releases keyboard ownership after cancel so the existing payment cancel flow still works', async () => {
    const { user, dialog } = await setup();
    await user.click(within(dialog).getByRole('button', { name: '取消' }));
    await user.keyboard('{F2}');
    expect(screen.getByTestId('product-search-input')).toHaveFocus();
    await user.click(screen.getByTestId('cart-checkout-button'));
    const payment = screen.getByRole('dialog', { name: '確認結帳' });
    await user.click(within(payment).getByRole('button', { name: '取消' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(useCartStore.getState().items).toEqual(items);
    expectNoWrite();
  });
});
