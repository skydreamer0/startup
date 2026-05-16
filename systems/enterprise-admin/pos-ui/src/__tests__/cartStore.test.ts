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

const mockProduct2: PosProduct = {
  id: 'prod-2',
  name: 'Ibuprofen 400mg',
  sku: 'IBU-400',
  retailPrice: 200,
  stockQuantity: 5,
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

describe('addItem', () => {
  it('adds product with quantity 1 and discountRate 0', () => {
    useCartStore.getState().addItem(mockProduct);
    const { items } = useCartStore.getState();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(1);
    expect(items[0].discountRate).toBe(0);
  });

  it('increments quantity when same product added again', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().addItem(mockProduct);
    expect(useCartStore.getState().items[0].quantity).toBe(2);
  });

  it('caps quantity at stockQuantity when adding repeatedly', () => {
    for (let i = 0; i < 15; i++) useCartStore.getState().addItem(mockProduct);
    expect(useCartStore.getState().items[0].quantity).toBe(mockProduct.stockQuantity);
  });

  it('adds different products as separate cart items', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().addItem(mockProduct2);
    expect(useCartStore.getState().items).toHaveLength(2);
  });
});

describe('removeItem', () => {
  it('removes the target product', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().removeItem(mockProduct.id);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('only removes the matching product', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().addItem(mockProduct2);
    useCartStore.getState().removeItem(mockProduct.id);
    expect(useCartStore.getState().items).toHaveLength(1);
    expect(useCartStore.getState().items[0].product.id).toBe('prod-2');
  });
});

describe('updateQuantity', () => {
  it('updates quantity to the given value', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateQuantity(mockProduct.id, 5);
    expect(useCartStore.getState().items[0].quantity).toBe(5);
  });

  it('removes item when quantity set to 0', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateQuantity(mockProduct.id, 0);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('removes item when quantity set to negative', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateQuantity(mockProduct.id, -1);
    expect(useCartStore.getState().items).toHaveLength(0);
  });

  it('does not affect other items when updating quantity', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().addItem(mockProduct2);
    useCartStore.getState().updateQuantity(mockProduct.id, 8);
    expect(useCartStore.getState().items.find(i => i.product.id === 'prod-2')?.quantity).toBe(1);
  });
});

describe('updateItemDiscount', () => {
  it('updates discountRate for the item', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateItemDiscount(mockProduct.id, 20);
    expect(useCartStore.getState().items[0].discountRate).toBe(20);
  });

  it('does not affect quantity', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateQuantity(mockProduct.id, 3);
    useCartStore.getState().updateItemDiscount(mockProduct.id, 10);
    expect(useCartStore.getState().items[0].quantity).toBe(3);
  });
});

describe('subtotal()', () => {
  it('returns 0 for empty cart', () => {
    expect(useCartStore.getState().subtotal()).toBe(0);
  });

  it('returns retailPrice × quantity when no discount', () => {
    useCartStore.getState().addItem(mockProduct);
    expect(useCartStore.getState().subtotal()).toBeCloseTo(100);
  });

  it('reflects quantity change: qty=5 → subtotal=500', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateQuantity(mockProduct.id, 5);
    expect(useCartStore.getState().subtotal()).toBeCloseTo(500);
  });

  it('applies item-level discount: 10% off → subtotal=90', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateItemDiscount(mockProduct.id, 10);
    expect(useCartStore.getState().subtotal()).toBeCloseTo(90);
  });

  it('sums multiple items correctly', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().addItem(mockProduct2);
    expect(useCartStore.getState().subtotal()).toBeCloseTo(300);
  });

  it('updates subtotal after quantity change on one of many items', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().addItem(mockProduct2);
    useCartStore.getState().updateQuantity(mockProduct.id, 3);
    expect(useCartStore.getState().subtotal()).toBeCloseTo(500);
  });
});

describe('total()', () => {
  it('equals subtotal when no order discount', () => {
    useCartStore.getState().addItem(mockProduct);
    expect(useCartStore.getState().total()).toBeCloseTo(useCartStore.getState().subtotal());
  });

  it('deducts orderDiscountAmount from subtotal', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().setOrderDiscount(20);
    expect(useCartStore.getState().total()).toBeCloseTo(80);
  });

  it('is never negative', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().setOrderDiscount(9999);
    expect(useCartStore.getState().total()).toBe(0);
  });

  it('updates after quantity change + order discount', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().updateQuantity(mockProduct.id, 3);
    useCartStore.getState().setOrderDiscount(50);
    expect(useCartStore.getState().total()).toBeCloseTo(250);
  });
});

describe('clearCart', () => {
  it('empties items and resets order discount', () => {
    useCartStore.getState().addItem(mockProduct);
    useCartStore.getState().setOrderDiscount(30);
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(useCartStore.getState().orderDiscountAmount).toBe(0);
  });

  it('does not reset paymentMethod or salesStaff', () => {
    useCartStore.getState().setPaymentMethod('CARD');
    useCartStore.getState().setSalesStaff('staff-1');
    useCartStore.getState().clearCart();
    expect(useCartStore.getState().paymentMethod).toBe('CARD');
    expect(useCartStore.getState().currentSalesStaffId).toBe('staff-1');
  });
});
