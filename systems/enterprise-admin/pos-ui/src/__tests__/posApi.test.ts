import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CheckoutPayload } from '../api/pos';

const get = vi.fn();
const post = vi.fn();
const patch = vi.fn();

vi.mock('../api/client', () => ({
  default: { get, post, patch },
}));

describe('posApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requests products with query, category, and in-stock params', async () => {
    const { posApi } = await import('../api/pos');

    posApi.getProducts('pan', 'pain');

    expect(get).toHaveBeenCalledWith('/pos/products', {
      params: { q: 'pan', categoryId: 'pain', inStockOnly: 'true' },
    });
  });

  it('can request products without the in-stock-only filter', async () => {
    const { posApi } = await import('../api/pos');

    posApi.getProducts(undefined, undefined, false);

    expect(get).toHaveBeenCalledWith('/pos/products', {
      params: { q: undefined, categoryId: undefined, inStockOnly: 'false' },
    });
  });

  it('posts checkout payloads to the checkout endpoint', async () => {
    const { posApi } = await import('../api/pos');
    const payload: CheckoutPayload = {
      cartItems: [{ productId: 'p1', quantity: 2, discountRate: 0 }],
      paymentMethod: 'CASH',
      orderDiscountAmount: 0,
      shiftId: 'shift-1',
      salesStaffId: 'staff-1',
    };

    posApi.checkout(payload);

    expect(post).toHaveBeenCalledWith('/pos/checkout', payload);
  });

  it('opens and closes shifts through the shifts endpoints', async () => {
    const { posApi } = await import('../api/pos');

    posApi.openShift('staff-1', 1000);
    posApi.closeShift('shift-1', 2500);

    expect(post).toHaveBeenCalledWith('/shifts', { staffId: 'staff-1', openingCash: 1000 });
    expect(patch).toHaveBeenCalledWith('/shifts/shift-1/close', { closingCash: 2500 });
  });
});
