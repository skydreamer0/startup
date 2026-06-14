import { prisma } from '../../lib/prisma';
import type { Prisma } from '@prisma/client';
import { AppError } from '../../lib/errors';
import { requireTenantId } from '../../lib/tenant.context';
import { tenantPersistence } from '../../lib/tenant-persistence';
import { ProductAnalyticsService } from '../analytics/product-analytics.service';
import { CrmService } from '../crm/crm.service';
import { CheckoutDto } from './pos.schema';

type PosRfmSegment = 'vip' | 'loyal' | 'new' | 'at_risk';
type PosRecommendationReason = 'REPLENISHMENT_DUE' | 'HOT_SELLER';

function daysBetween(from: Date, to: Date) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((to.getTime() - from.getTime()) / msPerDay);
}

function classifyCustomer(totalSpent: number, purchaseCount: number, daysSinceLastPurchase: number | null): PosRfmSegment {
  if (daysSinceLastPurchase !== null && daysSinceLastPurchase >= 90) return 'at_risk';
  if (totalSpent >= 10000 || purchaseCount >= 8) return 'vip';
  if (purchaseCount >= 3) return 'loyal';
  return 'new';
}

export class CheckoutService {
  static async checkout(dto: CheckoutDto) {
    const tenant = tenantPersistence();

    return prisma.$transaction(async (tx) => {
      // 1. Validate shift
      const shift = await tx.shift.findFirst({ where: tenant.where({ id: dto.shiftId }) });
      if (!shift) throw new AppError(404, 'Shift not found');
      if (shift.status !== 'OPEN') throw new AppError(400, 'Shift is not open');

      // 2. Resolve salesStaffId
      const salesStaffId = dto.salesStaffId ?? shift.staffId;

      // 3. Resolve customer (WALK_IN fallback)
      let customerId = dto.customerId;
      if (customerId) {
        const customer = await tx.customer.findFirst({
          where: tenant.where({ id: customerId }),
          select: { id: true },
        });
        if (!customer) throw new AppError(404, 'Customer not found');
      } else {
        const walkIn = await tx.customer.findFirst({ where: tenant.where({ phone: 'WALK_IN' }) });
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
          where: tenant.where({ id: cartItem.productId }),
        });
        if (!product) throw new AppError(404, `Product ${cartItem.productId} not found`);
        if (product.stockQuantity < cartItem.quantity) {
          throw new AppError(400, `Insufficient stock for "${product.name}": available ${product.stockQuantity}`);
        }

        // FIFO: select batches ordered by expiry date
        const batches = await tx.productBatch.findMany({
          where: tenant.where({ productId: cartItem.productId, quantity: { gt: 0 } }),
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
        const retailPrice = Number(product.retailPrice);
        const finalUnitPrice = retailPrice * (1 - discountRate / 100);
        subtotal += finalUnitPrice * cartItem.quantity;

        itemsData.push({
          productId: cartItem.productId,
          quantity: cartItem.quantity,
          unitPrice: retailPrice,
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
        where: tenant.where({ orderNumber: { startsWith: prefix } }),
        orderBy: { orderNumber: 'desc' },
      });
      const nextSeq = lastOrder?.orderNumber
        ? parseInt(lastOrder.orderNumber.slice(-5), 10) + 1
        : 1;
      const orderNumber = `${prefix}${String(nextSeq).padStart(5, '0')}`;

      // 6. Validate split payments if provided
      if (dto.payments && dto.payments.length > 0) {
        const paymentsTotal = dto.payments.reduce((s, p) => s + p.amount, 0);
        if (Math.abs(paymentsTotal - totalAmount) > 0.01) {
          throw new AppError(400, `付款金額合計 ${paymentsTotal} 與訂單金額 ${totalAmount} 不符`);
        }
      }

      // 7. Create Order + OrderItems
      const order = await tx.order.create({
        data: {
          tenantId: tenant.tenantId,
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
          ...(dto.payments && dto.payments.length > 0 ? {
            payments: {
              create: dto.payments.map((p) => ({
                tenantId: tenant.tenantId,
                method: p.method,
                amount: p.amount,
              })),
            },
          } : {}),
        },
        include: { items: true, payments: true },
      });

      // 8. Apply FIFO batch deductions + update product stock
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
            tenantId: tenant.tenantId,
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
    const tenant = tenantPersistence();
    const where: Prisma.ProductWhereInput = tenant.where({
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
    });

    return prisma.product.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
      take: 100,
    });
  }

  static async getStaff() {
    const tenant = tenantPersistence();
    return prisma.user.findMany({
      where: tenant.where({ status: 'active', deletedAt: null }),
      select: { id: true, fullName: true, email: true, employeeCode: true },
      orderBy: { fullName: 'asc' },
    });
  }

  static async lookupCustomer(q: string, now = new Date()) {
    const tenant = tenantPersistence();
    const query = q.trim();
    if (!query) return null;

    const customer = await prisma.customer.findFirst({
      where: {
        tenantId: tenant.tenantId,
        OR: [
          { phone: { contains: query } },
          { id: query },
        ],
      },
      include: {
        orders: {
          where: tenant.where(),
          orderBy: { createdAt: 'desc' },
          take: 3,
          include: {
            items: {
              include: {
                product: { select: { id: true, name: true, sku: true, retailPrice: true } },
              },
            },
          },
        },
      },
    });
    if (!customer) return null;

    const lastPurchaseDate = customer.lastPurchaseDate ?? customer.orders[0]?.createdAt ?? null;
    const daysSinceLastPurchase = lastPurchaseDate ? daysBetween(lastPurchaseDate, now) : null;
    const totalSpent = Number(customer.totalSpent);
    const rfmSegment = classifyCustomer(totalSpent, customer.purchaseCount, daysSinceLastPurchase);

    const recentPurchases = customer.orders.flatMap((order) =>
      order.items.map((item) => ({
        productId: item.product.id,
        name: item.product.name,
        sku: item.product.sku,
        quantity: item.quantity,
        purchasedAt: order.createdAt.toISOString(),
      })),
    ).slice(0, 5);

    const dueByProduct = new Map<string, {
      productId: string;
      name: string;
      sku: string;
      daysSincePurchase: number;
    }>();

    for (const order of customer.orders) {
      const age = daysBetween(order.createdAt, now);
      if (age < 25) continue;
      for (const item of order.items) {
        if (!dueByProduct.has(item.product.id)) {
          dueByProduct.set(item.product.id, {
            productId: item.product.id,
            name: item.product.name,
            sku: item.product.sku,
            daysSincePurchase: age,
          });
        }
      }
    }

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      rfmSegment,
      totalSpent,
      purchaseCount: customer.purchaseCount,
      lastPurchaseDate: lastPurchaseDate?.toISOString() ?? null,
      daysSinceLastPurchase,
      recentPurchases,
      supplementDueItems: Array.from(dueByProduct.values()).slice(0, 3),
    };
  }

