import type { Product } from '@prisma/client';
import type { prisma } from './prisma';
import { AppError } from './errors';
import { requireTenantId } from './tenant.context';

interface SaleQuantity {
  productId: string;
  quantity: number;
}

/** Internal aggregate projection debit used by InventoryPostingService.
 * Command dedupe and other writers remain separate work in #29/#30.
 */
export async function deductSaleStock(tx: Pick<typeof prisma, 'product'>, items: readonly SaleQuantity[]) {
  const tenantId = requireTenantId();
  if (items.length === 0) throw new AppError(400, 'Order must have at least one item');

  const demand = new Map<string, number>();
  for (const item of items) {
    const quantity = (demand.get(item.productId) ?? 0) + item.quantity;
    if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || quantity > 2_147_483_647) {
      throw new AppError(400, 'Sale quantity must be a positive integer within the stock range');
    }
    demand.set(item.productId, quantity);
  }

  const products = new Map<string, Product>();
  // Every participating sale locks product rows in the same order, regardless
  // of cart order. The conditional update rechecks stock after waiting on a lock.
  for (const productId of [...demand.keys()].sort()) {
    const quantity = demand.get(productId)!;
    const product = await tx.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) throw new AppError(404, `Product ${productId} not found`);
    if (product.stockQuantity < quantity) {
      throw new AppError(400, `Insufficient stock for "${product.name}": available ${product.stockQuantity}`);
    }
    const result = await tx.product.updateMany({
      where: { id: productId, tenantId, stockQuantity: { gte: quantity } },
      data: { stockQuantity: { decrement: quantity } },
    });
    if (result.count !== 1) throw new AppError(400, `Insufficient stock for "${product.name}"`);
    products.set(productId, product);
  }
  return products;
}
