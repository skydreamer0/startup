import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../lib/prisma', () => ({ prisma: { $transaction: vi.fn() } }));
import { prisma } from '../lib/prisma';
import { tenantContext } from '../lib/tenant.context';
import { AppError } from '../lib/errors';
import { CheckoutCommandService } from '../modules/pos/checkout-command.service';

const dto = {
  commandId: '44444444-4444-4444-8444-444444444444',
  shiftId: '22222222-2222-4222-8222-222222222222', paymentMethod: 'CASH' as const,
  cartItems: [{ productId: '11111111-1111-4111-8111-111111111111', quantity: 1 }],
};
const known = (code: string, meta?: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError('Synthetic test error', { code, clientVersion: '6.19.3', meta });
const diagnostic = (code = '40P01') => `Error occurred during query execution:\nConnectorError(ConnectorError { user_facing_error: None, kind: QueryError(PostgresError { code: "${code}", message: "deadlock detected", severity: "ERROR", detail: None, column: None, hint: None }), transient: false })`;
const unknown = (message: string, clientVersion = '6.19.3') => new Prisma.PrismaClientUnknownRequestError(message, { clientVersion });
const run = () => tenantContext.run({ tenantId: 'synthetic-tenant', plan: 'pro' }, () => CheckoutCommandService.execute(dto, vi.fn()));
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

// Error classification controls; these mocks are separate from native acceptance.
describe('Checkout aborted transaction retry controls', () => {
  it.each([known('P2034'), known('P2010', { code: '40001' }), known('P2010', { code: '40P01' }), unknown(diagnostic())])('retries a confirmed abort and preserves the result', async (error) => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(error).mockResolvedValueOnce({ id: 'saved-order' });
    const result = run();
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ id: 'saved-order' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(vi.mocked(prisma.$transaction).mock.calls.every(call => call[1]?.isolationLevel === 'ReadCommitted')).toBe(true);
  });

  it('stops at three attempts and throws the original last error', async () => {
    const errors = [known('P2034'), known('P2034'), known('P2034')];
    errors.forEach(error => vi.mocked(prisma.$transaction).mockRejectedValueOnce(error));
    const result = expect(run()).rejects.toBe(errors[2]);
    await vi.runAllTimersAsync();
    await result;
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it.each([
    known('P2028'), known('P1001'), known('P1002'), known('P1017'), known('P2002'),
    known('P2010', { code: '23505' }), known('P2010', { code: '57014' }),
    new AppError(409, 'Payload conflict', 'COMMAND_PAYLOAD_CONFLICT'),
    new AppError(503, 'Unknown result', 'COMMAND_UNKNOWN'),
    new Error('40001 deadlock detected'), { code: 'P2034' },
    unknown('deadlock detected 40P01'), unknown(diagnostic('P0001')),
    unknown(diagnostic(), '6.20.0'), unknown(diagnostic() + ' trailing text'),
    unknown(diagnostic().replace('severity: "ERROR"', 'severity: "FATAL"')),
  ])('propagates nonretry and unknown-outcome errors unchanged', async (error) => {
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(error);
    await expect(run()).rejects.toBe(error);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