  static async createCustomer(data: { phone: string; name?: string }) {
    const customer = await CrmService.createCustomer({ phone: data.phone, name: data.name });
    return {
      id: customer.id,
      name: customer.name ?? null,
      phone: customer.phone ?? null,
      rfmSegment: 'new' as const,
      totalSpent: 0,
      purchaseCount: 0,
      lastPurchaseDate: null,
      daysSinceLastPurchase: null,
      recentPurchases: [],
      supplementDueItems: [],
    };
  }

  static async getRecommendations(customerId: string, now = new Date()) {
    const tenant = tenantPersistence();

    const customer = await prisma.customer.findFirst({
      where: tenant.where({ id: customerId }),
      select: { id: true },
    });
    if (!customer) throw new AppError(404, 'Customer not found');

    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 25);

    const purchasedItems = await prisma.orderItem.findMany({
      where: {
        order: {
          customerId,
          tenantId: tenant.tenantId,
          createdAt: { lte: cutoff },
        },
        product: tenant.where({ stockQuantity: { gt: 0 } }),
      },
      include: {
        order: { select: { createdAt: true } },
        product: { select: { id: true, name: true, sku: true, retailPrice: true, stockQuantity: true } },
      },
      orderBy: { order: { createdAt: 'desc' } },
      take: 50,
    });

