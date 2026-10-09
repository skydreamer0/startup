import { BatchStockStatus, Prisma, ProductBatch } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';
import { saleExpiryCutoff } from '../../lib/batch-expiry';
import { AppError } from '../../lib/errors';
import { changeBatchStatusSchema, correctBatchCostSchema, correctBatchExpirySchema } from './product-batches.schema';

type Actor = { userId: string; permissions: string[] };
type Change = { operation: 'STATUS'; status: BatchStockStatus; reason: string }
  | { operation: 'EXPIRY'; expiryDate: string; reason: string }
  | { operation: 'COST'; costPrice: number; reason: string };
const snapshot = (batch: Pick<ProductBatch, 'status' | 'expiryDate' | 'costPrice'>) => ({
  status: batch.status, expiryDate: batch.expiryDate.toISOString(), costPrice: batch.costPrice.toString(),
});

/** Only field corrections: never posts stock or rewrites order/movement snapshots. */
export class BatchAuditService {
  static async change(id: string, change: Change, actor: Actor | undefined) {
    const tenantId = requireTenantId();
    if (!actor?.userId) throw new AppError(401, 'Authentication required');
    if (!actor.permissions.includes('update:products')) throw new AppError(403, '批次更正需要 update:products 權限');
    const schema = change.operation === 'STATUS' ? changeBatchStatusSchema.body
      : change.operation === 'EXPIRY' ? correctBatchExpirySchema.body
        : change.operation === 'COST' ? correctBatchCostSchema.body : undefined;
    const { operation: _operation, ...body } = change;
    void _operation;
    const parsed = schema?.safeParse(body);
    if (!parsed?.success) throw new AppError(400, '請提供有效的更正欄位與原因（最多 1000 字）');
    if (change.operation === 'STATUS' && change.status === 'RELEASED' && !actor.permissions.includes('release:product_batches')) {
      throw new AppError(403, '放行批次需要獨立的 release:product_batches 權限');
    }
    if (change.operation === 'COST' && new Prisma.Decimal(change.costPrice).decimalPlaces() > 4) {
      throw new AppError(400, '批次成本最多四位小數');
    }
    return prisma.$transaction(async (tx) => {
      const initial = await tx.productBatch.findFirst({ where: { id, tenantId } });
      if (!initial) throw new AppError(404, 'Product batch not found');
      // Same lock order as sale/receipt posting. Do not touch stock to lock it.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM products WHERE id = ${initial.productId} AND tenant_id = ${tenantId} FOR UPDATE`;
      if (locked.length !== 1) throw new AppError(404, 'Product not found');
      // Read again after waiting: another correction or sale may have committed.
      const batch = await tx.productBatch.findFirst({ where: { id, tenantId, productId: initial.productId } });
      if (!batch) throw new AppError(404, 'Product batch not found');
      const user = await tx.user.findFirst({ where: { id: actor.userId, tenantId, status: 'active', deletedAt: null }, select: { id: true } });
      if (!user) throw new AppError(403, '操作者不屬於此租戶或已停用');
      const cutoff = saleExpiryCutoff(); // Recompute after the product lock, including Taipei midnight.
      const data: Prisma.ProductBatchUpdateManyMutationInput = {};
      if (change.operation === 'STATUS') {
        const transitions: Record<BatchStockStatus, readonly BatchStockStatus[]> = {
          QUARANTINE: ['RELEASED', 'BLOCKED'], BLOCKED: ['QUARANTINE', 'RELEASED'], RELEASED: ['QUARANTINE', 'BLOCKED'],
        };
        if (!transitions[batch.status].includes(change.status)) throw new AppError(400, '此批次狀態轉換無效');
        if (change.status === 'RELEASED' && batch.expiryDate < cutoff) throw new AppError(400, '到期當日或過期批次不可放行');
        data.status = change.status;
      } else if (change.operation === 'EXPIRY') {
        const expiryDate = new Date(change.expiryDate);
        if (expiryDate.getTime() === batch.expiryDate.getTime()) throw new AppError(400, '效期未變更');
        // An expired released lot cannot become saleable just by extending its
        // expiry. First explicitly quarantine/block it, correct, then release.
        if (batch.status === 'RELEASED' && (batch.expiryDate < cutoff || expiryDate < cutoff)) {
          throw new AppError(400, '到期批次的效期更正須先隔離或封鎖；不得藉更正效期維持可售');
        }
        data.expiryDate = expiryDate;
      } else {
        const costPrice = new Prisma.Decimal(change.costPrice);
        if (costPrice.equals(batch.costPrice)) throw new AppError(400, '成本未變更');
        data.costPrice = costPrice;
      }
      const updated = await tx.productBatch.updateMany({ where: { id, tenantId, productId: batch.productId }, data });
      if (updated.count !== 1) throw new AppError(409, '批次已變更，請重新整理');
      const after = await tx.productBatch.findFirstOrThrow({ where: { id, tenantId }, include: { product: { select: { id: true, name: true, sku: true } } } });
      await tx.productBatchChange.create({ data: {
        tenantId, batchId: id, productId: batch.productId, actorId: actor.userId,
        operation: change.operation, before: snapshot(batch), after: snapshot(after), reason: change.reason.trim(),
      } });
      return after;
    });
  }

  static async history(id: string, cursor?: string) {
    const tenantId = requireTenantId();
    if (!await prisma.productBatch.findFirst({ where: { id, tenantId }, select: { id: true } })) throw new AppError(404, 'Product batch not found');
    if (cursor && !await prisma.productBatchChange.findFirst({ where: { id: cursor, batchId: id, tenantId }, select: { id: true } })) {
      throw new AppError(400, 'Invalid history cursor');
    }
    const rows = await prisma.productBatchChange.findMany({
      where: { batchId: id, tenantId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    return { items: rows.slice(0, 50), nextCursor: rows.length > 50 ? rows[49].id : null };
  }
}
