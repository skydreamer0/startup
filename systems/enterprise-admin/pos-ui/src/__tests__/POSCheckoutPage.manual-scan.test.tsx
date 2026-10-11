import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosHeaders, type AxiosResponse } from 'axios';
import type { ApiSuccess, PosProduct } from '@pharmasaas/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import POSCheckoutPage from '../pages/POSCheckoutPage';
import { posApi } from '../api/pos';
import { lookupProduct } from '../api/productLookup';
import { cancelBarcodeInput, onBarcode, onScanResult } from '../services/barcodeService';
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
  cancelBarcodeInput(); vi.resetAllMocks(); localStorage.clear(); vi.stubGlobal('crypto', webcrypto);
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


async function setup() {
  const user = userEvent.setup();
  const view = render(<QueryClientProvider client={client}><POSCheckoutPage /></QueryClientProvider>);
  await screen.findByTestId('product-card-p1');
  const opener = screen.getByRole('button', { name: '手動貼碼' });
  return { ...view, user, opener };
}
function scan(code: string, target: HTMLElement | Document = document) {
  act(() => {
    for (const key of code) fireEvent.keyDown(target, { key });
    fireEvent.keyDown(target, { key: 'Enter' });
  });
}
function deferredLookup() {
  let resolve!: (value: ReturnType<typeof response<PosProduct[]>>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ReturnType<typeof response<PosProduct[]>>>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('manual scan + real POS page/scanner/cart integration', () => {
  it('captures manual evidence without lookup, legacy callback, checkout, cart mutation or persistence', async () => {
    const { user, opener } = await setup();
    const legacy = vi.fn(), stream = vi.fn(); const off = [onBarcode(legacy), onScanResult(stream)];
    const before = useCartStore.getState().items;
    await user.click(opener);
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    try {
      const literal = '  001aB\u001d\r\nhttps://example.invalid  ';
      fireEvent.paste(screen.getByLabelText('掃描文字'), { clipboardData: { getData: () => literal } });
      await user.click(screen.getByRole('button', { name: '檢視掃描結果' }));
      expect(JSON.parse(screen.getByLabelText('原始 literal').textContent!)).toBe(literal);
      for (const key of ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'Enter']) fireEvent.keyDown(document.body, { key });
      scan('ONE');
      expect(useCartStore.getState().items).toEqual(before); expect(useCartStore.getState().heldCarts).toEqual([]);
      expect(lookupProduct).not.toHaveBeenCalled(); expect(posApi.checkout).not.toHaveBeenCalled();
      expect(legacy).not.toHaveBeenCalled(); expect(stream).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
    } finally { off.forEach(unsubscribe => unsubscribe()); storage.mockRestore(); }
    await user.click(screen.getByRole('button', { name: '關閉' })); expect(opener).toHaveFocus();
    await user.click(opener); expect(screen.getByLabelText('掃描文字')).toHaveValue('');
    expect(screen.queryByLabelText('原始 literal')).not.toBeInTheDocument();
    await user.keyboard('{Escape}'); expect(opener).toHaveFocus();
  });

  it('resumes unchanged USB Enter/min3 flow after a fast open/close, dropping both boundary partials', async () => {
    const { opener } = await setup(); const legacy = vi.fn(); const off = onBarcode(legacy);
    const search = screen.getByTestId('product-search-input');
    const observedKeys = vi.fn((event: KeyboardEvent) => event.target);
    search.addEventListener('keydown', observedKeys);
    const time = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
    try {
      // Freeze the decoder clock so neither boundary can rely on the 300ms timeout.
      fireEvent.keyDown(document, { key: 'O' }); fireEvent.keyDown(document, { key: 'L' });
      fireEvent.click(opener); scan('ONE');
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
      search.focus(); expect(search).toHaveFocus();
      // A short document-target Enter intentionally remains the page's checkout
      // shortcut. Exercise min3 on the focused search input, which owns text keys.
      scan('ON', search);
      expect(search).toHaveFocus();
      expect(legacy).not.toHaveBeenCalled(); expect(lookupProduct).not.toHaveBeenCalled();
      expect(useCartStore.getState().items).toEqual([{ product: existing, quantity: 1, discountRate: 0 }]);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      scan('ONE', search); expect(legacy.mock.calls).toEqual([['ONE']]);
      expect(observedKeys.mock.calls.map(([event]) => event.key)).toEqual(['O', 'N', 'Enter', 'O', 'N', 'E', 'Enter']);
      expect(observedKeys.mock.calls.every(([event]) => event.target === search)).toBe(true);
      // ONE is already the single exact SKU in the supplied product list.
      expect(lookupProduct).not.toHaveBeenCalled();
      expect(useCartStore.getState().items.find(item => item.product.id === 'p1')?.quantity).toBe(1);
      expect(useCartStore.getState().items.find(item => item.product.id === 'existing')?.quantity).toBe(1);
      expect(search).toHaveFocus();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(posApi.checkout).not.toHaveBeenCalled();
    } finally { off(); time.mockRestore(); search.removeEventListener('keydown', observedKeys); }
  });

  it('retains the existing document short-Enter checkout shortcut after closing manual evidence', async () => {
    const { opener } = await setup(); fireEvent.click(opener);
    fireEvent.click(screen.getByRole('button', { name: '關閉' }));
    scan('ON');
    expect(screen.getByRole('dialog', { name: '付款' })).toBeInTheDocument();
    expect(lookupProduct).not.toHaveBeenCalled(); expect(posApi.checkout).not.toHaveBeenCalled();
    expect(useCartStore.getState().items).toEqual([{ product: existing, quantity: 1, discountRate: 0 }]);
  });

  it.each(['success', 'error'] as const)('discards pre-open slow lookup %s even after the dialog has closed', async outcome => {
    const pending = deferredLookup(); vi.mocked(lookupProduct).mockReturnValue(pending.promise);
    const { opener } = await setup(); scan('LATE'); expect(lookupProduct).toHaveBeenCalledWith('LATE');
    fireEvent.click(opener); fireEvent.click(screen.getByRole('button', { name: '關閉' }));
    await act(async () => {
      if (outcome === 'success') pending.resolve(response([{ ...first, sku: 'LATE' }]));
      else pending.reject(new Error('synthetic failure'));
      await pending.promise.catch(() => {});
    });
    expect(useCartStore.getState().items).toEqual([{ product: existing, quantity: 1, discountRate: 0 }]);
    expect(screen.queryByText(/synthetic failure|查詢商品失敗|已加入 候選一/)).not.toBeInTheDocument();
    scan('ONE'); expect(useCartStore.getState().items.find(item => item.product.id === 'p1')?.quantity).toBe(1);
  });

  it('preserves a frozen checkout intent when it arrives while manual evidence is open', async () => {
    const { opener } = await setup(); fireEvent.click(opener);
    const cart = useCartStore.getState();
    act(() => {
      useCheckoutRecoveryStore.getState().prepare({ commandId: 'synthetic-command',
        cartItems: [{ productId: existing.id, quantity: 1, discountRate: 0 }], paymentMethod: 'CASH', orderDiscountAmount: 0 },
      { items: cart.items, orderDiscountAmount: 0, orderDiscountNote: '', paymentMethod: 'CASH', currentSalesStaffId: 'cashier-1' });
      useCheckoutRecoveryStore.getState().mark('conflict');
    });
    const frozen = JSON.stringify(useCheckoutRecoveryStore.getState().pending);
    fireEvent.change(screen.getByLabelText('掃描文字'), { target: { value: 'ONE' } });
    fireEvent.click(screen.getByRole('button', { name: '檢視掃描結果' }));
    fireEvent.click(screen.getByRole('button', { name: '關閉' })); scan('ONE');
    expect(JSON.stringify(useCheckoutRecoveryStore.getState().pending)).toBe(frozen);
    expect(useCartStore.getState().items).toEqual(cart.items); expect(opener).toBeDisabled();
    expect(posApi.checkout).not.toHaveBeenCalled(); expect(lookupProduct).not.toHaveBeenCalled();
  });

  it('unmount removes dialog ownership and discards its evidence', async () => {
    const { opener, unmount } = await setup(); fireEvent.click(opener);
    fireEvent.change(screen.getByLabelText('掃描文字'), { target: { value: 'private fixture' } });
    fireEvent.click(screen.getByRole('button', { name: '檢視掃描結果' })); unmount();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const listener = vi.fn(); window.addEventListener('keydown', listener);
    fireEvent.keyDown(document.body, { key: 'F2' }); expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener('keydown', listener);
    const next = await setup(); fireEvent.click(next.opener);
    expect(screen.getByLabelText('掃描文字')).toHaveValue('');
  });
});
