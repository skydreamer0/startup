import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { requireTenantId } from '../../lib/tenant.context';
import { CheckoutDto } from './pos.schema';

export class CheckoutService {
  static async checkout(dto: CheckoutDto) {
    const tenantId = requireTenantId();

    return prisma.$transaction(async (tx) => {
      // 1. Validate shift
      const shift = await tx.shift.findFirst({ where: { id: dto.shiftId, tenantId } });
      if (!shift) throw new AppError(404, 'Shift not found');
      if (shift.status !== 'OPEN') throw new AppError(400, 'Shift is not open');

      // 2. Resolve salesStaffId
      const salesStaffId = dto.salesStaffId ?? shift.staffId;

      // 3. Resolve customer (WALK_IN fallback)
      let customerId = dto.customerId;
      if (!customerId) {
        const walkIn = await tx.customer.findFirst({ where: { phone: 'WALK_IN', tenantId } });
        if (!walkIn) throw new AppError(500, 'WALK_IN system customer not seeded');
        customerId = walkIn.id;
      }

      // 4. Process each cart item: validate + FIFO batch deduction plan
      let subtotal = 0;
      const itemsData: {
        productId: string;
        quantity: number;
        unitPrice: number;
        discountRate: number;
        finalUnitPrice: number;
        batchDeductions: { id: string; deduct: number }[];
      }[] = [];

      for (const cartItem of dto.cartItems) {
        const product = await tx.product.findFirst({
          where: { id: cartItem.productId, tenantId },
        });
        if (!product) throw new AppError(404, `Product ${cartItem.productId} not found`);
        if (product.stockQuantity < cartItem.quantity) {
          throw new AppError(400, `Insufficient stock for "${product.name}": available ${product.stockQuantity}`);
        }

        // FIFO: select batches ordered by expiry date
        const batches = await tx.productBatch.findMany({
          where: { productId: cartItem.productId, tenantId, quantity: { gt: 0 } },
          orderBy: { expiryDate: 'asc' },
        });

        let remaining = cartItem.quantity;
        const batchDeductions: { id: string; deduct: number }[] = [];
        for (const batch of batches) {
          if (remaining <= 0) break;
          const deduct = Math.min(batch.quantity, remaining);
          batchDeductions.push({ id: batch.id, deduct });
          remaining -= deduct;
        }

        if (remaining > 0) {
          throw new AppError(400, `Insufficient batch stock for "${product.name}"`);
        }

        const discountRate = cartItem.discountRate ?? 0;
        const finalUnitPrice = product.retailPrice * (1 - discountRate / 100);
        subtotal += finalUnitPrice * cartItem.quantity;

        itemsData.push({
          productId: cartItem.productId,
          quantity: cartItem.quantity,
          unitPrice: product.retailPrice,
          discountRate,
          finalUnitPrice,
          batchDeductions,
        });
      }

      const orderDiscountAmount = dto.orderDiscountAmount ?? 0;
      const totalAmount = Math.max(0, subtotal - orderDiscountAmount);

      // 5. Generate orderNumber (POS-YYYYMMDD-NNNNN, tenant-scoped daily sequence)
      const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const prefix = `POS-${todayStr}-`;
      const lastOrder = await tx.order.findFirst({
        where: { tenantId, orderNumber: { startsWith: prefix } },
        orderBy: { orderNumber: 'desc' },
      });
      const nextSeq = lastOrder?.orderNumber
        ? parseInt(lastOrder.orderNumber.slice(-5), 10) + 1
        : 1;
      const orderNumber = `${prefix}${String(nextSeq).padStart(5, '0')}`;

      // 6. Create Order + OrderItems
      const order = await tx.order.create({
        data: {
          tenantId,
          customerId,
          orderNumber,
          orderType: 'WALK_IN',
          status: 'completed',
          paymentStatus: 'paid',
          paymentMethod: dto.paymentMethod,
          totalAmount,
          discountAmount: orderDiscountAmount,
          discountNote: dto.orderDiscountNote,
          shiftId: dto.shiftId,
          salesStaffId,
          items: {
            create: itemsData.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountRate: item.discountRate,
              finalUnitPrice: item.finalUnitPrice,
            })),
          },
        },
        include: { items: true },
      });

      // 7. Apply FIFO batch deductions + update product stock
      for (const item of itemsData) {
        for (const { id, deduct } of item.batchDeductions) {
          await tx.productBatch.update({
            where: { id },
            data: { quantity: { decrement: deduct } },
          });
        }
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { decrement: item.quantity } },
        });
        await tx.inventoryTransaction.create({
          data: {
            tenantId,
            productId: item.productId,
            type: 'OUT',
            quantity: item.quantity,
            referenceId: order.id,
            notes: `POS sale — ${orderNumber}`,
          },
        });
      }

      return order;
    });
  }

  static async getProducts(filters: { q?: string; categoryId?: string; inStockOnly?: string }) {
    const tenantId = requireTenantId();
    return prisma.product.findMany({
      where: {
        tenantId,
        ...(filters.q
          ? {
              OR: [
                { name: { contains: filters.q, mode: 'insensitive' } },
                { sku: { contains: filters.q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.inStockOnly === 'true' ? { stockQuantity: { gt: 0 } } : {}),
      },
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
      take: 100,
    });
  }

  static async getStaff() {
    const tenantId = requireTenantId();
    return prisma.user.findMany({
      where: { tenantId, status: 'active', deletedAt: null },
      select: { id: true, fullName: true, email: true, employeeCode: true },
      orderBy: { fullName: 'asc' },
    });
  }

  static async getActiveShift() {
    const tenantId = requireTenantId();
    return prisma.shift.findFirst({
      where: { tenantId, status: 'OPEN' },
      include: { staff: { select: { id: true, fullName: true } } },
      orderBy: { openedAt: 'desc' },
    });
  }
}
