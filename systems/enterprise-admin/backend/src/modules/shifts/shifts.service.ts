import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { requireTenantId } from '../../lib/tenant.context';

export interface CreateShiftDto {
  staffId: string;
  openingCash?: number;
  notes?: string;
}

export interface CloseShiftDto {
  closingCash: number;
  notes?: string;
}

export class ShiftService {
  static async getAll(filters?: { status?: string }) {
    const tenantId = requireTenantId();
    return prisma.shift.findMany({
      where: {
        tenantId,
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: {
        staff: { select: { id: true, fullName: true, email: true } },
        _count: { select: { orders: true, settlements: true } },
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  static async getById(id: string) {
    const tenantId = requireTenantId();
    const shift = await prisma.shift.findFirst({
      where: { id, tenantId },
      include: {
        staff: { select: { id: true, fullName: true, email: true } },
        orders: {
          select: { id: true, totalAmount: true, paymentMethod: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        settlements: true,
      },
    });
    if (!shift) throw new AppError(404, 'Shift not found');
    return shift;
  }

  static async create(data: CreateShiftDto) {
    const tenantId = requireTenantId();
    // 檢查是否有未關閉的班別（同 staff）
    const openShift = await prisma.shift.findFirst({
      where: { tenantId, staffId: data.staffId, status: 'OPEN' },
    });
    if (openShift) throw new AppError(400, 'Staff already has an open shift');

    return prisma.shift.create({
      data: {
        tenantId,
        staffId: data.staffId,
        openingCash: data.openingCash ?? 0,
        notes: data.notes,
        status: 'OPEN',
      },
      include: {
        staff: { select: { id: true, fullName: true, email: true } },
      },
    });
  }

  static async close(id: string, data: CloseShiftDto) {
    const tenantId = requireTenantId();
    const shift = await prisma.shift.findFirst({ where: { id, tenantId } });
    if (!shift) throw new AppError(404, 'Shift not found');
    if (shift.status === 'CLOSED') throw new AppError(400, 'Shift is already closed');

    return prisma.shift.update({
      where: { id },
      data: {
        status: 'CLOSED',
        closingCash: data.closingCash,
        closedAt: new Date(),
        notes: data.notes ?? shift.notes,
      },
    });
  }

  static async delete(id: string) {
    const tenantId = requireTenantId();
    const shift = await prisma.shift.findFirst({ where: { id, tenantId } });
    if (!shift) throw new AppError(404, 'Shift not found');
    if (shift.status === 'OPEN') throw new AppError(400, 'Cannot delete an open shift');
    await prisma.shift.delete({ where: { id } });
  }

  static async getReport(id: string) {
    const tenantId = requireTenantId();
    const shift = await prisma.shift.findFirst({
      where: { id, tenantId },
      include: {
        staff: { select: { id: true, fullName: true } },
        orders: {
          where: { status: { in: ['completed', 'refunded'] } },
          select: { id: true, orderNumber: true, status: true, totalAmount: true, discountAmount: true, paymentMethod: true, createdAt: true },
        },
      },
    });
    if (!shift) throw new AppError(404, 'Shift not found');

    const completed = shift.orders.filter((o) => o.status === 'completed');
    const refunded = shift.orders.filter((o) => o.status === 'refunded');

    const paymentBreakdown: Record<string, number> = {};
    let grossSales = 0;
    for (const o of completed) {
      const amt = Number(o.totalAmount);
      paymentBreakdown[o.paymentMethod] = (paymentBreakdown[o.paymentMethod] ?? 0) + amt;
      grossSales += amt;
    }

    const refundTotal = refunded.reduce((s, o) => s + Number(o.totalAmount), 0);
    const netTotal = grossSales - refundTotal;
    const discountTotal = completed.reduce((s, o) => s + Number(o.discountAmount), 0);
    const cashIn = paymentBreakdown['CASH'] ?? 0;
    const cashBalance = Number(shift.openingCash) + cashIn - refundTotal;

    return {
      shiftId: shift.id,
      staffName: shift.staff.fullName,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt ?? null,
      openingCash: Number(shift.openingCash),
      closingCash: shift.closingCash ? Number(shift.closingCash) : null,
      orderCount: completed.length,
      refundCount: refunded.length,
      grossSales,
      discountTotal,
      refundTotal,
      netTotal,
      paymentBreakdown,
      cashBalance,
    };
  }
}
