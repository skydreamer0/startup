import { MutableRefObject, useRef } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { PosProduct } from '../api/pos';
import { useCartStore } from '../store/cartStore';

const barcodeMocks = vi.hoisted(() => ({
  startBarcodeListener: vi.fn(),
  stopBarcodeListener: vi.fn(),
  unsubscribe: vi.fn(),
  barcodeCallback: null as ((code: string) => void) | null,
  getProducts: vi.fn(),
}));
const { startBarcodeListener, stopBarcodeListener, unsubscribe, getProducts } = barcodeMocks;

vi.mock('../services/barcodeService', () => ({
  startBarcodeListener: barcodeMocks.startBarcodeListener,
  stopBarcodeListener: barcodeMocks.stopBarcodeListener,
  onBarcode: vi.fn((cb: (code: string) => void) => {
    barcodeMocks.barcodeCallback = cb;
    return barcodeMocks.unsubscribe;
  }),
}));

vi.mock('../api/pos', async () => {
  const actual = await vi.importActual<typeof import('../api/pos')>('../api/pos');
  return {
    ...actual,
    posApi: { getProducts: barcodeMocks.getProducts },
  };
});

const product: PosProduct = {
  id: 'p1',
  name: 'Panadol',
  sku: 'PAN',
  barcode: '4711',
  retailPrice: 100,
  stockQuantity: 20,
};

const outOfStockProduct: PosProduct = {
  ...product,
  id: 'p2',
  sku: 'OUT',
  stockQuantity: 0,
};

function Harness({
  products = [product],
  addItem = vi.fn(),
  setSearchQuery = vi.fn(),
  showToast = vi.fn(),
}: {
  products?: PosProduct[];
  addItem?: (product: PosProduct) => void;
  setSearchQuery?: (q: string) => void;
  showToast?: (msg: { type: string; message: string }) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  useBarcodeScanner(
    products,
    inputRef as MutableRefObject<HTMLInputElement | null>,
    setSearchQuery,
    addItem,
    showToast,
  );
  return <input ref={inputRef} aria-label="search" />;
}

describe('useBarcodeScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    barcodeMocks.barcodeCallback = null;
    useCartStore.setState({
      items: [],
      orderDiscountAmount: 0,
      orderDiscountNote: '',
      paymentMethod: 'CASH',
      currentSalesStaffId: null,
    });
  });

  it('starts and stops the shared barcode listener', () => {
    const { unmount } = render(<Harness />);

    expect(startBarcodeListener).toHaveBeenCalledOnce();
    unmount();

    expect(stopBarcodeListener).toHaveBeenCalledOnce();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('adds a loaded product matched by sku and refocuses search', () => {
    const addItem = vi.fn();
    const setSearchQuery = vi.fn();
    const showToast = vi.fn();
    render(<Harness addItem={addItem} setSearchQuery={setSearchQuery} showToast={showToast} />);

    barcodeMocks.barcodeCallback?.('PAN');

    expect(addItem).toHaveBeenCalledWith(product);
    expect(setSearchQuery).toHaveBeenCalledWith('');
    expect(screen.getByRole('textbox', { name: 'search' })).toHaveFocus();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('does not add out-of-stock matched products', () => {
    const addItem = vi.fn();
    const showToast = vi.fn();
    render(<Harness products={[outOfStockProduct]} addItem={addItem} showToast={showToast} />);

    barcodeMocks.barcodeCallback?.('OUT');

    expect(addItem).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
  });

  it('looks up unknown barcodes through the API and applies a single result', async () => {
    const addItem = vi.fn();
    const showToast = vi.fn();
    getProducts.mockResolvedValue({ data: { data: [product] } });
    render(<Harness products={[]} addItem={addItem} showToast={showToast} />);

    barcodeMocks.barcodeCallback?.('REMOTE');

    await waitFor(() => expect(getProducts).toHaveBeenCalledWith('REMOTE'));
    expect(addItem).toHaveBeenCalledWith(product);
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('shows an error toast when remote lookup returns no products', async () => {
    const showToast = vi.fn();
    getProducts.mockResolvedValue({ data: { data: [] } });
    render(<Harness products={[]} showToast={showToast} />);

    barcodeMocks.barcodeCallback?.('MISSING');

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })));
  });

  it('shows an info toast when remote lookup returns multiple products', async () => {
    const showToast = vi.fn();
    getProducts.mockResolvedValue({ data: { data: [product, { ...product, id: 'p3', sku: 'PAN2' }] } });
    render(<Harness products={[]} showToast={showToast} />);

    barcodeMocks.barcodeCallback?.('PAN');

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' })));
  });
});
