import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { allowedPaths, assertBrowserLedger, assertReceivingBrowserEnvironment, ownedDatabaseUrl, receivingRequestAllowed } from './fixture.mjs';
import { assertAcceptanceAfterCleanup, assertPlaywrightReceivingReport, expectedReceivingCases } from './acceptance.mjs';
import { loginToReceiving } from './login-navigation.ts';

// Page-protocol controls only: these do not establish native browser/API/PG acceptance.
function loginPage({ authenticated = false, delayed = false, rejectLogin = false } = {}) {
  const state = { path: '', phase: '', fields: {}, calls: [] };
  const ready = () => { state.phase = authenticated ? 'receiving' : 'login'; state.path = `/${state.phase}`; };
  const locator = name => ({
    async isVisible() { return name === '#login-email' && state.phase === 'login'; },
    async fill(value) { assert.equal(state.phase, 'login'); state.fields[name] = value; },
    async click() {
      state.calls.push(name);
      if (name === '#login-submit') {
        assert.equal(state.phase, 'login');
        state.phase = rejectLogin ? 'login' : 'dashboard'; state.path = `/${state.phase}`;
      } else {
        assert.equal(name, 'link:人工收貨草稿'); assert.equal(state.phase, 'dashboard');
        state.phase = 'receiving'; state.path = '/receiving';
      }
    },
    or(other) {
      assert.equal(name, '#login-email'); assert.equal(other.name, 'button:新增私人草稿');
      return { async waitFor(options) { assert.deepEqual(options, { state: 'visible', timeout: 10_000 }); ready(); } };
    },
    name,
  });
  const page = {
    async goto(url) { assert.equal(url, 'http://127.0.0.1:4287/receiving'); state.calls.push('goto'); if (!delayed) ready(); },
    locator,
    getByRole(role, options) { assert.equal(options.exact, true); return locator(`${role}:${options.name}`); },
    async waitForURL(url, options) {
      assert.deepEqual(options, { timeout: 10_000 }); state.calls.push(`wait:${new URL(url).pathname}`);
      assert.equal(state.path, new URL(url).pathname, 'must observe successful navigation, not assume login success');
    },
  };
  return { page, state };
}

test('receiving login follows the actual dashboard redirect through the existing named link', async () => {
  const { page, state } = loginPage();
  await loginToReceiving(page, 'http://127.0.0.1:4287', { email: 'synthetic@example.invalid', password: 'synthetic-test-password' });
  assert.equal(state.path, '/receiving');
  assert.deepEqual(state.fields, { '#login-email': 'synthetic@example.invalid', '#login-password': 'synthetic-test-password' });
  assert.deepEqual(state.calls, ['goto', '#login-submit', 'wait:/dashboard', 'link:人工收貨草稿', 'wait:/receiving']);
});

test('receiving login waits for a delayed cold login form instead of skipping credentials', async () => {
  const { page, state } = loginPage({ delayed: true });
  await loginToReceiving(page, 'http://127.0.0.1:4287', { email: 'second@example.invalid', password: 'second-test-password' });
  assert.equal(state.path, '/receiving');
  assert.equal(state.fields['#login-email'], 'second@example.invalid');
  assert.equal(state.calls.filter(value => value === '#login-submit').length, 1);
});

for (const delayed of [false, true]) test(`receiving entry preserves an authenticated session (delayed hydration: ${delayed})`, async () => {
  const { page, state } = loginPage({ authenticated: true, delayed });
  await loginToReceiving(page, 'http://127.0.0.1:4287', { email: 'unused@example.invalid', password: 'unused-test-password' });
  assert.equal(state.path, '/receiving');
  assert.deepEqual(state.fields, {});
  assert.deepEqual(state.calls, ['goto', 'wait:/receiving']);
});

test('failed login cannot navigate around authentication or retry submission', async () => {
  const { page, state } = loginPage({ rejectLogin: true });
  await assert.rejects(loginToReceiving(page, 'http://127.0.0.1:4287', { email: 'synthetic@example.invalid', password: 'bad-test-password' }), /must observe successful navigation/);
  assert.equal(state.path, '/login');
  assert.deepEqual(state.calls, ['goto', '#login-submit', 'wait:/dashboard']);
});

