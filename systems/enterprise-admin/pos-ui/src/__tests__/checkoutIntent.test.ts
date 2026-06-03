import { describe, expect, it } from 'vitest';
import type { PosProduct } from '@pharmasaas/types';
import {
  buildCheckoutIntent,
  buildCheckoutPayload,
  checkoutIntentToPayload,
  MANAGER_APPROVAL_REASON,
  resolveCheckoutAuthorization,
} from '../services/checkoutIntent';

const product: PosProduct = {
  id: 'product-1',
  name: 'Test Product',
  sku: 'SKU-1',
  retailPrice: 120,
  stockQuantity: 10,
};

describe('checkout intent', () => {
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

  it('falls back to the selected payment method when split payment entries are empty', () => {
    const payload = buildCheckoutPayload({
      items: [{ product, quantity: 1, discountRate: 0 }],
      paymentMethod: 'CARD',
      splitPayments: [],
      orderDiscountAmount: 0,
      orderDiscountNote: '',
      shiftId: 'shift-1',
      salesStaffId: null,
    });

    expect(payload.paymentMethod).toBe('CARD');
    expect(payload.payments).toEqual([]);
  });

  it('marks high item or order discounts as manager approval intents', () => {
    const highItemIntent = buildCheckoutIntent({
      items: [{ product, quantity: 1, discountRate: 20 }],
      paymentMethod: 'CASH',
      orderDiscountAmount: 0,
      orderDiscountNote: '',
      shiftId: 'shift-1',
      salesStaffId: 'staff-1',
    });
    const highOrderIntent = buildCheckoutIntent({
      items: [{ product, quantity: 1, discountRate: 0 }],
      paymentMethod: 'CASH',
      orderDiscountAmount: 500,
      orderDiscountNote: 'promo',
      shiftId: 'shift-1',
      salesStaffId: 'staff-1',
    });

    expect(highItemIntent.requiresManagerApproval).toBe(true);
    expect(highOrderIntent.requiresManagerApproval).toBe(true);
    expect(MANAGER_APPROVAL_REASON).toContain('商品 ≥20%');
  });

  it('turns high-discount checkout attempts into manager-pin pending actions', () => {
    const intent = buildCheckoutIntent({
      items: [{ product, quantity: 1, discountRate: 25 }],
      paymentMethod: 'CASH',
      splitPayments: [{ method: 'CASH', amount: 120 }],
      orderDiscountAmount: 0,
      orderDiscountNote: '',
      shiftId: 'shift-1',
      salesStaffId: 'staff-1',
    });

    expect(resolveCheckoutAuthorization({ action: 'split', intent, managerPin: null })).toEqual({
      status: 'manager_pin_required',
      action: 'split',
      splitPayments: [{ method: 'CASH', amount: 120 }],
    });
    expect(resolveCheckoutAuthorization({ action: 'split', intent, managerPin: '1234' })).toEqual({
      status: 'approved',
      splitPayments: [{ method: 'CASH', amount: 120 }],
    });
  });

  it('keeps active shift validation inside the intent-to-payload seam', () => {
    const intent = buildCheckoutIntent({
      items: [{ product, quantity: 1, discountRate: 0 }],
      paymentMethod: 'CASH',
      orderDiscountAmount: 0,
      orderDiscountNote: '',
      salesStaffId: 'staff-1',
    });

    expect(() => checkoutIntentToPayload(intent)).toThrow(/active shift/);
  });
});
