import { test } from 'node:test';
import * as readerNative from './admin-readers-native.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runAdminReadersNative, assertReadersNativeAcceptance, createReaderBudget, assertReaderTableScroll, navigateReader, readerNavigationResponse } from './admin-readers-native.mjs';
import { readerEndpoints } from './admin-readers-oracle.mjs';
function oldFakeResult() { const flags = { actualEntry: true, authorizedData: true, stale500Retained: true, real403Hidden: true, failedRetryStillHidden: true, recovered: true, keyboardGeometry: true }; return { status: 'passed', responseTimeoutMs: 25000, tableScroll: ['analytics', 'margin', 'sales', 'supplier-ranking', 'suppliers'].map(subject => ({ subject, before: { focused: true, clientWidth: 200, scrollWidth: 640, scrollLeft: 0, pageX: 0, pageY: 20, viewport: 390, pageWidth: 390 }, after: { focused: true, clientWidth: 200, scrollWidth: 640, scrollLeft: 35, pageX: 0, pageY: 20, viewport: 390, pageWidth: 390 } })), budget: { elapsedMs: 1, deadlineMs: 300000, apiRequests: 1, analyticsRequests: 1 }, fixtureCleaned: true, databaseGrantLookup: true, lateScopeSuppressed: true, readOnlySnapshotEqual: true, rawSnapshotTables: 33, forbidden: [], beforeSha256: 'a'.repeat(64), afterSha256: 'a'.repeat(64), cases: [1366, 1024, 390].map(width => ({ width, contextId: [1366, 1024, 390].indexOf(width) + 2, readers: ['cashflow', 'margin', 'sales', 'analytics', 'suppliers'].map(id => { const subject = navigationSubjects.find(row => row.id === id); return { id, ...flags, navigation: { route: subject.route, heading: subject.heading, period: id === 'suppliers' ? null : '2026-01', response: { contextId: [1366, 1024, 390].indexOf(width) + 2, requestId: 1, path: '/api/v1/admin' + (id === 'analytics' ? '/analytics/product-abc' : id === 'suppliers' ? '/inventory/suppliers' : subject.route) + (id === 'suppliers' ? '' : '?period=2026-01'), actor: 'readerA', status: 200, sha256: 'c'.repeat(64) } } }; }) })), pgNegativeControls: { oldOrderItemRevenue: 17844, scopedRevenue: 67, oldSupplierDenominator: 17844, scopedSupplierDenominator: 62 }, httpStatuses: Object.fromEntries(readerEndpoints.map(endpoint => [endpoint, { readerA: 200, readerB: 200, readerEmpty: 200, unauthenticated: 401, denied: 403, inactive: 401, crossTenantHeader: 401 }])), initialErrorRecovered: ['cashflow', 'margin', 'sales', 'analytics', 'suppliers'], authorizedEmpty: ['cashflow', 'margin', 'sales', 'analytics', 'suppliers'] }; }
function fakeResult() {
    const result = oldFakeResult();
    result.coverage = 'one shared lifecycle; three independent five-reader cold entries';
    result.coldEntries = structuredClone(result.cases).map((row, i) => ({ ...row, contextId: i + 3, authenticated: true, authResponse: { contextId: i + 3, requestId: 1, path: '/api/v1/admin/auth/me', actor: 'readerA', status: 200, sha256: 'a'.repeat(64) },
        readers: row.readers.map(reader => ({ id: reader.id, navigation: { ...reader.navigation, response: { ...reader.navigation.response, contextId: i + 3 } } })) }));
    for (const row of result.cases) { row.contextId = 2; for (const reader of row.readers) {
        reader.navigation.response.contextId = 2;
        reader.states = Object.fromEntries(readerNative.readerStates.map((state, i) => [state, { width: row.width, verified: true, response: { ...reader.navigation.response, requestId: i + 1, actor: ['denied', 'failed-retry'].includes(state) ? 'denied' : 'readerA', status: state === 'denied' ? 403 : ['stale', 'failed-retry'].includes(state) ? 500 : 200 } }]));
    } }
    result.emptyCases = result.cases[0].readers.map(reader => ({ id: reader.id, contextId: 6, period: '2026-01', views: Object.fromEntries([['initial-error', 500], ['empty', 200]].map(([state, status]) => [state, [1366, 1024, 390].map(width => ({ width, verified: true, response: { ...reader.navigation.response, contextId: 6, actor: 'readerEmpty', status } }))])) }));
    return result;
}
test('acceptance contract requires every actual reader and all original boundaries', () => assert.doesNotThrow(() => assertReadersNativeAcceptance(fakeResult())));
for (const key of ['fixtureCleaned', 'databaseGrantLookup', 'readOnlySnapshotEqual', 'lateScopeSuppressed'])
    test(`cannot pass without ${key}`, () => { const r = fakeResult(); r[key] = false; assert.throws(() => assertReadersNativeAcceptance(r)); });
