import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { basePrisma, prisma } from '../lib/prisma';
import { tenantContext } from '../lib/tenant.context';
import { BatchAuditService } from '../modules/product-batches/batch-audit.service';
import { ProductBatchService } from '../modules/product-batches/product-batches.service';

// Same exclusive synthetic database as the 15 original acceptance cases.
const databaseUrl = process.env.BATCH_AUDIT_DATABASE_URL;
if (databaseUrl && (databaseUrl !== 'postgresql://test@127.0.0.1:55437/checkout_http_recovery_batch_audit_ci'
  || process.env.DATABASE_URL !== databaseUrl)) throw new Error('Schema acceptance requires the exact isolated batch audit database');

const run = <T>(tenantId: string, work: () => T) => tenantContext.run({ tenantId, plan: 'pro' }, work);
const snapshot = { status: 'QUARANTINE', expiryDate: '2099-01-01T00:00:00.000Z', costPrice: '20' };
async function fixture() {
  const tenantId = randomUUID();
  await basePrisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Synthetic schema acceptance' } });
  const user = await basePrisma.user.create({ data: { tenantId, email: `${tenantId}@schema.test`, fullName: 'Synthetic actor', passwordHash: 'not-a-login-hash' } });
  const product = await basePrisma.product.create({ data: { tenantId, sku: 'SCHEMA', name: 'Synthetic product', stockQuantity: 4, costPrice: 20, retailPrice: 100 } });
  const batch = await basePrisma.productBatch.create({ data: { tenantId, productId: product.id, batchNumber: 'SCHEMA', quantity: 4, expiryDate: new Date(snapshot.expiryDate), costPrice: 20 } });
  const data: Prisma.ProductBatchChangeUncheckedCreateInput = {
    tenantId, productId: product.id, batchId: batch.id, actorId: user.id, operation: 'COST',
    before: snapshot, after: { ...snapshot, costPrice: '30' }, reason: 'Verified invoice',
  };
  return { tenantId, user, product, batch, data, actor: { userId: user.id, permissions: ['create:products', 'update:products', 'release:product_batches'] } };
}

