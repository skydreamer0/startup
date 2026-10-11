import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: { shift: { findFirst: vi.fn() }, order: { findMany: vi.fn() } },
}));
vi.mock('../lib/tenant.context', () => ({ requireTenantId: () => 'tenant-1' }));

import { prisma } from '../lib/prisma';
import { ShiftService } from '../modules/shifts/shifts.service';
import { DailySettlementService } from '../modules/daily-settlements/daily-settlements.service';

beforeEach(() => vi.clearAllMocks());

describe('split-payment readers (mocked persistence)', () => {
  it('daily settlement reads the stored 60 cash + 40 card rather than the primary method', async () => {
    vi.mocked(prisma.shift.findFirst).mockResolvedValue({ id: 'shift-1' } as never);
    vi.mocked(prisma.order.findMany).mockResolvedValue([{
      status: 'completed', totalAmount: 100, paymentMethod: 'CASH',
      payments: [{ method: 'CASH', amount: 60 }, { method: 'CARD', amount: 40 }],
    }] as never);
    expect(await DailySettlementService.calculate('shift-1')).toEqual({
      shiftId: 'shift-1', totalOrders: 1, totalSales: 100,
      cashAmount: 60, cardAmount: 40, linePayAmount: 0, otherAmount: 0,
    });
  });
});

it('shift report reads the same stored split and expected cash intake', async () => {
  vi.mocked(prisma.shift.findFirst).mockResolvedValue({
    id: 'shift-1', staff: { fullName: 'Staff' }, openingCash: 200,
    orders: [{ status: 'completed', totalAmount: 100, discountAmount: 0,
      paymentMethod: 'CASH', payments: [{ method: 'CASH', amount: 60 }, { method: 'CARD', amount: 40 }] }],
  } as never);
  expect(await ShiftService.getReport('shift-1')).toMatchObject({
    orderCount: 1, grossSales: 100, netTotal: 100,
    paymentBreakdown: { CASH: 60, CARD: 40 }, cashBalance: 260,
  });
});

it('daily keeps its original paid cohort and non-completed classification', async () => {
  vi.mocked(prisma.shift.findFirst).mockResolvedValue({ id: 'shift-1' } as never);
  vi.mocked(prisma.order.findMany).mockResolvedValue(['refunded', 'pending'].map(status => ({
    status, totalAmount: 100, paymentMethod: 'CASH',
    payments: [{ method: 'CASH', amount: 60 }, { method: 'CARD', amount: 40 }],
  })) as never);
  expect(await DailySettlementService.calculate('shift-1')).toMatchObject({
    totalOrders: 2, totalSales: 200, cashAmount: 200, cardAmount: 0,
  });
  expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { tenantId: 'tenant-1', shiftId: 'shift-1', paymentStatus: 'paid' },
    select: expect.objectContaining({ payments: { where: { tenantId: 'tenant-1' }, select: { method: true, amount: true } } }),
  }));
});

it('shift preserves its existing refund arithmetic without treating it as accepted policy', async () => {
  vi.mocked(prisma.shift.findFirst).mockResolvedValue({
    id: 'shift-1', staff: { fullName: 'Staff' }, openingCash: 200,
    orders: [
      { status: 'completed', totalAmount: 100, discountAmount: 0, paymentMethod: 'CASH', payments: [] },
      { status: 'refunded', totalAmount: 80, discountAmount: 0, paymentMethod: 'CARD', payments: [{ method: 'CARD', amount: 80 }] },
    ],
  } as never);
  expect(await ShiftService.getReport('shift-1')).toMatchObject({
    orderCount: 1, refundCount: 1, grossSales: 100, refundTotal: 80,
    netTotal: 20, paymentBreakdown: { CASH: 100 }, cashBalance: 220,
  });
  expect(prisma.shift.findFirst).toHaveBeenCalledWith(expect.objectContaining({
    where: { id: 'shift-1', tenantId: 'tenant-1' },
    include: expect.objectContaining({ orders: expect.objectContaining({
      where: { status: { in: ['completed', 'refunded'] } },
      select: expect.objectContaining({ payments: { where: { tenantId: 'tenant-1' }, select: { method: true, amount: true } } }),
    }) }),
  }));
});

