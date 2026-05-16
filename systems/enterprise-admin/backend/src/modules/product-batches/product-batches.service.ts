import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { requireTenantId } from '../../lib/tenant.context';

export interface CreateProductBatchDto {
  productId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  costPrice: number;
}

export interface UpdateProductBatchDto {
  quantity?: number;
  costPrice?: number;
  expiryDate?: string;
}

export class ProductBatchService {
  static async getAll(filters?: { productId?: string; expiringSoon?: boolean }) {
    const tenantId = requireTenantId();

    const where: Record<string, unknown> = { tenantId };

    if (filters?.productId) {
      where.productId = filters.productId;
    }

    if (filters?.expiringSoon) {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      where.expiryDate = { lte: thirtyDaysFromNow };
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
      },
    });
    if (!batch) throw new AppError(404, 'Product batch not found');
    return batch;
  }

  static async create(data: CreateProductBatchDto) {
    const tenantId = requireTenantId();

    // Verify product belongs to tenant
    const product = await prisma.product.findFirst({
      where: { id: data.productId, tenantId },
    });
    if (!product) throw new AppError(404, 'Product not found');

    return prisma.productBatch.create({
      data: {
        tenantId,
        productId: data.productId,
        batchNumber: data.batchNumber,
        expiryDate: new Date(data.expiryDate),
        quantity: data.quantity,
        costPrice: data.costPrice,
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
    });
  }

  static async update(id: string, data: UpdateProductBatchDto) {
    const tenantId = requireTenantId();
    const batch = await prisma.productBatch.findFirst({ where: { id, tenantId } });
    if (!batch) throw new AppError(404, 'Product batch not found');

    return prisma.productBatch.update({
      where: { id },
      data: {
        ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
        ...(data.costPrice !== undefined ? { costPrice: data.costPrice } : {}),
        ...(data.expiryDate !== undefined ? { expiryDate: new Date(data.expiryDate) } : {}),
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

    await prisma.productBatch.delete({ where: { id } });
  }
}