    const recommendations = new Map<string, {
      productId: string;
      name: string;
      sku: string;
      retailPrice: number;
      stockQuantity: number;
      lastPurchasedAt: string;
      daysSincePurchase: number;
      reason: PosRecommendationReason;
    }>();

    for (const item of purchasedItems) {
      if (recommendations.has(item.productId)) continue;
      recommendations.set(item.productId, {
        productId: item.product.id,
        name: item.product.name,
        sku: item.product.sku,
        retailPrice: Number(item.product.retailPrice),
        stockQuantity: item.product.stockQuantity,
        lastPurchasedAt: item.order.createdAt.toISOString(),
        daysSincePurchase: daysBetween(item.order.createdAt, now),
        reason: 'REPLENISHMENT_DUE',
      });
      if (recommendations.size >= 3) break;
    }

    return Array.from(recommendations.values());
  }

  static async getHotRecommendations(now = new Date()) {
    const tenant = tenantPersistence();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 7);

    const soldItems = await prisma.orderItem.findMany({
      where: {
        order: {
          tenantId: tenant.tenantId,
          status: 'completed',
          createdAt: { gte: startDate, lte: now },
        },
        product: tenant.where({ stockQuantity: { gt: 0 } }),
      },
      include: {
        product: { select: { id: true, name: true, sku: true, retailPrice: true, stockQuantity: true } },
      },
      take: 200,
    });

    const byProduct = new Map<string, {
      productId: string;
      name: string;
      sku: string;
      retailPrice: number;
      stockQuantity: number;
      quantitySold: number;
      reason: PosRecommendationReason;
    }>();

    for (const item of soldItems) {
      const existing = byProduct.get(item.productId);
      if (existing) {
        existing.quantitySold += item.quantity;
        continue;
      }
      byProduct.set(item.productId, {
        productId: item.product.id,
        name: item.product.name,
        sku: item.product.sku,
        retailPrice: Number(item.product.retailPrice),
        stockQuantity: item.product.stockQuantity,
        quantitySold: item.quantity,
        reason: 'HOT_SELLER',
      });
    }

    return Array.from(byProduct.values())
      .sort((a, b) => b.quantitySold - a.quantitySold)
      .slice(0, 3);
  }

  static async getReorderForecast(limit = 20) {
    requireTenantId();
    return ProductAnalyticsService.getReorderForecast(limit);
  }

  static async getActiveShift() {
    const tenant = tenantPersistence();
    return prisma.shift.findFirst({
      where: tenant.where({ status: 'OPEN' }),
      include: { staff: { select: { id: true, fullName: true } } },
      orderBy: { openedAt: 'desc' },
    });
  }

  static async getTodayOrders(shiftId?: string) {
    const tenant = tenantPersistence();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return prisma.order.findMany({
      where: tenant.where({
        createdAt: { gte: startOfDay },
        ...(shiftId ? { shiftId } : {}),
      }),
      include: {
        items: {
          include: { product: { select: { id: true, name: true, sku: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  static async getOrderById(orderId: string) {
    const tenant = tenantPersistence();
    const order = await prisma.order.findFirst({
      where: tenant.where({ id: orderId }),
      include: {
        items: {
          include: { product: { select: { id: true, name: true, sku: true } } },
        },
      },
    });
    if (!order) throw new AppError(404, 'Order not found');
    return order;
  }

  static async refundOrder(orderId: string, reason?: string) {
    const tenant = tenantPersistence();

    return prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: tenant.where({ id: orderId }),
        include: { items: true },
      });
      if (!order) throw new AppError(404, 'Order not found');
      if (order.status === 'refunded') throw new AppError(400, '此訂單已退款');
      if (order.status !== 'completed') throw new AppError(400, '只能退貨已完成的訂單');

      await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'refunded',
          discountNote: reason ? `[退貨] ${reason}` : '[退貨]',
        },
      });

      for (const item of order.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQuantity: { increment: item.quantity } },
        });
        await tx.inventoryTransaction.create({
          data: {
            tenantId: tenant.tenantId,
            productId: item.productId,
            type: 'IN',
            quantity: item.quantity,
            referenceId: orderId,
            notes: `POS 退貨 — ${order.orderNumber}`,
          },
        });
      }

      return { ...order, status: 'refunded' };
    });
  }
}
