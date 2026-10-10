// Test-only orchestrator. No migration, broad seed, login bypass or production endpoint.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { allowedRead, assertEnvironment, databaseUrl } from '../../pos-ui/e2e/category-native/contract.mjs';

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
  const output = path.join(process.env.RUNNER_TEMP!, `category-native-${ownership.runId}-${ownership.attempt}`);
  assert.equal(process.env.CATEGORY_UI_OUTPUT, output);
  const write = (name: string, value: unknown) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const bootstrap = path.join(output, '.bootstrap.json');
  const { basePrisma: db } = await import('../src/lib/prisma');
  const { signAccessToken } = await import('../src/lib/jwt');
  const { default: app } = await import('../src/app');
  const { default: express } = await import('express');
  const tenantId = randomUUID(); const userId = randomUUID(); const shiftId = randomUUID();
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
  const empty = (value: Record<string, unknown[]>) => Object.values(value).every(rows => rows.length === 0);
  try {
    const identity = await db.$queryRaw<Array<{ name: string; username: string; version: string }>>`SELECT current_database() AS name, current_user AS username, version() AS version`;
    assert.equal(identity.length, 1); assert.equal(identity[0].name, ownership.database); assert.equal(identity[0].username, 'test'); assert.match(identity[0].version, /^PostgreSQL 15\./);
    write('database-identity.json', { rows: identity, url: databaseUrl, ownership });
    const initial = await snapshot(); write('initial-counts.json', Object.fromEntries(Object.entries(initial).map(([table, rows]) => [table, rows.length])));
    beforeEmpty = empty(initial); assert.equal(beforeEmpty, true, 'Never append fixtures to a populated DB');
    assert.equal(cancelled, null);
    seeded = true; // Partial fixture creation is also cleaned by exact tenant ID.
    await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Synthetic category browser tenant', plan: 'pro' } });
    const email = `${userId}@category-browser.example.test`;
    await db.user.create({ data: { id: userId, tenantId, email, fullName: '合成分類收銀員', passwordHash: 'not-a-login-hash', status: 'active' } });
    const categories = [];
    for (const name of ['A 合成營養保健', 'B 合成日常用品', 'C 合成空分類']) {
      categories.push(await db.productCategory.create({ data: { tenantId, name }, select: { id: true, name: true } }));
    }
    for (const [index, name] of ['合成維他命甲', '合成日用品乙'].entries()) {
      await db.product.create({ data: { tenantId, categoryId: categories[index].id, sku: `CATEGORY-ONLY-${index + 1}`, name, stockQuantity: 5, safetyStock: 1, costPrice: 10, retailPrice: 20 } });
    }
    await db.shift.create({ data: { id: shiftId, tenantId, staffId: userId, status: 'OPEN', openingCash: 0 } });
    const products = await db.product.findMany({ where: { tenantId }, orderBy: { name: 'asc' }, select: { id: true, sku: true, name: true, categoryId: true, stockQuantity: true } });
    expected = { tenantId, userId, shiftId, categories, products };
    before = await snapshot();
    const accessToken = signAccessToken({ userId, email, tenantId, plan: 'pro', permissions: ['manage:pos'] });
    // Ephemeral public-synthetic JWT only. Deleted before any artifact output is released.
    fs.writeFileSync(bootstrap, JSON.stringify({ ...(expected as object), accessToken, nonce: process.env.CATEGORY_UI_NONCE }), { flag: 'wx', mode: 0o600 });
    const outer = express();
    outer.use((req, res, next) => {
      const requestId = req.get('x-category-qa-request') ?? '';
      if (!allowedRead(req.method, req.path) || !requestId.startsWith(`${process.env.CATEGORY_UI_NONCE}:`) || identities.has(requestId)) {
        rejected.push(`${req.method} ${req.originalUrl}`); res.status(405).json({ success: false, error: { code: 'QA_READ_ONLY' } }); return;
      }
      identities.add(requestId);
      const json = res.json.bind(res);
      res.json = body => {
        const sha256 = createHash('sha256').update(JSON.stringify(body)).digest('hex');
        res.once('finish', () => requests.push({ id: requestId, method: req.method, path: req.originalUrl, status: res.statusCode, sha256, body }));
        return json(body);
      };
      next();
    });
    outer.use(app); // Unchanged production app, JWT/RBAC/tenant/controller/service/Prisma.
    server = await new Promise<Server>((resolve, reject) => { const listener = outer.listen(4291, '127.0.0.1', () => resolve(listener)); listener.once('error', reject); });
    assert.equal(cancelled, null);
    const pos = path.resolve(backend, '../pos-ui');
    child = spawn(process.execPath, [path.join(pos, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'e2e/category-native.config.mts'], { cwd: pos, env: process.env, stdio: 'inherit' });
    browser = await new Promise((resolve, reject) => { child!.once('error', reject); child!.once('close', (exitCode, signal) => resolve({ exitCode, signal })); });
    child = undefined;
    assert.ok(browser); assert.equal(browser.exitCode, 0); assert.equal(browser.signal, null); assert.equal(cancelled, null);
  } catch (problem) { error = problem; }
  finally {
    try {
      if (server) await new Promise<void>((resolve, reject) => server!.close(problem => problem ? reject(problem) : resolve()));
      after = await snapshot();
      if (before) assert.deepEqual(after, before, 'Every business/fixture row must be unchanged by the browser');
      assert.deepEqual(rejected, []);
    } catch (problem) { error ??= problem; }
    try {
      if (seeded) {
        // No reset/truncate and no ambient IDs. Foreign-key failures stay failures.
        await db.shift.deleteMany({ where: { tenantId } });
        await db.product.deleteMany({ where: { tenantId } });
        await db.productCategory.deleteMany({ where: { tenantId } });
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
    write('database-receipt.json', { beforeEmpty, afterEmpty, before, after, expected, browser, cancelled, error: error instanceof Error ? error.message : error });
    process.off('SIGTERM', term); process.off('SIGINT', interrupt);
  }
  assert.equal(cancelled, null); if (error) throw error;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
