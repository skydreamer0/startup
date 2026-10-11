import { Prisma } from '@prisma/client';

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
export function aggregateOrderPayments(
  orders: readonly PaymentOrder[],
  paymentGroup: (method: string) => string = (method) => method,
) {
  const byMethod = new Map<string, Prisma.Decimal>();
  let totalSales = new Prisma.Decimal(0);
  for (const order of orders) {
    totalSales = totalSales.plus(order.totalAmount);
    const payments = order.status === 'completed' && order.payments.length > 0
      ? order.payments
      : [{ method: order.paymentMethod, amount: order.totalAmount }];
    for (const payment of payments) {
      const group = paymentGroup(payment.method);
      byMethod.set(group, (byMethod.get(group) ?? new Prisma.Decimal(0)).plus(payment.amount));
    }
  }
  // Group persisted decimal facts before the existing numeric API boundary.
  // No quantization, residual allocation or writer-policy change is performed.
  const paymentBreakdown = Object.fromEntries(
    Array.from(byMethod, ([method, amount]): [string, number] => [method, amount.toNumber()]),
  );
  return { totalSales: totalSales.toNumber(), paymentBreakdown };
}
