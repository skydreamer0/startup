// Test-only orchestrator. No migration, broad seed, login bypass or production endpoint.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { seedFixture, cleanupFixture, observeResponse, drainHttp, finalizeFixture } from '../../pos-ui/e2e/recovery-native/fixture.mjs';
import { allowedRequest, assertEnvironment, databaseUrl, cases, phases, requestLimit, safePayload, authorizeOwnedWrite } from '../../pos-ui/e2e/recovery-native/contract.mjs';

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
  const output = path.join(process.env.RUNNER_TEMP!, `recovery-native-${ownership.runId}-${ownership.attempt}`);
  assert.equal(process.env.RECOVERY_UI_OUTPUT, output);
  const write = (name: string, value: unknown) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const bootstrap = path.join(output, '.bootstrap.json');
  const { basePrisma: db } = await import('../src/lib/prisma');
  const { signAccessToken } = await import('../src/lib/jwt');
  const { default: app } = await import('../src/app');
  const { default: express } = await import('express');
  const fixtures: Record<string, { tenantId: string; userId: string; shiftId: string; productId: string; batchId: string }> = {};
  const seededTenants: string[] = []; const finalSnapshots: Record<string, unknown> = {};
  const writeCounts: Record<string, number> = {};
  const bootstraps: Record<string, { tenantId: string; userId: string; shiftId: string; productId: string; batchId: string; accessToken: string; nonce: string | undefined }> = {};
  let server: Server | undefined, child: ChildProcess | undefined, cancelled: string | null = null;
  let browser: { exitCode: number | null; signal: NodeJS.Signals | null } | null = null;
  let before: unknown = null, after: unknown = null, beforeEmpty = false, afterEmpty = false, seeded = false;
  let expected: unknown = null, error: unknown = null;
  let stage = 'database-identity', failedStage: string | null = null;
  function fail(problem: unknown, at = stage) { if (error === null) { error = problem; failedStage = at; } }
  const failure = () => error === null ? null : { stage: failedStage, name: error instanceof Error ? error.name : typeof error, code: typeof (error as { code?: unknown })?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test((error as { code: string }).code) ? (error as { code: string }).code : null };
  let httpDrainedBeforeSnapshot = false;
  const pendingResponses = new Set<Promise<void>>();
  const requests: unknown[] = [], rejected: string[] = [];
  const identities = new Set<string>();
  const originalIntents: Record<string, { payload: Record<string, unknown>; orderId?: string }> = {};
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
  async function scopedRaw(tenantId: string) {
    const result: Record<string, unknown[]> = {};
    for (const table of ['products','product_batches','orders','order_items','order_payments','inventory_transactions','sale_batch_allocations','checkout_commands','order_number_counters']) {
      const sql = table === 'order_items'
        ? 'SELECT row_to_json(t) AS row FROM order_items t JOIN orders o ON o.id = t.order_id WHERE o.tenant_id = $1'
        : `SELECT row_to_json(t) AS row FROM public."${table}" t WHERE t.tenant_id = $1`;
      const rows = await db.$queryRawUnsafe<Array<{ row: unknown }>>(sql, tenantId);
      result[table] = rows.map(row => row.row).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    }
    return result;
  }
  async function stockSnapshot(key: string) {
    const fixture = fixtures[key]; assert.ok(fixture);
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
    return JSON.parse(JSON.stringify({ raw: await scopedRaw(tenantId), product, batch, orders, items: items.map(item => item.row), payments, movements, allocations, commands, counters }));
  }
  const empty = (value: Record<string, unknown[]>) => Object.values(value).every(rows => rows.length === 0);
  try {
    const identity = await db.$queryRaw<Array<{ name: string; username: string; version: string }>>`SELECT current_database() AS name, current_user AS username, version() AS version`;
    assert.equal(identity.length, 1); assert.equal(identity[0].name, ownership.database); assert.equal(identity[0].username, 'test'); assert.match(identity[0].version, /^PostgreSQL 15\./);
    write('database-identity.json', { rows: identity, url: databaseUrl, ownership });
    stage = 'initial-empty-snapshot';
    const initial = await snapshot(); write('initial-counts.json', Object.fromEntries(Object.entries(initial).map(([table, rows]) => [table, rows.length])));
    beforeEmpty = empty(initial); assert.equal(beforeEmpty, true, 'Never append fixtures to a populated DB');
    assert.equal(cancelled, null);
    seeded = true;
    for (const scenario of cases) {
      const key = scenario.id;
      const tenantId = randomUUID(), userId = randomUUID(), shiftId = randomUUID();
      seededTenants.push(tenantId); writeCounts[key] = 0;
      const { email, ...fixture } = await seedFixture(db, { tenantId, userId, shiftId }, (part: string) => { stage = `seed-${part}-${key}`; });
      fixtures[key] = fixture;
      const accessToken = signAccessToken({ userId, email, tenantId, plan: 'pro', permissions: ['manage:pos'] });
      bootstraps[key] = { ...fixtures[key], accessToken, nonce: process.env.CATEGORY_UI_NONCE };
    }
    stage = 'fixture-before-snapshot'; expected = fixtures; before = await snapshot();
    fs.writeFileSync(bootstrap, JSON.stringify(bootstraps), { flag: 'wx', mode: 0o600 });
    const outer = express();
    outer.use(express.json({ limit: '10mb' }));
    outer.use((req, res, next) => {
      // Snapshot the known path and method before Express mount/router mutation.
      const requestId = req.get('x-recovery-qa-request') ?? '';
      const key = req.get('x-recovery-qa-case') ?? '', phase = req.get('x-recovery-qa-phase') ?? '';
      const fixture = fixtures[key], method = req.method, pathname = req.path, requestPath = req.originalUrl;
      if (!fixture || !phases.includes(phase) || !allowedRequest(method, pathname)
          || !requestId.startsWith(`${process.env.CATEGORY_UI_NONCE}:`) || identities.has(requestId)
          || req.get('authorization') !== `Bearer ${bootstraps[key].accessToken}`
          || identities.size >= requestLimit || method === 'POST' && !authorizeOwnedWrite(key, writeCounts[key], pathname, phase, req.body, fixture, originalIntents[key])) {
        rejected.push('Request outside exact owned fixture scope'); res.status(405).json({ success: false, error: { code: 'QA_SCOPE_DENIED' } }); return;
      }
      identities.add(requestId);
      if (method === 'POST') {
        if (writeCounts[key] === 0) originalIntents[key] = { payload: safePayload(req.body) };
        writeCounts[key]++;
      }
      const payload = method === 'POST' && pathname.endsWith('/checkout') ? safePayload(req.body) : undefined;
      observeResponse({ res, identity: { id: requestId, method, path: requestPath, caseId: key, phase, payload }, pending: pendingResponses,
        snapshot: async (body: { data?: { id?: string } }, status: number) => {
          const current = await stockSnapshot(key);
          if (pathname.endsWith('/checkout') && status === 201 && originalIntents[key]) originalIntents[key].orderId = body.data?.id;
          return current;
        },
        record: (row: unknown) => requests.push(row), onError: (problem: unknown) => fail(problem, 'response-snapshot-or-finish') });
      next();
    });
    outer.use(app); // Unchanged production app, JWT/RBAC/tenant/controller/service/Prisma.
    stage = 'owned-http-listen';
    server = await new Promise<Server>((resolve, reject) => { const listener = outer.listen(4291, '127.0.0.1', () => resolve(listener)); listener.once('error', reject); });
    assert.equal(cancelled, null);
    const pos = path.resolve(backend, '../pos-ui');
    stage = 'native-recovery-journeys';
    child = spawn(process.execPath, [path.join(pos, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'e2e/recovery-native.config.mts'], { cwd: pos, env: process.env, stdio: 'inherit' });
    browser = await new Promise((resolve, reject) => { child!.once('error', reject); child!.once('close', (exitCode, signal) => resolve({ exitCode, signal })); });
    child = undefined;
    assert.ok(browser); assert.equal(browser.exitCode, 0); assert.equal(browser.signal, null); assert.equal(cancelled, null);
  } catch (problem) { fail(problem); }
  finally {
    await finalizeFixture({
      'owned-http-drain': async () => { httpDrainedBeforeSnapshot = await drainHttp(server, pendingResponses); },
      'after-snapshot': async () => {
        assert.equal(httpDrainedBeforeSnapshot, true, 'No post-run snapshot while HTTP may still write');
        after = await snapshot();
        for (const key of Object.keys(fixtures)) finalSnapshots[key] = await stockSnapshot(key);
        assert.deepEqual(rejected, []);
      },
      'exact-fixture-cleanup': async () => {
        assert.equal(httpDrainedBeforeSnapshot, true, 'Never delete fixtures before owned HTTP is settled');
        if (seeded) for (const tenantId of seededTenants) await cleanupFixture(db, tenantId, httpDrainedBeforeSnapshot);
        const final = await snapshot(); afterEmpty = empty(final);
        write('final-counts.json', Object.fromEntries(Object.entries(final).map(([table, rows]) => [table, rows.length])));
        assert.equal(afterEmpty, true, 'Fixture must leave all business tables empty');
      },
      'database-disconnect': () => db.$disconnect(),
      'private-bootstrap-removal': () => fs.rmSync(bootstrap, { force: true }),
      'api-ledger-write': () => write('api-ledger.json', { requests, rejected }),
      'database-receipt-write': () => write('database-receipt.json', { beforeEmpty, afterEmpty, before, after, expected, finalSnapshots, browser, cancelled, httpDrainedBeforeSnapshot, error: failure() }),
      'signal-disposal': () => { process.off('SIGTERM', term); process.off('SIGINT', interrupt); },
    }, fail);
  }
  assert.equal(cancelled, null); if (error) { console.error('RECOVERY_FIXTURE_DIAGNOSTIC', JSON.stringify(failure())); throw error; }
}
main().catch(error => { console.error('RECOVERY_FIXTURE_FAILED', error instanceof Error ? error.name : typeof error); process.exitCode = 1; });
