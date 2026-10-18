import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';
import { saleExpiryCutoff } from '../../lib/batch-expiry';
import { AppError } from '../../lib/errors';

export function reconciliationPage(value: unknown): number {
    if (value === undefined) return 1;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new AppError(400, 'Invalid reconciliation page');
    const page = Number(value);
    if (!Number.isSafeInteger(page) || page > 1_000_000) throw new AppError(400, 'Invalid reconciliation page');
    return page;
}

function exactInteger(value: number): number {
    if (!Number.isSafeInteger(value)) throw new AppError(422, 'Reconciliation quantity exceeds exact integer range; use the authorized numeric diagnostic');
    return value;
}

/** Diagnostic snapshot only. Never repairs projections or invents opening lots.
 * All quantities use the existing base stock unit. No reservation model exists;
 * eligible released quantity must not be labelled available-to-promise.
 */
export class StockReconciliationService {
    static async list(rawPage: unknown, now = new Date()) {
        const page = reconciliationPage(rawPage);
        const tenantId = requireTenantId();
        const limit = 50;
        const cutoff = saleExpiryCutoff(now);
        return prisma.$transaction(async (tx) => {
            const total = await tx.product.count({ where: { tenantId } });
            const products = await tx.product.findMany({
                where: { tenantId }, skip: (page - 1) * limit, take: limit,
                orderBy: [{ name: 'asc' }, { id: 'asc' }],
                select: { id: true, sku: true, name: true, stockQuantity: true, stockUnitLabel: true },
            });
            const where = { tenantId, productId: { in: products.map(p => p.id) } };
            const groups = await tx.productBatch.groupBy({
                by: ['productId', 'status'], where,
                _sum: { quantity: true }, _count: { _all: true },
            });
            const eligible = await tx.productBatch.groupBy({
                by: ['productId'], where: { ...where, status: 'RELEASED', quantity: { gt: 0 }, expiryDate: { gte: cutoff } },
                _sum: { quantity: true },
            });
            const expired = await tx.productBatch.groupBy({
                by: ['productId'], where: { ...where, expiryDate: { lt: cutoff } }, _sum: { quantity: true },
            });
            const negative = await tx.productBatch.groupBy({
                by: ['productId'], where: { ...where, quantity: { lt: 0 } }, _count: { _all: true },
            });
            const untraced = await tx.inventoryTransaction.groupBy({
                by: ['productId'], where: { ...where, type: 'IN', batchId: null }, _count: { _all: true },
            });
            // Prisma Int aggregates are JavaScript numbers. Fail closed rather
            // than publishing rounded quantities; the existing administrative
            // SQL diagnostic retains arbitrary-size numeric strings.
            exactInteger(total);
            for (const row of [...groups, ...eligible, ...expired]) exactInteger(row._sum.quantity ?? 0);
            for (const row of [...groups, ...negative, ...untraced]) exactInteger(row._count._all);
            return {
                total, page, limit, observedAt: now.toISOString(), expiryCutoff: cutoff.toISOString(),
                data: products.map(product => {
                    const rows = groups.filter(row => row.productId === product.id);
                    const physicalBatchQuantity = rows.reduce((sum, row) => exactInteger(sum + (row._sum.quantity ?? 0)), 0);
                    const batchCount = rows.reduce((sum, row) => exactInteger(sum + row._count._all), 0);
                    return {
                        ...product, physicalBatchQuantity, batchCount,
                        difference: exactInteger(product.stockQuantity - physicalBatchQuantity),
                        releasedQuantity: rows.find(row => row.status === 'RELEASED')?._sum.quantity ?? 0,
                        quarantineQuantity: rows.find(row => row.status === 'QUARANTINE')?._sum.quantity ?? 0,
                        blockedQuantity: rows.find(row => row.status === 'BLOCKED')?._sum.quantity ?? 0,
                        expiredQuantity: expired.find(row => row.productId === product.id)?._sum.quantity ?? 0,
                        eligibleReleasedQuantity: eligible.find(row => row.productId === product.id)?._sum.quantity ?? 0,
                        negativeBatchCount: negative.find(row => row.productId === product.id)?._count._all ?? 0,
                        untracedReceiptCount: untraced.find(row => row.productId === product.id)?._count._all ?? 0,
                        reservedQuantity: null,
                        availableQuantity: null,
                        historyComplete: null,
                    };
                }),
            };
        }, { isolationLevel: 'RepeatableRead' });
    }
}
