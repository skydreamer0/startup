import type { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { requireTenantId } from '../../lib/tenant.context';

export const MAX_ORDER_SEQUENCE = 99_999;

/** Caller-owned transaction only. INSERT/conditional UPDATE obtains the
 * tenant/day row lock; the following read sees this transaction's increment.
 * A failed checkout rolls the counter back along with every other side effect. */
export async function allocateOrderNumber(
  tx: Pick<typeof prisma, 'orderNumberCounter'>,
  date: string,
) {
  const tenantId = requireTenantId();
  const businessDate = new Date(`${date}T00:00:00.000Z`);
  const key = { tenantId, businessDate };
  await tx.orderNumberCounter.createMany({ data: { ...key, lastSequence: 0 }, skipDuplicates: true });
  const claimed = await tx.orderNumberCounter.updateMany({
    where: { ...key, lastSequence: { lt: MAX_ORDER_SEQUENCE } },
    data: { lastSequence: { increment: 1 } },
  });
  if (claimed.count !== 1) {
    throw new AppError(409, '本營業日單號已達上限，請聯絡管理員', 'ORDER_SEQUENCE_EXHAUSTED');
  }
  const counter = await tx.orderNumberCounter.findFirstOrThrow({ where: key });
  return { businessDate, orderNumber: `POS-${date.replace(/-/g, '')}-${String(counter.lastSequence).padStart(5, '0')}` };
}
