import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { requireTenantId } from '../../lib/tenant.context';

export interface CreateDailySettlementDto {
  shiftId: string;
  date: string;
  totalSales?: number;
  totalOrders?: number;
  cashAmount?: number;
  cardAmount?: number;
  linePayAmount?: number;
  otherAmount?: number;
  notes?: string;
}

export class DailySettlementService {
  static async getAll(filters?: { shiftId?: string; startDate?: string; endDate?: string }) {
    const tenantId = requireTenantId();

    const where: Record<string, unknown> = { tenantId };

    if (filters?.shiftId) {
      where.shiftId = filters.shiftId;
    }

    if (filters?.startDate || filters?.endDate) {
      const dateFilter: Record<string, Date> = {};
      if (filters.startDate) dateFilter.gte = new Date(filters.startDate);
      if (filters.endDate) dateFilter.lte = new Date(filters.endDate);
      where.date = dateFilter;
    }

    return prisma.dailySettlement.findMany({
      where,
      include: {
        shift: {
          select: {
            id: true,
            status: true,
            openedAt: true,
            closedAt: true,
            staff: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
      orderBy: { date: 'desc' },
    });
  }

  static async getById(id: string) {
    const tenantId = requireTenantId();
    const settlement = await prisma.dailySettlement.findFirst({
      where: { id, tenantId },
      include: {
        shift: {
          include: {
            staff: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });
    if (!settlement) throw new AppError(404, 'Daily settlement not found');
    return settlement;
  }

  static async calculate(shiftId: string) {
    const tenantId = requireTenantId();

    // Verify shift belongs to tenant
    const shift = await prisma.shift.findFirst({ where: { id: shiftId, tenantId } });
    if (!shift) throw new AppError(404, 'Shift not found');

    // Aggregate orders for this shift (only paid orders)
    const orders = await prisma.order.findMany({
      where: {
        tenantId,
        shiftId,
        paymentStatus: 'paid',
      },
      select: {
        totalAmount: true,
        paymentMethod: true,
      },
    });

    const totalOrders = orders.length;
    let totalSales = 0;
    let cashAmount = 0;
    let cardAmount = 0;
    let linePayAmount = 0;
    let otherAmount = 0;

    for (const order of orders) {
      totalSales += order.totalAmount;
      switch (order.paymentMethod) {
        case 'CASH':
          cashAmount += order.totalAmount;
          break;
        case 'CARD':
          cardAmount += order.totalAmount;
          break;
        case 'LINE_PAY':
          linePayAmount += order.totalAmount;
          break;
        default:
          otherAmount += order.totalAmount;
          break;
      }
    }

    return {
      shiftId,
      totalOrders,
      totalSales,
      cashAmount,
      cardAmount,
      linePayAmount,
      otherAmount,
    };
  }

  static async create(data: CreateDailySettlementDto) {
    const tenantId = requireTenantId();

    // Verify shift belongs to tenant
    const shift = await prisma.shift.findFirst({ where: { id: data.shiftId, tenantId } });
    if (!shift) throw new AppError(404, 'Shift not found');

    return prisma.dailySettlement.create({
      data: {
        tenantId,
        shiftId: data.shiftId,
        date: new Date(data.date),
        totalSales: data.totalSales ?? 0,
        totalOrders: data.totalOrders ?? 0,
        cashAmount: data.cashAmount ?? 0,
        cardAmount: data.cardAmount ?? 0,
        linePayAmount: data.linePayAmount ?? 0,
        otherAmount: data.otherAmount ?? 0,
        notes: data.notes,
      },
      include: {
        shift: {
          select: {
            id: true,
            status: true,
            openedAt: true,
            staff: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });
  }

  static async confirm(id: string) {
    const tenantId = requireTenantId();
    const settlement = await prisma.dailySettlement.findFirst({ where: { id, tenantId } });
    if (!settlement) throw new AppError(404, 'Daily settlement not found');
    if (settlement.confirmedAt) throw new AppError(400, 'Settlement is already confirmed');

    return prisma.dailySettlement.update({
      where: { id },
      data: { confirmedAt: new Date() },
    });
  }
}
