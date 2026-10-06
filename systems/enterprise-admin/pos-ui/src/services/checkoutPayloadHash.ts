import type { CheckoutPayload } from '@pharmasaas/types';

// ADR-018 normalization version 1; shared backend/browser contract vectors
// guard this explicit business allowlist. Keep line/payment order significant.
export async function checkoutPayloadHash(dto: CheckoutPayload): Promise<string> {
  const normalized = {
    version: 1,
    shiftId: dto.shiftId.toLowerCase(),
    customerId: dto.customerId?.toLowerCase() ?? null,
    salesStaffId: dto.salesStaffId?.toLowerCase() ?? null,
    cartItems: dto.cartItems.map((item) => ({
      productId: item.productId.toLowerCase(), quantity: item.quantity, discountRate: item.discountRate ?? 0,
    })),
    paymentMethod: dto.paymentMethod,
    payments: dto.payments?.length ? dto.payments.map(({ method, amount }) => ({ method, amount })) : [],
    orderDiscountAmount: dto.orderDiscountAmount ?? 0,
    orderDiscountNote: dto.orderDiscountNote ?? '',
  };
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(normalized)));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