test('network guard allows only real auth, product reads and bounded draft lifecycle routes', () => {
  assert.equal(receivingRequestAllowed('POST', 'http://127.0.0.1:4287/api/v1/admin/auth/login'), true);
  assert.equal(receivingRequestAllowed('GET', 'http://127.0.0.1:4287/api/v1/admin/receiving-drafts'), true);
  assert.equal(receivingRequestAllowed('PUT', 'http://127.0.0.1:4287/api/v1/admin/receiving-drafts/11111111-1111-4111-8111-111111111111'), true);
  for (const [method, url] of [
    ['POST', `${'http://127.0.0.1:4287'}/api/v1/admin/auth/refresh`],
    ['DELETE', 'http://127.0.0.1:4287/api/v1/admin/receiving-drafts/11111111-1111-4111-8111-111111111111'],
    ['PUT', 'http://127.0.0.1:4287/api/v1/admin/receiving-drafts/11111111-1111-4111-8111-111111111111?unsafe=1'],
    ['POST', 'http://127.0.0.1:4287/api/v1/admin/orders'],
    ['GET', 'http://example.com/api/v1/admin/receiving-drafts'],
  ]) assert.equal(receivingRequestAllowed(method, url), false, `${method} ${url}`);
  assert.ok(allowedPaths.has('/inventory/products'));
});

test('runner fails closed without actual hosted provenance and exact owned database', () => {
  const env = { DATABASE_URL: ownedDatabaseUrl,
    RECEIVING_DRAFT_DATABASE_URL: ownedDatabaseUrl, RECEIVING_QA_HEAD: 'a'.repeat(40),
    RECEIVING_QA_CONTAINER: 'b'.repeat(64), RECEIVING_QA_NETWORK: `github_network_${'c'.repeat(16)}`,
    GITHUB_RUN_ID: '10', GITHUB_RUN_ATTEMPT: '2' };
  assert.throws(() => assertReceivingBrowserEnvironment(env, 'v22.12.0'));
  for (const mutate of [e => e.GITHUB_ACTIONS = 'false', e => e.RUNNER_ENVIRONMENT = 'self-hosted', e => e.DATABASE_URL = 'postgresql://test@127.0.0.1:5432/production']) {
    const changed = { ...env }; mutate(changed); assert.throws(() => assertReceivingBrowserEnvironment(changed, 'v22.12.0'));
  }
  assert.throws(() => assertReceivingBrowserEnvironment(env, 'v20.0.0'));
});

