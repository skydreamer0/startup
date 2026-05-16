import { describe, it, expect, beforeEach } from 'vitest';
import { useCartStore } from '../store/cartStore';
import { PosProduct } from '../api/pos';

const mockProduct: PosProduct = {
  id: 'prod-1',
  name: 'Panadol 500mg',
  sku: 'PAN-500',
  retailPrice: 100,
  stockQuantity: 10,
};

beforeEach(() => {
  useCartStore.setState({
    items: [],
    orderDiscountAmount: 0,
    orderDiscountNote: '',
    paymentMethod: 'CASH',
    currentSalesStaffId: null,
  });
});

describe('cartStore', () => {
  it('addItem adds product to cart', () => {
    useCartStore.getState().addItem(mockProduct);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].quantity).toBe(1);
  });

  it('addItem increments quantity if product already in cart', () => {
    const { addItem } = useCartStore.getState();
    addItem(mockProduct);
    addItem(mockProduct);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });

  it('removeItem removes product from cart', () => {
    const { addItem, removeItem } = useCartStore.getState();
    addItem(mockProduct);
    removeItem(mockProduct.id);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('subtotal calculates correctly with item discount', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateItemDiscount(mockProduct.id, 10); // 10% off
    // 100 * (1 - 10/100) * 1 = 90
    expect(useCartStore.getState().subtotal()).toBeCloseTo(90);
  });

  it('total deducts orderDiscountAmount from subtotal', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().setOrderDiscount(20);
    // subtotal=100, discount=20, total=80
    expect(useCartStore.getState().total()).toBeCloseTo(80);
  });

  it('total is never negative', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().setOrderDiscount(9999);
    expect(useCartStore.getState().total()).toBe(0);
  });

  it('clearCart resets items and discount', () => {
    const { addItem, setOrderDiscount, clearCart } = useCartStore.getState();
    addItem(mockProduct);
    setOrderDiscount(50);
    clearCart();
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().orderDiscountAmount).toBe(0);
  });

  it('setSalesStaff updates currentSalesStaffId', () => {
    useCartStore.getState().setSalesStaff('staff-1');
    expect(useCartStore.getState().currentSalesStaffId).toBe('staff-1');
  });
});
