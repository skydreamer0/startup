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
      commandId: '11111111-1111-4111-8111-111111111111',
        cartItems: [{ productId: 'p1', quantity: 2, discountRate: 0 }],
      paymentMethod: 'CASH',
      orderDiscountAmount: 0,
      shiftId: 'shift-1',
      salesStaffId: 'staff-1',
    };

    posApi.checkout(payload);

    expect(post).toHaveBeenCalledWith('/pos/checkout', payload);
  });

  it('requests customer lookup by phone or member code', async () => {
    const { posApi } = await import('../api/pos');

    posApi.lookupCustomer('0912345678');

    expect(get).toHaveBeenCalledWith('/pos/customer-lookup', {
      params: { q: '0912345678' },
    });
  });

  it('requests customer recommendations', async () => {
    const { posApi } = await import('../api/pos');

    posApi.getRecommendations('customer-1');

    expect(get).toHaveBeenCalledWith('/pos/recommendations/customer-1');
  });

  it('requests hot recommendations without a customer', async () => {
    const { posApi } = await import('../api/pos');

    posApi.getHotRecommendations();

    expect(get).toHaveBeenCalledWith('/pos/recommendations');
  });

  it('requests reorder forecast with a bounded limit', async () => {
    const { posApi } = await import('../api/pos');

    posApi.getReorderForecast(5);

    expect(get).toHaveBeenCalledWith('/pos/reorder-forecast', {
      params: { limit: 5 },
    });
  });

  it('opens and closes shifts through the shifts endpoints', async () => {
    const { posApi } = await import('../api/pos');

    posApi.openShift('staff-1', 1000);
    posApi.closeShift('shift-1', 2500);

    expect(post).toHaveBeenCalledWith('/shifts', { staffId: 'staff-1', openingCash: 1000 });
    expect(patch).toHaveBeenCalledWith('/shifts/shift-1/close', { closingCash: 2500 });
  });
});