test('actual Playwright report and per-case ledgers require exactly seven passed viewport cases', () => {
  const ids = expectedReceivingCases.map((_, index) => `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`);
  const ledgers = expectedReceivingCases.map(({ viewport, title }, index) => {
    const url = `http://127.0.0.1:4287/api/v1/admin/receiving-drafts/${ids[index]}`;
    const requests = title === expectedReceivingCases[0].title ? [{ method: 'PUT', url, status: 200 }]
      : title === expectedReceivingCases[1].title ? [{ method: 'PUT', url }, { method: 'GET', url, status: 200 }]
        : title === expectedReceivingCases[2].title ? [{ method: 'PUT', url, status: 200 }, { method: 'PUT', url, status: 200 }, { method: 'PUT', url, status: 409 }]
          : [];
    return { viewport, title, retry: 0, requests, saveCalls: requests.filter(row => row.method === 'PUT').length };
  });
  const appResponses = ledgers.flatMap(ledger => ledger.requests.filter(row => row.method === 'PUT').map(row => ({ ...row,
    endpoint: new URL(row.url).pathname.replace('/api/v1/admin', ''), dispatchComplete: true,
    applicationComplete: true, pendingHandlers: 0, handlerFailures: [] })));
  const report = { stats: { expected: 7, unexpected: 0, skipped: 0, flaky: 0 }, suites: [
    ...[1440, 390].map(viewport => ({ title: `receiving real API ${viewport}`, specs: expectedReceivingCases.filter(row => row.viewport === viewport && row.title !== expectedReceivingCases[6].title).map(row => ({
      title: row.title, tests: [{ expectedStatus: 'passed', results: [{ status: 'passed', retry: 0, duration: 25, errors: [] }] }],
    })) })),
    { title: 'receiving.spec.ts', specs: [{ title: expectedReceivingCases[6].title,
      tests: [{ expectedStatus: 'passed', results: [{ status: 'passed', retry: 0, duration: 30, errors: [] }] }] }] },
  ] };
  assert.equal(assertPlaywrightReceivingReport(report, ledgers, appResponses).length, 7);
  const missingHandlerState = structuredClone(appResponses); delete missingHandlerState[0].applicationComplete;
  assert.throws(() => assertPlaywrightReceivingReport(report, ledgers, missingHandlerState), /handler Promise must settle/);
  const unfinishedDispatch = structuredClone(appResponses); unfinishedDispatch[0].dispatchComplete = false;
  assert.throws(() => assertPlaywrightReceivingReport(report, ledgers, unfinishedDispatch), /dispatch must reach a terminal handler/);
  const unfinishedHandler = structuredClone(appResponses); unfinishedHandler[0].applicationComplete = false;
  assert.throws(() => assertPlaywrightReceivingReport(report, ledgers, unfinishedHandler), /handler Promise must settle/);
  const pendingHandler = structuredClone(appResponses); pendingHandler[0].pendingHandlers = 1;
  assert.throws(() => assertPlaywrightReceivingReport(report, ledgers, pendingHandler), /No Express route or middleware Promise may remain active/);
  const rejectedHandler = structuredClone(appResponses); rejectedHandler[0].handlerFailures = [{ name: 'synthetic', errorName: 'Error' }];
  assert.throws(() => assertPlaywrightReceivingReport(report, ledgers, rejectedHandler), /handler Promise may throw or reject/);
  const missing = structuredClone(report); missing.suites[0].specs.pop(); assert.throws(() => assertPlaywrightReceivingReport(missing, ledgers, appResponses));
  const failed = structuredClone(report); failed.suites[0].specs[0].tests[0].results[0].status = 'failed'; assert.throws(() => assertPlaywrightReceivingReport(failed, ledgers, appResponses));
  const retried = structuredClone(report); retried.suites[0].specs[0].tests[0].results.push({ status: 'passed', retry: 1, duration: 25, errors: [] }); assert.throws(() => assertPlaywrightReceivingReport(retried, ledgers, appResponses));
  const duplicate = structuredClone(ledgers); duplicate[6] = structuredClone(duplicate[5]); assert.throws(() => assertPlaywrightReceivingReport(report, duplicate, appResponses));
});

test('acceptance cannot be emitted after failed primary work or incomplete teardown', () => {
  const clean = { status: 'passed', processes: { quiescent: true, signalCount: 0 }, http: { drained: true },
    server: { closed: true }, database: { disconnected: true }, credentials: { removed: true } };
  assert.equal(assertAcceptanceAfterCleanup(null, clean), true);
  for (const [key, value] of [['processes', { quiescent: false, signalCount: 1 }], ['http', { drained: false }],
    ['server', { closed: false }], ['database', { disconnected: false }], ['credentials', { removed: false }]]) {
    assert.throws(() => assertAcceptanceAfterCleanup(null, { ...clean, [key]: value }));
  }
  assert.throws(() => assertAcceptanceAfterCleanup(new Error('primary'), clean));
});

