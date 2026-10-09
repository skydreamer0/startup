import { randomUUID } from 'node:crypto';
import type { BatchStockStatus } from '@prisma/client';
import { z } from 'zod';
import type { prisma } from './prisma';
import { AppError } from './errors';
import { requireTenantId } from './tenant.context';
import { deductSaleStock } from './sale-stock';
import { saleExpiryCutoff } from './batch-expiry';
import { systemClock, type Clock } from './business-day';

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
 * Receipts use the same product-row lock before lot and movement writes.
 * Physical returns, adjustments and reconciliation remain follow-up work.
 */
export class InventoryPostingService {
  static async receiveBatch(
    tx: Pick<typeof prisma, 'product' | 'productBatch' | 'inventoryTransaction'>,
    data: { productId: string; batchNumber: string; expiryDate: string; quantity: number; costPrice: number; status?: BatchStockStatus },
  ) {
    const tenantId = requireTenantId();
    if (!Number.isSafeInteger(data.quantity) || data.quantity <= 0 || data.quantity > 2_147_483_647) {
      throw new AppError(400, '進貨數量必須為有效正整數');
    }
    const expiryDate = new Date(data.expiryDate);
    if (!z.string().datetime().safeParse(data.expiryDate).success || !Number.isFinite(expiryDate.getTime())) throw new AppError(400, '請提供完整且有效的批次效期');
    if (!Number.isFinite(data.costPrice) || data.costPrice <= 0) throw new AppError(400, '進貨成本必須大於零');
    const product = await tx.product.findFirst({ where: { id: data.productId, tenantId } });
    if (!product) throw new AppError(404, 'Product not found');
    const claimed = await tx.product.updateMany({
      where: { id: data.productId, tenantId, stockQuantity: { gte: 0, lte: 2_147_483_647 - data.quantity } },
      data: { stockQuantity: { increment: data.quantity } },
    });
    if (claimed.count !== 1) throw new AppError(400, '商品庫存帳量異常或超出數量上限，請先核對');
    // A receipt can wait on a competing sale/receipt through store midnight.
    if (data.status === 'RELEASED' && expiryDate < saleExpiryCutoff()) throw new AppError(400, '到期當日或過期批次不可驗收為可售');
    const batch = await tx.productBatch.create({
      data: { tenantId, productId: data.productId, batchNumber: data.batchNumber,
        quantity: data.quantity, costPrice: data.costPrice, expiryDate, status: data.status ?? 'QUARANTINE' },
      include: { product: { select: { id: true, name: true, sku: true } } },
    });
    await tx.inventoryTransaction.create({ data: {
      tenantId, productId: data.productId, batchId: batch.id, referenceId: batch.id,
      type: 'IN', quantity: data.quantity, costPriceAtReceipt: batch.costPrice, notes: `批次進貨 ${batch.batchNumber}`,
    } });
    return batch;
  }

  static async debitSale(tx: Pick<typeof prisma, 'product' | 'productBatch'>, items: readonly SaleLine[], clock: Clock = systemClock) {
    const tenantId = requireTenantId();
    const products = await deductSaleStock(tx, items);
    const lines: DebitedLine[] = [];
    for (const item of items) {
      const product = products.get(item.productId)!;
      const batches = await tx.productBatch.findMany({
        where: {
          tenantId, productId: item.productId, quantity: { gt: 0 },
          status: 'RELEASED', expiryDate: { gte: saleExpiryCutoff(clock()) },
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
            expiryDate: { equals: batch.expiryDate, gte: saleExpiryCutoff(clock()) },
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