describe.skipIf(!databaseUrl)('ProductBatchChange database contract with real PostgreSQL', () => {
  afterAll(() => basePrisma.$disconnect());

  it('enforces tenant product batch and actor identity through composite foreign keys', async () => {
    const a = await fixture(); const b = await fixture();
    for (const data of [
      { ...a.data, actorId: b.user.id }, { ...a.data, batchId: b.batch.id },
      { ...a.data, productId: b.product.id }, { ...a.data, tenantId: b.tenantId },
    ]) await expect(basePrisma.productBatchChange.create({ data })).rejects.toMatchObject({ code: 'P2003' });
    // Even a legacy batch with a mismatched product/tenant cannot establish an audit.
    const legacy = await basePrisma.productBatch.create({ data: { tenantId: a.tenantId, productId: b.product.id, batchNumber: 'LEGACY', quantity: 0, expiryDate: new Date(snapshot.expiryDate), costPrice: 20 } });
    await expect(basePrisma.productBatchChange.create({ data: { ...a.data, productId: b.product.id, batchId: legacy.id } })).rejects.toMatchObject({ code: 'P2003' });
    expect(await basePrisma.productBatchChange.count({ where: { tenantId: a.tenantId } })).toBe(0);
  });

  it('fails closed without tenant context and scopes audit reads and writes', async () => {
    const a = await fixture(); const b = await fixture();
    await basePrisma.productBatchChange.create({ data: a.data });
    await expect(prisma.productBatchChange.findMany()).rejects.toThrow('Missing tenant context');
    expect(await run(b.tenantId, () => prisma.productBatchChange.findMany({ where: { tenantId: a.tenantId } }))).toEqual([]);
    await expect(run(b.tenantId, () => prisma.productBatchChange.create({ data: a.data }))).rejects.toMatchObject({ code: 'P2003' });
    expect(await run(a.tenantId, () => prisma.productBatchChange.count())).toBe(1);
  });

  it('rejects malformed snapshots reasons and operation mismatches in PostgreSQL', async () => {
    const f = await fixture();
    const invalid: Prisma.ProductBatchChangeUncheckedCreateInput[] = [
      { ...f.data, reason: '' }, { ...f.data, reason: '  ' }, { ...f.data, reason: ' untrimmed' }, { ...f.data, reason: 'a'.repeat(1001) },
      { ...f.data, before: { exists: false } }, { ...f.data, after: {} },
      { ...f.data, after: { ...snapshot, costPrice: 30 } },
      { ...f.data, after: { ...snapshot, costPrice: '30.12345' } },
      { ...f.data, after: { ...snapshot, costPrice: '100000000' } },
      { ...f.data, after: { ...snapshot, costPrice: '30', quantity: 4 } },
      { ...f.data, after: { ...snapshot, expiryDate: '2099-01-01', costPrice: '30' } },
      { ...f.data, after: { ...snapshot, status: 'RELEASED', costPrice: '30' } },
      { ...f.data, after: { ...snapshot, costPrice: '20.0000' } },
      { ...f.data, operation: 'INITIAL_RELEASE', before: { exists: false }, after: snapshot },
    ];
    for (const data of invalid) await expect(basePrisma.productBatchChange.create({ data })).rejects.toThrow();
    expect(await basePrisma.productBatchChange.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('preserves initial nonexistence decimal precision and database creation time', async () => {
    const f = await fixture();
    const started = await basePrisma.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const batch = await run(f.tenantId, () => ProductBatchService.create({ productId: f.product.id, batchNumber: 'INITIAL', quantity: 2, costPrice: 22.1234, expiryDate: snapshot.expiryDate, status: 'RELEASED', reason: '  Inspected  ' }, f.actor));
    const row = await basePrisma.productBatchChange.findFirstOrThrow({ where: { tenantId: f.tenantId } });
    const ended = await basePrisma.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    expect(row).toMatchObject({ batchId: batch.id, actorId: f.user.id, reason: 'Inspected', operation: 'INITIAL_RELEASE', before: { exists: false }, after: { status: 'RELEASED', expiryDate: snapshot.expiryDate, costPrice: '22.1234' } });
    expect(row.createdAt.getTime()).toBeGreaterThanOrEqual(started[0].now.getTime() - 1);
    expect(row.createdAt.getTime()).toBeLessThanOrEqual(ended[0].now.getTime());
  });

  it('blocks truncate and parent deletion or identity rewrites while retaining history', async () => {
    const f = await fixture();
    const row = await basePrisma.productBatchChange.create({ data: f.data });
    await expect(basePrisma.$executeRaw`TRUNCATE TABLE product_batch_changes`).rejects.toThrow('append-only');
    await expect(basePrisma.$executeRaw`UPDATE product_batch_changes SET reason = reason`).rejects.toThrow('append-only');
    for (const action of [
      () => basePrisma.user.delete({ where: { id: f.user.id } }),
      () => basePrisma.user.update({ where: { id: f.user.id }, data: { id: randomUUID() } }),
      () => basePrisma.product.delete({ where: { id: f.product.id } }),
      () => basePrisma.productBatch.delete({ where: { id: f.batch.id } }),
      () => basePrisma.tenant.delete({ where: { id: f.tenantId } }),
    ]) await expect(action()).rejects.toMatchObject({ code: 'P2003' });
    expect(await basePrisma.productBatchChange.findUniqueOrThrow({ where: { id: row.id } })).toEqual(row);
  });

  it('rolls back corrections and initial receipt when PostgreSQL itself rejects the audit insert', async () => {
    const f = await fixture();
    // Synthetic DB only: inject a database failure without mocking any client/service.
    await basePrisma.$executeRaw`CREATE FUNCTION synthetic_batch_change_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic PostgreSQL audit rejection' USING ERRCODE = '23514'; END $$`;
    await basePrisma.$executeRaw`CREATE TRIGGER synthetic_batch_change_rejection BEFORE INSERT ON product_batch_changes FOR EACH ROW WHEN (NEW.reason = 'SYNTHETIC_DATABASE_REJECTION') EXECUTE FUNCTION synthetic_batch_change_reject()`;
    await expect(run(f.tenantId, () => BatchAuditService.change(f.batch.id, { operation: 'COST', costPrice: 30, reason: 'SYNTHETIC_DATABASE_REJECTION' }, f.actor))).rejects.toThrow();
    await expect(run(f.tenantId, () => ProductBatchService.create({ productId: f.product.id, batchNumber: 'ROLLBACK', quantity: 3, costPrice: 20, expiryDate: snapshot.expiryDate, status: 'RELEASED', reason: 'SYNTHETIC_DATABASE_REJECTION' }, f.actor))).rejects.toThrow();
    expect(await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).toEqual(f.product);
    expect(await basePrisma.productBatch.findMany({ where: { tenantId: f.tenantId } })).toEqual([f.batch]);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await basePrisma.productBatchChange.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });
});