for (const key of ['actualEntry', 'authorizedData', 'stale500Retained', 'real403Hidden', 'failedRetryStillHidden', 'recovered', 'keyboardGeometry'])
    test(`cannot pass with one missing selected child ${key}`, () => { const r = fakeResult(); r.cases[2].readers[4][key] = false; assert.throws(() => assertReadersNativeAcceptance(r)); });
test('cross-tenant success, changed raw rows, missing page or absent native negative control fail closed', () => {
    for (const change of [r => r.httpStatuses[readerEndpoints[0]].crossTenantHeader = 200, r => r.afterSha256 = 'b'.repeat(64), r => r.cases.pop(), r => delete r.pgNegativeControls.oldSupplierDenominator, r => r.forbidden.push({ method: 'POST' }), r => r.cases[0].readers.pop()]) {
        const r = fakeResult();
        change(r);
        assert.throws(() => assertReadersNativeAcceptance(r));
    }
});
function fixtureDb({ collision = false, cleanupFailure = false } = {}) {
    const calls = [], store = new Map(), names = ['tenant', 'supplier', 'productCategory', 'product', 'customer', 'order', 'orderItem', 'productBatch', 'inventoryTransaction', 'expense', 'user', 'role', 'rolePermission', 'userRole', 'permission'];
    const db = Object.fromEntries(names.map(model => {
        store.set(model, []);
        const matches = (row, where) => Object.entries(where).every(([key, value]) => value && typeof value === 'object' && 'in' in value ? value.in.includes(row[key]) : row[key] === value);
        return [model, {
                count: async ({ where }) => { calls.push({ op: 'count', model }); return collision && model === 'product' ? 1 : store.get(model).filter(row => matches(row, where)).length; },
                createMany: async ({ data }) => { calls.push({ op: 'createMany', model }); if (model === 'inventoryTransaction')
                    throw Object.assign(new Error('DO_NOT_LEAK_TOKEN_OR_DB_CONFIG'), { name: 'PrismaClientKnownRequestError', code: 'P2004', meta: { secret: 'DO_NOT_LEAK' } }); store.get(model).push(...data); },
                deleteMany: async ({ where }) => { calls.push({ op: 'deleteMany', model }); if (cleanupFailure && model === 'product')
                    throw new Error('DO_NOT_LEAK_CLEANUP'); store.set(model, store.get(model).filter(row => !matches(row, where))); },
            }];
    }));
    return { db, calls, store };
}
for (const scenario of ['partial-seed', 'preexisting-id', 'cleanup-failure'])
    test(`actual runner ${scenario} remains failed with safe receipts and exact-owned cleanup`, async () => {
        const output = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-control-')), fixture = fixtureDb({ collision: scenario === 'preexisting-id', cleanupFailure: scenario === 'cleanup-failure' });
        try {
            await assert.rejects(runAdminReadersNative({ db: fixture.db, adminOrigin: 'http://127.0.0.1:12345', output, nonce: randomUUID(), signAccessToken: () => { throw Error('must not issue tokens after seed failure'); } }));
            const result = JSON.parse(fs.readFileSync(path.join(output, 'admin-readers-native.json'))), cleanup = JSON.parse(fs.readFileSync(path.join(output, 'admin-readers-cleanup.json')));
            assert.equal(result.status, 'failed');
            assert.equal(result.databaseGrantLookup, false);
            assert.equal(result.readOnlySnapshotEqual, false);
            assert.equal(result.cases.length, 0);
            assert.ok(!JSON.stringify(result).includes('DO_NOT_LEAK'));
            if (scenario === 'preexisting-id') {
                assert.equal(cleanup.status, 'not-required');
                assert.equal(fixture.calls.some(call => ['createMany', 'deleteMany'].includes(call.op)), false);
            }
            else if (scenario === 'partial-seed') {
                assert.equal(cleanup.status, 'passed');
                assert.equal(result.fixtureCleaned, true);
                assert.deepEqual(result.failureDetail, { kind: 'PrismaClientKnownRequestError', code: 'P2004' });
                assert.ok([...fixture.store.values()].every(rows => rows.length === 0));
            }
            else {
                assert.equal(cleanup.status, 'failed');
                assert.equal(result.fixtureCleaned, false);
            }
        }
        finally {
            fs.rmSync(output, { recursive: true, force: true });
        }
    });
