import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { tenantContext } from '../../../lib/tenant.context';
import { ProductBatchService } from '../product-batches.service';
import { createProductBatchSchema } from '../product-batches.schema';

const db = vi.hoisted(() => ({ product: { findFirst: vi.fn(), updateMany: vi.fn() },
  batch: { create: vi.fn() }, movement: { create: vi.fn() }, audit: { create: vi.fn() },
  user: { findFirst: vi.fn() }, transaction: vi.fn() }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $transaction: db.transaction } }));
const run = <T>(work: () => T) => tenantContext.run({ tenantId: 'synthetic', plan: 'pro' }, work);
const actor = { userId: 'trusted-user', permissions: ['release:product_batches'] };
const receipt = { productId: 'product', batchNumber: 'INITIAL', expiryDate: '2099-01-01T00:00:00Z',
  quantity: 3, costPrice: 20, status: 'RELEASED' as const, reason: '  Label inspected  ' };
beforeEach(() => {
  vi.resetAllMocks();
  db.product.findFirst.mockResolvedValue({ id: 'product' });
  db.product.updateMany.mockResolvedValue({ count: 1 });
  db.batch.create.mockImplementation(async ({ data }) => ({ ...data, id: 'batch', expiryDate: new Date(data.expiryDate), costPrice: new Prisma.Decimal(data.costPrice) }));
  db.user.findFirst.mockResolvedValue({ id: actor.userId });
  db.transaction.mockImplementation(work => work({ product: db.product, productBatch: db.batch,
    inventoryTransaction: db.movement, productBatchChange: db.audit, user: db.user }));
});
afterEach(() => vi.useRealTimers());
describe('initial receipt release authority (mock persistence)', () => {
  it('rejects missing actor or release permission before opening a transaction', async () => {
    await expect(run(() => ProductBatchService.create(receipt))).rejects.toMatchObject({ statusCode: 401 });
    await expect(run(() => ProductBatchService.create(receipt, { ...actor, permissions: ['create:products'] }))).rejects.toMatchObject({ statusCode: 403 });
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it.each([undefined, '', '   ', 'x'.repeat(1001)])('rejects invalid initial-release reason %j', async reason => {
    expect(createProductBatchSchema.body.safeParse({ ...receipt, reason }).success).toBe(false);
    await expect(run(() => ProductBatchService.create({ ...receipt, reason }, actor))).rejects.toMatchObject({ statusCode: 400 });
    expect(db.transaction).not.toHaveBeenCalled();
  });
  it('rejects inactive or foreign actor without posting stock', async () => {
    db.user.findFirst.mockResolvedValue(null);
    await expect(run(() => ProductBatchService.create(receipt, actor))).rejects.toMatchObject({ statusCode: 403 });
    expect(db.user.findFirst).toHaveBeenCalledWith({ where: { id: 'trusted-user', tenantId: 'synthetic', status: 'active', deletedAt: null }, select: { id: true } });
    expect(db.product.updateMany).not.toHaveBeenCalled();
  });
  it('posts stock lot movement and initial audit using one transaction and trusted actor', async () => {
    await run(() => ProductBatchService.create(receipt, actor));
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.product.updateMany).toHaveBeenCalledTimes(1);
    expect(db.batch.create).toHaveBeenCalledTimes(1);
    expect(db.movement.create).toHaveBeenCalledTimes(1);
    expect(db.audit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ tenantId: 'synthetic',
      actorId: actor.userId, batchId: 'batch', productId: 'product', operation: 'INITIAL_RELEASE',
      before: { exists: false }, after: { status: 'RELEASED', expiryDate: '2099-01-01T00:00:00.000Z', costPrice: '20' }, reason: 'Label inspected' }) });
    expect(db.audit.create.mock.invocationCallOrder[0]).toBeGreaterThan(db.movement.create.mock.invocationCallOrder[0]);
  });
  it('propagates an audit write failure to the caller-owned receipt transaction', async () => {
    db.audit.create.mockRejectedValue(new Error('Synthetic audit failure'));
    await expect(run(() => ProductBatchService.create(receipt, actor))).rejects.toThrow('Synthetic audit failure');
    // Actual database rollback requires the dedicated PostgreSQL suite, not this mock.
  });
  it('rechecks expiry after the product lock crosses Taipei midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-05T15:59:59Z'));
    db.product.updateMany.mockImplementation(async () => { vi.setSystemTime(new Date('2026-10-05T16:00:00Z')); return { count: 1 }; });
    await expect(run(() => ProductBatchService.create({ ...receipt, expiryDate: '2026-10-06T00:00:00Z' }, actor))).rejects.toMatchObject({ statusCode: 400 });
    expect(db.batch.create).not.toHaveBeenCalled(); expect(db.audit.create).not.toHaveBeenCalled();
  });
  it.each(['QUARANTINE', 'BLOCKED'] as const)('keeps ordinary %s receipts independent of release authority', async status => {
    for (const reason of [undefined, '', 42]) {
      const parsed = createProductBatchSchema.body.parse({ ...receipt, status, reason });
      expect(parsed.reason).toBeUndefined();
    }
    await run(() => ProductBatchService.create({ ...receipt, status, reason: undefined }));
    expect(db.batch.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status }) }));
    expect(db.user.findFirst).not.toHaveBeenCalled(); expect(db.audit.create).not.toHaveBeenCalled();
  });
});
