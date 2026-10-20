// Existing Admin batch form, read-only real API and exact synthetic PostgreSQL fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import type { Server } from 'node:http';
import { buildFixture, seedFixture, cleanupFixture, createGuard, drainHttp, finalizeFixture } from '../../pos-ui/e2e/batch-entry-native/fixture.mjs';
import { assertEnvironment, databaseUrl, cases } from '../../pos-ui/e2e/batch-entry-native/contract.mjs';
async function main() {
  assertEnvironment(process.env, process.version);
  assert.equal(process.env.NODE_ENV, 'test'); assert.match(process.env.CATEGORY_UI_NONCE ?? '', /^[a-f0-9-]{36}$/);
  const backend = path.resolve(__dirname, '..'), root = path.resolve(backend, '../../..');
  assert.equal(fs.existsSync(path.join(backend, '.env')), false);
  const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10_000 }).trim();
  const ownership = JSON.parse(fs.readFileSync(path.join(process.env.RUNNER_TEMP!, `sku-qa-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`, 'ownership.json'), 'utf8'));
  assert.equal(ownership.head, process.env.SKU_QA_HEAD); assert.equal(ownership.head, git('rev-parse', 'HEAD'));
  assert.equal(ownership.tree, git('rev-parse', 'HEAD^{tree}')); assert.equal(git('status', '--porcelain'), '');
  assert.equal(ownership.runId, process.env.GITHUB_RUN_ID); assert.equal(ownership.attempt, process.env.GITHUB_RUN_ATTEMPT);
  assert.equal(ownership.service.container, process.env.SKU_QA_CONTAINER); assert.equal(ownership.service.network, process.env.SKU_QA_NETWORK);
  assert.equal(ownership.database, 'checkout_http_recovery_pos_lookup_ci'); assert.equal(ownership.syntheticOnly, true); assert.deepEqual(ownership.initialPublicTables, []);
  const output = path.join(process.env.RUNNER_TEMP!, `batch-entry-native-${ownership.runId}-${ownership.attempt}`);
  assert.equal(process.env.BATCH_ENTRY_UI_OUTPUT, output);
  const write = (name: string, value: unknown) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const bootstrap = path.join(output, '.bootstrap.json');
  const { basePrisma: db } = await import('../src/lib/prisma');
  const { verifyAccessToken, signAccessToken } = await import('../src/lib/jwt');
  const { default: app } = await import('../src/app');
  const { default: express } = await import('express');
  const fixture = buildFixture(process.env.CATEGORY_UI_NONCE!);
  const tokens: Record<string, string> = {};
  let server: Server | undefined, child: ChildProcess | undefined, cancelled: string | null = null;
  let browser: { exitCode: number | null; signal: NodeJS.Signals | null } | null = null;
  let before: unknown = null, after: unknown = null, beforeEmpty = false, afterEmpty = false, seeded = false, httpDrainedBeforeSnapshot = false;
  let stage = 'database-identity', failedStage: string | null = null, error: unknown = null;
  const pending = new Set<Promise<void>>(), requests: unknown[] = [], rejected: string[] = [];
  const fail = (problem: unknown, at = stage) => { if (error === null) { error = problem; failedStage = at; } };
  const failure = () => error === null ? null : { stage: failedStage, name: error instanceof Error ? error.name : typeof error, code: typeof (error as { code?: unknown })?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test((error as { code: string }).code) ? (error as { code: string }).code : null };
  const signal = (name: string) => { cancelled ??= name; child?.kill('SIGTERM'); };
  const term = () => signal('SIGTERM'), interrupt = () => signal('SIGINT'); process.on('SIGTERM', term); process.on('SIGINT', interrupt);
  async function snapshot() {
    const tables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
    assert.ok(tables.length > 0); const result: Record<string, unknown[]> = {};
    for (const { tablename } of tables) { assert.match(tablename, /^[a-z_]+$/); const rows = await db.$queryRawUnsafe<Array<{ row: unknown }>>(`SELECT row_to_json(t) AS row FROM public."${tablename}" t`); result[tablename] = rows.map(row => row.row).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))); }
    return result;
  }
  const empty = (value: Record<string, unknown[]>) => Object.values(value).every(rows => rows.length === 0);
  try {
    const identity = await db.$queryRaw<Array<{ name: string; username: string; version: string }>>`SELECT current_database() AS name, current_user AS username, version() AS version`;
    assert.equal(identity.length, 1); assert.equal(identity[0].name, ownership.database); assert.equal(identity[0].username, 'test'); assert.match(identity[0].version, /^PostgreSQL 15\./);
    write('database-identity.json', { rows: identity, url: databaseUrl, ownership });
    stage = 'initial-empty-snapshot'; const initial = await snapshot(); beforeEmpty = empty(initial);
    write('initial-counts.json', Object.fromEntries(Object.entries(initial).map(([table, rows]) => [table, rows.length]))); assert.equal(beforeEmpty, true); assert.equal(cancelled, null);
    seeded = true; await seedFixture(db, fixture, (part: string) => { stage = `seed-${part}`; });
    for (const actor of fixture.actors) { const user = fixture.user.find((row: {id: string}) => row.id === actor.userId)!; tokens[actor.key] = signAccessToken({userId: actor.userId, email: user.email, tenantId: actor.tenantId, plan: 'pro', permissions: actor.grants}); }
    stage = 'fixture-before-snapshot'; before = await snapshot();
    fs.writeFileSync(bootstrap, JSON.stringify({ nonce: fixture.nonce, tenantA: fixture.ids.tenantA, products: fixture.product, tokens }), { flag: 'wx', mode: 0o600 });
    const outer = express(); outer.use(express.json({ limit: '10kb' }));
    outer.use(createGuard({ f: fixture, nonce: fixture.nonce, verifyAccessToken, tokens, cases, pending, requests, rejected,
      onError: (problem: unknown) => fail(problem, 'response-projection-or-finish') }));
    outer.use((req, res, next) => req.path.startsWith('/api/') ? app(req, res, next) : next());
    const adminDist = path.resolve(backend, '../admin-ui/dist'); assert.equal(fs.existsSync(path.join(adminDist, 'index.html')), true);
    outer.use(express.static(adminDist));
    outer.get('/inventory/batches', (_req, res) => res.sendFile(path.join(adminDist, 'index.html')));
    outer.get('/login', (_req, res) => res.sendFile(path.join(adminDist, 'index.html')));
    stage = 'owned-http-listen'; server = await new Promise<Server>((resolve, reject) => { const listener = outer.listen(4290, '127.0.0.1', () => resolve(listener)); listener.once('error', reject); });
    assert.equal(cancelled, null); stage = 'native-batch-entry-journeys'; const pos = path.resolve(backend, '../pos-ui');
    child = spawn(process.execPath, [path.join(pos, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'e2e/batch-entry-native.config.mts'], { cwd: pos, env: process.env, stdio: 'inherit' });
    browser = await new Promise((resolve, reject) => { child!.once('error', reject); child!.once('close', (exitCode, signal) => resolve({ exitCode, signal })); }); child = undefined;
    assert.ok(browser); assert.equal(browser.exitCode, 0); assert.equal(browser.signal, null); assert.equal(cancelled, null);
  } catch (problem) { fail(problem); }
  finally {
    await finalizeFixture({
      'owned-http-drain': async () => { httpDrainedBeforeSnapshot = await drainHttp(server, pending); },
      'after-snapshot': async () => { assert.equal(httpDrainedBeforeSnapshot, true); after = await snapshot(); assert.deepEqual(after, before); assert.deepEqual(rejected, []); },
      'exact-fixture-cleanup': async () => {
        assert.equal(httpDrainedBeforeSnapshot, true); if (seeded && fixture.ownershipProven) await cleanupFixture(db, fixture, httpDrainedBeforeSnapshot);
        const final = await snapshot(); afterEmpty = empty(final); write('final-counts.json', Object.fromEntries(Object.entries(final).map(([table, rows]) => [table, rows.length]))); assert.equal(afterEmpty, true);
      },
      'database-disconnect': () => db.$disconnect(),
      'private-bootstrap-removal': () => { for (const key of Object.keys(tokens)) delete tokens[key]; fs.rmSync(bootstrap, { force: true }); },
      'api-ledger-write': () => write('api-ledger.json', { requests, rejected }),
      'database-receipt-write': () => write('database-receipt.json', { beforeEmpty, afterEmpty, before, after, expected: seeded ? { tenantA: fixture.ids.tenantA, actors: fixture.actors, products: fixture.product, batches: fixture.productBatch } : null, browser, cancelled, httpDrainedBeforeSnapshot, error: failure() }),
      'signal-disposal': () => { process.off('SIGTERM', term); process.off('SIGINT', interrupt); },
    }, fail);
  }
  assert.equal(cancelled, null); if (error) { console.error('BATCH_ENTRY_FIXTURE_DIAGNOSTIC', JSON.stringify(failure())); throw error; }
}
main().catch(error => { console.error('BATCH_ENTRY_FIXTURE_FAILED', error instanceof Error ? error.name : typeof error); process.exitCode = 1; });