test('whole-flow deadline and request ceilings reject extra work without renewing the clock', () => {
    let now = 0;
    const budget = createReaderBudget(() => now);
    now = 299999;
    budget.check();
    now = 300000;
    assert.throws(() => budget.check());
    const api = createReaderBudget(() => 0);
    for (let i = 0; i < 320; i++)
        api.request('/reports/margin');
    assert.throws(() => api.request('/reports/margin'));
    const analytics = createReaderBudget(() => 0);
    for (let i = 0; i < 120; i++)
        analytics.request('/analytics/product-abc');
    assert.throws(() => analytics.request('/analytics/product-abc'));
});

test('table keyboard receipt rejects no movement, lost focus, whole-page scroll and overflow', () => {
    const good = fakeResult().tableScroll[0]; assert.doesNotThrow(() => assertReaderTableScroll(good.before, good.after));
    for (const delta of [{ scrollLeft: 0 }, { focused: false }, { pageX: 2 }, { pageY: 30 }, { pageWidth: 659 }, { scrollLeft: 500 }, { clientWidth: 0 }])
        assert.throws(() => assertReaderTableScroll(good.before, { ...good.after, ...delta }));
});
test('missing or duplicate reader table acceptance cannot pass', () => {
    for (const change of [result => result.tableScroll.pop(), result => result.tableScroll[0].subject = 'margin', result => result.tableScroll[0].after.scrollLeft = 0]) {
        const result = fakeResult(); change(result); assert.throws(() => assertReadersNativeAcceptance(result));
    }
});

