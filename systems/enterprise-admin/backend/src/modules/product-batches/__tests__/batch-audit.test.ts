import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ProductBatchService } from '../product-batches.service';
import { BatchAuditService } from '../batch-audit.service';
import { tenantContext } from '../../../lib/tenant.context';
import { updateProductBatchSchema } from '../product-batches.schema';

const db = vi.hoisted(() => ({ batch: { findFirst: vi.fn(), findFirstOrThrow: vi.fn(), updateMany: vi.fn() },
  audit: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() }, user: { findFirst: vi.fn() }, lock: vi.fn(), transaction: vi.fn() }));
vi.mock('../../../lib/prisma', () => ({ prisma: {
  productBatch: db.batch, productBatchChange: db.audit, $transaction: db.transaction,
} }));
const run = <T>(work: () => T) => tenantContext.run({ tenantId: 'synthetic', plan: 'pro' }, work);
const actor = { userId: 'staff', permissions: ['update:products', 'release:product_batches'] };
const lot = () => ({ id: 'lot', tenantId: 'synthetic', productId: 'product', batchNumber: 'L1', quantity: 7,
  status: 'QUARANTINE', expiryDate: new Date('2099-01-01T00:00:00Z'), costPrice: new Prisma.Decimal(20) });
let current: ReturnType<typeof lot>;
beforeEach(() => {
  vi.resetAllMocks(); current = lot();
  db.batch.findFirst.mockImplementation(async ({ where }) => where.id === 'lot' ? { ...current } : null);
  db.batch.findFirstOrThrow.mockImplementation(async () => ({ ...current }));
  db.batch.updateMany.mockImplementation(async ({ data }) => { current = { ...current, ...data }; return { count: 1 }; });
  db.user.findFirst.mockResolvedValue({ id: 'staff' }); db.lock.mockResolvedValue([{ id: 'product' }]);
  db.transaction.mockImplementation(async (work) => work({ productBatch: db.batch, productBatchChange: db.audit, user: db.user, $queryRaw: db.lock }));
});
afterEach(() => vi.useRealTimers());

describe('batch audit service and input boundary (mock persistence)', () => {
  it.each([{ expiryDate: '2099-01-01T00:00:00Z' }, { status: 'RELEASED' as const }, { costPrice: 20 }, { quantity: 1 }])('rejects protected ordinary PATCH fields %j', async (body) => {
    expect(updateProductBatchSchema.body.safeParse(body).success).toBe(false);
    await expect(run(() => ProductBatchService.update('lot', body))).rejects.toMatchObject({ statusCode: 400 });
    expect(db.transaction).not.toHaveBeenCalled(); expect(db.batch.updateMany).not.toHaveBeenCalled();
  });
  it('requires independent permission for release even with ordinary product update permission', async () => {
    await expect(run(() => BatchAuditService.change('lot', { operation: 'STATUS', status: 'RELEASED', reason: 'Inspection' }, { ...actor, permissions: ['update:products'] }))).rejects.toMatchObject({ statusCode: 403 });
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it('requires an authenticated actor and ordinary correction permission', async () => {
    const change = { operation: 'COST' as const, costPrice: 22, reason: 'Invoice' };
    await expect(run(() => BatchAuditService.change('lot', change, undefined))).rejects.toMatchObject({ statusCode: 401 });
    await expect(run(() => BatchAuditService.change('lot', change, { ...actor, permissions: [] }))).rejects.toMatchObject({ statusCode: 403 });
  });
  it('records tenant/actor/operation/normalized reason and complete before/after without changing quantity', async () => {
    const result = await run(() => BatchAuditService.change('lot', { operation: 'STATUS', status: 'RELEASED', reason: '  Inspection OK  ' }, actor));
    expect(result).toMatchObject({ status: 'RELEASED', quantity: 7 });
    expect(db.audit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 'synthetic', batchId: 'lot', productId: 'product', actorId: 'staff', operation: 'STATUS', reason: 'Inspection OK',
      before: { status: 'QUARANTINE', expiryDate: '2099-01-01T00:00:00.000Z', costPrice: '20' },
      after: { status: 'RELEASED', expiryDate: '2099-01-01T00:00:00.000Z', costPrice: '20' } }) });
    expect(db.batch.updateMany).toHaveBeenCalledWith({ where: { id: 'lot', tenantId: 'synthetic', productId: 'product' }, data: { status: 'RELEASED' } });
  });
  it('rejects cross-tenant batch lookup and inactive/other-tenant actors', async () => {
    await expect(run(() => BatchAuditService.change('other', { operation: 'COST', costPrice: 22, reason: 'Invoice' }, actor))).rejects.toMatchObject({ statusCode: 404 });
    db.user.findFirst.mockResolvedValue(null);
    await expect(run(() => BatchAuditService.change('lot', { operation: 'COST', costPrice: 22, reason: 'Invoice' }, actor))).rejects.toMatchObject({ statusCode: 403 });
    expect(db.audit.create).not.toHaveBeenCalled();
  });
  it('checks Taipei expiry after a lock wait crosses midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-05T15:59:59Z'));
    current.expiryDate = new Date('2026-10-06T00:00:00Z');
    db.lock.mockImplementation(async () => { vi.setSystemTime(new Date('2026-10-05T16:00:00Z')); return [{ id: 'product' }]; });
    await expect(run(() => BatchAuditService.change('lot', { operation: 'STATUS', status: 'RELEASED', reason: 'Inspection' }, actor))).rejects.toMatchObject({ statusCode: 400 });
    expect(db.batch.updateMany).not.toHaveBeenCalled();
  });
  it('cannot extend an expired RELEASED lot into saleability or shorten a released lot to today', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-05T16:00:00Z'));
    current.status = 'RELEASED'; current.expiryDate = new Date('2026-10-06T00:00:00Z');
    await expect(run(() => BatchAuditService.change('lot', { operation: 'EXPIRY', expiryDate: '2099-02-01T00:00:00Z', reason: 'Label correction' }, actor))).rejects.toMatchObject({ statusCode: 400 });
    current.expiryDate = new Date('2099-01-01T00:00:00Z');
    await expect(run(() => BatchAuditService.change('lot', { operation: 'EXPIRY', expiryDate: '2026-10-06T00:00:00Z', reason: 'Label correction' }, actor))).rejects.toMatchObject({ statusCode: 400 });
  });
  it('keeps a quarantined corrected lot quarantined and audits cost precisely', async () => {
    await run(() => BatchAuditService.change('lot', { operation: 'EXPIRY', expiryDate: '2099-02-01T00:00:00Z', reason: 'Verified label' }, actor));
    expect(current.status).toBe('QUARANTINE');
    await run(() => BatchAuditService.change('lot', { operation: 'COST', costPrice: 20.1234, reason: 'Invoice correction' }, actor));
    expect(current.costPrice.toString()).toBe('20.1234'); expect(db.audit.create).toHaveBeenCalledTimes(2);
  });
  it.each([{ operation: 'STATUS' as const, status: 'QUARANTINE' as const, reason: 'No change' },
    { operation: 'COST' as const, costPrice: 20.12345, reason: 'Precision' },
    { operation: 'COST' as const, costPrice: 22, reason: '   ' }])('rejects invalid corrections %j', async (change) => {
    await expect(run(() => BatchAuditService.change('lot', change, actor))).rejects.toMatchObject({ statusCode: 400 });
    expect(db.audit.create).not.toHaveBeenCalled();
  });
});
