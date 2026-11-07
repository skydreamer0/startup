import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({
  shift: { findFirst: vi.fn(), update: vi.fn() },
  dailySettlement: { findFirst: vi.fn(), update: vi.fn() },
}));
vi.mock('../lib/prisma', () => ({ prisma: database }));
vi.mock('../lib/tenant.context', () => ({ requireTenantId: () => 'tenant-1' }));

import { ShiftService } from '../modules/shifts/shifts.service';
import { DailySettlementService } from '../modules/daily-settlements/daily-settlements.service';

const knownError = (code: string) => new Prisma.PrismaClientKnownRequestError(
  'Synthetic database diagnostic', { code, clientVersion: '6.19.3' },
);

beforeEach(() => vi.resetAllMocks());

// This delegate models a conditional row update, not native PostgreSQL locking.
// Both calls read the initial snapshot before either continuation can update it.
function modelRow(
  delegate: typeof database.shift,
  initial: Record<string, unknown>,
) {
  let row = { ...initial };
  delegate.findFirst.mockImplementation(async () => ({ ...row }));
  delegate.update.mockImplementation(async ({ where, data }: {
    where: Record<string, unknown>; data: Record<string, unknown>;
  }) => {
    if (!Object.entries(where).every(([key, value]) => row[key] === value)) {
      throw knownError('P2025');
    }
    row = { ...row, ...data };
    return { ...row };
  });
  return () => ({ ...row });
}

describe('shift close transition (mocked persistence)', () => {
  it('does not let two stale OPEN reads overwrite the first closing cash and note', async () => {
    const read = modelRow(database.shift, {
      id: 'shift-1', tenantId: 'tenant-1', status: 'OPEN', notes: 'opening note',
    });
    const results = await Promise.allSettled([
      ShiftService.close('shift-1', { closingCash: 100, notes: 'first count' }),
      ShiftService.close('shift-1', { closingCash: 999, notes: 'stale count' }),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { statusCode: 409 } });
    expect(read()).toMatchObject({ status: 'CLOSED', closingCash: 100, notes: 'first count' });
    expect(database.shift.update).toHaveBeenCalledTimes(2);
    expect(database.shift.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'shift-1', tenantId: 'tenant-1', status: 'OPEN' },
    }));
  });

  it('keeps zero closing cash, an omitted note and the returned stored row', async () => {
    const read = modelRow(database.shift, {
      id: 'shift-1', tenantId: 'tenant-1', status: 'OPEN', notes: 'keep note',
    });
    expect(await ShiftService.close('shift-1', { closingCash: 0 })).toEqual(read());
    expect(read()).toMatchObject({ closingCash: 0, notes: 'keep note', closedAt: expect.any(Date) });
  });

  it('preserves an explicitly empty close note', async () => {
    modelRow(database.shift, { id: 'shift-1', tenantId: 'tenant-1', status: 'OPEN', notes: 'old' });
    expect(await ShiftService.close('shift-1', { closingCash: 10, notes: '' })).toMatchObject({ notes: '' });
  });

  it('keeps existing 400 for an already closed shift without writing', async () => {
    database.shift.findFirst.mockResolvedValue({ status: 'CLOSED' });
    await expect(ShiftService.close('shift-1', { closingCash: 1 })).rejects.toMatchObject({ statusCode: 400 });
    expect(database.shift.update).not.toHaveBeenCalled();
  });

  it('keeps missing or tenant-hidden shifts at 404 without writing', async () => {
    database.shift.findFirst.mockResolvedValue(null);
    await expect(ShiftService.close('foreign', { closingCash: 1 })).rejects.toMatchObject({ statusCode: 404 });
    expect(database.shift.findFirst).toHaveBeenCalledExactlyOnceWith({ where: { id: 'foreign', tenantId: 'tenant-1' } });
    expect(database.shift.update).not.toHaveBeenCalled();
  });
});

describe('daily settlement confirmation (mocked persistence)', () => {
  it('allows one stale unconfirmed reader to confirm and rejects the other without overwriting', async () => {
    const read = modelRow(database.dailySettlement, {
      id: 'settlement-1', tenantId: 'tenant-1', confirmedAt: null, totalSales: '100.0000',
    });
    const results = await Promise.allSettled([
      DailySettlementService.confirm('settlement-1'),
      DailySettlementService.confirm('settlement-1'),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1]).toMatchObject({ status: 'rejected', reason: { statusCode: 409 } });
    if (results[0].status === 'fulfilled') expect(read()).toEqual(results[0].value);
    expect(database.dailySettlement.update).toHaveBeenCalledTimes(2);
    expect(database.dailySettlement.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'settlement-1', tenantId: 'tenant-1', confirmedAt: null },
      data: { confirmedAt: expect.any(Date) },
    }));
  });

  it('keeps the returned confirmation and all settlement amounts unchanged', async () => {
    const read = modelRow(database.dailySettlement, {
      id: 'settlement-1', tenantId: 'tenant-1', confirmedAt: null, totalSales: '0.3000',
    });
    expect(await DailySettlementService.confirm('settlement-1')).toEqual(read());
    expect(read()).toMatchObject({ totalSales: '0.3000', confirmedAt: expect.any(Date) });
  });

  it('keeps existing 400 for an already confirmed settlement without writing', async () => {
    database.dailySettlement.findFirst.mockResolvedValue({ confirmedAt: new Date() });
    await expect(DailySettlementService.confirm('settlement-1')).rejects.toMatchObject({ statusCode: 400 });
    expect(database.dailySettlement.update).not.toHaveBeenCalled();
  });

  it('keeps missing or tenant-hidden settlements at 404 without writing', async () => {
    database.dailySettlement.findFirst.mockResolvedValue(null);
    await expect(DailySettlementService.confirm('foreign')).rejects.toMatchObject({ statusCode: 404 });
    expect(database.dailySettlement.findFirst).toHaveBeenCalledExactlyOnceWith({ where: { id: 'foreign', tenantId: 'tenant-1' } });
    expect(database.dailySettlement.update).not.toHaveBeenCalled();
  });
});

describe.each([
  { name: 'shift', delegate: database.shift, run: () => ShiftService.close('owned', { closingCash: 1 }), initial: { status: 'OPEN' } },
  { name: 'daily settlement', delegate: database.dailySettlement, run: () => DailySettlementService.confirm('owned'), initial: { confirmedAt: null } },
])('$name update failure contract', ({ delegate, run, initial }) => {
  it('maps a lost conditional match to 409 without another write or retry', async () => {
    delegate.findFirst.mockResolvedValue(initial);
    delegate.update.mockRejectedValueOnce(knownError('P2025'));
    await expect(run()).rejects.toMatchObject({ statusCode: 409, errorCode: 'CONFLICT' });
    expect(delegate.update).toHaveBeenCalledTimes(1);
    expect(delegate.findFirst).toHaveBeenCalledTimes(1);
  });

  it.each([knownError('P2002'), knownError('P1001'), new Error('offline'), { code: 'P2025' }])(
    'does not mask unrelated errors or unknown outcomes %#', async error => {
      delegate.findFirst.mockResolvedValue(initial);
      delegate.update.mockRejectedValueOnce(error);
      await expect(run()).rejects.toBe(error);
      expect(delegate.update).toHaveBeenCalledTimes(1);
    },
  );
});