// Deterministic Playwright adapter: URL changes before React replaces the old page.
// These controls are driver tests, not native browser evidence.
function navigationAdapter(subject, { lateRoute = false, lateHeading = false, ignoresFill = false, noLink = false } = {}) {
    const state = { route: '/reports/cashflow', mounted: 'Cash Flow Statement（估算）', oldMonth: '2026-01', targetMonth: '2026-10', fills: [], events: [] };
    const link = { kind: 'link', count: async () => noLink ? 0 : 1, click: async () => { state.events.push('click'); } };
    const month = scoped => ({ kind: 'month', scoped, fill: async value => { state.fills.push({ scoped, mounted: state.mounted, value }); if (!ignoresFill) { if (scoped) state.targetMonth = value; else state.oldMonth = value; } } });
    const root = { kind: 'root', heading: null, locator: selector => { assert.equal(selector, 'input[type="month"]'); return month(true); }, filter: ({ has }) => { root.heading = has.name; return root; } };
    const page = { kind: 'page', goto: async () => { state.events.push('goto'); }, locator: selector => selector.startsWith('a[') ? link : selector === '.admin-reader-page' ? root : month(false), getByRole: (role, options) => { assert.equal(role, 'heading'); assert.equal(options.level, 1); assert.equal(options.exact, true); return { kind: 'heading', name: options.name }; } };
    const expect = value => ({
        toHaveURL: async url => { assert.equal(value, page); assert.equal(url, 'http://127.0.0.1:12345' + subject.route); if (lateRoute) throw Error('route wait expired'); state.route = subject.route; state.events.push('url'); },
        toBeVisible: async () => { if (value.kind === 'root') { assert.equal(state.route, subject.route); assert.equal(value.heading, subject.heading); if (lateHeading) throw Error('heading wait expired'); state.mounted = subject.heading; state.events.push('heading'); } },
        toHaveValue: async expected => { assert.equal(value.kind, 'month'); assert.equal(state.targetMonth, expected); state.events.push('value'); },
    });
    return { page, expect, state };
}
const navigationSubjects = [
    { id: 'cashflow', route: '/reports/cashflow', heading: 'Cash Flow Statement（估算）' },
    { id: 'margin', route: '/reports/margin', heading: 'Gross Margin Analysis（目前成本估算）' },
    { id: 'sales', route: '/reports/sales-ranking', heading: 'Product Sales Ranking' },
    { id: 'analytics', route: '/inventory/analytics', heading: 'Inventory Analytics' },
    { id: 'suppliers', route: '/suppliers', heading: 'Suppliers Management' },
];
for (const subject of navigationSubjects) test(`navigation ${subject.id} waits for its own route and mounted heading before filling its own month`, async () => {
    const adapter = navigationAdapter(subject); const receipt = await navigateReader({ ...adapter, subject, adminOrigin: 'http://127.0.0.1:12345' });
    assert.equal(adapter.state.route, subject.route); assert.equal(adapter.state.mounted, subject.heading);
    assert.equal(adapter.state.oldMonth, '2026-01');
    if (subject.id !== 'suppliers') { assert.equal(adapter.state.targetMonth, '2026-01'); assert.deepEqual(adapter.state.fills, [{ scoped: true, mounted: subject.heading, value: '2026-01' }]); }
    else assert.equal(adapter.state.fills.length, 0);
    assert.deepEqual(receipt, { route: subject.route, heading: subject.heading, period: subject.id === 'suppliers' ? null : '2026-01' });
});
for (const scenario of ['lateRoute', 'lateHeading', 'ignoresFill']) test(`navigation ${scenario} fails closed instead of accepting the still-mounted old page`, async () => {
    const subject = navigationSubjects[1], adapter = navigationAdapter(subject, { [scenario]: true });
    await assert.rejects(navigateReader({ ...adapter, subject, adminOrigin: 'http://127.0.0.1:12345' }));
    if (scenario !== 'ignoresFill') assert.equal(adapter.state.fills.length, 0);
});
test('direct navigation and intermediate refresh navigation use the same route/root guard', async () => {
    const subject = navigationSubjects[0], adapter = navigationAdapter(subject, { noLink: true });
    const receipt = await navigateReader({ ...adapter, subject, adminOrigin: 'http://127.0.0.1:12345', period: null });
    assert.deepEqual(adapter.state.events, ['goto', 'url', 'heading']); assert.equal(adapter.state.fills.length, 0); assert.equal(receipt.period, null);
});


test('navigation proof ignores delayed old-month, old-context, wrong-route and non-authorized responses', () => {
    const subject = { ...navigationSubjects[1], paths: ['/reports/margin', '/reports/margin/trend'] };
    const good = { contextId: 2, requestId: 7, actor: 'readerA', status: 200, path: '/api/v1/admin/reports/margin?period=2026-01', sha256: 'a'.repeat(64) };
    assert.equal(readerNavigationResponse([good], { contextId: 2, subject }), good);
    for (const delta of [{ contextId: 1 }, { actor: 'readerB' }, { status: 403 }, { requestId: undefined }, { cancelledBody: true }, { sha256: 'bad' }, { path: '/api/v1/admin/reports/margin?period=2026-10' }, { path: '/api/v1/admin/reports/margin/trend?to=2026-01' }, { path: '/api/v1/admin/reports/cashflow?period=2026-01' }]) {
        const stale = { ...good, ...delta };
        assert.equal(readerNavigationResponse([stale], { contextId: 2, subject }), undefined);
        assert.equal(readerNavigationResponse([good, stale], { contextId: 2, subject }), good);
    }
});
test('acceptance rejects missing navigation, wrong target month and replay from another context', () => {
    for (const change of [reader => delete reader.navigation, reader => reader.navigation.period = '2026-10', reader => reader.navigation.heading = 'Cash Flow Statement（估算）', reader => reader.navigation.response.contextId = 1, reader => reader.navigation.response.path = '/api/v1/admin/reports/margin?period=2026-10']) {
        const result = fakeResult(); change(result.cases[0].readers[1]); assert.throws(() => assertReadersNativeAcceptance(result));
    }
});


