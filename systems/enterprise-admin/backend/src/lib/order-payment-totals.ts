import type { Prisma } from '@prisma/client';

type Amount = Prisma.Decimal | number | string;
interface PaymentOrder {
  status: string;
  totalAmount: Amount;
  paymentMethod: string;
  payments: readonly { method: string; amount: Amount }[];
}

/** Read persisted payment facts without changing eligibility or refund policy.
 * Completed orders use their payment rows; legacy orders without rows retain
 * the primary-method fallback. Other statuses deliberately retain old behavior
 * until refund/event semantics are defined. No rounding or allocation is done.
 */
export function aggregateOrderPayments(orders: readonly PaymentOrder[]) {
  const byMethod = new Map<string, number>();
  let totalSales = 0;
  for (const order of orders) {
    totalSales += Number(order.totalAmount);
    const payments = order.status === 'completed' && order.payments.length > 0
      ? order.payments
      : [{ method: order.paymentMethod, amount: order.totalAmount }];
    for (const payment of payments) {
      byMethod.set(payment.method, (byMethod.get(payment.method) ?? 0) + Number(payment.amount));
    }
  }
  return { totalSales, paymentBreakdown: Object.fromEntries(byMethod) };
}