test('ledger rejects fixture JWTs, synthetic HTTP and any forbidden financial write', () => {
  const base = { realLogin: true, syntheticHttp: false, fixtureJwt: false, unexpected: [], forbidden: [], requests: [
    { allowed: true, api: true, method: 'POST', url: 'http://127.0.0.1:4287/api/v1/admin/auth/login', status: 200 },
    { allowed: true, api: true, method: 'PUT', url: 'http://127.0.0.1:4287/api/v1/admin/receiving-drafts/11111111-1111-4111-8111-111111111111', status: 200 },
    { allowed: true, api: true, method: 'GET', url: 'http://127.0.0.1:4287/api/v1/admin/receiving-drafts/11111111-1111-4111-8111-111111111111', status: 200 },
  ], stockWrites: 0, orderWrites: 0, paymentWrites: 0, postingWrites: 0, viewports: [1440, 390], saveCalls: 1 };
  assert.doesNotThrow(() => assertBrowserLedger(base));
  for (const mutate of [x => x.syntheticHttp = true, x => x.fixtureJwt = true, x => x.paymentWrites = 1, x => x.forbidden.push({})]) {
    const changed = structuredClone(base); mutate(changed); assert.throws(() => assertBrowserLedger(changed));
  }
});

test('native source keeps official Chrome sandbox, exact app host and append-only owned worker prerequisites', () => {
  const config = fs.readFileSync(new URL('./playwright.config.mts', import.meta.url), 'utf8');
  const spec = fs.readFileSync(new URL('./receiving.spec.ts', import.meta.url), 'utf8');
  const fixtures = fs.readFileSync(new URL('./fixtures.ts', import.meta.url), 'utf8');
  const runner = fs.readFileSync(new URL('../../../backend/scripts/receiving-drafts-browser-native.mjs', import.meta.url), 'utf8');
  const shutdown = fs.readFileSync(new URL('./server-shutdown.mjs', import.meta.url), 'utf8');
  const work = fs.readFileSync(new URL('./http-work.mjs', import.meta.url), 'utf8');
  assert.match(config, /channel:\s*'chrome'/);
  assert.match(config, /chromiumSandbox:\s*true/);
  assert.doesNotMatch(config + runner, /--no-sandbox/);
  assert.match(runner, /ownership\.json/);
  assert.match(runner, /tests\.json/);
  assert.match(runner, /HostPort: '55438'/);
  assert.match(runner, /append-only draft rows retained until original owned DB drop/);
  assert.match(runner, /runOwnedBrowser\(/);
  assert.match(runner, /compareReceivingBrowserSnapshots\(/);
  assert.match(runner, /business-before\.json/);
  assert.ok(runner.indexOf("write('browser-cleanup.json'") < runner.indexOf("write('browser-accepted.json'"));
  assert.doesNotMatch(runner, /spawnSync|browserEvidence|duration:\s*1/);
  assert.match(runner, /cleanupRunProcesses\(runScope\)/);
  assert.match(runner, /drainAndCloseServers\(/);
  assert.match(runner, /browser-api-responses\.json/);
  assert.match(runner, /business-baseline-before\.json/);
  assert.match(runner, /browser-after-snapshot-status\.json/);
  assert.match(shutdown, /finally/);
  assert.match(work, /!applicationComplete && dispatchComplete && pendingHandlers === 0/);
  assert.match(work, /dispatchComplete && pendingHandlers === 0/);
  assert.match(work, /!settled && applicationComplete && transportComplete/);
  assert.match(work, /!nextCalled && Boolean\(response\?\.writableEnded \|\| response\?\.destroyed\)/);
  assert.match(work, /handler\.length === 4/);
  assert.doesNotMatch(work, /res\.(?:json|send|end)\s*=/, 'Response methods cannot stand in for Express handler completion');
  assert.match(spec, /for\s*\(let i = 0; i < 10; i\+\+\)/, 'Exact #160 empty-draft snapshot needs ten added lines');
  assert.match(fixtures, /headingText\s*=\s*'人工收貨草稿'/, 'Font proof must use the stable receiving heading');
  assert.match(fixtures, /readInstalledFontSources\(fonts, targetText\)/, 'Actual installed font source and complete heading glyph coverage are required');
  assert.doesNotMatch(fixtures, /fontProof\(page,\s*'body'\)|Noto Sans CJK|body\.innerText\(\)/, 'Do not gate by Noto family or pass all body text as one heading');
  assert.match(runner, /browser-native/);
  assert.doesNotMatch(runner, /RECEIVING_DRAFT_OWNED\s*=\s*['"]true/);
});