test('initial unavailable entry waits for its own named alert root without filling a hidden month', async () => {
    const subject = { ...navigationSubjects[1], label: '毛利報表' }, adapter = navigationAdapter(subject, { noLink: true });
    adapter.page.getByRole = (role, options) => { assert.equal(role, 'alert'); assert.equal(options.name, '毛利報表讀取狀態'); assert.equal(options.exact, true); return { name: subject.heading }; };
    const receipt = await navigateReader({ ...adapter, subject, adminOrigin: 'http://127.0.0.1:12345', unavailable: true });
    assert.deepEqual(adapter.state.events, ['goto', 'url', 'heading']); assert.equal(adapter.state.fills.length, 0); assert.equal(receipt.period, null); assert.equal(receipt.heading, null);
});

// Execute the actual dispatch/response callbacks, not a reimplementation of their actor assignment.
function actorCallbacks({ pace = async () => ({ admitted: true, at: 0 }) } = {}) {
    const source = fs.readFileSync(new URL('./admin-readers-native.mjs', import.meta.url), 'utf8');
    const routeMarker = "await context.route('**/*', async (route) => {";
    const routeStart = source.indexOf(routeMarker) + routeMarker.length;
    const routeEnd = source.indexOf('\n        });\n        const page = await context.newPage();', routeStart);
    const responseMarker = "page.on('response', response => {";
    const responseStart = source.indexOf(responseMarker) + responseMarker.length;
    const responseEnd = source.indexOf('\n        });\n        return { context, page, control, contextId };', responseStart);
    assert.ok(routeStart >= routeMarker.length && routeEnd > routeStart && responseStart >= responseMarker.length && responseEnd > responseStart);
    const tokens = { readerA: 'SYNTHETIC_READER_A_ONLY', denied: 'SYNTHETIC_DENIED_ONLY', readerB: 'SYNTHETIC_READER_B_ONLY' };
    const control = { actor: 'readerA', mode: 'normal', paths: [] }, network = [], responses = [], pending = [], dispatched = new WeakMap(), transport = { continued: 0, aborted: 0 };
    const budgetCalls = [];
    const dispatch = new Function('contextId', 'control', 'network', 'dispatched', 'forbidden', 'adminOrigin', 'budget', 'pace', 'tokens', 'readerRequestActor', `let nextRequestId=0; const viewport={width:1366}; return async route => {${source.slice(routeStart, routeEnd)}\n}`)(2, control, network, dispatched, [], 'http://127.0.0.1:12345', { request(endpoint) { budgetCalls.push(endpoint); } }, pace, tokens, readerNative.readerRequestActor);
    const receive = new Function('contextId', 'control', 'dispatched', 'responses', 'pending', 'adminOrigin', 'readerEndpoints', 'expected', 'assertReaderResponse', 'hash', 'readerPeriod', `const viewport={width:1366}; return response => {${source.slice(responseStart, responseEnd)}\n}`)(2, control, dispatched, responses, pending, 'http://127.0.0.1:12345', ['/reports/margin'], { readerA: { actor: 'readerA' }, readerB: { actor: 'readerB' } }, (_endpoint, _data, expected) => assert.equal(expected.actor, 'readerA'), () => 'a'.repeat(64), '2026-01');
    async function request(authorization, { endpoint = '/reports/margin', failed = null, detached = false } = {}) {
        const req = { url: () => 'http://127.0.0.1:12345/api/v1/admin' + endpoint + '?period=2026-01', method: () => 'GET', headers: () => authorization === undefined ? {} : { authorization }, failure: () => failed, frame: () => ({ isDetached: () => detached }) };
        await dispatch({ request: () => req, continue: async () => { transport.continued++; }, abort: async () => { transport.aborted++; } }); return req;
    }
    return { control, tokens, network, responses, pending, dispatched, receive, request, transport, budgetCalls };
}
test('actual dispatch records denied, recovered, other-actor, missing and unknown credentials without trusting control.actor', async () => {
    const c = actorCallbacks();
    for (const [header, expectedActor] of [[`Bearer ${c.tokens.denied}`, 'denied'], [`Bearer ${c.tokens.readerA}`, 'readerA'], [`Bearer ${c.tokens.readerB}`, 'readerB'], [undefined, 'unauthenticated'], ['Bearer UNRECOGNIZED_SYNTHETIC_ONLY', 'unrecognized']]) {
        c.control.actor = expectedActor === 'readerA' ? 'denied' : 'readerA';
        const request = await c.request(header); assert.equal(c.dispatched.get(request).actor, expectedActor);
    }
    assert.ok(!JSON.stringify(c.network).includes('SYNTHETIC_')); assert.ok(!JSON.stringify(c.network).includes('authorization'));
});
test('actual late response keeps its dispatch actor across credential recovery without emitting tokens', async () => {
    const c = actorCallbacks(), deniedRequest = await c.request(`Bearer ${c.tokens.denied}`);
    let release; const lateBody = new Promise(resolve => { release = resolve; });
    c.receive({ url: deniedRequest.url, request: () => deniedRequest, status: () => 403, body: () => lateBody });
    c.control.actor = 'readerA'; const recovered = await c.request(`Bearer ${c.tokens.readerA}`);
    c.receive({ url: recovered.url, request: () => recovered, status: () => 200, body: async () => Buffer.from('{"success":true,"data":{}}') });
    release(Buffer.from('{"success":false}')); assert.ok((await Promise.all(c.pending)).every(Boolean));
    const denied = c.responses.find(row => row.status === 403), good = c.responses.find(row => row.status === 200);
    assert.equal(denied.actor, 'denied'); assert.equal(good.actor, 'readerA'); assert.notEqual(denied.requestId, good.requestId);
    assert.ok(!JSON.stringify(c.responses).includes('SYNTHETIC_')); assert.ok(!JSON.stringify(c.responses).includes('authorization'));
});


