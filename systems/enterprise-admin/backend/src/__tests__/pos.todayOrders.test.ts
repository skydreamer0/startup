import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock('../lib/prisma', () => ({ prisma: { order: { findMany } } }));

import { tenantContext } from '../lib/tenant.context';
import { CheckoutService } from '../modules/pos/checkout.service';

const inTenant = <T>(id: string, work: () => T) => tenantContext.run({ tenantId: id, plan: 'pro' }, work);
const clockAt = (instant: string) => () => new Date(instant);
const start = new Date('2026-10-10T16:00:00.000Z');
const end = new Date('2026-10-11T16:00:00.000Z');

beforeEach(() => { vi.resetAllMocks(); findMany.mockResolvedValue([]); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('CheckoutService.getTodayOrders — Taipei midnight read window', () => {
  it.each([
    ['2026-10-10T15:59:59.999Z', '2026-10-09T16:00:00.000Z', '2026-10-10T16:00:00.000Z'],
    ['2026-10-10T16:00:00.000Z', start.toISOString(), end.toISOString()],
    ['2026-10-11T15:59:59.999Z', start.toISOString(), end.toISOString()],
    ['2026-10-11T16:00:00.000Z', end.toISOString(), '2026-10-12T16:00:00.000Z'],
  ])('samples %s into the existing half-open calendar', async (now, lower, upper) => {
    const clock = vi.fn(clockAt(now));
    await inTenant('tenant-a', () => CheckoutService.getTodayOrders(undefined, clock));
    expect(clock).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', createdAt: { gte: new Date(lower), lt: new Date(upper) } },
      include: { items: { include: { product: { select: { id: true, name: true, sku: true } } } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  });

  // This fixture interprets the emitted predicate only; it is not native DB evidence.
  it.each(['UTC', 'Asia/Taipei'])('returns the same bounded orders under host TZ=%s', async (tz) => {
    vi.stubEnv('TZ', tz);
    const fixtures = [
      { id: 'before', tenantId: 'tenant-a', shiftId: 'shift-a', status: 'completed', createdAt: new Date(start.getTime() - 1) },
      { id: 'at-start', tenantId: 'tenant-a', shiftId: 'shift-a', status: 'completed', createdAt: start },
      { id: 'refunded', tenantId: 'tenant-a', shiftId: 'shift-a', status: 'refunded', createdAt: new Date(end.getTime() - 1) },
      { id: 'at-end', tenantId: 'tenant-a', shiftId: 'shift-a', status: 'completed', createdAt: end },
      { id: 'future', tenantId: 'tenant-a', shiftId: 'shift-a', status: 'completed', createdAt: new Date(end.getTime() + 1) },
      { id: 'other-tenant', tenantId: 'tenant-b', shiftId: 'shift-a', status: 'completed', createdAt: start },
      { id: 'other-shift', tenantId: 'tenant-a', shiftId: 'shift-b', status: 'pending', createdAt: new Date(start.getTime() + 1) },
    ];
    findMany.mockImplementation(async ({ where, take }: {
      where: { tenantId: string; shiftId?: string; createdAt: { gte: Date; lt: Date } }; take: number;
    }) => fixtures.filter((order) => order.tenantId === where.tenantId
      && (!where.shiftId || order.shiftId === where.shiftId)
      && order.createdAt >= where.createdAt.gte && order.createdAt < where.createdAt.lt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, take));

    const clock = clockAt('2026-10-10T16:30:00.000Z');
    const result = await inTenant('tenant-a', () => CheckoutService.getTodayOrders('shift-a', clock));
    expect(result.map((order) => order.id)).toEqual(['refunded', 'at-start']);
    expect(findMany.mock.lastCall?.[0].where).toEqual({ tenantId: 'tenant-a', shiftId: 'shift-a', createdAt: { gte: start, lt: end } });
    const allShifts = await inTenant('tenant-a', () => CheckoutService.getTodayOrders(undefined, clock));
    expect(allShifts.map((order) => order.id)).toEqual(['refunded', 'other-shift', 'at-start']);
    const otherTenant = await inTenant('tenant-b', () => CheckoutService.getTodayOrders(undefined, clock));
    expect(otherTenant.map((order) => order.id)).toEqual(['other-tenant']);
  });

  it('uses the real-time default clock when the controller supplies only shiftId', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T16:30:00.000Z'));
    await inTenant('tenant-a', () => CheckoutService.getTodayOrders('shift-a'));
    expect(findMany.mock.lastCall?.[0].where).toEqual({ tenantId: 'tenant-a', shiftId: 'shift-a', createdAt: { gte: start, lt: end } });
  });

  it('fails closed without tenant context before reading the clock or orders', async () => {
    const clock = vi.fn(clockAt('2026-10-10T16:30:00.000Z'));
    await expect(CheckoutService.getTodayOrders(undefined, clock)).rejects.toThrow('Tenant context missing');
    expect(clock).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();
  });

  it('propagates a read failure rather than returning an empty successful list', async () => {
    findMany.mockRejectedValue(new Error('synthetic read failure'));
    await expect(inTenant('tenant-a', () => CheckoutService.getTodayOrders(undefined, clockAt('2026-10-10T16:30:00.000Z'))))
      .rejects.toThrow('synthetic read failure');
  });
});