it('daily groups TRANSFER and unknown methods into its unchanged other bucket', async () => {
  vi.mocked(prisma.shift.findFirst).mockResolvedValue({ id: 'shift-1' } as never);
  vi.mocked(prisma.order.findMany).mockResolvedValue([{
    status: 'completed', totalAmount: 100, paymentMethod: 'CASH', payments: [
      { method: 'CASH', amount: 10 }, { method: 'CARD', amount: 20 },
      { method: 'LINE_PAY', amount: 30 }, { method: 'TRANSFER', amount: 15 }, { method: 'OTHER', amount: 25 },
    ],
  }] as never);
  expect(await DailySettlementService.calculate('shift-1')).toMatchObject({
    totalSales: 100, cashAmount: 10, cardAmount: 20, linePayAmount: 30, otherAmount: 40,
  });
});

it('daily combines stored TRANSFER0.1 and OTHER0.2 before the numeric API boundary', async () => {
  vi.mocked(prisma.shift.findFirst).mockResolvedValue({ id: 'shift-1' } as never);
  vi.mocked(prisma.order.findMany).mockResolvedValue([{
    status: 'completed', totalAmount: '0.3', paymentMethod: 'TRANSFER',
    payments: [{ method: 'TRANSFER', amount: '0.1' }, { method: 'OTHER', amount: '0.2' }],
  }] as never);
  expect(await DailySettlementService.calculate('shift-1')).toMatchObject({ totalSales: 0.3, otherAmount: 0.3 });
});

it('daily adds separate persisted 0.1 and 0.2 order totals to numeric 0.3', async () => {
  vi.mocked(prisma.shift.findFirst).mockResolvedValue({ id: 'shift-1' } as never);
  vi.mocked(prisma.order.findMany).mockResolvedValue(['0.1', '0.2'].map(amount => ({
    status: 'completed', totalAmount: new Prisma.Decimal(amount), paymentMethod: 'CARD',
    payments: [{ method: 'CASH', amount: new Prisma.Decimal(amount) }],
  })) as never);
  expect(await DailySettlementService.calculate('shift-1')).toEqual({
    shiftId: 'shift-1', totalOrders: 2, totalSales: 0.3,
    cashAmount: 0.3, cardAmount: 0, linePayAmount: 0, otherAmount: 0,
  });
});

it('shift adds completed order totals precisely while leaving its refund and net formulas intact', async () => {
  vi.mocked(prisma.shift.findFirst).mockResolvedValue({
    id: 'shift-1', staff: { fullName: 'Staff' }, openingCash: 0,
    orders: [
      ...['0.1', '0.2'].map(amount => ({
        status: 'completed', totalAmount: new Prisma.Decimal(amount), discountAmount: 0,
        paymentMethod: 'CASH', payments: [{ method: 'CASH', amount: new Prisma.Decimal(amount) }],
      })),
      { status: 'refunded', totalAmount: new Prisma.Decimal('0.4'), discountAmount: 0,
        paymentMethod: 'CARD', payments: [{ method: 'CARD', amount: new Prisma.Decimal('0.4') }] },
    ],
  } as never);
  expect(await ShiftService.getReport('shift-1')).toMatchObject({
    orderCount: 2, refundCount: 1, grossSales: 0.3, refundTotal: 0.4,
    netTotal: 0.3 - 0.4, discountTotal: 0,
    paymentBreakdown: { CASH: 0.3 }, cashBalance: 0.3 - 0.4,
  });
});

it('empty daily and shift cohorts retain numeric zero totals and counts', async () => {
  vi.mocked(prisma.shift.findFirst).mockResolvedValue({
    id: 'shift-1', staff: { fullName: 'Staff' }, openingCash: 0, orders: [],
  } as never);
  vi.mocked(prisma.order.findMany).mockResolvedValue([]);
  expect(await DailySettlementService.calculate('shift-1')).toMatchObject({ totalOrders: 0, totalSales: 0 });
  expect(await ShiftService.getReport('shift-1')).toMatchObject({ orderCount: 0, grossSales: 0, netTotal: 0 });
});
