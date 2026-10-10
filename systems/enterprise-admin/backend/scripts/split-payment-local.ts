import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Server } from 'node:http';
import { PrismaClient } from '@prisma/client';
import { ownedConnection } from './split-payment-guards';
// Local acceptance only. The owner runner supplies a new empty cluster receipt;
// neither ambient URLs nor a production/preview connection is a fallback.
async function main() {
  assert.equal(process.env.NODE_ENV, 'test');
  const receiptPath = process.env.SPLIT_PAYMENT_OWNERSHIP;
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
      name: `Synthetic split payment ${index}`, slug: `split-${owned.nonce}-${index}`, plan: 'pro',
    } })));
    const users = await Promise.all(tenants.map((tenant, index) => db.user.create({ data: {
      tenantId: tenant.id, email: `split-${index}@example.test`, fullName: 'Synthetic split actor', passwordHash: 'not-a-login-hash',
    } })));
    const token = (index: number, permissions = ['manage:pos', 'manage:shifts', 'read:shifts', 'create:products', 'release:product_batches']) => signAccessToken({
      userId: users[index].id, email: users[index].email, tenantId: tenants[index].id, plan: 'pro', permissions,
    });
    const customer = await db.customer.create({ data: { tenantId: tenants[0].id, phone: 'WALK_IN' } });
    const product = await db.product.create({ data: { tenantId: tenants[0].id, sku: `SPLIT-${owned.nonce}`, name: 'Synthetic split payment', costPrice: 10, retailPrice: 100, stockQuantity: 0 } });
    const shift = () => db.shift.create({ data: { tenantId: tenants[0].id, staffId: users[0].id, openingCash: 200 } });
    const prefix = '/api/v1/admin';
    const readPair = async (id: string) => {
      const before = await snapshot();
      const daily = (await http(`${prefix}/daily-settlements/calculate`, 200, token(0), { shiftId: id })).data;
      const report = (await http(`${prefix}/shifts/${id}/report`, 200, token(0))).data;
      assert.deepEqual(await snapshot(), before, 'Settlement calculation and report must not write any persisted row');
      return { daily, report };
    };
    const sale = async (id: string, payments: { method: string; amount: number }[], primary = payments[0].method) => {
      const body = { commandId: randomUUID(), shiftId: id, cartItems: [{ productId: product.id, quantity: 1 }], paymentMethod: primary, payments };
      const response = await http(`${prefix}/pos/checkout`, 201, token(0), body);
      return { body, response };
    };
    const assertTotals = (pair: Awaited<ReturnType<typeof readPair>>, expected: Record<string, number>) => {
      const { daily, report } = pair;
      assert.equal(daily.totalSales, 100); assert.equal(daily.totalOrders, 1);
      assert.equal(report.grossSales, 100); assert.equal(report.orderCount, 1);
      assert.equal(report.netTotal, 100); assert.equal(report.refundTotal, 0);
      assert.deepEqual(report.paymentBreakdown, expected);
      assert.equal(daily.cashAmount, expected.CASH ?? 0);
      assert.equal(daily.cardAmount, expected.CARD ?? 0);
      assert.equal(daily.linePayAmount, expected.LINE_PAY ?? 0);
      assert.equal(daily.otherAmount, Object.entries(expected).filter(([k]) => !['CASH', 'CARD', 'LINE_PAY'].includes(k)).reduce((sum, [, v]) => sum + v, 0));
      assert.equal(report.cashBalance, 200 + (expected.CASH ?? 0));
      assert.equal(Object.values(expected).reduce((s, n) => s + n, 0), 100);
    };
    let batchId = '';
    await check('actual receipt API establishes synthetic stock for split checkouts', async () => {
      const result = await http(`${prefix}/product-batches`, 201, token(0), {
        productId: product.id, batchNumber: `SPLIT-${owned.nonce}`, expiryDate: '2099-01-01T00:00:00.000Z',
        quantity: 20, costPrice: 10, status: 'RELEASED', reason: 'Synthetic split-payment acceptance only',
      });
      batchId = result.data.id as string;
      assert.equal(await db.inventoryTransaction.count({ where: { batchId, type: 'IN', quantity: 20 } }), 1);
    });
    const splitShift = await shift(); let originalOrderId = '';
    await check('100 = cash 60 + card 40 reconciles persisted payments and both real HTTP readers', async () => {
      const { response } = await sale(splitShift.id, [{ method: 'CASH', amount: 60 }, { method: 'CARD', amount: 40 }]);
      originalOrderId = response.data.id as string;
      const payments = await db.orderPayment.findMany({ where: { orderId: originalOrderId }, orderBy: { method: 'asc' } });
      assert.deepEqual(payments.map(p => ({ method: p.method, amount: p.amount.toString() })), [{ method: 'CARD', amount: '40' }, { method: 'CASH', amount: '60' }]);
      const pair = await readPair(splitShift.id); assertTotals(pair, { CASH: 60, CARD: 40 });
      save('split-60-40.json', { orderId: originalOrderId, payments, pair });
    });
    await check('reversed payment order and CARD primary still reconcile; same-command retry adds no facts', async () => {
      const ownShift = await shift();
      const { body, response } = await sale(ownShift.id, [{ method: 'CARD', amount: 40 }, { method: 'CASH', amount: 60 }]);
      const before = await snapshot();
      const replay = await http(`${prefix}/pos/checkout`, 201, token(0), body);
      assert.deepEqual(replay, response); assert.deepEqual(await snapshot(), before);
      const id = response.data.id as string;
      assert.equal(await db.orderPayment.count({ where: { orderId: id } }), 2);
      assert.equal(await db.saleBatchAllocation.count({ where: { orderId: id } }), 1);
      assert.equal(await db.inventoryTransaction.count({ where: { referenceId: id, type: 'OUT' } }), 1);
      assert.equal(await db.checkoutCommand.count({ where: { commandId: body.commandId } }), 1);
      assertTotals(await readPair(ownShift.id), { CASH: 60, CARD: 40 });
    });
    await check('cash/card/LINE_PAY/TRANSFER/OTHER and repeated rows sum once per stored method', async () => {
      const ownShift = await shift();
      await sale(ownShift.id, [
        { method: 'CASH', amount: 5 }, { method: 'CARD', amount: 20 }, { method: 'LINE_PAY', amount: 30 },
        { method: 'TRANSFER', amount: 15 }, { method: 'OTHER', amount: 25 }, { method: 'CASH', amount: 5 },
      ]);
      assertTotals(await readPair(ownShift.id), { CASH: 10, CARD: 20, LINE_PAY: 30, TRANSFER: 15, OTHER: 25 });
    });
    await check('legacy completed order without payment rows retains primary-method fallback', async () => {
      const ownShift = await shift();
      const legacy = await db.order.create({ data: { tenantId: tenants[0].id, customerId: customer.id, shiftId: ownShift.id,
        status: 'completed', paymentStatus: 'paid', paymentMethod: 'CARD', totalAmount: 100 } });
      assert.equal(await db.orderPayment.count({ where: { orderId: legacy.id } }), 0);
      assertTotals(await readPair(ownShift.id), { CARD: 100 });
    });
    await check('refund and non-completed cohorts preserve pre-patch output; this is NOT accepted refund policy', async () => {
      const ownShift = await shift();
      const { response } = await sale(ownShift.id, [{ method: 'CASH', amount: 60 }, { method: 'CARD', amount: 40 }]);
      await http(`${prefix}/pos/orders/${response.data.id as string}/refund`, 200, token(0), { reason: 'Synthetic compatibility check' });
      await db.order.create({ data: { tenantId: tenants[0].id, customerId: customer.id, shiftId: ownShift.id,
        status: 'pending', paymentStatus: 'paid', paymentMethod: 'LINE_PAY', totalAmount: 30,
        payments: { create: [{ tenantId: tenants[0].id, method: 'CARD', amount: 30 }] } } });
      const pair = await readPair(ownShift.id);
      assert.deepEqual(pair.daily, { shiftId: ownShift.id, totalOrders: 2, totalSales: 130, cashAmount: 100, cardAmount: 0, linePayAmount: 30, otherAmount: 0 });
      assert.equal(pair.report.orderCount, 0); assert.equal(pair.report.refundCount, 1);
      assert.equal(pair.report.grossSales, 0); assert.equal(pair.report.refundTotal, 100);
      assert.equal(pair.report.netTotal, -100); assert.equal(pair.report.cashBalance, 100);
      assert.deepEqual(pair.report.paymentBreakdown, {});
      save('unchanged-refund-limit.json', pair);
    });
    await check('tenant-scoped payment rows exclude a synthetic foreign relation without reader writes', async () => {
      // The current schema permits mismatched child tenant IDs; readers must not leak them.
      await db.orderPayment.create({ data: { tenantId: tenants[1].id, orderId: originalOrderId, method: 'CARD', amount: 999 } });
      assertTotals(await readPair(splitShift.id), { CASH: 60, CARD: 40 });
    });
    await check('both readers reject cross-tenant, missing, unauthenticated and unauthorized requests without writes', async () => {
      const before = await snapshot();
      for (const [actor, expectedStatus] of [[token(1), 404], [token(0, []), 403], [undefined, 401]] as const) {
        await http(`${prefix}/daily-settlements/calculate`, expectedStatus, actor, { shiftId: splitShift.id }, actor ? {} : { 'x-tenant-id': tenants[0].id });
        await http(`${prefix}/shifts/${splitShift.id}/report`, expectedStatus, actor, undefined, actor ? {} : { 'x-tenant-id': tenants[0].id });
      }
      await http(`${prefix}/daily-settlements/calculate`, 400, undefined, { shiftId: splitShift.id });
      await http(`${prefix}/shifts/${splitShift.id}/report`, 400);
      await http(`${prefix}/daily-settlements/calculate`, 404, token(0), { shiftId: randomUUID() });
      await http(`${prefix}/shifts/${randomUUID()}/report`, 404, token(0));
      assert.deepEqual(await snapshot(), before);
    });
    save('final-snapshot.json', await snapshot());
    save('acceptance.json', { status: 'passed', sourceHead: owned.sourceHead, cases, httpExchanges: exchanges.length,
      limits: ['Only completed-order split-payment classification is corrected', 'Refund status/filter/arithmetic intentionally unchanged and not approved policy',
        'No precision/rounding/partial refund/historical cost or business-date acceptance', 'No browser/UI/device/production/full business gates', 'Cleanup is a separate receipt'] });
  } finally {
    save('http-exchanges.json', exchanges);
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    if (appDb) await appDb.$disconnect();
    await db.$disconnect();
  }
}
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
