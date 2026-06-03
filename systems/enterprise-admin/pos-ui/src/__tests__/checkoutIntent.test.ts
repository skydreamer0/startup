import { describe, expect, it } from 'vitest';
import type { PosProduct } from '@pharmasaas/types';
import { buildCheckoutPayload } from '../services/checkoutIntent';

const product: PosProduct = {
  id: 'product-1',
  name: 'Test Product',
  sku: 'SKU-1',
  retailPrice: 120,
  stockQuantity: 10,
};

describe('buildCheckoutPayload', () => {
  it('builds the backend checkout payload from cart and checkout intent state', () => {
    const payload = buildCheckoutPayload({
      items: [{ product, quantity: 2, discountRate: 10 }],
      paymentMethod: 'CARD',
      orderDiscountAmount: 15,
      orderDiscountNote: 'manager approved',
      customerId: 'customer-1',
      shiftId: 'shift-1',
      salesStaffId: 'staff-1',
    });

    expect(payload).toEqual({
      cartItems: [{ productId: 'product-1', quantity: 2, discountRate: 10 }],
      paymentMethod: 'CARD',
      payments: undefined,
      orderDiscountAmount: 15,
      orderDiscountNote: 'manager approved',
      customerId: 'customer-1',
      shiftId: 'shift-1',
      salesStaffId: 'staff-1',
    });
  });

  it('uses the first split payment method as the summary payment method', () => {
    const payload = buildCheckoutPayload({
      items: [{ product, quantity: 1, discountRate: 0 }],
      paymentMethod: 'CASH',
      splitPayments: [
        { method: 'LINE_PAY', amount: 50 },
        { method: 'CARD', amount: 70 },
      ],
      orderDiscountAmount: 0,
      orderDiscountNote: '',
      shiftId: 'shift-1',
      salesStaffId: null,
    });

    expect(payload.paymentMethod).toBe('LINE_PAY');
    expect(payload.payments).toEqual([
      { method: 'LINE_PAY', amount: 50 },
      { method: 'CARD', amount: 70 },
    ]);
    expect(payload.orderDiscountNote).toBeUndefined();
    expect(payload.customerId).toBeUndefined();
    expect(payload.salesStaffId).toBeUndefined();
  });
});
