import { beforeEach, describe, expect, it } from 'vitest';
import type { PosProduct } from '@pharmasaas/types';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';

const product: PosProduct = { id: 'product-a', sku: 'A', name: 'Synthetic product', retailPrice: '1.25', stockQuantity: 8 };
function reset() {
  useCartStore.setState({ items: [], draftRevision: 0, draftScope: 'tenant-a:cashier', orderDiscountAmount: 0,
    orderDiscountNote: '', paymentMethod: 'CASH', currentSalesStaffId: null, customerId: null, selectedCustomer: null });
  useCheckoutRecoveryStore.setState({ scope: 'tenant-a:cashier', pending: null });
}
beforeEach(reset);

describe('cart addPackage invariant', () => {
  it('adds the selected stock-unit quantity as one product line', () => {
    expect(useCartStore.getState().addPackage(product, 3)).toBe(true);
    expect(useCartStore.getState().items).toEqual([{ product, quantity: 3, discountRate: 0 }]);
  });

  it('combines same-product packages against current stock and preserves the selected product snapshot', () => {
    useCartStore.getState().addItem(product);
    const refreshed = { ...product, stockQuantity: 4, retailPrice: '1.50' };
    expect(useCartStore.getState().addPackage(refreshed, 3)).toBe(true);
    expect(useCartStore.getState().items).toEqual([{ product: refreshed, quantity: 4, discountRate: 0 }]);
    const before = useCartStore.getState().items;
    expect(useCartStore.getState().addPackage(refreshed, 1)).toBe(false);
    expect(useCartStore.getState().items).toBe(before);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid package stock-unit quantity %s without mutation', quantity => {
      const before = useCartStore.getState().items;
      expect(useCartStore.getState().addPackage(product, quantity)).toBe(false);
      expect(useCartStore.getState().items).toBe(before);
    },
  );

  it('rejects additions when checkout recovery has frozen the draft', () => {
    useCheckoutRecoveryStore.setState({ pending: { payload: { commandId: 'pending' } } as never });
    expect(useCartStore.getState().addPackage(product, 1)).toBe(false);
    expect(useCartStore.getState().items).toEqual([]);
  });

  it('rejects unsafe aggregate quantities and never modifies other lines', () => {
    const other: PosProduct = { ...product, id: 'product-b', sku: 'B' };
    useCartStore.getState().addItem(product); useCartStore.getState().addItem(other);
    useCartStore.getState().updateQuantity(product.id, Number.MAX_SAFE_INTEGER);
    const before = useCartStore.getState().items;
    expect(useCartStore.getState().addPackage(product, 1)).toBe(false);
    expect(useCartStore.getState().items).toBe(before);
  });
});
