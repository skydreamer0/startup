import { randomUUID } from 'node:crypto';
import type { prisma } from './prisma';
import { AppError } from './errors';
import { requireTenantId } from './tenant.context';
import { deductSaleStock } from './sale-stock';
import { saleExpiryCutoff } from './batch-expiry';

interface SaleLine {
  productId: string;
  quantity: number;
}

interface DebitedLine extends SaleLine {
  id: string;
  allocations: { batchId: string; quantity: number; expiryDateAtSale: Date }[];
}

/** Sale posting boundary. The caller owns the transaction and creates the
 * order between debitSale and recordSale; neither method commits separately.
 * Receipts, returns, adjustments and import cutover remain follow-up work.
 */
export class InventoryPostingService {
  static async debitSale(tx: Pick<typeof prisma, 'product' | 'productBatch'>, items: readonly SaleLine[]) {
    const tenantId = requireTenantId();
    const products = await deductSaleStock(tx, items);
    const lines: DebitedLine[] = [];
    for (const item of items) {
      const product = products.get(item.productId)!;
      const batches = await tx.productBatch.findMany({
        where: {
          tenantId, productId: item.productId, quantity: { gt: 0 },
          status: 'RELEASED', expiryDate: { gte: saleExpiryCutoff() },
        },
        orderBy: [{ expiryDate: 'asc' }, { receivedAt: 'asc' }, { id: 'asc' }],
      });
      const line: DebitedLine = { ...item, id: randomUUID(), allocations: [] };
      let remaining = item.quantity;
      for (const batch of batches) {
        if (remaining === 0) break;
        const quantity = Math.min(batch.quantity, remaining);
        // Recheck both balance and eligibility after any concurrent change,
        // including a midnight boundary or a quarantine applied after selection.
        const result = await tx.productBatch.updateMany({
          where: {
            id: batch.id, tenantId, productId: item.productId,
            quantity: { gte: quantity }, status: 'RELEASED',
            expiryDate: { equals: batch.expiryDate, gte: saleExpiryCutoff() },
          },
          data: { quantity: { decrement: quantity } },
        });
        if (result.count !== 1) throw new AppError(400, `商品「${product.name}」批次庫存或效期狀態已變更，請重新確認`);
        line.allocations.push({ batchId: batch.id, quantity, expiryDateAtSale: batch.expiryDate });
        remaining -= quantity;
      }
      if (remaining > 0) throw new AppError(400, `商品「${product.name}」無足夠可出庫批次（到期當日、過期、隔離或封鎖批次不可出庫）`);
      lines.push(line);
    }
    return { products, lines };
  }

  static async recordSale(
    tx: Pick<typeof prisma, 'inventoryTransaction' | 'saleBatchAllocation'>,
    orderId: string, lines: readonly DebitedLine[], notes: string,
  ) {
    const tenantId = requireTenantId();
    for (const line of lines) {
      const movementId = randomUUID();
      await tx.inventoryTransaction.create({
        data: { id: movementId, tenantId, productId: line.productId, type: 'OUT', quantity: line.quantity, referenceId: orderId, notes },
      });
      await tx.saleBatchAllocation.createMany({
        data: line.allocations.map((allocation) => ({
          tenantId, orderId, orderItemId: line.id, productId: line.productId, movementId, ...allocation,
        })),
      });
    }
  }
}
