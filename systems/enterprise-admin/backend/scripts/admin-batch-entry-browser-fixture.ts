// Existing Admin batch form, read-only real API and exact synthetic PostgreSQL fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Server } from 'node:http';
import { buildFixture, seedFixture, cleanupFixture, createGuard, drainHttp } from '../../pos-ui/e2e/batch-entry-native/fixture.mjs';
import { assertEnvironment, databaseUrl, cases } from '../../pos-ui/e2e/batch-entry-native/contract.mjs';
import { processOwner } from '../../pos-ui/e2e/ui-evidence/owned-process.mjs';
import { createRunScope, cleanupRunProcesses } from '../../pos-ui/e2e/category-native/owned-run.mjs';
import { fixtureLifecycle, finalizeBatchFixture } from '../../pos-ui/e2e/batch-entry-native/lifecycle.mjs';
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
  let server: Server | undefined;
  const lifecycle = fixtureLifecycle(), browserOwner = processOwner();
  let browserScope: Awaited<ReturnType<typeof createRunScope>> | undefined;
  let browserQuiescent = false;
  let browser: { exitCode: number | null; signal: string | null } | null = null;
  let before: unknown = null, after: unknown = null, beforeEmpty = false, afterEmpty = false, seeded = false, httpDrainedBeforeSnapshot = false;
  let stage = 'browser-scope-initialization', failedStage: string | null = null, error: unknown = null;
  const pending = new Set<Promise<void>>(), requests: unknown[] = [], rejected: string[] = [];
  const fail = (problem: unknown, at = stage) => { if (error === null) { error = problem; failedStage = at; } };
  const failure = () => error === null ? null : { stage: failedStage, name: error instanceof Error ? error.name : typeof error, code: typeof (error as { code?: unknown })?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test((error as { code: string }).code) ? (error as { code: string }).code : null };
  async function snapshot(allowStopped = false) {
    if (!allowStopped) lifecycle.checkpoint();
    const tables = await db.$queryRaw<Array<{ tablename: string }>>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
    assert.ok(tables.length > 0); const result: Record<string, unknown[]> = {};
    for (const { tablename } of tables) { if (!allowStopped) lifecycle.checkpoint(); assert.match(tablename, /^[a-z_]+$/); const rows = await db.$queryRawUnsafe<Array<{ row: unknown }>>(`SELECT row_to_json(t) AS row FROM public."${tablename}" t`); result[tablename] = rows.map(row => row.row).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))); }
    return result;
  }
  const empty = (value: Record<string, unknown[]>) => Object.values(value).every(rows => rows.length === 0);
  try {
    lifecycle.checkpoint();
    browserScope = await createRunScope(process.env.CATEGORY_UI_NONCE!);
    lifecycle.checkpoint(); stage = 'database-identity';
    const identity = await db.$queryRaw<Array<{ name: string; username: string; version: string }>>`SELECT current_database() AS name, current_user AS username, version() AS version`;
    assert.equal(identity.length, 1); assert.equal(identity[0].name, ownership.database); assert.equal(identity[0].username, 'test'); assert.match(identity[0].version, /^PostgreSQL 15\./);
    write('database-identity.json', { rows: identity, url: databaseUrl, ownership });
    stage = 'initial-empty-snapshot'; const initial = await snapshot(); beforeEmpty = empty(initial);
    write('initial-counts.json', Object.fromEntries(Object.entries(initial).map(([table, rows]) => [table, rows.length]))); assert.equal(beforeEmpty, true); lifecycle.checkpoint();
    seeded = true; await seedFixture(db, fixture, (part: string) => { lifecycle.checkpoint(); stage = `seed-${part}`; });
    lifecycle.checkpoint();
    for (const actor of fixture.actors) { const user = fixture.user.find((row: {id: string}) => row.id === actor.userId)!; tokens[actor.key] = signAccessToken({userId: actor.userId, email: user.email, tenantId: actor.tenantId, plan: 'pro', permissions: actor.grants}); }
    stage = 'fixture-before-snapshot'; before = await snapshot();
    lifecycle.checkpoint();
    fs.writeFileSync(bootstrap, JSON.stringify({ nonce: fixture.nonce, tenantA: fixture.ids.tenantA, products: fixture.product, tokens }), { flag: 'wx', mode: 0o600 });
    const outer = express();
    outer.use(lifecycle.requestFence);
    outer.use(express.json({ limit: '10kb' }));
    outer.use(createGuard({ f: fixture, nonce: fixture.nonce, verifyAccessToken, tokens, cases, pending, requests, rejected,
      onError: (problem: unknown) => fail(problem, 'response-projection-or-finish') }));
    outer.use((req, res, next) => req.path.startsWith('/api/') ? app(req, res, next) : next());
    const adminDist = path.resolve(backend, '../admin-ui/dist'); assert.equal(fs.existsSync(path.join(adminDist, 'index.html')), true);
    outer.use(express.static(adminDist));
    outer.get('/inventory/batches', (_req, res) => res.sendFile(path.join(adminDist, 'index.html')));
    outer.get('/login', (_req, res) => res.sendFile(path.join(adminDist, 'index.html')));
    lifecycle.checkpoint(); stage = 'owned-http-listen'; server = await new Promise<Server>((resolve, reject) => { const listener = outer.listen(4290, '127.0.0.1', () => resolve(listener)); listener.once('error', reject); });
    lifecycle.checkpoint(); stage = 'native-batch-entry-journeys'; const pos = path.resolve(backend, '../pos-ui');
    const result = await browserOwner.run(process.execPath, [path.join(pos, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'e2e/batch-entry-native.config.mts'], { cwd: pos, env: process.env, stdio: 'inherit' });
    browser = { exitCode: result.exitCode, signal: result.signal };
    assert.equal(result.quiescent, true); assert.equal(result.error, null); assert.equal(result.cancelled, null); assert.equal(result.signalCount, 0);
    assert.equal(browser.exitCode, 0); assert.equal(browser.signal, null); lifecycle.checkpoint();
  } catch (problem) { fail(problem); }
  finally {
    await finalizeBatchFixture({
      stopBrowser: async () => {
        // Missing scope is unknown ownership, never permission to inspect/delete rows.
        if (!browserScope) return false;
        const cleanup = await cleanupRunProcesses(browserScope);
        browserQuiescent = cleanup.quiescent === true;
        write('browser-process-cleanup.json', cleanup);
        if (cleanup.signalCount !== 0) fail(new Error('Owned browser required recovery signals'), 'owned-browser-stop');
        return browserQuiescent;
      },
      drainHttp: async () => { httpDrainedBeforeSnapshot = await drainHttp(server, pending); return httpDrainedBeforeSnapshot; },
      afterSnapshot: async () => { assert.equal(httpDrainedBeforeSnapshot, true); after = await snapshot(true); assert.deepEqual(after, before); assert.deepEqual(rejected, []); },
      cleanupRows: async () => {
        assert.equal(httpDrainedBeforeSnapshot, true); if (seeded && fixture.ownershipProven) await cleanupFixture(db, fixture, httpDrainedBeforeSnapshot);
        const final = await snapshot(true); afterEmpty = empty(final); write('final-counts.json', Object.fromEntries(Object.entries(final).map(([table, rows]) => [table, rows.length]))); assert.equal(afterEmpty, true);
      },
      disconnect: () => db.$disconnect(),
      purgePrivate: () => { for (const key of Object.keys(tokens)) delete tokens[key]; fs.rmSync(bootstrap, { force: true }); },
      writeLedger: () => write('api-ledger.json', { requests, rejected }),
      writeReceipt: () => write('database-receipt.json', { beforeEmpty, afterEmpty, before, after, expected: seeded ? { tenantA: fixture.ids.tenantA, actors: fixture.actors, products: fixture.product, batches: fixture.productBatch } : null, browser, cancelled: lifecycle.stopped, browserQuiescent, httpDrainedBeforeSnapshot, error: failure() }),
      dispose: () => { browserOwner.dispose(); lifecycle.dispose(); },
    }, fail);
  }
  if (error) { console.error('BATCH_ENTRY_FIXTURE_DIAGNOSTIC', JSON.stringify(failure())); throw error; }
  lifecycle.checkpoint();
}
main().catch(error => { console.error('BATCH_ENTRY_FIXTURE_FAILED', error instanceof Error ? error.name : typeof error); process.exitCode = 1; });
