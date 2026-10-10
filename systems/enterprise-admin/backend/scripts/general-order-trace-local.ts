import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { ownedConnection } from './general-order-trace-guards';
// These assertions inspect real HTTP JSON, not the UI or its parser.
function tracePayload(response: { data: Record<string, unknown> }) {
  const data = response.data as unknown as {
    receiptMovements: { id: string; quantity: number }[];
    saleAllocations: { id: string; order: { id: string; orderNumber: string | null } }[];
    _count: { saleAllocations: number };
  };
  assert.ok(Array.isArray(data.receiptMovements));
  assert.ok(Array.isArray(data.saleAllocations));
  assert.ok(Number.isSafeInteger(data._count.saleAllocations));
  return { ...data, totalAllocations: data._count.saleAllocations };
}

// Local acceptance only. The owner runner supplies a new empty cluster receipt;
// neither ambient URLs nor a production/preview connection is a fallback.
async function main() {
  assert.equal(process.env.NODE_ENV, 'test');
  const receiptPath = process.env.GENERAL_TRACE_OWNERSHIP;
  assert.ok(receiptPath, 'An explicit owned-cluster receipt is required');
  const { owned, url: expected } = ownedConnection(JSON.parse(fs.readFileSync(receiptPath, 'utf8')), process.env, process.cwd());
  const db = new PrismaClient({ datasources: { db: { url: expected } }, log: [] });
  const cases: { name: string; status: string }[] = [];
  const exchanges: object[] = [];
  const save = (name: string, data: unknown) => fs.writeFileSync(path.join(owned.output, name), JSON.stringify(data, null, 2));
  let server: Server | undefined;
  let appDb: PrismaClient | undefined;
  let base = '';
  try {
    const identity = await db.$queryRaw<Array<{ directory: string; host: string; port: number; name: string; system: string }>>`
      SELECT current_setting('data_directory') AS directory, host(inet_server_addr()) AS host,
      inet_server_port() AS port, current_database() AS name,
      (SELECT system_identifier::text FROM pg_control_system()) AS system`;
    assert.deepEqual(identity, [{ directory: owned.dataDirectory, host: '127.0.0.1', port: owned.port, name: owned.database, system: owned.systemIdentifier }]);
    const tables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
    assert.ok(tables.length >= 28);
    for (const { tablename } of tables) assert.match(tablename, /^[a-z_]+$/);
    async function snapshot() {
      const result: Record<string, unknown> = {};
      for (const { tablename } of tables) {
        result[tablename] = await db.$queryRawUnsafe(`SELECT to_jsonb(t) AS row FROM "${tablename}" t ORDER BY to_jsonb(t)::text`);
      }
      return JSON.parse(JSON.stringify(result)) as Record<string, unknown[]>;
    }
    const empty = await snapshot();
    assert.ok(Object.values(empty).every(rows => rows.length === 0));
    save('empty-database.json', { identity, counts: Object.fromEntries(Object.entries(empty).map(([key, rows]) => [key, rows.length])) });
    const { default: app } = await import('../src/app');
    ({ basePrisma: appDb } = await import('../src/lib/prisma'));
    const { signAccessToken } = await import('../src/lib/jwt');
    server = await new Promise<Server>((resolve, reject) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
      instance.once('error', reject);
    });
    const address = server.address();
    assert.ok(address && typeof address !== 'string' && address.address === '127.0.0.1');
    base = `http://127.0.0.1:${address.port}`;
    async function http(route: string, status: number, token?: string, body?: object, headers: Record<string, string> = {}) {
      const response = await fetch(`${base}${route}`, { method: body ? 'POST' : 'GET',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
        body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000) });
      const text = await response.text();
      const payload: unknown = JSON.parse(text);
      exchanges.push({ route, method: body ? 'POST' : 'GET', status: response.status,
        sha256: createHash('sha256').update(text).digest('hex'), payload });
      assert.equal(response.status, status, `${route}: ${text}`);
      return payload as { success: boolean; status?: string; data: Record<string, unknown> };
    }
    async function check(name: string, work: () => Promise<void>) {
      try { await work(); cases.push({ name, status: 'passed' }); }
      catch (error) { cases.push({ name, status: 'failed' }); throw error; }
      finally { save('cases.json', cases); }
    }
    await check('same-executor HTTP client → unchanged app readiness → owned PostgreSQL', async () => {
      assert.equal((await http('/ready', 200)).status, 'ready');
      save('connectivity.json', { status: 'passed', api: base, database: identity, browserTested: false });
    });
    const tenants = await Promise.all([0, 1].map(index => db.tenant.create({ data: {
      name: `Synthetic trace ${index}`, slug: `trace-${owned.nonce}-${index}`, plan: 'pro',
    } })));
    const users = await Promise.all(tenants.map((tenant, index) => db.user.create({ data: {
      tenantId: tenant.id, email: `trace-${index}@example.test`, fullName: 'Synthetic trace actor', passwordHash: 'not-a-login-hash',
    } })));
    const token = (index: number, permissions = ['create:orders', 'read:orders', 'read:products', 'create:products', 'release:product_batches', 'manage:pos']) => signAccessToken({
      userId: users[index].id, email: users[index].email, tenantId: tenants[index].id, plan: 'pro', permissions,
    });
    const customer = await db.customer.create({ data: { tenantId: tenants[0].id, phone: 'WALK_IN' } });
    const product = await db.product.create({ data: { tenantId: tenants[0].id, sku: `TRACE-${owned.nonce}`, name: 'Synthetic general trace', costPrice: 10, retailPrice: 20, stockQuantity: 0 } });
    const shift = await db.shift.create({ data: { tenantId: tenants[0].id, staffId: users[0].id } });
    const prefix = '/api/v1/admin';
    let batchId = ''; let generalId = ''; let posId = '';
    await check('actual receipt API creates batch and persisted IN source', async () => {
      const response = await http(`${prefix}/product-batches`, 201, token(0), {
        productId: product.id, batchNumber: `TRACE-${owned.nonce}`, expiryDate: '2099-01-01T00:00:00.000Z',
        quantity: 200, costPrice: 10, status: 'RELEASED', reason: 'Synthetic acceptance receipt only',
      });
      assert.equal(typeof response.data.id, 'string'); batchId = response.data.id as string;
      assert.equal(await db.inventoryTransaction.count({ where: { batchId, type: 'IN', quantity: 200 } }), 1);
    });
    const orderBody = (quantity: number) => ({ customerId: customer.id, items: [{ productId: product.id, quantity }] });
    await check('actual general order API persists null number and durable allocation', async () => {
      const response = await http(`${prefix}/orders`, 201, token(0), orderBody(2));
      assert.equal(response.data.orderNumber, null);
      assert.equal(typeof response.data.id, 'string'); generalId = response.data.id as string;
      const order = await db.order.findUniqueOrThrow({ where: { id: generalId } });
      assert.equal(order.orderNumber, null);
      assert.equal(await db.saleBatchAllocation.count({ where: { orderId: generalId, batchId, quantity: 2 } }), 1);
    });
    await check('real POS numbered order coexists with general-order null in batch HTTP payload', async () => {
      const result = await http(`${prefix}/pos/checkout`, 201, token(0), { commandId: randomUUID(),
        cartItems: [{ productId: product.id, quantity: 1 }], paymentMethod: 'CASH', shiftId: shift.id });
      assert.equal(typeof result.data.id, 'string'); posId = result.data.id as string;
      const before = await snapshot();
      const response = await http(`${prefix}/product-batches/${batchId}`, 200, token(0));
      const parsed = tracePayload(response);
      assert.equal(parsed.totalAllocations, 2);
      assert.equal(parsed.receiptMovements.length, 1);
      assert.equal(parsed.receiptMovements[0].quantity, 200);
      assert.equal(parsed.saleAllocations.find(row => row.order.id === generalId)?.order.orderNumber, null);
      assert.match(parsed.saleAllocations.find(row => row.order.id === posId)?.order.orderNumber ?? '', /^POS-\d{8}-\d{5}$/);
      assert.equal((await db.product.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity, 197);
      assert.equal((await db.productBatch.findUniqueOrThrow({ where: { id: batchId } })).quantity, 197);
      assert.deepEqual(await snapshot(), before);
      save('mixed-trace.json', { response, parsed, before, after: await snapshot() });
    });
    await check('order HTTP readback returns the same real batch allocation', async () => {
      const before = await snapshot();
      const response = await http(`${prefix}/orders/${generalId}`, 200, token(0));
      assert.equal(response.data.orderNumber, null);
      const persisted = await db.orderItem.findMany({ where: { orderId: generalId }, include: { batchAllocations: true } });
      assert.equal(persisted.length, 1);
      assert.equal(persisted[0].batchAllocations[0].batchId, batchId);
      const wire = response.data.items as { id: string; batchAllocations: { id: string; batch: { id: string } }[] }[];
      assert.equal(wire[0].batchAllocations[0].id, persisted[0].batchAllocations[0].id);
      assert.equal(wire[0].batchAllocations[0].batch.id, batchId);
      assert.deepEqual(await snapshot(), before);
    });
    await check('tenant/RBAC/unauthenticated/missing reads reject without data changes', async () => {
      const before = await snapshot();
      const route = `${prefix}/product-batches/${batchId}`;
      await http(route, 403, token(0, []));
      await http(route, 404, token(1));
      await http(route, 401, undefined, undefined, { 'x-tenant-id': tenants[0].id });
      await http(route, 401, token(0), undefined, { 'x-tenant-id': tenants[1].id });
      await http(`${prefix}/product-batches/${randomUUID()}`, 404, token(0));
      assert.deepEqual(await snapshot(), before);
    });
    await check('actual 132 allocations return exactly latest 100 with full count and preserved receipt', async () => {
      for (let i = 0; i < 130; i++) await http(`${prefix}/orders`, 201, token(0), orderBody(1));
      const before = await snapshot();
      const response = await http(`${prefix}/product-batches/${batchId}`, 200, token(0));
      const parsed = tracePayload(response);
      assert.equal(parsed.totalAllocations, 132); assert.equal(parsed.saleAllocations.length, 100);
      const expectedRows = await db.saleBatchAllocation.findMany({ where: { batchId }, take: 100, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
      assert.deepEqual(parsed.saleAllocations.map(row => row.id), expectedRows.map(row => row.id));
      assert.ok(parsed.saleAllocations.every(row => row.order.orderNumber === null));
      assert.equal(parsed.receiptMovements.length, 1);
      assert.equal((await db.productBatch.findUniqueOrThrow({ where: { id: batchId } })).quantity, 67);
      assert.deepEqual(await snapshot(), before);
      save('capped-trace.json', { response, parsed });
    });
    await check('fresh database client preserves null/order/receipt links after HTTP reads', async () => {
      const fresh = new PrismaClient({ datasources: { db: { url: expected } }, log: [] });
      try {
        assert.equal((await fresh.order.findUniqueOrThrow({ where: { id: generalId } })).orderNumber, null);
        assert.equal(await fresh.saleBatchAllocation.count({ where: { batchId } }), 132);
        assert.equal(await fresh.inventoryTransaction.count({ where: { batchId, type: 'IN' } }), 1);
      } finally { await fresh.$disconnect(); }
      save('final-snapshot.json', await snapshot());
    });
    save('acceptance.json', { status: 'passed', sourceHead: owned.sourceHead, cases, httpExchanges: exchanges.length,
      fixtures: { tenantIds: tenants.map(t => t.id), productId: product.id, batchId, generalId, posId },
      limits: ['No browser/UI/device acceptance', 'No full business gates', 'No production data or deployment', 'Cleanup is a separate owner-runner receipt'] });
  } finally {
    save('http-exchanges.json', exchanges);
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    if (appDb) await appDb.$disconnect();
    await db.$disconnect();
  }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
