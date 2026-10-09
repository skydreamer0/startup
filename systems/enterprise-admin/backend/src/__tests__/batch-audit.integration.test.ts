import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

const probe = vi.hoisted(() => ({ failTenant: '', failMovementTenant: '', observedBatch: '', observed: () => {} }));
vi.mock('../lib/prisma', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/prisma')>();
  return { ...actual, prisma: actual.prisma.$extends({ query: {
    productBatch: { async findFirst({ args, query }) {
      const row = await query(args);
      if (row?.id === probe.observedBatch) probe.observed();
      return row;
    } },
    inventoryTransaction: { async create({ args, query }) {
      if (args.data.tenantId === probe.failMovementTenant) throw new Error('Synthetic movement write failure');
      return query(args);
    } },
    productBatchChange: { async create({ args, query }) {
      if (args.data.tenantId === probe.failTenant) throw new Error('Synthetic audit write failure');
      return query(args);
    } },
  } }) };
});
import { basePrisma } from '../lib/prisma';
import { tenantContext } from '../lib/tenant.context';
import { BatchAuditService } from '../modules/product-batches/batch-audit.service';
import { ProductBatchService } from '../modules/product-batches/product-batches.service';
import batchRoutes from '../modules/product-batches/product-batches.routes';
import { setTenantContext } from '../middleware/tenant.middleware';
import { errorMiddleware } from '../middleware/error.middleware';
import { signAccessToken } from '../lib/jwt';
import { OrderService } from '../modules/orders/order.service';
import { defaultRateLimit } from '../middleware/rate-limit.middleware';

// Opt in explicitly: this suite preserves append-only rows until its owned DB is dropped.
const databaseUrl = process.env.BATCH_AUDIT_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '55437'
    || url.username !== 'test' || url.password || url.search || url.hash
    || url.pathname !== '/checkout_http_recovery_batch_audit_ci' || process.env.DATABASE_URL !== databaseUrl) {
    throw new Error('Batch audit requires its exact isolated synthetic loopback database');
  }
}
// End isolated database guard.
const run = <T>(tenantId: string, work: () => T) => tenantContext.run({ tenantId, plan: 'pro' }, work);
const permissions = ['read:products', 'create:products', 'update:products', 'release:product_batches'];
const app = express(); app.use(express.json()); app.use(defaultRateLimit); app.use(setTenantContext); app.use('/batches', batchRoutes); app.use(errorMiddleware);
async function fixture(status: 'QUARANTINE' | 'RELEASED' = 'QUARANTINE') {
  const tenantId = randomUUID();
  await basePrisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Synthetic batch audit' } });
  const user = await basePrisma.user.create({ data: { tenantId, email: `${tenantId}@audit.test`, fullName: 'Synthetic actor', passwordHash: 'not-a-login-hash', status: 'active' } });
  const product = await basePrisma.product.create({ data: { tenantId, sku: 'AUDIT', name: 'Synthetic lot', stockQuantity: 4, costPrice: 20, retailPrice: 100 } });
  const batch = await basePrisma.productBatch.create({ data: { tenantId, productId: product.id, batchNumber: 'LOT', quantity: 4, expiryDate: new Date('2099-01-01T00:00:00Z'), costPrice: 20, status } });
  const customer = await basePrisma.customer.create({ data: { tenantId, phone: 'AUDIT' } });
  const actor = { userId: user.id, permissions };
  const token = (allowed = permissions) => signAccessToken({ userId: user.id, email: user.email, tenantId, plan: 'pro', permissions: allowed });
  return { tenantId, user, product, batch, customer, actor, token };
}
function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}
async function bounded(promise: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Synthetic lock rendezvous timed out')), 4000); })]); }
  finally { clearTimeout(timer); }
}


async function waitForBlockedProductLock() {
  // Observe PostgreSQL's actual blocked query, not merely a pre-lock JS callback.
  await expect.poll(async () => {
    const rows = await basePrisma.$queryRaw<{ blocked: number }[]>`
      SELECT count(*)::int AS blocked FROM pg_stat_activity
      WHERE datname = current_database() AND wait_event_type = 'Lock'
        AND query LIKE '%FROM products%' AND pid <> pg_backend_pid()`;
    return rows[0].blocked;
  }, { timeout: 3000, interval: 20 }).toBeGreaterThan(0);
}

