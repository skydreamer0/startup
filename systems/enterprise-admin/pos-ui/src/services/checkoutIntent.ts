import type { CheckoutPayload, PaymentEntry, PaymentMethod } from '@pharmasaas/types';
import type { CartItem } from '../store/cartStore';

export type CheckoutAction = 'checkout' | 'split';

export const ITEM_DISCOUNT_PIN_THRESHOLD = 20;
export const ORDER_DISCOUNT_PIN_THRESHOLD = 500;

export const MANAGER_APPROVAL_REASON =
  `折扣超過授權閾值（商品 ≥${ITEM_DISCOUNT_PIN_THRESHOLD}% 或整筆 ≥$${ORDER_DISCOUNT_PIN_THRESHOLD}），請輸入管理員 PIN`;

export interface CheckoutIntentInput {
  items: CartItem[];
  paymentMethod: PaymentMethod;
  splitPayments?: PaymentEntry[];
  orderDiscountAmount: number;
  orderDiscountNote: string;
  customerId?: string;
  shiftId?: string;
  salesStaffId: string | null;
}

export interface CheckoutIntent {
  items: CartItem[];
  paymentMethod: PaymentMethod;
  splitPayments?: PaymentEntry[];
  orderDiscountAmount: number;
  orderDiscountNote?: string;
  customerId?: string;
  shiftId?: string;
  salesStaffId?: string;
  requiresManagerApproval: boolean;
}

export interface CheckoutAuthorizationInput {
  action: CheckoutAction;
  intent: CheckoutIntent;
  managerPin: string | null;
}

export type CheckoutAuthorization =
  | { status: 'approved'; splitPayments?: PaymentEntry[] }
  | { status: 'manager_pin_required'; action: CheckoutAction; splitPayments?: PaymentEntry[] };

export function checkoutNeedsManagerApproval(items: CartItem[], orderDiscountAmount: number): boolean {
  return items.some((item) => item.discountRate >= ITEM_DISCOUNT_PIN_THRESHOLD)
    || orderDiscountAmount >= ORDER_DISCOUNT_PIN_THRESHOLD;
}

export function buildCheckoutIntent({
  items,
  paymentMethod,
  splitPayments,
  orderDiscountAmount,
  orderDiscountNote,
  customerId,
  shiftId,
  salesStaffId,
}: CheckoutIntentInput): CheckoutIntent {
  return {
    items,
    paymentMethod,
    splitPayments,
    orderDiscountAmount,
    orderDiscountNote: orderDiscountNote || undefined,
    customerId,
    shiftId,
    salesStaffId: salesStaffId ?? undefined,
    requiresManagerApproval: checkoutNeedsManagerApproval(items, orderDiscountAmount),
  };
}

export function resolveCheckoutAuthorization({
  action,
  intent,
  managerPin,
}: CheckoutAuthorizationInput): CheckoutAuthorization {
  if (!intent.requiresManagerApproval || managerPin) {
    return { status: 'approved', splitPayments: intent.splitPayments };
  }

  return { status: 'manager_pin_required', action, splitPayments: intent.splitPayments };
}

export function checkoutIntentToPayload(intent: CheckoutIntent): Omit<CheckoutPayload, 'commandId'> {
  if (!intent.shiftId) {
    throw new Error('Checkout intent requires an active shift before payload submission');
  }

  return {
    cartItems: intent.items.map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
      discountRate: item.discountRate,
    })),
    paymentMethod: intent.splitPayments?.[0]?.method ?? intent.paymentMethod,
    payments: intent.splitPayments,
    orderDiscountAmount: intent.orderDiscountAmount,
    orderDiscountNote: intent.orderDiscountNote,
    customerId: intent.customerId,
    shiftId: intent.shiftId,
    salesStaffId: intent.salesStaffId,
  };
}

export function buildCheckoutPayload(input: CheckoutIntentInput): Omit<CheckoutPayload, 'commandId'> {
  return checkoutIntentToPayload(buildCheckoutIntent(input));
}
