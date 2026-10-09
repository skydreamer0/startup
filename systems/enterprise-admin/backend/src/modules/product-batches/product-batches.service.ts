import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { requireTenantId } from '../../lib/tenant.context';
import { BatchStockStatus, Prisma } from '@prisma/client';
import { saleExpiryCutoff } from '../../lib/batch-expiry';
import { InventoryPostingService } from '../../lib/inventory-posting';

export interface CreateProductBatchDto {
  productId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  costPrice: number;
  status?: BatchStockStatus;
  reason?: string;
}

export interface UpdateProductBatchDto {
  quantity?: number;
  costPrice?: number;
  expiryDate?: string;
  status?: BatchStockStatus;
}

export class ProductBatchService {
  static async getAll(filters?: { productId?: string; expiringSoon?: boolean }) {
    const tenantId = requireTenantId();

    const where: Record<string, unknown> = { tenantId };

    if (filters?.productId) {
      where.productId = filters.productId;
    }

    if (filters?.expiringSoon) {
      // Include expired stock for action as well as advance warnings through
      // calendar day 30, regardless of the server's local timezone.
      where.expiryDate = { lt: new Date(saleExpiryCutoff().getTime() + 30 * 86_400_000) };
      where.quantity = { gt: 0 };
    }

    return prisma.productBatch.findMany({
      where,
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  static async getById(id: string) {
    const tenantId = requireTenantId();
    const batch = await prisma.productBatch.findFirst({
      where: { id, tenantId },
      include: {
        product: { select: { id: true, name: true, sku: true } },
        saleAllocations: {
          where: { tenantId },
          take: 100,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          include: { order: { select: { id: true, orderNumber: true, createdAt: true } } },
        },
        _count: { select: { saleAllocations: true } },
        receiptMovements: { where: { tenantId }, orderBy: { createdAt: 'asc' } },
      },
    });
    if (!batch) throw new AppError(404, 'Product batch not found');
    return batch;
  }

  static async create(data: CreateProductBatchDto, actor?: { userId: string; permissions: string[] }) {
    const tenantId = requireTenantId();
    const released = data.status === 'RELEASED';
    if (released && !actor?.userId) throw new AppError(401, 'Authentication required for initial release');
    if (released && !actor?.permissions.includes('release:product_batches')) {
      throw new AppError(403, '初次放行需要獨立的 release:product_batches 權限');
    }
    const reason = released ? data.reason?.trim() : undefined;
    if (released && (!reason || reason.length > 1000)) throw new AppError(400, '初次放行必須填寫原因（最多 1000 字）');
    try {
      return await prisma.$transaction(async (tx) => {
        if (released) {
          const user = await tx.user.findFirst({ where: { id: actor!.userId, tenantId, status: 'active', deletedAt: null }, select: { id: true } });
          if (!user) throw new AppError(403, '操作者不屬於此租戶或已停用');
        }
        // receiveBatch obtains the product lock and rechecks today's expiry.
        const batch = await InventoryPostingService.receiveBatch(tx, data);
        if (released) await tx.productBatchChange.create({ data: {
          tenantId, batchId: batch.id, productId: batch.productId, actorId: actor!.userId,
          operation: 'INITIAL_RELEASE', before: { exists: false },
          after: { status: batch.status, expiryDate: batch.expiryDate.toISOString(), costPrice: batch.costPrice.toString() },
          reason: reason!,
        } });
        return batch;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, '批號已存在，請核對原進貨紀錄');
      throw error;
    }
  }

  static async update(id: string, data: UpdateProductBatchDto) {
    requireTenantId();
    // No mutable fields remain on the ordinary PATCH channel. Keep this guard
    // at the service boundary as well as in HTTP validation/import callers.
    void id;
    void data;
    throw new AppError(400, '批次数量不可直接修改；效期、狀態與成本請使用附原因的專用更正作業');
  }

  static async delete(id: string) {
    const tenantId = requireTenantId();
    const batch = await prisma.productBatch.findFirst({ where: { id, tenantId } });
    if (!batch) throw new AppError(404, 'Product batch not found');
    if (batch.quantity !== 0) throw new AppError(400, 'Cannot delete a batch with remaining quantity');

    if (await prisma.saleBatchAllocation.count({ where: { tenantId, batchId: id } }) || await prisma.inventoryTransaction.count({ where: { tenantId, batchId: id } })) {
      throw new AppError(400, 'Cannot delete a batch referenced by a posting');
    }
    try {
      await prisma.productBatch.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new AppError(400, 'Cannot delete a batch referenced by a posting');
      }
      throw error;
    }
  }
}
