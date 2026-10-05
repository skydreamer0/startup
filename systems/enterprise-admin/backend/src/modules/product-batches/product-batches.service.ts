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

  static async create(data: CreateProductBatchDto) {
    requireTenantId();
    try {
      return await prisma.$transaction((tx) => InventoryPostingService.receiveBatch(tx, data));
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new AppError(409, '批號已存在，請核對原進貨紀錄');
      throw error;
    }
  }

  static async update(id: string, data: UpdateProductBatchDto) {
    const tenantId = requireTenantId();
    if (data.quantity !== undefined) throw new AppError(400, '批次数量不能直接修改，請使用庫存過帳作業');
    const batch = await prisma.productBatch.findFirst({ where: { id, tenantId } });
    if (!batch) throw new AppError(404, 'Product batch not found');

    return prisma.productBatch.update({
      where: { id },
      data: {
        ...(data.costPrice !== undefined ? { costPrice: data.costPrice } : {}),
        ...(data.expiryDate !== undefined ? { expiryDate: new Date(data.expiryDate) } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
    });
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
