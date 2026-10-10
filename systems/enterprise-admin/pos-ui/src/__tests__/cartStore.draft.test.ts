import { beforeEach, describe, expect, it } from 'vitest';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
import type { PosCustomerLookup } from '../api/pos';
const product = { id: 'p', name: 'Synthetic', sku: 'SYNTHETIC', retailPrice: 100, stockQuantity: 20 };
const customer: PosCustomerLookup = { id: 'A', name: 'Synthetic A', phone: 'SYNTHETIC-PHONE', rfmSegment: 'vip', totalSpent: 100,
  purchaseCount: 1, lastPurchaseDate: null, daysSinceLastPurchase: null, recentPurchases: [], supplementDueItems: [] };
function draft(id: string, payment: 'CARD' | 'CASH') {
  const cart = useCartStore.getState();
  cart.addItem(product); cart.updateQuantity(product.id, id === 'A' ? 2 : 3);
  cart.updateItemDiscount(product.id, id === 'A' ? 10 : 5);
  cart.setOrderDiscount(id === 'A' ? 7 : 9, `Synthetic ${id} discount`);
  cart.setSalesStaff(`staff-${id}`); cart.setCustomer({ ...customer, id, name: `Synthetic ${id}` }); cart.setPaymentMethod(payment);
}
function expectDraft(id: string, payment: 'CARD' | 'CASH') {
  expect(useCartStore.getState()).toMatchObject({ customerId: id, selectedCustomer: { id, name: `Synthetic ${id}` }, paymentMethod: payment,
    currentSalesStaffId: `staff-${id}`, orderDiscountAmount: id === 'A' ? 7 : 9, orderDiscountNote: `Synthetic ${id} discount`,
    items: [{ product, quantity: id === 'A' ? 2 : 3, discountRate: id === 'A' ? 10 : 5 }] });
}
beforeEach(() => {
  localStorage.clear(); useCheckoutRecoveryStore.setState({ scope: 'tenant:cashier', pending: null });
  useCartStore.setState({ draftScope: 'tenant:cashier', items: [], orderDiscountAmount: 0, orderDiscountNote: '', paymentMethod: 'CASH',
    currentSalesStaffId: null, customerId: null, selectedCustomer: null, heldCarts: [] });
});
describe('ordinary editable drafts remain in memory', () => {
  it('saves complete A/B contexts on hold and automatic nonempty save, using fresh recall revisions', () => {
    draft('A', 'CARD'); const aRevision = useCartStore.getState().draftRevision;
    useCartStore.getState().holdCurrentCart('A');
    const heldA = useCartStore.getState().heldCarts[0];
    expect(heldA).toMatchObject({ customerId: 'A', paymentMethod: 'CARD', draftRevision: aRevision, currentSalesStaffId: 'staff-A' });
    expect(useCartStore.getState()).toMatchObject({ items: [], customerId: null, selectedCustomer: null, paymentMethod: 'CASH' });
    draft('B', 'CASH'); const bRevision = useCartStore.getState().draftRevision;
    useCartStore.getState().recallHeldCart(heldA.id); expectDraft('A', 'CARD');
    expect(useCartStore.getState().draftRevision).toBeGreaterThan(bRevision);
    const heldB = useCartStore.getState().heldCarts[0];
    expect(heldB).toMatchObject({ customerId: 'B', paymentMethod: 'CASH', draftRevision: bRevision, currentSalesStaffId: 'staff-B' });
    useCartStore.getState().recallHeldCart(heldB.id); expectDraft('B', 'CASH');
    useCartStore.getState().recallHeldCart(useCartStore.getState().heldCarts[0].id); expectDraft('A', 'CARD');
    expect(localStorage.length).toBe(0);
  });
  it('clear only discards the current member/payment/discount, preserving held A and sales staff', () => {
    draft('A', 'CARD'); useCartStore.getState().holdCurrentCart('A'); draft('B', 'CASH');
    useCartStore.getState().clearCart();
    expect(useCartStore.getState()).toMatchObject({ customerId: null, selectedCustomer: null, items: [], paymentMethod: 'CASH',
      orderDiscountAmount: 0, orderDiscountNote: '', currentSalesStaffId: 'staff-B' });
    useCartStore.getState().recallHeldCart(useCartStore.getState().heldCarts[0].id); expectDraft('A', 'CARD');
  });
  it.each(['pending', 'unknown', 'conflict'] as const)('blocks every editable context transition during %s', (status) => {
    draft('A', 'CARD'); useCartStore.getState().holdCurrentCart('A'); draft('B', 'CASH');
    const before = useCartStore.getState();
    useCheckoutRecoveryStore.getState().prepare({ commandId: 'synthetic-command', cartItems: [{ productId: 'p', quantity: 3, discountRate: 5 }],
      paymentMethod: 'CASH', shiftId: 'synthetic-shift', orderDiscountAmount: 9, customerId: 'B' }, before);
    useCheckoutRecoveryStore.getState().mark(status);
    before.setCustomer(customer); before.setPaymentMethod('CARD'); before.setSalesStaff('C'); before.setOrderDiscount(1); before.clearCart();
    before.holdCurrentCart(); before.recallHeldCart(before.heldCarts[0].id); before.deleteHeldCart(before.heldCarts[0].id);
    expect(useCartStore.getState()).toBe(before);
  });
  it('identity change clears active and held context despite the old pending lock, without deleting old recovery', () => {
    draft('A', 'CARD'); useCartStore.getState().holdCurrentCart('A'); draft('B', 'CASH');
    useCheckoutRecoveryStore.getState().prepare({ commandId: 'synthetic-command', cartItems: [{ productId: 'p', quantity: 3, discountRate: 5 }],
      paymentMethod: 'CASH', shiftId: 'synthetic-shift', orderDiscountAmount: 9, customerId: 'B' }, useCartStore.getState());
    const saved = localStorage.getItem('pos-checkout-intent-v1:tenant:cashier');
    const revision = useCartStore.getState().draftRevision;
    useCartStore.getState().bindCheckoutScope('other:cashier');
    expect(useCartStore.getState()).toMatchObject({ items: [], heldCarts: [], customerId: null, selectedCustomer: null,
      currentSalesStaffId: null, paymentMethod: 'CASH', draftScope: 'other:cashier' });
    expect(useCartStore.getState().draftRevision).toBeGreaterThan(revision);
    expect(localStorage.getItem('pos-checkout-intent-v1:tenant:cashier')).toBe(saved);
    useCartStore.getState().bindCheckoutScope('tenant:cashier'); expect(useCartStore.getState().heldCarts).toEqual([]);
  });
});
