import { webcrypto } from 'node:crypto';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosHeaders, type AxiosResponse } from 'axios';
import type { ApiSuccess, PosProduct } from '@pharmasaas/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeImageScan } from '../services/imageScanDecoder';
import type { ImageScanEvidence } from '../services/imageScanResult';
import POSCheckoutPage from '../pages/POSCheckoutPage';
import { posApi } from '../api/pos';
import { lookupProduct } from '../api/productLookup';
import { cancelBarcodeInput, onBarcode, onScanResult } from '../services/barcodeService';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';

// Keep the real page, hook, decoder, candidate controls and cart store together.
// Synthetic API/shift and unrelated panels isolate native keyboard ownership.
vi.mock('../services/imageScanDecoder', () => ({ decodeImageScan: vi.fn(), ImageScanError: class extends Error {} }));
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
  const opener = screen.getByRole('button', { name: '圖片掃碼' });
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


const evidence: ImageScanEvidence = {
  scan: { contractVersion: 1, source: 'image', literal: 'ONE', bytes: { status: 'observed', value: [79, 78, 69] },
    symbology: { status: 'observed', value: 'qr' }, gs1: { status: 'unknown' },
    decoder: { name: 'zxing-wasm/reader', version: '3.1.2' }, evidence: { inputRoute: 'image-file', hardwareVerified: false } },
  decoderObservation: { text: 'ONE', bytes: [79, 78, 69], bytesECI: [79, 78, 69], format: 'QRCode', symbology: 'QRCode',
    symbologyIdentifier: ']Q1', isValid: true, error: '', extra: '{}', sequenceSize: -1, sequenceIndex: -1, sequenceId: '', orientation: 0, isMirrored: false, isInverted: false, lineCount: 0, symbol: { data: [], width: 0, height: 0 }, version: '', readerInit: false, ecLevel: '', hasECI: false, contentType: 'Text',
    position: { topLeft: { x: 0, y: 0 }, topRight: { x: 10, y: 0 }, bottomRight: { x: 10, y: 10 }, bottomLeft: { x: 0, y: 10 } } },
};

// These cases execute real page/scanner/cart ownership with a synthetic image
// decoder response. Actual WASM fixture decoding is verified separately.
describe('image scan entry + real POS page/scanner/cart integration', () => {
  it('requires user selection/confirmation after import and never dispatches the exact SKU to POS', async () => {
    vi.mocked(decodeImageScan).mockResolvedValue([evidence]);
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:synthetic-image'); URL.revokeObjectURL = vi.fn();
    const { user, opener } = await setup();
    const legacy = vi.fn(), stream = vi.fn(); const off = [onBarcode(legacy), onScanResult(stream)];
    const before = useCartStore.getState().items;
    await user.click(opener);
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    try {
      await user.upload(screen.getByLabelText('選擇條碼或 QR Code 圖片'), new File(['synthetic decoder fixture'], 'sku.png', { type: 'image/png' }));
      const radio = await screen.findByRole('radio');
      const confirm = screen.getByRole('button', { name: '確認這段辨識文字' });
      expect(confirm).toBeDisabled(); await user.click(radio); await user.click(confirm);
      expect(screen.getByRole('status')).toHaveTextContent('已人工確認');
      for (const key of ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'Enter']) fireEvent.keyDown(document.body, { key });
      scan('ONE');
      expect(useCartStore.getState().items).toEqual(before); expect(useCartStore.getState().heldCarts).toEqual([]);
      expect(lookupProduct).not.toHaveBeenCalled(); expect(posApi.checkout).not.toHaveBeenCalled();
      expect(legacy).not.toHaveBeenCalled(); expect(stream).not.toHaveBeenCalled(); expect(storage).not.toHaveBeenCalled();
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      await user.click(screen.getByRole('button', { name: '關閉' })); expect(opener).toHaveFocus();
      await user.click(opener); expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
      await user.keyboard('{Escape}'); expect(opener).toHaveFocus();
    } finally { off.forEach(unsubscribe => unsubscribe()); storage.mockRestore(); URL.createObjectURL = create; URL.revokeObjectURL = revoke; }
  });

  it('drops both partial scanner boundaries through immediate open/close then accepts a fresh SKU', async () => {
    const { opener } = await setup(); const time = vi.spyOn(Date, 'now').mockReturnValue(Date.now());
    try {
      fireEvent.keyDown(document, { key: 'O' }); fireEvent.keyDown(document, { key: 'L' });
      fireEvent.click(opener); scan('ONE');
      fireEvent.keyDown(document.body, { key: 'Escape' });
      const search = screen.getByTestId('product-search-input'); search.focus();
      scan('ON', search); expect(lookupProduct).not.toHaveBeenCalled();
      expect(useCartStore.getState().items).toEqual([{ product: existing, quantity: 1, discountRate: 0 }]);
      scan('ONE', search);
      expect(useCartStore.getState().items.find(item => item.product.id === 'p1')?.quantity).toBe(1);
      expect(useCartStore.getState().items.find(item => item.product.id === 'existing')?.quantity).toBe(1);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(posApi.checkout).not.toHaveBeenCalled();
    } finally { time.mockRestore(); }
  });

  it.each(['success', 'error'] as const)('discards the pre-open slow product lookup %s', async outcome => {
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

  it('preserves frozen checkout when it arrives while image evidence is open', async () => {
    const { opener } = await setup(); fireEvent.click(opener);
    const cart = useCartStore.getState();
    act(() => {
      useCheckoutRecoveryStore.getState().prepare({ commandId: 'synthetic-command', shiftId: 'shift-1',
        cartItems: [{ productId: existing.id, quantity: 1, discountRate: 0 }], paymentMethod: 'CASH', orderDiscountAmount: 0 },
      { items: cart.items, orderDiscountAmount: 0, orderDiscountNote: '', paymentMethod: 'CASH', currentSalesStaffId: 'cashier-1' });
      useCheckoutRecoveryStore.getState().mark('conflict');
    });
    const frozen = JSON.stringify(useCheckoutRecoveryStore.getState().pending);
    fireEvent.click(screen.getByRole('button', { name: '關閉' })); scan('ONE');
    expect(JSON.stringify(useCheckoutRecoveryStore.getState().pending)).toBe(frozen);
    expect(useCartStore.getState().items).toEqual(cart.items); expect(opener).toBeDisabled();
    expect(posApi.checkout).not.toHaveBeenCalled(); expect(lookupProduct).not.toHaveBeenCalled();
  });
});
