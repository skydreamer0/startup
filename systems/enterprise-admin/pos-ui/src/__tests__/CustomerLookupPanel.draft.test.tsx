import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CustomerLookupPanel from '../components/CustomerLookupPanel';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
import type { PosCustomerLookup } from '../api/pos';
const { lookupCustomer, createCustomer } = vi.hoisted(() => ({ lookupCustomer: vi.fn(), createCustomer: vi.fn() }));
vi.mock('../api/pos', () => ({ posApi: { lookupCustomer, createCustomer } }));
const customer: PosCustomerLookup = { id: 'A', name: 'Synthetic A', phone: 'SYNTHETIC-PHONE', rfmSegment: 'new',
  totalSpent: 0, purchaseCount: 0, lastPurchaseDate: null, daysSinceLastPurchase: null, recentPurchases: [], supplementDueItems: [] };
const product = { id: 'p', name: 'Synthetic', sku: 'SYNTHETIC', retailPrice: 100, stockQuantity: 5 };
const feedback = vi.fn();
function Panel() {
  const { selectedCustomer, setCustomer } = useCartStore();
  return <CustomerLookupPanel selectedCustomer={selectedCustomer} onSelect={setCustomer} onClear={() => setCustomer(null)} onFeedback={feedback} />;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear();
  useCheckoutRecoveryStore.setState({ scope: 'tenant:cashier', pending: null });
  useCartStore.setState({ draftScope: 'tenant:cashier', items: [{ product, quantity: 1, discountRate: 0 }],
    selectedCustomer: null, customerId: null, heldCarts: [] });
});
afterEach(cleanup);
describe('customer request draft boundary (synthetic API)', () => {
  function changeBoundary(kind: string) {
    const cart = useCartStore.getState();
    if (kind === 'hold') cart.holdCurrentCart();
    else if (kind === 'recall') {
      cart.holdCurrentCart(); useCartStore.getState().recallHeldCart(useCartStore.getState().heldCarts[0].id);
    } else if (kind === 'clear') cart.clearCart();
    else if (kind === 'scope ABA') {
      cart.bindCheckoutScope('other:cashier'); useCheckoutRecoveryStore.getState().hydrate('other:cashier');
      cart.bindCheckoutScope('tenant:cashier'); useCheckoutRecoveryStore.getState().hydrate('tenant:cashier');
    } else if (kind === 'pending ABA') {
      useCheckoutRecoveryStore.getState().prepare({ commandId: 'synthetic-command', cartItems: [{ productId: 'p', quantity: 1, discountRate: 0 }],
        paymentMethod: 'CASH', shiftId: 'synthetic-shift', orderDiscountAmount: 0 }, cart);
      useCheckoutRecoveryStore.getState().confirm('synthetic-command');
    }
  }
  it.each(['hold', 'recall', 'clear', 'scope ABA', 'pending ABA'])('ignores a late lookup after %s', async (kind) => {
    const reply = deferred<{ data: { data: PosCustomerLookup | null } }>();
    lookupCustomer.mockReturnValue(reply.promise);
    const user = userEvent.setup(); render(<Panel />);
    await user.type(screen.getByLabelText('客戶查詢'), 'A');
    await user.click(screen.getByRole('button', { name: '查詢客戶' }));
    act(() => changeBoundary(kind));
    await act(async () => { reply.resolve({ data: { data: customer } }); });
    expect(useCartStore.getState().customerId).toBeNull();
    expect(screen.queryByText('Synthetic A')).not.toBeInTheDocument();
    expect(feedback).not.toHaveBeenCalled();
  });
  it.each(['missing', 'error'])('does not reopen old form or error after a late %s lookup', async (outcome) => {
    const reply = deferred<{ data: { data: PosCustomerLookup | null } }>(); lookupCustomer.mockReturnValue(reply.promise);
    const user = userEvent.setup(); render(<Panel />);
    await user.type(screen.getByLabelText('客戶查詢'), 'A'); await user.click(screen.getByRole('button', { name: '查詢客戶' }));
    act(() => useCartStore.getState().clearCart());
    await act(async () => { if (outcome === 'missing') reply.resolve({ data: { data: null } }); else reply.reject(new Error('Synthetic failure')); });
    expect(screen.queryByText('此電話無紀錄')).not.toBeInTheDocument(); expect(feedback).not.toHaveBeenCalled();
  });
  it('retains the newer selected customer when two edited queries resolve out of order', async () => {
    const old = deferred<{ data: { data: PosCustomerLookup } }>(); const newer = deferred<{ data: { data: PosCustomerLookup } }>();
    lookupCustomer.mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise);
    const user = userEvent.setup(); render(<Panel />);
    await user.type(screen.getByLabelText('客戶查詢'), 'A'); await user.click(screen.getByRole('button', { name: '查詢客戶' }));
    await user.clear(screen.getByLabelText('客戶查詢')); await user.type(screen.getByLabelText('客戶查詢'), 'B');
    await user.click(screen.getByRole('button', { name: '查詢客戶' }));
    await act(async () => { newer.resolve({ data: { data: { ...customer, id: 'B', name: 'Synthetic B' } } }); });
    await act(async () => { old.resolve({ data: { data: customer } }); });
    expect(useCartStore.getState().customerId).toBe('B'); expect(screen.getByText('Synthetic B')).toBeInTheDocument();
    expect(feedback).toHaveBeenCalledTimes(1);
  });
  it('clear customer invalidates an in-flight replacement lookup', async () => {
    useCartStore.getState().setCustomer(customer);
    const reply = deferred<{ data: { data: PosCustomerLookup } }>(); lookupCustomer.mockReturnValue(reply.promise);
    const user = userEvent.setup(); render(<Panel />);
    await user.type(screen.getByLabelText('客戶查詢'), 'B'); await user.click(screen.getByRole('button', { name: '查詢客戶' }));
    await user.click(screen.getByRole('button', { name: '清除客戶' }));
    await act(async () => { reply.resolve({ data: { data: { ...customer, id: 'B', name: 'Synthetic B' } } }); });
    expect(useCartStore.getState().customerId).toBeNull(); expect(screen.queryByText('Synthetic B')).not.toBeInTheDocument();
  });
  it.each(['hold', 'recall', 'clear', 'scope ABA', 'pending ABA'])('detaches late successful create after %s without claiming cancellation', async (kind) => {
    const reply = deferred<{ data: { data: PosCustomerLookup } }>();
    lookupCustomer.mockResolvedValue({ data: { data: null } }); createCustomer.mockReturnValue(reply.promise);
    const user = userEvent.setup(); render(<Panel />);
    await user.type(screen.getByLabelText('客戶查詢'), 'SYNTHETIC-PHONE'); await user.click(screen.getByRole('button', { name: '查詢客戶' }));
    await user.click(await screen.findByRole('button', { name: '新增客戶' })); await user.click(screen.getByRole('button', { name: '建立' }));
    act(() => changeBoundary(kind));
    await act(async () => { reply.resolve({ data: { data: customer } }); });
    expect(useCartStore.getState().customerId).toBeNull(); expect(screen.queryByText('Synthetic A')).not.toBeInTheDocument();
    expect(feedback).toHaveBeenCalledWith({ type: 'info', message: '客戶已建立，但未套用至目前交易；請重新查詢' });
    expect(createCustomer).toHaveBeenCalledTimes(1);
  });
  it.each(['scope change', 'unmount'])('suppresses private stale create feedback on %s', async (kind) => {
    const reply = deferred<{ data: { data: PosCustomerLookup } }>();
    lookupCustomer.mockResolvedValue({ data: { data: null } }); createCustomer.mockReturnValue(reply.promise);
    const user = userEvent.setup(); const panel = render(<Panel />);
    await user.type(screen.getByLabelText('客戶查詢'), 'SYNTHETIC-PHONE'); await user.click(screen.getByRole('button', { name: '查詢客戶' }));
    await user.click(await screen.findByRole('button', { name: '新增客戶' })); await user.click(screen.getByRole('button', { name: '建立' }));
    if (kind === 'unmount') panel.unmount();
    else act(() => { useCartStore.getState().bindCheckoutScope('other:cashier'); useCheckoutRecoveryStore.getState().hydrate('other:cashier'); });
    await act(async () => { reply.resolve({ data: { data: customer } }); });
    expect(feedback).not.toHaveBeenCalled(); expect(useCartStore.getState().customerId).toBeNull();
  });
  it('blocks lookup/create while a frozen checkout is pending', async () => {
    useCheckoutRecoveryStore.getState().prepare({ commandId: 'synthetic-command', cartItems: [{ productId: 'p', quantity: 1, discountRate: 0 }],
      paymentMethod: 'CASH', shiftId: 'synthetic-shift', orderDiscountAmount: 0 }, useCartStore.getState());
    const user = userEvent.setup(); render(<Panel />); await user.type(screen.getByLabelText('客戶查詢'), 'A');
    await user.click(screen.getByRole('button', { name: '查詢客戶' })); expect(lookupCustomer).not.toHaveBeenCalled();
  });
});
