// Test-only orchestrator. No migration, broad seed, login bypass or production endpoint.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { allowedRequest, assertEnvironment, databaseUrl, widths, phases } from '../../pos-ui/e2e/stock-native/contract.mjs';

async function main() {
  assertEnvironment(process.env, process.version); // Before importing any DB/app module.
  assert.equal(process.env.NODE_ENV, 'test');
  assert.match(process.env.CATEGORY_UI_NONCE ?? '', /^[a-f0-9-]{36}$/);
  const backend = path.resolve(__dirname, '..');
  const root = path.resolve(backend, '../../..');
  assert.equal(fs.existsSync(path.join(backend, '.env')), false);
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10000 }).trim();
  const ownershipFile = path.join(process.env.RUNNER_TEMP!, `sku-qa-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`, 'ownership.json');
  const ownership = JSON.parse(fs.readFileSync(ownershipFile, 'utf8'));
  assert.equal(ownership.head, process.env.SKU_QA_HEAD); assert.equal(ownership.head, git('rev-parse', 'HEAD'));
  assert.equal(ownership.tree, git('rev-parse', 'HEAD^{tree}')); assert.equal(git('status', '--porcelain'), '');
  assert.equal(ownership.runId, process.env.GITHUB_RUN_ID); assert.equal(ownership.attempt, process.env.GITHUB_RUN_ATTEMPT);
  assert.equal(ownership.service.container, process.env.SKU_QA_CONTAINER); assert.equal(ownership.service.network, process.env.SKU_QA_NETWORK);
  assert.equal(ownership.database, 'checkout_http_recovery_pos_lookup_ci');
  assert.equal(ownership.syntheticOnly, true); assert.deepEqual(ownership.initialPublicTables, []);
  const output = path.join(process.env.RUNNER_TEMP!, `stock-native-${ownership.runId}-${ownership.attempt}`);
  assert.equal(process.env.STOCK_UI_OUTPUT, output);
  const write = (name: string, value: unknown) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const bootstrap = path.join(output, '.bootstrap.json');
  const { basePrisma: db } = await import('../src/lib/prisma');
  const { signAccessToken } = await import('../src/lib/jwt');
  const { default: app } = await import('../src/app');
  const { default: express } = await import('express');
  const fixtures: Record<number, { tenantId: string; userId: string; shiftId: string; productId: string; batchId: string }> = {};
  const seededTenants: string[] = []; const finalSnapshots: Record<number, unknown> = {};
  const writeCounts: Record<number, number> = {};
  const bootstraps: Record<number, { tenantId: string; userId: string; shiftId: string; productId: string; batchId: string; accessToken: string; nonce: string | undefined }> = {};
  let server: Server | undefined, child: ChildProcess | undefined, cancelled: string | null = null;
  let browser: { exitCode: number | null; signal: NodeJS.Signals | null } | null = null;
  let before: unknown = null, after: unknown = null, beforeEmpty = false, afterEmpty = false, seeded = false;
  let expected: unknown = null, error: unknown = null;
  const requests: unknown[] = [], rejected: string[] = [];
  const identities = new Set<string>();
  const signal = (name: string) => { cancelled ??= name; child?.kill('SIGTERM'); };
  const term = () => signal('SIGTERM'), interrupt = () => signal('SIGINT');
  process.on('SIGTERM', term); process.on('SIGINT', interrupt);
  async function snapshot() {
    const tables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
    assert.ok(tables.length > 0, 'The existing isolated runner must have migrated the DB');
    const result: Record<string, unknown[]> = {};
    for (const { tablename } of tables) {
      assert.match(tablename, /^[a-z_]+$/);
      const rows = await db.$queryRawUnsafe<Array<{ row: unknown }>>(`SELECT row_to_json(t) AS row FROM public."${tablename}" t`);
      result[tablename] = rows.map(row => row.row).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    return result;
  }
  async function stockSnapshot(width: number) {
    const fixture = fixtures[width]; assert.ok(fixture);
    const { tenantId, productId, batchId } = fixture;
    const [product, batch, orders, items, payments, movements, allocations, commands, counters] = await db.$transaction([
      db.product.findUniqueOrThrow({ where: { id: productId } }),
      db.productBatch.findUniqueOrThrow({ where: { id: batchId } }),
      db.order.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      db.$queryRaw<Array<{ row: unknown }>>`SELECT row_to_json(i) AS row FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.tenant_id = ${tenantId} ORDER BY i.id`,
      db.orderPayment.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      db.inventoryTransaction.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      db.saleBatchAllocation.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      db.checkoutCommand.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      db.orderNumberCounter.findMany({ where: { tenantId } }),
    ]);
    return JSON.parse(JSON.stringify({ product, batch, orders, items: items.map(item => item.row), payments, movements, allocations, commands, counters }));
  }
  const empty = (value: Record<string, unknown[]>) => Object.values(value).every(rows => rows.length === 0);
  try {
    const identity = await db.$queryRaw<Array<{ name: string; username: string; version: string }>>`SELECT current_database() AS name, current_user AS username, version() AS version`;
    assert.equal(identity.length, 1); assert.equal(identity[0].name, ownership.database); assert.equal(identity[0].username, 'test'); assert.match(identity[0].version, /^PostgreSQL 15\./);
    write('database-identity.json', { rows: identity, url: databaseUrl, ownership });
    const initial = await snapshot(); write('initial-counts.json', Object.fromEntries(Object.entries(initial).map(([table, rows]) => [table, rows.length])));
    beforeEmpty = empty(initial); assert.equal(beforeEmpty, true, 'Never append fixtures to a populated DB');
    assert.equal(cancelled, null);
    seeded = true;
    for (const width of widths) {
      const tenantId = randomUUID(), userId = randomUUID(), shiftId = randomUUID();
      seededTenants.push(tenantId); writeCounts[width] = 0;
      await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Synthetic confirmed-stock tenant', plan: 'pro' } });
      const email = `${userId}@stock-browser.example.test`;
      await db.user.create({ data: { id: userId, tenantId, email, fullName: '合成庫存收銀員', passwordHash: 'not-a-login-hash', status: 'active' } });
      await db.customer.create({ data: { tenantId, phone: 'WALK_IN' } });
      const product = await db.product.create({ data: { tenantId, sku: 'SYNTHETIC-STOCK', name: '合成庫存驗收商品', stockQuantity: 5, safetyStock: 1, costPrice: 10, retailPrice: 20 } });
      const batch = await db.productBatch.create({ data: { tenantId, productId: product.id, batchNumber: 'SYNTHETIC-STOCK-LOT', quantity: 5, costPrice: 10, status: 'RELEASED', expiryDate: new Date('2099-01-01') } });
      await db.shift.create({ data: { id: shiftId, tenantId, staffId: userId, status: 'OPEN', openingCash: 0 } });
      fixtures[width] = { tenantId, userId, shiftId, productId: product.id, batchId: batch.id };
      const accessToken = signAccessToken({ userId, email, tenantId, plan: 'pro', permissions: ['manage:pos'] });
      bootstraps[width] = { ...fixtures[width], accessToken, nonce: process.env.CATEGORY_UI_NONCE };
    }
    expected = fixtures; before = await snapshot();
    fs.writeFileSync(bootstrap, JSON.stringify(bootstraps), { flag: 'wx', mode: 0o600 });
    const outer = express();
    outer.use((req, res, next) => {
      const requestId = req.get('x-stock-qa-request') ?? '';
      const width = Number(req.get('x-stock-qa-width')), phase = req.get('x-stock-qa-phase') ?? '';
      const fixture = fixtures[width];
      // The QA header selects only an already-created fixture. Authentication still
      // uses the production middleware and token bound to that exact synthetic user.
      if (!fixture || !phases.includes(phase) || !allowedRequest(req.method, req.path)
          || !requestId.startsWith(`${process.env.CATEGORY_UI_NONCE}:`) || identities.has(requestId)
          || req.get('authorization') !== `Bearer ${bootstraps[width].accessToken}`
          || req.method === 'POST' && (writeCounts[width] >= 2
            || writeCounts[width] === 0 && (phase !== 'checkout-failure' || !req.path.endsWith('/checkout'))
            || writeCounts[width] === 1 && (phase !== 'refund-failure' || !req.path.endsWith('/refund')))) {
        rejected.push(`${req.method} ${req.originalUrl}`); res.status(405).json({ success: false, error: { code: 'QA_SCOPE_DENIED' } }); return;
      }
      identities.add(requestId);
      if (req.method === 'POST') writeCounts[width]++;
      const injected = req.method === 'GET' && req.path.endsWith('/products') && ['checkout-failure', 'refund-failure'].includes(phase);
      const json = res.json.bind(res);
      res.json = body => {
        void (async () => {
          const current = await stockSnapshot(width);
          const sha256 = createHash('sha256').update(JSON.stringify(body)).digest('hex');
          res.once('finish', () => requests.push({ id: requestId, method: req.method, path: req.originalUrl,
            width, phase, injected, status: res.statusCode, sha256, body, snapshot: current }));
          json(body);
        })().catch(problem => { error ??= problem; res.status(500).end(); });
        return res;
      };
      if (injected) { res.status(500).json({ success: false, error: { code: 'QA_PRODUCT_READ_FAILURE', message: 'Synthetic product read unavailable' } }); return; }
      next();
    });
    outer.use(app); // Unchanged production app, JWT/RBAC/tenant/controller/service/Prisma.
    server = await new Promise<Server>((resolve, reject) => { const listener = outer.listen(4291, '127.0.0.1', () => resolve(listener)); listener.once('error', reject); });
    assert.equal(cancelled, null);
    const pos = path.resolve(backend, '../pos-ui');
    child = spawn(process.execPath, [path.join(pos, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'e2e/stock-native.config.mts'], { cwd: pos, env: process.env, stdio: 'inherit' });
    browser = await new Promise((resolve, reject) => { child!.once('error', reject); child!.once('close', (exitCode, signal) => resolve({ exitCode, signal })); });
    child = undefined;
    assert.ok(browser); assert.equal(browser.exitCode, 0); assert.equal(browser.signal, null); assert.equal(cancelled, null);
  } catch (problem) { error = problem; }
  finally {
    try {
      if (server) await new Promise<void>((resolve, reject) => server!.close(problem => problem ? reject(problem) : resolve()));
      after = await snapshot();
      for (const width of widths) finalSnapshots[width] = await stockSnapshot(width);
      assert.deepEqual(rejected, []);
    } catch (problem) { error ??= problem; }
    try {
      if (seeded) for (const tenantId of seededTenants) {
        // Same exact-tenant FK cleanup ordering as the existing command/native tests.
        await db.checkoutCommand.deleteMany({ where: { tenantId } });
        await db.saleBatchAllocation.deleteMany({ where: { tenantId } });
        await db.order.deleteMany({ where: { tenantId } });
        await db.inventoryTransaction.deleteMany({ where: { tenantId } });
        await db.orderNumberCounter.deleteMany({ where: { tenantId } });
        await db.shift.deleteMany({ where: { tenantId } });
        await db.customer.deleteMany({ where: { tenantId } });
        await db.productBatch.deleteMany({ where: { tenantId } });
        await db.product.deleteMany({ where: { tenantId } });
        await db.user.deleteMany({ where: { tenantId } });
        await db.tenant.deleteMany({ where: { id: tenantId } });
      }
      const final = await snapshot(); afterEmpty = empty(final);
      write('final-counts.json', Object.fromEntries(Object.entries(final).map(([table, rows]) => [table, rows.length])));
      assert.equal(afterEmpty, true, 'Fixture must leave all business tables empty');
    } catch (problem) { error ??= problem; }
    await db.$disconnect();
    fs.rmSync(bootstrap, { force: true });
    write('api-ledger.json', { requests, rejected });
    write('database-receipt.json', { beforeEmpty, afterEmpty, before, after, expected, finalSnapshots, browser, cancelled, error: error instanceof Error ? error.message : error });
    process.off('SIGTERM', term); process.off('SIGINT', interrupt);
  }
  assert.equal(cancelled, null); if (error) throw error;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
