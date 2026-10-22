import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertBrowserLedger, assertReceivingBrowserEnvironment, ownedDatabaseUrl, receivingRequestAllowed } from '../../pos-ui/e2e/receiving-browser-native/fixture.mjs';
import { assertPlaywrightReceivingReport, assertAcceptanceAfterCleanup, receivingBrowserScope } from '../../pos-ui/e2e/receiving-browser-native/acceptance.mjs';
import { runOwnedBrowser } from '../../pos-ui/e2e/receiving-browser-native/owned-browser-process.mjs';
import { createHttpWorkTracker, instrumentExpressHandlers, trackReceivingRequest } from '../../pos-ui/e2e/receiving-browser-native/http-work.mjs';
import { drainAndCloseServers } from '../../pos-ui/e2e/receiving-browser-native/server-shutdown.mjs';
import { createRunScope, cleanupRunProcesses } from '../../pos-ui/e2e/category-native/owned-run.mjs';
import { compareReceivingBrowserSnapshots, readSnapshotWithDeadline, redactBusinessSnapshot } from './receiving-browser-snapshot.mjs';
import { buildAuthFixture, authCredential, seedAuthFixture } from './admin-auth-fixture.mjs';
import { assertConnection, assertService, databaseName, databaseUrl } from './receiving-drafts-ci.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const system = path.resolve(backend, '..');
const root = path.resolve(system, '../..');
const env = process.env;
assertReceivingBrowserEnvironment(env, process.version);
assert.equal(execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), env.RECEIVING_QA_HEAD);
assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }).trim(), '');
assertConnection(env);
assert.equal(databaseUrl, ownedDatabaseUrl);
assert.equal(databaseName, 'checkout_http_recovery_receiving_drafts_ci');
assert.ok(env.RUNNER_TEMP);

