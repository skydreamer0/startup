import type { CheckoutPayload, PaymentEntry, PaymentMethod } from '@pharmasaas/types';
import type { CartItem } from '../store/cartStore';

interface BuildCheckoutPayloadInput {
  items: CartItem[];
  paymentMethod: PaymentMethod;
  splitPayments?: PaymentEntry[];
  orderDiscountAmount: number;
  orderDiscountNote: string;
  customerId?: string;
  shiftId: string;
  salesStaffId: string | null;
}

export function buildCheckoutPayload({
  items,
  paymentMethod,
  splitPayments,
  orderDiscountAmount,
  orderDiscountNote,
  customerId,
  shiftId,
  salesStaffId,
}: BuildCheckoutPayloadInput): CheckoutPayload {
  return {
    cartItems: items.map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
      discountRate: item.discountRate,
    })),
    paymentMethod: splitPayments ? splitPayments[0].method : paymentMethod,
    payments: splitPayments,
    orderDiscountAmount,
    orderDiscountNote: orderDiscountNote || undefined,
    customerId,
    shiftId,
    salesStaffId: salesStaffId ?? undefined,
  };
}
