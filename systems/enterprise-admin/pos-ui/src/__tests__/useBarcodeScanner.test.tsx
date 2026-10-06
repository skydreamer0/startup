import { MutableRefObject, useRef, useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { useBarcodeScanner } from '../hooks/useBarcodeScanner';
import { PosProduct } from '../api/pos';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
import type { PosToastMessage } from '../components/PosToast';
import { startBarcodeListener, stopBarcodeListener } from '../services/barcodeService';

const { getProducts } = vi.hoisted(() => ({ getProducts: vi.fn() }));
vi.mock('../api/pos', async () => {
  const actual = await vi.importActual<typeof import('../api/pos')>('../api/pos');
  return { ...actual, posApi: { getProducts } };
});

const product: PosProduct = {
  id: 'p1', name: 'Panadol', sku: 'PAN', barcode: '4711',
  retailPrice: 100, stockQuantity: 20,
};
const second: PosProduct = { ...product, id: 'p2', sku: 'PAN2', barcode: '4712' };

function Harness({
  products = [product], showToast = vi.fn(),
}: { products?: PosProduct[]; showToast?: (msg: PosToastMessage) => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const items = useCartStore((state) => state.items);
  const invalidateLookups = useBarcodeScanner(products, inputRef as MutableRefObject<HTMLInputElement | null>,
    setQuery, useCartStore.getState().addItem, showToast);
  return <>
    <input ref={inputRef} aria-label="search" value={query}
      onChange={(event) => {
        if (typeof invalidateLookups === 'function') invalidateLookups(event.nativeEvent);
        setQuery(event.target.value);
      }} />
    <button type="button">other</button>
    <output aria-label="cart">{JSON.stringify(items.map((item) => ({
      id: item.product.id, quantity: item.quantity,
    })))}</output>
  </>;
}

function scan(code: string) {
  act(() => {
    for (const key of code) fireEvent.keyDown(document, { key });
    fireEvent.keyDown(document, { key: 'Enter' });
  });
}
function deferredLookup() {
  type Response = { data: { data: PosProduct[] } };
  let resolve!: (value: Response) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Response>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
async function finish(lookup: ReturnType<typeof deferredLookup>, products = [product]) {
  await act(async () => { lookup.resolve({ data: { data: products } }); await lookup.promise; });
}
function checkoutDraft() {
  const { items, orderDiscountAmount, orderDiscountNote, paymentMethod, currentSalesStaffId } = useCartStore.getState();
  return { items, orderDiscountAmount, orderDiscountNote, paymentMethod, currentSalesStaffId };
}

describe('useBarcodeScanner', () => {
  beforeEach(() => {
    startBarcodeListener();
    fireEvent.keyDown(document, { key: 'Enter' });
    stopBarcodeListener();
    vi.resetAllMocks();
    localStorage.clear();
    useCheckoutRecoveryStore.setState({ scope: null, pending: null });
    useCheckoutRecoveryStore.getState().hydrate('synthetic-tenant:cashier');
    useCartStore.setState({
      items: [], heldCarts: [], orderDiscountAmount: 0,
      orderDiscountNote: '', paymentMethod: 'CASH', currentSalesStaffId: null,
    });
  });
  afterEach(() => { vi.useRealTimers(); });

  it('stops listening on unmount', () => {
    const h = render(<Harness />);
    h.unmount();
    scan('PAN');
    expect(useCartStore.getState().items).toEqual([]);
    expect(getProducts).not.toHaveBeenCalled();
  });

  it('adds a loaded exact sku and refocuses search', () => {
    const showToast = vi.fn();
    render(<Harness showToast={showToast} />);
    scan('PAN');
    expect(useCartStore.getState().items[0]).toMatchObject({ product, quantity: 1 });
    expect(screen.getByRole('textbox', { name: 'search' })).toHaveFocus();
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('does not add out-of-stock matched products', () => {
    const showToast = vi.fn();
    render(<Harness products={[{ ...product, stockQuantity: 0 }]} showToast={showToast} />);
    scan('PAN');
    expect(useCartStore.getState().items).toEqual([]);
    expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'warning' }));
  });

  it('does not apply a single remote result whose identifiers do not match', async () => {
    const showToast = vi.fn();
    getProducts.mockResolvedValue({ data: { data: [product] } });
    render(<Harness products={[]} showToast={showToast} />);
    scan('REMOTE');
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(useCartStore.getState().items).toEqual([]);
    expect(showToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('shows an error for an empty lookup without changing the draft', async () => {
    const showToast = vi.fn();
    getProducts.mockResolvedValue({ data: { data: [] } });
    render(<Harness products={[]} showToast={showToast} />);
    scan('MISSING');
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })));
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('adds PAN when PAN2 is also returned but only PAN is exact', async () => {
    const showToast = vi.fn();
    getProducts.mockResolvedValue({ data: { data: [second, product] } });
    render(<Harness products={[]} showToast={showToast} />);
    scan('PAN');
    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(1));
    expect(useCartStore.getState().items[0]).toMatchObject({ product, quantity: 1 });
  });

  it('does not add a single fuzzy candidate for a scanned code', async () => {
    const showToast = vi.fn();
    getProducts.mockResolvedValue({ data: { data: [{ ...product, sku: 'A123B', barcode: undefined }] } });
    render(<Harness products={[]} showToast={showToast} />);
    scan('123');
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(useCartStore.getState().items).toEqual([]);
    expect(showToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('ignores an exact remote response after unmount', async () => {
    const lookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValue(lookup.promise);
    const h = render(<Harness products={[]} showToast={showToast} />);
    scan('PAN');
    h.unmount();
    await finish(lookup);
    expect(useCartStore.getState().items).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('handles lookup rejection without losing the draft or an unhandled rejection', async () => {
    useCartStore.getState().addItem(second);
    useCartStore.getState().setOrderDiscount(5, 'keep');
    const before = useCartStore.getState().items;
    const showToast = vi.fn();
    getProducts.mockRejectedValue(new Error('synthetic lookup failure'));
    render(<Harness products={[]} showToast={showToast} />);
    scan('PAN');
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' })));
    expect(useCartStore.getState().items).toBe(before);
    expect(useCartStore.getState().orderDiscountAmount).toBe(5);
    expect(showToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it.each(['local', 'remote'])('rejects two exact candidates from %s', async (source) => {
    const candidates = [product, { ...second, barcode: 'PAN' }];
    const showToast = vi.fn();
    getProducts.mockResolvedValue({ data: { data: candidates } });
    render(<Harness products={source === 'local' ? candidates : []} showToast={showToast} />);
    scan('PAN');
    await waitFor(() => expect(showToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'info' })));
    expect(useCartStore.getState().items).toEqual([]);
    expect(showToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it.each(['local', 'remote'])('accepts an exact existing barcode from %s without dropping its leading zero', async (source) => {
    const candidates = [{ ...product, barcode: '04711' }];
    getProducts.mockResolvedValue({ data: { data: candidates } });
    render(<Harness products={source === 'local' ? candidates : []} />);
    scan('04711');
    await waitFor(() => expect(useCartStore.getState().items).toHaveLength(1));
    expect(useCartStore.getState().items[0].product.barcode).toBe('04711');
  });

  it('ignores an old response after the user changes search and changes it back', async () => {
    const lookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValue(lookup.promise);
    render(<Harness products={[]} showToast={showToast} />);
    scan('PAN');
    const input = screen.getByRole('textbox', { name: 'search' });
    fireEvent.change(input, { target: { value: 'new search' } });
    fireEvent.change(input, { target: { value: '' } });
    screen.getByRole('button', { name: 'other' }).focus();
    await finish(lookup);
    expect(useCartStore.getState().items).toEqual([]);
    expect(input).toHaveValue('');
    expect(screen.getByRole('button', { name: 'other' })).toHaveFocus();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('does not clear a new search or report success when an old response arrives', async () => {
    const lookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValue(lookup.promise);
    render(<Harness products={[]} showToast={showToast} />);
    scan('PAN');
    fireEvent.change(screen.getByRole('textbox', { name: 'search' }), { target: { value: 'new search' } });
    await finish(lookup);
    expect(screen.getByRole('textbox', { name: 'search' })).toHaveValue('new search');
    expect(useCartStore.getState().items).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
  });

  it.each(['clear', 'hold', 'recall'])('ignores a response after switching drafts via %s', async (action) => {
    const cart = useCartStore.getState();
    cart.addItem(second);
    let heldId = '';
    if (action === 'recall') {
      cart.holdCurrentCart();
      heldId = useCartStore.getState().heldCarts[0].id;
      cart.addItem({ ...second, id: 'p3', sku: 'OTHER' });
    }
    const lookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValue(lookup.promise);
    render(<Harness products={[]} showToast={showToast} />);
    scan('PAN');
    act(() => {
      if (action === 'clear') cart.clearCart();
      if (action === 'hold') cart.holdCurrentCart();
      if (action === 'recall') cart.recallHeldCart(heldId);
    });
    const switched = useCartStore.getState().items;
    await finish(lookup);
    expect(useCartStore.getState().items).toBe(switched);
    expect(showToast).not.toHaveBeenCalled();
  });

  it.each([false, true])('invalidates a request on checkout pending even if pending clears before reply: %s', async (unlock) => {
    useCartStore.getState().addItem(second);
    const lookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValue(lookup.promise);
    render(<Harness products={[]} showToast={showToast} />);
    scan('PAN');
    const before = useCartStore.getState().items;
    act(() => {
      const draft = checkoutDraft();
      const intent = useCheckoutRecoveryStore.getState().prepare({
        commandId: 'synthetic-command', cartItems: [{ productId: second.id, quantity: 1, discountRate: 0 }],
        shiftId: 'synthetic-shift', paymentMethod: 'CASH', orderDiscountAmount: 0,
      }, draft);
      if (unlock) useCheckoutRecoveryStore.getState().confirm(intent.payload.commandId);
    });
    const savedIntent = localStorage.getItem('pos-checkout-intent-v1:synthetic-tenant:cashier');
    await finish(lookup);
    expect(useCartStore.getState().items).toBe(before);
    expect(showToast).not.toHaveBeenCalled();
    expect(localStorage.getItem('pos-checkout-intent-v1:synthetic-tenant:cashier')).toBe(savedIntent);
  });

  it('retains both legal remote scan intents through product refresh and reverse response order', async () => {
    const firstLookup = deferredLookup();
    const secondLookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValueOnce(firstLookup.promise).mockReturnValueOnce(secondLookup.promise);
    const h = render(<Harness products={[]} showToast={showToast} />);
    scan('PAN');
    scan('PAN2');
    h.rerender(<Harness products={[{ ...second, sku: 'OTHER', barcode: undefined }]} showToast={showToast} />);
    await finish(secondLookup, [second]);
    await finish(firstLookup);
    expect(useCartStore.getState().items.map((item) => item.product.id)).toEqual([second.id, product.id]);
    expect(showToast.mock.calls.filter(([msg]) => msg.type === 'success')).toHaveLength(2);
  });

  it('counts two scans of the same product in the same valid draft twice', async () => {
    const firstLookup = deferredLookup();
    const secondLookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValueOnce(firstLookup.promise).mockReturnValueOnce(secondLookup.promise);
    render(<Harness products={[]} showToast={showToast} />);
    scan('PAN');
    scan('PAN');
    await finish(secondLookup);
    await finish(firstLookup);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });

  it('does not auto-add a fuzzy cached candidate or its fuzzy lookup result', async () => {
    const fuzzy = { ...product, sku: 'A123B', barcode: undefined };
    const showToast = vi.fn();
    getProducts.mockResolvedValue({ data: { data: [fuzzy] } });
    render(<Harness products={[fuzzy]} showToast={showToast} />);
    scan('123');
    await waitFor(() => expect(showToast).toHaveBeenCalled());
    expect(useCartStore.getState().items).toEqual([]);
  });

  it.each(['search', 'unmount'])('silently handles a rejection after %s invalidates a lookup', async (boundary) => {
    const lookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValue(lookup.promise);
    const h = render(<Harness products={[]} showToast={showToast} />);
    scan('PAN');
    if (boundary === 'unmount') h.unmount();
    else fireEvent.change(screen.getByRole('textbox', { name: 'search' }), { target: { value: 'new search' } });
    await act(async () => {
      lookup.reject(new Error('synthetic late rejection'));
      await lookup.promise.catch(() => undefined);
    });
    expect(useCartStore.getState().items).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('allows a new scan after search changes while discarding the old scan', async () => {
    const stale = deferredLookup();
    const fresh = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise);
    render(<Harness products={[]} showToast={showToast} />);
    scan('PAN');
    fireEvent.change(screen.getByRole('textbox', { name: 'search' }), { target: { value: 'new search' } });
    scan('PAN2');
    await finish(stale);
    expect(screen.getByRole('textbox', { name: 'search' })).toHaveValue('new search');
    await finish(fresh, [second]);
    expect(useCartStore.getState().items.map((item) => item.product.id)).toEqual([second.id]);
    expect(showToast.mock.calls.filter(([msg]) => msg.type === 'success')).toHaveLength(1);
  });

  it.each(['local', 'remote'])('blocks new %s scans while a known conflict freezes checkout', (source) => {
    const showToast = vi.fn();
    getProducts.mockResolvedValue({ data: { data: [product] } });
    const draft = checkoutDraft();
    useCheckoutRecoveryStore.getState().prepare({ commandId: 'synthetic-conflict',
      cartItems: [], shiftId: 'synthetic-shift', paymentMethod: 'CASH', orderDiscountAmount: 0 }, draft);
    useCheckoutRecoveryStore.getState().mark('conflict');
    const stored = localStorage.getItem('pos-checkout-intent-v1:synthetic-tenant:cashier');
    render(<Harness products={source === 'local' ? [product] : []} showToast={showToast} />);
    scan('PAN');
    expect(useCartStore.getState().items).toEqual([]);
    expect(getProducts).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(useCheckoutRecoveryStore.getState().pending?.status).toBe('conflict');
    expect(localStorage.getItem('pos-checkout-intent-v1:synthetic-tenant:cashier')).toBe(stored);
  });

  it('ignores a lookup from the previous authenticated checkout scope', async () => {
    const lookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValue(lookup.promise);
    render(<Harness products={[]} showToast={showToast} />);
    scan('PAN');
    act(() => { useCheckoutRecoveryStore.getState().hydrate('other-synthetic-tenant:cashier'); });
    await finish(lookup);
    expect(useCartStore.getState().items).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
  });

  it('preserves both wedge scans when keyboard characters also edit the focused search input', async () => {
    const firstLookup = deferredLookup();
    const secondLookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValueOnce(firstLookup.promise).mockReturnValueOnce(secondLookup.promise);
    render(<Harness products={[]} showToast={showToast} />);
    const input = screen.getByRole('textbox', { name: 'search' });
    input.focus();
    const user = userEvent.setup();
    await user.type(input, 'PAN{Enter}');
    await user.type(input, 'PAN2{Enter}');
    expect(getProducts.mock.calls.map(([code]) => code)).toEqual(['PAN', 'PAN2']);
    await finish(secondLookup, [second]);
    await finish(firstLookup);
    expect(useCartStore.getState().items.map((item) => item.product.id)).toEqual([second.id, product.id]);
    expect(showToast.mock.calls.filter(([msg]) => msg.type === 'success')).toHaveLength(2);
  });

  it('pauses an earlier response during scanner input and keeps both intents after Enter', async () => {
    const firstLookup = deferredLookup();
    const secondLookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValueOnce(firstLookup.promise).mockReturnValueOnce(secondLookup.promise);
    render(<Harness products={[]} showToast={showToast} />);
    const input = screen.getByRole('textbox', { name: 'search' });
    const user = userEvent.setup();
    await user.type(input, 'PAN{Enter}');
    await user.type(input, 'P');
    await finish(firstLookup);
    expect(input).toHaveValue('PANP');
    expect(useCartStore.getState().items).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
    await user.type(input, 'AN2{Enter}');
    await finish(secondLookup, [second]);
    expect(useCartStore.getState().items.map((item) => item.product.id)).toEqual([product.id, second.id]);
    expect(showToast.mock.calls.filter(([msg]) => msg.type === 'success')).toHaveLength(2);
  });

  it('does not claim quantity plus one when a scan cannot increase the cart quantity', () => {
    useCartStore.getState().addItem(product);
    useCartStore.getState().updateQuantity(product.id, product.stockQuantity);
    const showToast = vi.fn();
    render(<Harness showToast={showToast} />);
    const input = screen.getByRole('textbox', { name: 'search' });
    fireEvent.change(input, { target: { value: 'keep search' } });
    scan('PAN');
    expect(useCartStore.getState().items[0].quantity).toBe(product.stockQuantity);
    expect(showToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
    expect(input).toHaveValue('keep search');
  });

  it('preserves two focused scans of the same SKU with reverse responses', async () => {
    const firstLookup = deferredLookup();
    const secondLookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValueOnce(firstLookup.promise).mockReturnValueOnce(secondLookup.promise);
    render(<Harness products={[]} showToast={showToast} />);
    const user = userEvent.setup();
    const input = screen.getByRole('textbox', { name: 'search' });
    await user.type(input, 'PAN{Enter}PAN{Enter}');
    await finish(secondLookup);
    await finish(firstLookup);
    expect(useCartStore.getState().items).toMatchObject([{ product, quantity: 2 }]);
    expect(showToast.mock.calls.filter(([msg]) => msg.type === 'success')).toHaveLength(2);
  });

  it.each(['paste', 'backspace', 'change'])('permanently cancels paused responses after manual %s', async (edit) => {
    const lookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValue(lookup.promise);
    render(<Harness products={[]} showToast={showToast} />);
    const user = userEvent.setup();
    const input = screen.getByRole('textbox', { name: 'search' });
    await user.type(input, 'PAN{Enter}P');
    await finish(lookup);
    expect(useCartStore.getState().items).toEqual([]);
    if (edit === 'paste') await user.paste('manual');
    else if (edit === 'backspace') await user.keyboard('{Backspace}');
    else fireEvent.change(input, { target: { value: 'manual search' } });
    const query = (input as HTMLInputElement).value;
    const other = screen.getByRole('button', { name: 'other' });
    other.focus();
    await act(async () => { await Promise.resolve(); });
    expect(useCartStore.getState().items).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
    expect(input).toHaveValue(query);
    expect(other).toHaveFocus();
  });

  it('keeps unfinished input paused at 300ms and cancels it permanently at 301ms', async () => {
    vi.useFakeTimers();
    const lookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValue(lookup.promise);
    render(<Harness products={[]} showToast={showToast} />);
    const input = screen.getByRole('textbox', { name: 'search' });
    input.focus();
    let value = '';
    for (const key of 'PAN') {
      fireEvent.keyDown(input, { key });
      value += key;
      fireEvent.input(input, { inputType: 'insertText', data: key, target: { value } });
    }
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'P' });
    fireEvent.input(input, { inputType: 'insertText', data: 'P', target: { value: 'PANP' } });
    await finish(lookup);
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(input).toHaveValue('PANP');
    expect(useCartStore.getState().items).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(1); });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(getProducts).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('PANP');
    expect(useCartStore.getState().items).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
  });

  it.each(['clear', 'hold', 'recall', 'pending ABA', 'scope ABA'])(
    'does not revive either intent after %s during partial input', async (boundary) => {
      if (boundary === 'hold') useCartStore.getState().addItem(second);
      if (boundary === 'recall') {
        useCartStore.getState().addItem(second);
        useCartStore.getState().holdCurrentCart();
      }
      const lookup = deferredLookup();
      const showToast = vi.fn();
      getProducts.mockReturnValue(lookup.promise);
      render(<Harness products={[]} showToast={showToast} />);
      const user = userEvent.setup();
      const input = screen.getByRole('textbox', { name: 'search' });
      await user.type(input, 'PAN{Enter}P');
      await finish(lookup);
      act(() => {
        const cart = useCartStore.getState();
        if (boundary === 'clear') cart.clearCart();
        if (boundary === 'hold') cart.holdCurrentCart();
        if (boundary === 'recall') cart.recallHeldCart(cart.heldCarts[0].id);
        if (boundary === 'pending ABA') {
          useCheckoutRecoveryStore.getState().prepare({ commandId: 'synthetic-partial',
            cartItems: [], shiftId: 'synthetic-shift', paymentMethod: 'CASH', orderDiscountAmount: 0 }, checkoutDraft());
          useCheckoutRecoveryStore.getState().confirm('synthetic-partial');
        }
        if (boundary === 'scope ABA') {
          useCheckoutRecoveryStore.getState().hydrate('other-synthetic-tenant:cashier');
          useCheckoutRecoveryStore.getState().hydrate('synthetic-tenant:cashier');
        }
      });
      const itemsAfterBoundary = useCartStore.getState().items;
      await user.type(input, 'AN2{Enter}');
      expect(getProducts).toHaveBeenCalledTimes(1);
      expect(useCartStore.getState().items).toEqual(itemsAfterBoundary);
      expect(showToast).not.toHaveBeenCalled();
      expect(input).toHaveValue('PANPAN2');
    },
  );

  it('cancels a rejection received during partial input without publishing an error', async () => {
    const lookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValue(lookup.promise);
    render(<Harness products={[]} showToast={showToast} />);
    const user = userEvent.setup();
    const input = screen.getByRole('textbox', { name: 'search' });
    await user.type(input, 'PAN{Enter}P');
    await act(async () => { lookup.reject(new Error('synthetic offline')); await lookup.promise.catch(() => undefined); });
    expect(showToast).not.toHaveBeenCalled();
    await user.keyboard('{Backspace}');
    await act(async () => { await Promise.resolve(); });
    expect(showToast).not.toHaveBeenCalled();
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('releases paused responses safely when unmounted', async () => {
    const lookup = deferredLookup();
    const showToast = vi.fn();
    getProducts.mockReturnValue(lookup.promise);
    const view = render(<Harness products={[]} showToast={showToast} />);
    const user = userEvent.setup();
    await user.type(screen.getByRole('textbox', { name: 'search' }), 'PAN{Enter}P');
    await finish(lookup);
    view.unmount();
    await act(async () => { await Promise.resolve(); });
    expect(useCartStore.getState().items).toEqual([]);
    expect(showToast).not.toHaveBeenCalled();
  });
});