const output = path.join(env.RUNNER_TEMP, `receiving-qa-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`);
assert.ok(fs.existsSync(path.join(output, 'ownership.json')), 'The original PG preflight must prove ownership first');
assert.equal(JSON.parse(fs.readFileSync(path.join(output, 'tests.json'), 'utf8')).status, 'passed', 'The original ten native cases must pass first');
assert.equal(fs.existsSync(path.join(output, 'browser-source.json')), false, 'Never reuse browser evidence');
const write = (name, value) => fs.writeFileSync(path.join(output, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
const requireBackend = createRequire(path.join(backend, 'package.json'));
const requirePos = createRequire(path.join(system, 'pos-ui/package.json'));
const { PrismaClient } = requireBackend('@prisma/client');
const { hashPassword } = requireBackend('./dist/lib/password.js');
const express = requireBackend('express');
const db = new PrismaClient({ datasources: { db: { url: ownedDatabaseUrl } } });
const nonce = crypto.randomUUID();
const runScope = await createRunScope(nonce);
const credentialFile = path.join(env.RUNNER_TEMP, `receiving-auth-${nonce}.json`);
const browserOutput = path.join(output, 'browser-native');
fs.mkdirSync(browserOutput, { recursive: false });
const servers = [];
let fixture, failure = null, acceptedPayload = null, mutationScope = null, browserCases = null, combinedLedger = null;
let browserProcessReceipt = null;
let snapshotQueryInFlight = false;
let afterSnapshotDeadlineOutcome = null;
const requestRows = [];
const httpWork = createHttpWorkTracker();
let httpDrainedBeforeSnapshot = false;
let beforeFixtureSnapshot = null;
async function bounded(work, milliseconds, message) {
  let timer;
  try { return await Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => {
    const error = new Error(message); error.code = 'ERR_OWNED_WORK_DEADLINE'; reject(error);
  }, milliseconds); })]); }
  finally { clearTimeout(timer); }
}
async function waitForHttpDrain(milliseconds = 10_000) {
  const deadline = Date.now() + milliseconds;
  while (httpWork.activeCount !== 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(httpWork.activeCount, 0, 'All real API handlers and transports must finish before the PostgreSQL after-snapshot');
}
function redactFailureText(value) {
  return String(value ?? '').replace(/((?:password\w*|token\w*|secret\w*|authorization)\s*[:=]\s*)[^\r\n]*/gi, '$1[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[REDACTED JWT]');
}

async function rowsByTable() {
  const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`;
  const result = {};
  for (const { tablename } of tables) {
    assert.match(tablename, /^[a-z_]+$/);
    const rows = await db.$queryRawUnsafe(`SELECT row_to_json(t)::text AS row FROM public."${tablename}" t ORDER BY row_to_json(t)::text`);
    result[tablename] = rows.map(row => JSON.parse(row.row));
  }
  return result;
}
function tableDigests(snapshot) {
  return Object.fromEntries(Object.entries(snapshot).map(([name, rows]) => [name, { rows: rows.length,
    sha256: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex') }]));
}
async function startAdmin(f) {
  const app = express();
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'synthetic-receiving-browser-access-not-a-credential';
  process.env.JWT_REFRESH_SECRET = 'synthetic-receiving-browser-refresh-not-a-credential';
  const realApp = requireBackend('./dist/app.js').default;
  instrumentExpressHandlers(realApp);
  app.use((req, res, next) => trackReceivingRequest(req, res, next, httpWork, row => requestRows.push(row),
    request => f.user.find(user => user.email === request.body?.email)?.id ?? null));
  app.use((req, res, next) => req.path.startsWith('/api/') ? realApp(req, res, next) : next());
  app.use(express.static(path.join(system, 'admin-ui/dist')));
  app.get('/{*rest}', (_req, res) => res.sendFile(path.join(system, 'admin-ui/dist/index.html')));
  const server = app.listen(4287, '127.0.0.1'); servers.push(server);
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
}

try {
  const service = JSON.parse(execFileSync('docker', ['inspect', env.RECEIVING_QA_CONTAINER], { encoding: 'utf8' }))[0];
  const network = JSON.parse(execFileSync('docker', ['network', 'inspect', env.RECEIVING_QA_NETWORK], { encoding: 'utf8' }))[0];
  assert.equal(service.Id, env.RECEIVING_QA_CONTAINER); assert.equal(service.State.Running, true);
  const serviceOwnership = assertService(service, env.RECEIVING_QA_NETWORK, env.RECEIVING_QA_CONTAINER);
  assert.equal(network.Driver, 'bridge'); assert.deepEqual(Object.keys(network.Containers), [env.RECEIVING_QA_CONTAINER]);
  const originalOwnership = JSON.parse(fs.readFileSync(path.join(output, 'ownership.json'), 'utf8'));
  assert.equal(originalOwnership.head, env.RECEIVING_QA_HEAD);
  assert.equal(originalOwnership.tree, execFileSync('git', ['-C', root, 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim());
  assert.equal(originalOwnership.runId, env.GITHUB_RUN_ID); assert.equal(originalOwnership.attempt, env.GITHUB_RUN_ATTEMPT);
  assert.deepEqual(originalOwnership.service, serviceOwnership);
  const identity = { head: env.RECEIVING_QA_HEAD, tree: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
    runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, node: process.version, chrome: execFileSync('google-chrome', ['--version'], { encoding: 'utf8' }).trim(),
    browser: 'Google Chrome stable, sandbox enabled', service: serviceOwnership,
    database: 'owned synthetic PostgreSQL 15; no other host or fallback' };
  assert.match(identity.chrome, /^Google Chrome /);
  assert.deepEqual(service.HostConfig.PortBindings, { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55438' }] });
  assert.deepEqual(service.NetworkSettings.Ports, service.HostConfig.PortBindings);
  const before = await rowsByTable();
  write('business-baseline-before.json', redactBusinessSnapshot(before));
  fixture = await buildAuthFixture(nonce, hashPassword);
  await seedAuthFixture(db, fixture);
  const permissions = ['read:products', 'create:products'];
  for (const value of permissions) {
    const [action, resource] = value.split(':');
    let permission = await db.permission.findFirst({ where: { action, resource } });
    if (!permission) {
      const made = await db.permission.create({ data: { action, resource, description: 'Synthetic receiving browser acceptance' } });
      fixture.createdPermissions.push(made.id); permission = made;
    }
    await db.rolePermission.create({ data: { roleId: fixture.ids.allowedRole, permissionId: permission.id } });
    if (action === 'read') await db.rolePermission.create({ data: { roleId: fixture.ids.deniedRole, permissionId: permission.id } });
  }
  const product = await db.product.create({ data: { tenantId: fixture.ids.tenant, sku: `RECEIVING-${nonce.slice(0, 8)}`, name: '合成真 API 收貨商品',
    costPrice: 1, retailPrice: 2, stockQuantity: 0, safetyStock: 0 } });
  fixture.productId = product.id;
  const primary = authCredential(fixture, 'allowed'), secondary = authCredential(fixture, 'denied');
  fs.writeFileSync(credentialFile, JSON.stringify({ email: primary.email, password: primary.password,
    secondEmail: secondary.email, secondPassword: secondary.password, productId: product.id }), { flag: 'wx', mode: 0o600 });
  const afterFixture = await rowsByTable();
  beforeFixtureSnapshot = afterFixture;
  write('business-before.json', redactBusinessSnapshot(afterFixture));
  await startAdmin(fixture);
  write('browser-source.json', { ...identity, fixture: { nonce, syntheticOnly: true, actors: 2, products: 1, actualLogin: true,
    accessTokensFromRealLoginOnly: true, draftOnly: true, stockQuantity: 0 }, baselineTables: Object.keys(before).length,
    adminBuild: 'same exact-head Admin UI build', noFixtureJwt: true, noSyntheticHttp: true,
    verifiedScope: receivingBrowserScope.verified, notVerified: receivingBrowserScope.notVerified });
  write('browser-fixture-counts.json', { before: tableDigests(before), afterFixture: tableDigests(afterFixture) });
  const childEnv = Object.fromEntries(['PATH','HOME','TMPDIR','RUNNER_TEMP','CI','GITHUB_ACTIONS','RUNNER_ENVIRONMENT','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','RECEIVING_QA_HEAD','DATABASE_URL','RECEIVING_DRAFT_DATABASE_URL'].filter(key => env[key] !== undefined).map(key => [key, env[key]]));
  Object.assign(childEnv, { RECEIVING_BROWSER_OUTPUT: browserOutput, RECEIVING_BROWSER_CREDENTIAL_FILE: credentialFile, CATEGORY_UI_NONCE: nonce });
  const playwrightCli = path.join(path.dirname(requirePos.resolve('@playwright/test')), 'cli.js');
  const command = [playwrightCli, 'test', '--config', 'e2e/receiving-browser-native/playwright.config.mts'];
  const child = await runOwnedBrowser(process.execPath, command, { cwd: path.join(system, 'pos-ui'), env: childEnv }, { scope: runScope, timeoutMs: 240_000 });
  browserProcessReceipt = child.cleanup;
  fs.writeFileSync(path.join(browserOutput, 'raw.log'), `${child.stdout}${child.stderr}`, { flag: 'wx' });
  write('browser-command.json', { executable: process.execPath, args: command, exitCode: child.exitCode, signal: child.signal,
    error: child.error, timedOut: child.timedOut, closeTimedOut: child.closeTimedOut, forcedSignals: child.forcedSignals,
    processCleanup: child.cleanup, cleanupError: child.cleanupError?.message ?? null });
  process.stdout.write(child.stdout); process.stderr.write(child.stderr);
  assert.equal(child.error, null); assert.equal(child.signal, null); assert.equal(child.exitCode, 0, 'Receiving native browser runner failed');
  assert.equal(child.timedOut, false); assert.equal(child.cleanupError, null);
  assert.equal(child.cleanup?.quiescent, true); assert.equal(child.cleanup?.signalCount, 0, 'Browser descendants must exit normally');
  await waitForHttpDrain(); httpDrainedBeforeSnapshot = true;
  const report = JSON.parse(fs.readFileSync(path.join(browserOutput, 'report.json'), 'utf8'));
  const ledgerFiles = fs.readdirSync(path.join(browserOutput, 'tests'), { recursive: true }).filter(file => String(file).endsWith('/receiving-browser-ledger.json'));
  const ledgers = ledgerFiles.map(file => JSON.parse(fs.readFileSync(path.join(browserOutput, 'tests', file), 'utf8')));
  browserCases = assertPlaywrightReceivingReport(report, ledgers, requestRows);
  combinedLedger = { realLogin: true, syntheticHttp: false, fixtureJwt: false,
    unexpected: ledgers.flatMap(row => row.unexpected), forbidden: ledgers.flatMap(row => row.forbidden),
    requests: ledgers.flatMap(row => row.requests), viewports: [...new Set(ledgers.map(row => row.viewport))].sort((a,b) => b-a),
    saveCalls: ledgers.reduce((total, row) => total + row.saveCalls, 0),
    stockWrites: 0, orderWrites: 0, paymentWrites: 0, postingWrites: 0 };
  assert.deepEqual(combinedLedger.viewports, [1440, 390]);
  assertBrowserLedger(combinedLedger);
} catch (error) {
  failure = error;
} finally {
  const facts = { primary: failure ? { name: failure.name, message: redactFailureText(failure.message), stack: redactFailureText(failure.stack) } : null,
    processCleanupError: null, drainError: null, postCloseDrainError: null, serverCloseErrors: [], snapshotError: null,
    credentialError: null, databaseError: null, artifactError: null };
  let runProcessReceipt = null, finalProcessReceipt = null;
  try {
    finalProcessReceipt = await bounded(cleanupRunProcesses(runScope), 12_000, 'Final owned process cleanup deadline exceeded');
  } catch (error) { facts.processCleanupError = redactFailureText(error.message); }

  const closeOwnedServer = async server => {
    if (!server.listening) return { closed: true, alreadyStopped: true };
    let timer;
    const closePromise = new Promise(resolve => {
      try {
        server.close(error => resolve(error ? { closed: false, error: redactFailureText(error.message) } : { closed: true }));
      } catch (error) { resolve({ closed: false, error: redactFailureText(error.message) }); }
    });
    try {
      const result = await Promise.race([closePromise, new Promise(resolve => {
        timer = setTimeout(() => resolve({ closed: false, timedOut: true, error: 'Owned server close deadline exceeded' }), 10_000);
      })]);
      clearTimeout(timer);
      if (!result.closed) server.closeAllConnections?.();
      return result;
    } catch (error) {
      clearTimeout(timer); server.closeAllConnections?.();
      return { closed: false, error: redactFailureText(error.message) };
    }
  };
  const shutdown = await drainAndCloseServers(
    async () => { await waitForHttpDrain(); },
    servers,
    closeOwnedServer,
  );
  if (shutdown.drainError) facts.drainError = redactFailureText(shutdown.drainError.message);
  const serverCloseResults = shutdown.closeResults.map(result => ({ ...result,
    error: result.error ? redactFailureText(result.error instanceof Error ? result.error.message : result.error) : undefined }));
  for (const result of serverCloseResults) if (!result.closed) facts.serverCloseErrors.push(result.error ?? 'Owned server did not close');
  let postCloseDrainError = null;
  try { await waitForHttpDrain(); }
  catch (error) { postCloseDrainError = error; facts.postCloseDrainError = redactFailureText(error.message); }

  const serverClosed = serverCloseResults.every(result => result.closed === true);
  const processesQuiet = finalProcessReceipt?.quiescent === true;
  const handlersQuiet = httpWork.activeCount === 0 && !postCloseDrainError;
  const snapshotStatus = { status: 'unverified', reason: null, comparison: 'not-run' };
  try { write('browser-api-responses.json', requestRows); }
  catch (error) { facts.artifactError = redactFailureText(error.message); }
  try { write('browser-api-response-status.json', { completeAtCheckpoint: handlersQuiet && serverClosed,
    activeHandlers: httpWork.activeCount, serversClosed: serverClosed, capturedRows: requestRows.length }); }
  catch (error) { facts.artifactError ??= redactFailureText(error.message); }
  if (combinedLedger) {
    try { write('browser-ledger.json', { ...combinedLedger, appResponses: requestRows }); }
    catch (error) { facts.artifactError ??= redactFailureText(error.message); }
  }
  if (processesQuiet && serverClosed && handlersQuiet) {
    try {
      const outcome = await readSnapshotWithDeadline(rowsByTable, 15_000);
      if (outcome.status === 'deadline') {
        afterSnapshotDeadlineOutcome = outcome;
        snapshotQueryInFlight = !outcome.querySettled;
        throw Object.assign(new Error('Post-run owned PostgreSQL after-snapshot deadline exceeded'), { code: 'ERR_OWNED_WORK_DEADLINE' });
      }
      if (outcome.status === 'failed') throw outcome.error;
      const after = outcome.value;
      write('business-after.json', redactBusinessSnapshot(after));
      snapshotStatus.status = 'saved-after-quiescence';
      if (beforeFixtureSnapshot && fixture) {
        try {
          mutationScope = compareReceivingBrowserSnapshots(beforeFixtureSnapshot, after, fixture, requestRows);
          write('browser-mutation-scope.json', mutationScope);
          snapshotStatus.comparison = 'passed';
        } catch (error) {
          facts.snapshotError = redactFailureText(error.message);
          snapshotStatus.comparison = 'failed';
        }
      } else snapshotStatus.comparison = 'unavailable-no-browser-baseline';
    } catch (error) {
      facts.snapshotError = redactFailureText(error.message);
      snapshotStatus.reason = facts.snapshotError;
    }
  } else {
    snapshotStatus.reason = !processesQuiet ? 'Owned process tree was not proven quiescent'
      : !serverClosed ? 'Owned API server closure was not confirmed'
        : `Application handlers remain active: ${httpWork.activeCount}`;
  }
  try { write('browser-after-snapshot-status.json', snapshotStatus); }
  catch (error) { facts.artifactError = redactFailureText(error.message); }
  try { fs.rmSync(credentialFile, { force: true }); }
  catch (error) { facts.credentialError = redactFailureText(error.message); }
  const credentialsRemoved = !fs.existsSync(credentialFile);
  if (!credentialsRemoved && !facts.credentialError) facts.credentialError = 'Synthetic credential file remains present';
  let databaseDisconnected = false;
  if (snapshotQueryInFlight && !afterSnapshotDeadlineOutcome?.querySettled) facts.databaseError = 'After-snapshot query remains in flight; DB disconnect and owned drop are not claimed';
  else {
    snapshotQueryInFlight = false;
    try { await bounded(db.$disconnect(), 10_000, 'Database disconnect timed out'); databaseDisconnected = true; }
    catch (error) { facts.databaseError = redactFailureText(error.message); }
  }

  runProcessReceipt = browserProcessReceipt;
  const cleanup = {
    status: 'passed', primaryFailure: facts.primary,
    processes: { quiescent: processesQuiet, signalCount: (runProcessReceipt?.signalCount ?? 0) + (finalProcessReceipt?.signalCount ?? 0),
      browserRun: runProcessReceipt, final: finalProcessReceipt, error: facts.processCleanupError },
    http: { drainedBeforeSnapshot: httpDrainedBeforeSnapshot, drained: handlersQuiet, activeHandlers: httpWork.activeCount,
      drainError: facts.drainError, postCloseDrainError: facts.postCloseDrainError, responseRows: requestRows.length },
    server: { closed: serverClosed, closeResults: serverCloseResults, closeErrors: facts.serverCloseErrors },
    afterSnapshot: snapshotStatus, credentials: { removed: credentialsRemoved, error: facts.credentialError },
    database: { disconnected: databaseDisconnected, error: facts.databaseError },
  };
  const terminalErrors = [facts.primary?.message, facts.processCleanupError, facts.drainError, facts.postCloseDrainError,
    ...facts.serverCloseErrors, facts.snapshotError, facts.credentialError, facts.databaseError, facts.artifactError].filter(Boolean);
  if (terminalErrors.length || !processesQuiet || !handlersQuiet || !serverClosed || !snapshotStatus.status.startsWith('saved')) cleanup.status = 'failed';
  try { write('browser-cleanup.json', cleanup); }
  catch (error) { facts.artifactError ??= redactFailureText(error.message); cleanup.status = 'failed'; }
  try {
    assertAcceptanceAfterCleanup(terminalErrors.length ? new Error(terminalErrors.join('; ')) : null, cleanup);
    assert.ok(browserCases && combinedLedger && mutationScope, 'Complete browser, API and raw-row evidence is required');
    acceptedPayload = { head: env.RECEIVING_QA_HEAD, tree: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
      status: 'passed', cases: browserCases, mutationScope, syntheticOnly: true,
      verifiedScope: receivingBrowserScope.verified, notVerified: receivingBrowserScope.notVerified,
      cleanup: 'append-only draft rows retained until original owned DB drop' };
    write('browser-accepted.json', acceptedPayload);
  } catch (error) {
    facts.artifactError ??= redactFailureText(error.message);
    cleanup.status = 'failed';
    try { write('browser-failure.json', { ...facts, cleanup, snapshotStatus, requestRows: requestRows.length }); } catch {}
    process.exitCode = 1;
  }
  if (snapshotQueryInFlight) process.exit(1);
}