describe.skipIf(!databaseUrl)('Batch field audit with real PostgreSQL and authenticated routes', () => {
  afterEach(() => { probe.failTenant = ''; probe.failMovementTenant = ''; probe.observedBatch = ''; probe.observed = () => {}; vi.useRealTimers(); });
  afterAll(() => basePrisma.$disconnect());

  it('rejects ordinary PATCH of expiry status cost and quantity without mutation', async () => {
    const f = await fixture();
    for (const body of [{ expiryDate: '2099-02-01T00:00:00Z' }, { status: 'RELEASED' }, { costPrice: 40 }, { quantity: 10 }]) {
      expect((await request(app).patch(`/batches/${f.batch.id}`).set('Authorization', `Bearer ${f.token()}`).send(body)).status).toBe(400);
    }
    expect(await basePrisma.productBatch.findUnique({ where: { id: f.batch.id } })).toEqual(f.batch);
    expect(await basePrisma.productBatchChange.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('requires independent release permission and persists actor before after reason and time', async () => {
    const f = await fixture();
    const endpoint = `/batches/${f.batch.id}/status`;
    expect((await request(app).post(endpoint).set('Authorization', `Bearer ${f.token(['update:products'])}`).send({ status: 'RELEASED', reason: 'Inspected' })).status).toBe(403);
    expect((await request(app).post(endpoint).set('Authorization', `Bearer ${f.token()}`).send({ status: 'RELEASED', reason: '  Inspected  ' })).status).toBe(200);
    const rows = await basePrisma.productBatchChange.findMany({ where: { tenantId: f.tenantId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: f.user.id, tenantId: f.tenantId, batchId: f.batch.id, operation: 'STATUS', reason: 'Inspected', before: { status: 'QUARANTINE', costPrice: '20' }, after: { status: 'RELEASED', costPrice: '20' }, createdAt: expect.any(Date) });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(4);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('rejects cross tenant operations history and actor spoofing', async () => {
    const a = await fixture(); const b = await fixture();
    expect((await request(app).post(`/batches/${a.batch.id}/cost-corrections`).set('Authorization', `Bearer ${b.token()}`).send({ costPrice: 30, reason: 'Wrong tenant' })).status).toBe(404);
    expect((await request(app).get(`/batches/${a.batch.id}/history`).set('Authorization', `Bearer ${b.token()}`)).status).toBe(404);
    expect((await request(app).post(`/batches/${a.batch.id}/cost-corrections`).set('Authorization', `Bearer ${a.token()}`).send({ costPrice: 30, reason: 'Spoof actor', actorId: b.user.id })).status).toBe(400);
    await expect(run(a.tenantId, () => BatchAuditService.change(a.batch.id, { operation: 'COST', costPrice: 30, reason: 'Foreign actor' }, b.actor))).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rolls back the batch update when the audit insert fails', async () => {
    const f = await fixture(); probe.failTenant = f.tenantId;
    await expect(run(f.tenantId, () => BatchAuditService.change(f.batch.id, { operation: 'COST', costPrice: 30, reason: 'Invoice' }, f.actor))).rejects.toThrow('Synthetic audit write failure');
    expect(await basePrisma.productBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).toEqual(f.batch);
    expect(await basePrisma.productBatchChange.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('retains append only history and rejects direct update delete and referenced lot deletion', async () => {
    const f = await fixture();
    await run(f.tenantId, () => BatchAuditService.change(f.batch.id, { operation: 'COST', costPrice: 30, reason: 'Invoice' }, f.actor));
    const row = await basePrisma.productBatchChange.findFirstOrThrow({ where: { tenantId: f.tenantId } });
    await expect(basePrisma.productBatchChange.update({ where: { id: row.id }, data: { reason: 'Rewrite' } })).rejects.toThrow();
    await expect(basePrisma.productBatchChange.delete({ where: { id: row.id } })).rejects.toThrow();
    await basePrisma.productBatch.update({ where: { id: f.batch.id }, data: { quantity: 0 } });
    await expect(run(f.tenantId, () => ProductBatchService.delete(f.batch.id))).rejects.toMatchObject({ statusCode: 400 });
    const history = await run(f.tenantId, () => BatchAuditService.history(f.batch.id));
    expect(history.items).toHaveLength(1); expect(history.items[0].reason).toBe('Invoice');
  });

  it('rejects expiry extension bypass and keeps corrected quarantined stock unsaleable', async () => {
    const f = await fixture('RELEASED');
    await basePrisma.productBatch.update({ where: { id: f.batch.id }, data: { expiryDate: new Date('2000-01-01T00:00:00Z') } });
    await expect(run(f.tenantId, () => BatchAuditService.change(f.batch.id, { operation: 'EXPIRY', expiryDate: '2099-02-01T00:00:00Z', reason: 'Verified label' }, f.actor))).rejects.toMatchObject({ statusCode: 400 });
    await run(f.tenantId, () => BatchAuditService.change(f.batch.id, { operation: 'STATUS', status: 'QUARANTINE', reason: 'Inspect label' }, f.actor));
    await run(f.tenantId, () => BatchAuditService.change(f.batch.id, { operation: 'EXPIRY', expiryDate: '2099-02-01T00:00:00Z', reason: 'Verified label' }, f.actor));
    await expect(run(f.tenantId, () => OrderService.createOrder({ customerId: f.customer.id, items: [{ productId: f.product.id, quantity: 1 }] }))).rejects.toMatchObject({ statusCode: 400 });
    expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).status).toBe('QUARANTINE');
  });

  it('rechecks Taipei midnight after waiting for the actual product row lock', async () => {
    const f = await fixture(); const held = signal(); const unlock = signal(); const observed = signal();
    await basePrisma.productBatch.update({ where: { id: f.batch.id }, data: { expiryDate: new Date('2026-10-06T00:00:00Z') } });
    const holder = basePrisma.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM products WHERE id = ${f.product.id} FOR UPDATE`; held.resolve(); await bounded(unlock.promise); });
    await bounded(held.promise);
    probe.observedBatch = f.batch.id; probe.observed = observed.resolve;
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-05T15:59:59Z'));
    const release = run(f.tenantId, () => BatchAuditService.change(f.batch.id, { operation: 'STATUS', status: 'RELEASED', reason: 'Inspected' }, f.actor));
    const outcome = release.then(() => ({ statusCode: 200 }), error => error);
    try { await bounded(observed.promise); await waitForBlockedProductLock(); vi.setSystemTime(new Date('2026-10-05T16:00:00Z')); }
    finally { unlock.resolve(); await holder; }
    expect(await outcome).toMatchObject({ statusCode: 400 });
    expect(await basePrisma.productBatchChange.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('serializes concurrent sale and release without invented quantity or movements', async () => {
    const f = await fixture();
    const results = await Promise.allSettled([
      run(f.tenantId, () => BatchAuditService.change(f.batch.id, { operation: 'STATUS', status: 'RELEASED', reason: 'Inspected' }, f.actor)),
      run(f.tenantId, () => OrderService.createOrder({ customerId: f.customer.id, items: [{ productId: f.product.id, quantity: 1 }] })),
    ]);
    expect(results[0].status).toBe('fulfilled');
    const sold = results[1].status === 'fulfilled' ? 1 : 0;
    if (results[1].status === 'rejected') expect(results[1].reason).toMatchObject({ statusCode: 400 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(4 - sold);
    expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).quantity).toBe(4 - sold);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(sold);
    expect(await basePrisma.productBatchChange.count({ where: { tenantId: f.tenantId } })).toBe(1);
  });

  it('does not rewrite existing order items allocations or product cost on a batch cost correction', async () => {
    const f = await fixture('RELEASED');
    const order = await run(f.tenantId, () => OrderService.createOrder({ customerId: f.customer.id, items: [{ productId: f.product.id, quantity: 1 }] }));
    const items = await basePrisma.orderItem.findMany({ where: { orderId: order.id } });
    const allocations = await basePrisma.saleBatchAllocation.findMany({ where: { orderId: order.id } });
    const movements = await basePrisma.inventoryTransaction.findMany({ where: { tenantId: f.tenantId } });
    await run(f.tenantId, () => BatchAuditService.change(f.batch.id, { operation: 'COST', costPrice: 22.1234, reason: 'Correct invoice' }, f.actor));
    expect(await basePrisma.orderItem.findMany({ where: { orderId: order.id } })).toEqual(items);
    expect(await basePrisma.saleBatchAllocation.findMany({ where: { orderId: order.id } })).toEqual(allocations);
    expect(await basePrisma.inventoryTransaction.findMany({ where: { tenantId: f.tenantId } })).toEqual(movements);
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).costPrice.toString()).toBe('20');
  });


  it('requires independent authority reason and a trusted tenant actor for initial release', async () => {
    const f = await fixture(); const foreign = await fixture();
    const body = { productId: f.product.id, batchNumber: 'INITIAL', expiryDate: '2099-02-01T00:00:00Z', quantity: 3, costPrice: 20, status: 'RELEASED', reason: 'Inspected' };
    expect((await request(app).post('/batches').set('Authorization', `Bearer ${f.token(['create:products'])}`).send(body)).status).toBe(403);
    expect((await request(app).post('/batches').set('Authorization', `Bearer ${f.token()}`).send({ ...body, reason: '' })).status).toBe(400);
    await expect(run(f.tenantId, () => ProductBatchService.create({ ...body, status: 'RELEASED' }, foreign.actor))).rejects.toMatchObject({ statusCode: 403 });
    expect((await request(app).post('/batches').set('Authorization', `Bearer ${foreign.token()}`).send(body)).status).toBe(404);
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(4);
    expect(await basePrisma.productBatch.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await basePrisma.productBatchChange.count({ where: { tenantId: f.tenantId } })).toBe(0);
    // Body actor fields cannot choose the recorded operator; the controller supplies req.user.
    const response = await request(app).post('/batches').set('Authorization', `Bearer ${f.token()}`).send({ ...body, actorId: foreign.user.id });
    expect(response.status).toBe(201);
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(7);
    expect(await basePrisma.inventoryTransaction.findMany({ where: { tenantId: f.tenantId } })).toMatchObject([{ batchId: response.body.data.id, type: 'IN', quantity: 3 }]);
    expect(await basePrisma.productBatchChange.findMany({ where: { tenantId: f.tenantId } })).toMatchObject([{ actorId: f.user.id, operation: 'INITIAL_RELEASE', before: { exists: false }, after: { status: 'RELEASED' }, reason: 'Inspected' }]);
  });

  it.each(['audit', 'movement'] as const)('rolls back the whole initial receipt when %s persistence fails', async stage => {
    const f = await fixture();
    if (stage === 'audit') probe.failTenant = f.tenantId; else probe.failMovementTenant = f.tenantId;
    await expect(run(f.tenantId, () => ProductBatchService.create({ productId: f.product.id, batchNumber: 'INITIAL', expiryDate: '2099-02-01T00:00:00Z', quantity: 3, costPrice: 20, status: 'RELEASED', reason: 'Inspected' }, f.actor))).rejects.toThrow();
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(4);
    expect(await basePrisma.productBatch.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await basePrisma.productBatchChange.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('does not release expiry-day stock across the Taipei midnight boundary', async () => {
    const f = await fixture();
    const body = { productId: f.product.id, batchNumber: 'EXPIRY', expiryDate: '2026-10-06T00:00:00Z', quantity: 1, costPrice: 20, status: 'RELEASED' as const, reason: 'Inspected' };
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-05T15:59:59Z'));
    await run(f.tenantId, () => ProductBatchService.create(body, f.actor));
    vi.setSystemTime(new Date('2026-10-05T16:00:00Z'));
    await expect(run(f.tenantId, () => ProductBatchService.create({ ...body, batchNumber: 'EXPIRED' }, f.actor))).rejects.toMatchObject({ statusCode: 400 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(5);
    expect(await basePrisma.productBatchChange.count({ where: { tenantId: f.tenantId } })).toBe(1);
  });

  it('rejects an expiry extension after an actual lock wait crosses Taipei midnight', async () => {
    const f = await fixture('RELEASED'); const held = signal(); const unlock = signal(); const observed = signal();
    await basePrisma.productBatch.update({ where: { id: f.batch.id }, data: { expiryDate: new Date('2026-10-06T00:00:00Z') } });
    const holder = basePrisma.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM products WHERE id = ${f.product.id} FOR UPDATE`; held.resolve(); await bounded(unlock.promise); });
    await bounded(held.promise); probe.observedBatch = f.batch.id; probe.observed = observed.resolve;
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-05T15:59:59Z'));
    const correction = run(f.tenantId, () => BatchAuditService.change(f.batch.id, { operation: 'EXPIRY', expiryDate: '2099-02-01T00:00:00Z', reason: 'Label correction' }, f.actor));
    const outcome = correction.then(() => ({ statusCode: 200 }), error => error);
    try { await bounded(observed.promise); await waitForBlockedProductLock(); vi.setSystemTime(new Date('2026-10-05T16:00:00Z')); }
    finally { unlock.resolve(); await holder; }
    expect(await outcome).toMatchObject({ statusCode: 400 });
    expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).expiryDate.toISOString()).toBe('2026-10-06T00:00:00.000Z');
    expect(await basePrisma.productBatchChange.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('paginates all history without permitting another tenant cursor', async () => {
    const f = await fixture(); const other = await fixture();
    for (let index = 0; index < 51; index++) await run(f.tenantId, () => BatchAuditService.change(f.batch.id, { operation: 'COST', costPrice: 30 + index, reason: `Invoice ${index}` }, f.actor));
    await run(other.tenantId, () => BatchAuditService.change(other.batch.id, { operation: 'COST', costPrice: 31, reason: 'Other invoice' }, other.actor));
    const first = await run(f.tenantId, () => BatchAuditService.history(f.batch.id));
    expect(first.items).toHaveLength(50); expect(first.nextCursor).toBeTruthy();
    const second = await run(f.tenantId, () => BatchAuditService.history(f.batch.id, first.nextCursor!));
    expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map(row => row.id)).size).toBe(51);
    const alien = await basePrisma.productBatchChange.findFirstOrThrow({ where: { tenantId: other.tenantId } });
    await expect(run(f.tenantId, () => BatchAuditService.history(f.batch.id, alien.id))).rejects.toMatchObject({ statusCode: 400 });
  });
});