test('cancelled analytics requests do not consume future pacing slots; live requests remain spaced', async () => {
    let now = 0; const waits = [], pace = readerNative.createReaderPacer({ check() {}, now: () => now, wait: async ms => { waits.push(ms); now += ms; } });
    const first = await pace(() => false), cancelled = await pace(() => true), next = await pace(() => false);
    assert.deepEqual(first, { admitted: true, at: 0 }); assert.deepEqual(cancelled, { admitted: false, at: 0 }); assert.deepEqual(next, { admitted: true, at: 2150 }); assert.deepEqual(waits, [0, 2150]);
});
test('cancellation during a queue wait does not reserve another slot and deadlines still reject', async () => {
    let now = 0, cancelled = false, checks = 0;
    const pace = readerNative.createReaderPacer({ check() { checks++; }, now: () => now, wait: async ms => { now += ms; if (ms) cancelled = true; } });
    await pace(() => false); assert.deepEqual(await pace(() => cancelled), { admitted: false, at: 2150 });
    assert.deepEqual(await pace(() => false), { admitted: true, at: 2150 }); assert.ok(checks >= 5);
    await assert.rejects(readerNative.createReaderPacer({ check() { throw Error('bounded deadline'); } })(() => true));
});
test('data outcome waits require a newer matching actor/month/status and keep explicit 25-second bound', async () => {
    const scope = { contextId: 2, endpoint: '/analytics/product-abc', period: '2026-01', actor: 'denied', status: 403, afterRequestId: 10 };
    const old = { contextId: 2, requestId: 9, path: '/api/v1/admin/analytics/product-abc?period=2026-01', actor: 'denied', status: 403, sha256: 'a'.repeat(64) };
    const current = { ...old, requestId: 11 };
    for (const delta of [{}, { requestId: 11, actor: 'readerA' }, { requestId: 11, path: '/api/v1/admin/analytics/product-abc?period=2026-10' }, { requestId: 11, status: 500 }, { requestId: 11, contextId: 1 }])
        assert.equal(readerNative.readerOutcomeResponse([{ ...old, ...delta }], scope), undefined);
    let options;
    const expect = { poll(fn, supplied) { options = supplied; return { async toBe(expected) { assert.equal(fn(), expected); } }; } };
    assert.equal(await readerNative.waitForReaderOutcome({ expect, responses: [old, current], ...scope }), current); assert.deepEqual(options, { timeout: 25000 });
    await assert.rejects(readerNative.waitForReaderOutcome({ expect, responses: [old], ...scope }));
});


test('actual analytics callback aborts a cancelled queue entry before any HTTP dispatch', async () => {
    const c = actorCallbacks({ pace: async cancelled => { assert.equal(cancelled(), true); return { admitted: false, at: 2150 }; } });
    const request = await c.request(`Bearer ${c.tokens.readerA}`, { endpoint: '/analytics/product-abc', failed: 'net::ERR_ABORTED' });
    assert.deepEqual(c.transport, { continued: 0, aborted: 1 }); assert.equal(c.dispatched.get(request).cancelledBeforeDispatch, true); assert.equal(c.dispatched.get(request).analyticsCancelledAt, 2150);
    assert.equal(c.dispatched.get(request).analyticsAdmittedAt, undefined); assert.deepEqual(c.budgetCalls, ['/analytics/product-abc']);
});

test('shared lifecycle requires every state at all three widths plus independent cold auth/entries', () => {
    for (const change of [r => delete r.cases[1].readers[2].states.stale, r => r.cases[2].readers[0].states.denied.verified = false,
        r => r.cases[1].readers[4].states.recovered.width = 1366, r => r.coldEntries.pop(),
        r => r.coldEntries[1].contextId = r.coldEntries[0].contextId, r => r.coldEntries[0].contextId = 2,
        r => r.coldEntries[0].authenticated = false, r => r.emptyCases[2].views.empty.pop(), r => r.emptyCases[0].views['initial-error'][0].response.actor = 'readerA', r => r.coldEntries[0].authResponse.contextId = 2, r => r.cases[1].readers[0].states.denied.response.actor = 'readerA', r => r.cases[0].readers[0].states.stale.response.requestId = 1, r => r.coldEntries[2].readers.pop(),
        r => r.coldEntries[0].readers[1].navigation.response.actor = 'denied',
        r => r.coldEntries[0].readers[1].navigation.response.contextId = 2]) {
        const result = fakeResult(); change(result); assert.throws(() => assertReadersNativeAcceptance(result));
    }
});
test('shared viewport traversal really resizes before each state assertion and stops on a bad size or state', async () => {
    let current; const calls = [];
    const page = { setViewportSize: async view => { calls.push(['resize', view.width]); current = view; }, viewportSize: () => current };
    await readerNative.visitReaderViewports(page, async view => { assert.deepEqual(current, view); calls.push(['verify', view.width]); });
    assert.deepEqual(calls, [1366, 1024, 390].flatMap(width => [['resize', width], ['verify', width]]));
    await assert.rejects(readerNative.visitReaderViewports({ ...page, viewportSize: () => ({ width: 1, height: 1 }) }, () => assert.fail('wrong size must not verify')));
    calls.length = 0;
    await assert.rejects(readerNative.visitReaderViewports(page, async view => { if (view.width === 1024) throw Error('state not visible'); }));
    assert.deepEqual(calls, [['resize', 1366], ['resize', 1024]]);
});

for (const captureFails of [false, true]) test(`failure diagnostic preserves original error and actual viewport even when capture fails: ${captureFails}`, async () => {
    const original = new Error('original bounded failure'), calls = [];
    await assert.rejects(readerNative.preserveReaderFailure({ viewportSize: () => ({ width: 390, height: 844 }) }, async (_page, name, viewport) => {
        calls.push({ name, viewport }); if (captureFails) throw Error('capture unavailable');
    }, 'reader-failed', original), error => error === original);
    assert.deepEqual(calls, [{ name: 'reader-failed-390.png', viewport: { width: 390, height: 844 } }]);
});

test('reader geometry preserves the entire outline at all four viewport edges', () => {
    const good = { x: 300, y: 6, width: 84, height: 44, region: { x: 260, right: 1366 }, viewportHeight: 900, outline: '3px', outlineOffset: '3px' };
    assert.doesNotThrow(() => readerNative.assertReaderFocusClearance(good));
    for (const change of [{ y: -0.21875 }, { y: 4 }, { y: 852 }, { x: 264 }, { x: 1278 }, { outlineOffset: undefined }])
        assert.throws(() => readerNative.assertReaderFocusClearance({ ...good, ...change }));
});
