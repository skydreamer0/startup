import { test } from 'node:test';
import * as readerNative from './admin-readers-native.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { settleTraceFocusGeometry, safeTraceFailure } from './admin-trace-native.mjs';
import { runAdminReadersNative, assertReadersNativeAcceptance, createReaderBudget, assertReaderTableScroll, navigateReader, readerNavigationResponse } from './admin-readers-native.mjs';
import { readerEndpoints } from './admin-readers-oracle.mjs';

test('reader browser failure names are fixed and never serialize messages or stacks', () => {
    for (const name of ['TimeoutError', 'TypeError', 'ReferenceError', 'RangeError', 'credential-secret']) {
        const failure = readerNative.safeReaderFailure({ name, message: 'TOKEN_SECRET', stack: 'DATABASE_SECRET', code: 'TOKEN_SECRET' });
        assert.deepEqual(failure, { kind: name === 'credential-secret' ? 'UnknownError' : name, code: null });
        assert.ok(!JSON.stringify(failure).includes('SECRET'));
    }
});
for (const phase of ['tab', 'focused-probe', 'geometry', 'clearance']) {
    test(`actual keyboard capture preserves ${phase} failure before diagnostic capture failure`, async () => {
        const source = fs.readFileSync(new URL('./admin-readers-native.mjs', import.meta.url), 'utf8');
        const begin = source.indexOf('    async function keyboardCapture(page, subject, width, target, name) {');
        const end = source.indexOf('\n    async function tableKeyboard(', begin);
        assert.ok(begin > 0 && end > begin);
        const primary = Object.assign(new Error('TOKEN_SECRET'), { name: 'TimeoutError' });
        const secondary = new Error('DIAGNOSTIC_SECRET');
        const writes = []; let captured = false;
        const run = new Function('settleTraceFocusGeometry', 'assertReaderFocusClearance', 'safeTraceFailure', 'write', 'capture', `${source.slice(begin, end)};return keyboardCapture;`)(
            async () => { if (phase === 'geometry') throw primary; return {}; },
            () => { if (phase === 'clearance') throw primary; },
            readerNative.safeReaderFailure,
            (name, value) => writes.push({ name, value: structuredClone(value) }),
            async () => { captured = true; throw secondary; });
        const page = { keyboard: { press: async () => { if (phase === 'tab') throw primary; } } };
        const target = { evaluate: async () => { if (phase === 'focused-probe') throw primary; return true; } };
        await assert.rejects(run(page, 'margin', 1024, target, 'recovered'), error => error === primary);
        assert.equal(captured, true);
        assert.equal(writes.length, 1);
        assert.equal(writes[0].name, 'admin-readers-margin-recovered-1024-geometry.json');
        assert.equal(writes[0].value.diagnostic.phase, phase);
        assert.equal(writes[0].value.diagnostic.tabIndex, 0);
        assert.deepEqual(writes[0].value.diagnostic.failure, { kind: 'TimeoutError', code: null });
        assert.ok(!JSON.stringify(writes).includes('SECRET'));
    });
}
function oldFakeResult() { const flags = { actualEntry: true, authorizedData: true, stale500Retained: true, real403Hidden: true, failedRetryStillHidden: true, recovered: true, keyboardGeometry: true }; return { status: 'passed', responseTimeoutMs: 25000, tableScroll: ['analytics', 'margin', 'sales', 'supplier-ranking', 'suppliers'].map(subject => ({ subject, before: { focused: true, clientWidth: 200, scrollWidth: 640, scrollLeft: 0, pageX: 0, pageY: 20, viewport: 390, pageWidth: 390 }, after: { focused: true, clientWidth: 200, scrollWidth: 640, scrollLeft: 35, pageX: 0, pageY: 20, viewport: 390, pageWidth: 390 } })), budget: { elapsedMs: 1, deadlineMs: 300000, apiRequests: 1, analyticsRequests: 1 }, fixtureCleaned: true, databaseGrantLookup: true, lateScopeSuppressed: true, readOnlySnapshotEqual: true, rawSnapshotTables: 33, forbidden: [], beforeSha256: 'a'.repeat(64), afterSha256: 'a'.repeat(64), cases: [1366, 1024, 390].map(width => ({ width, contextId: [1366, 1024, 390].indexOf(width) + 2, readers: ['cashflow', 'margin', 'sales', 'analytics', 'suppliers'].map(id => { const subject = navigationSubjects.find(row => row.id === id); return { id, ...flags, navigation: { route: subject.route, heading: subject.heading, period: id === 'suppliers' ? null : '2026-01', response: { contextId: [1366, 1024, 390].indexOf(width) + 2, requestId: 1, path: '/api/v1/admin' + (id === 'analytics' ? '/analytics/product-abc' : id === 'suppliers' ? '/inventory/suppliers' : subject.route) + (id === 'suppliers' ? '' : '?period=2026-01'), actor: 'readerA', status: 200, sha256: 'c'.repeat(64) } } }; }) })), pgNegativeControls: { oldOrderItemRevenue: 17844, scopedRevenue: 67, oldSupplierDenominator: 17844, scopedSupplierDenominator: 62 }, httpStatuses: Object.fromEntries(readerEndpoints.map(endpoint => [endpoint, { readerA: 200, readerB: 200, readerEmpty: 200, unauthenticated: 401, denied: 403, inactive: 401, crossTenantHeader: 401 }])), initialErrorRecovered: ['cashflow', 'margin', 'sales', 'analytics', 'suppliers'], authorizedEmpty: ['cashflow', 'margin', 'sales', 'analytics', 'suppliers'] }; }
function fakeResult() {
    const result = oldFakeResult();
    result.tableScroll = result.tableScroll.map(row => { const before = { ...row.before, direction: 'ltr' }, forward = { ...row.after, direction: 'ltr' }; return { ...row, status: 'passed', failure: null, before, after: { ...before }, moves: [{ key: 'ArrowRight', before, after: forward }, { key: 'ArrowLeft', before: forward, after: { ...before } }] }; });
    result.coverage = 'one shared lifecycle; three independent five-reader cold entries';
    result.coldEntries = structuredClone(result.cases).map((row, i) => ({ ...row, contextId: i + 3, authenticated: true, authResponse: { contextId: i + 3, requestId: 1, path: '/api/v1/admin/auth/me', actor: 'readerA', status: 200, sha256: 'a'.repeat(64) },
        readers: row.readers.map(reader => ({ id: reader.id, navigation: { ...reader.navigation, response: { ...reader.navigation.response, contextId: i + 3 } } })) }));
    for (const row of result.cases) { row.contextId = 2; for (const reader of row.readers) {
        reader.navigation.response.contextId = 2;
        reader.states = Object.fromEntries(readerNative.readerStates.map((state, i) => [state, { width: row.width, verified: true, response: { ...reader.navigation.response, requestId: i + 1, actor: ['denied', 'failed-retry'].includes(state) ? 'denied' : 'readerA', status: state === 'denied' ? 403 : ['stale', 'failed-retry'].includes(state) ? 500 : 200 } }]));
    } }
    result.emptyCases = result.cases[0].readers.map(reader => ({ id: reader.id, contextId: 6, period: '2026-01', views: Object.fromEntries([['initial-error', 500], ['empty', 200]].map(([state, status]) => [state, [1366, 1024, 390].map(width => ({ width, verified: true, response: { ...reader.navigation.response, contextId: 6, actor: 'readerEmpty', status } }))])) }));
    for (const row of result.emptyCases) row.initialFaultReady = { route: navigationSubjects.find(subject => subject.id === row.id).route, readerRootMounted: true, contextId: row.contextId, requestId: row.views['initial-error'][0].response.requestId };
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
        const written = [], originalWrite = fs.writeFileSync;
        fs.writeFileSync = (file, ...args) => { if (typeof file === 'string' && path.dirname(file) === output) written.push(path.basename(file)); return originalWrite(file, ...args); };
        try {
            await assert.rejects(runAdminReadersNative({ db: fixture.db, adminOrigin: 'http://127.0.0.1:12345', output, nonce: randomUUID(), signAccessToken: () => { throw Error('must not issue tokens after seed failure'); } }));
            const result = JSON.parse(fs.readFileSync(path.join(output, 'admin-readers-native.json'))), cleanup = JSON.parse(fs.readFileSync(path.join(output, 'admin-readers-cleanup.json')));
            assert.equal(result.status, 'failed');
            assert.equal(result.databaseGrantLookup, false);
            assert.equal(result.readOnlySnapshotEqual, false);
            assert.equal(result.cases.length, 0);
            assert.ok(!JSON.stringify(result).includes('DO_NOT_LEAK'));
            assert.equal(new Set(written).size, written.length);
            assert.ok(written.indexOf('admin-readers-cleanup.json') < written.indexOf('admin-readers-native.json'));
            assert.ok(written.indexOf('admin-readers-responses.json') < written.indexOf('admin-readers-native.json'));
            assert.equal(written.filter(name => name === 'admin-readers-native.json').length, 1);
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
            fs.writeFileSync = originalWrite;
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
    const good = fakeResult().tableScroll[0].moves[0]; assert.doesNotThrow(() => assertReaderTableScroll(good.before, good.after));
    for (const delta of [{ scrollLeft: 0 }, { focused: false }, { pageX: 2 }, { pageY: 30 }, { pageWidth: 659 }, { scrollLeft: 500 }, { clientWidth: 0 }])
        assert.throws(() => assertReaderTableScroll(good.before, { ...good.after, ...delta }));
});
test('missing or duplicate reader table acceptance cannot pass', () => {
    for (const change of [result => result.tableScroll.pop(), result => result.tableScroll[0].subject = 'margin', result => result.tableScroll[0].moves[0].after.scrollLeft = 0]) {
        const result = fakeResult(); change(result); assert.throws(() => assertReadersNativeAcceptance(result));
    }
});

function tableKeyboardAdapter({ start = 402, mode = 'normal', captureFails = false, direction = 'ltr' } = {}) {
    const source = fs.readFileSync(new URL('./admin-readers-native.mjs', import.meta.url), 'utf8');
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-table-contract-'));
    const writeStart = source.indexOf('    const write = (name, value) => fs.writeFileSync(');
    const writeEnd = source.indexOf('\n', writeStart);
    assert.ok(writeStart > 0 && writeEnd > writeStart);
    // Exercise the exact production immutable writer, not a permissive array stub.
    const immutableWrite = new Function('fs', 'path', 'output', `${source.slice(writeStart, writeEnd)}; return write;`)(fs, path, output);
    const begin = source.indexOf('    async function tableKeyboard(page, subject) {');
    const end = source.indexOf('\n    try {\n        await seedReaderFixture', begin);
    assert.ok(begin > 0 && end > begin);
    const state = { scrollLeft: start, scrollWidth: 640, clientWidth: 238, pageX: 0, pageY: 0, focused: true, viewport: 390, pageWidth: 390, direction };
    const keys = [], writes = [], accepted = [], events = [];
    const region = { evaluate: async () => ({ ...state }) };
    const page = { locator: selector => { assert.equal(selector, '.reader-table-scroll'); return region; }, keyboard: { press: async key => {
        keys.push(key); events.push(key);
        if (mode !== 'no-movement') state.scrollLeft = Math.max(0, Math.min(402, state.scrollLeft + (key === 'ArrowRight' ? 32 : -32)));
        if (mode === 'page-moved') state.pageY++;
        if (mode === 'focus-lost') state.focused = false;
    } } };
    const expect = () => ({ toHaveCount: async count => assert.equal(count, 1) });
    const settle = (read, before, key, observe) => readerNative.settleReaderTableScroll(read, before, key, observe, async () => {});
    const run = new Function('expect', 'keyboardCapture', 'readerTableKeys', 'settleReaderTableScroll', 'assertReaderTableJourney', 'safeTraceFailure', 'tableScroll', 'write', 'capture', `let stage=''; ${source.slice(begin, end)};return tableKeyboard;`)(
        expect, async () => { events.push('keyboard-focus'); }, readerNative.readerTableKeys, settle, readerNative.assertReaderTableJourney,
        error => ({ kind: error.name, code: error.code ?? null }), accepted,
        (name, data) => { immutableWrite(name, data); writes.push({ name, data: structuredClone(data) }); },
        async () => { events.push('capture'); if (captureFails) throw new Error('diagnostic capture failure'); });
    return { run: async () => { try { await run(page, 'suppliers'); } finally { fs.rmSync(output, { recursive: true }); } }, keys, writes, accepted, events, state };
}
for (const [label, start, expected] of [
    ['right boundary', 402, ['ArrowLeft', 'ArrowRight']],
    ['left boundary', 0, ['ArrowRight', 'ArrowLeft']],
    ['middle', 201, ['ArrowRight', 'ArrowLeft']],
]) test(`actual table callback uses both real key directions from ${label}`, async () => {
    const model = tableKeyboardAdapter({ start }); await model.run();
    assert.deepEqual(model.keys, expected); assert.equal(model.state.scrollLeft, start);
    assert.equal(model.accepted.length, 1); readerNative.assertReaderTableJourney(model.accepted[0]);
    assert.ok(model.accepted[0].moves.every(move => move.samples.length >= 2));
    assert.equal(model.writes[0].data.before.scrollLeft, start); assert.equal(model.writes[0].data.moves[0].after, null);
    assert.equal(model.events.at(-1), 'capture');
});
for (const mode of ['no-movement', 'page-moved', 'focus-lost']) test(`table callback fails closed and saves samples when ${mode}`, async () => {
    const model = tableKeyboardAdapter({ mode }); await assert.rejects(model.run());
    assert.equal(model.accepted.length, 0); const saved = model.writes.at(-1).data;
    assert.equal(saved.status, 'failed'); assert.ok(saved.moves[0].samples.length > 0);
    assert.equal(model.events.at(-1), 'capture');
});
test('unsupported RTL is preserved in the failed receipt and never silently treated as LTR', async () => {
    const model = tableKeyboardAdapter({ direction: 'rtl' }); await assert.rejects(model.run());
    assert.deepEqual(model.keys, []); assert.equal(model.writes.at(-1).data.before.direction, 'rtl');
    assert.equal(model.accepted.length, 0);
});
test('table diagnostic capture failure cannot replace the original movement failure', async () => {
    const model = tableKeyboardAdapter({ mode: 'no-movement', captureFails: true });
    await assert.rejects(model.run(), /Reader table movement did not settle/);
    assert.equal(model.writes.at(-1).data.status, 'failed');
});
test('table movement rejects wrong sign, nonfinite or out-of-range positions and changing viewport', () => {
    const move = fakeResult().tableScroll[0].moves[0];
    for (const delta of [{ scrollLeft: NaN }, { scrollLeft: -1 }, { scrollLeft: 441 }, { viewport: 391 }, { direction: 'rtl' }, { scrollWidth: 200 }, { focused: false }, { pageX: 1 }, { pageY: 22 }])
        assert.throws(() => readerNative.assertReaderTableScroll(move.before, { ...move.after, ...delta }, move.key));
    assert.throws(() => readerNative.assertReaderTableScroll(move.before, move.after, 'ArrowLeft'));
    assert.throws(() => readerNative.readerTableKeys({ ...move.before, scrollWidth: 200 }));
});
test('native receipt requires both ordered table moves with exact continuation and a passed status', () => {
    for (const change of [row => row.moves.pop(), row => row.moves[1].key = 'ArrowRight', row => row.moves[1].before = { ...row.moves[1].before, scrollLeft: row.moves[1].before.scrollLeft + 1 }, row => row.status = 'failed', row => row.failure = { kind: 'Error' }, row => row.after.scrollLeft++, row => row.moves[1].after.scrollLeft = row.moves[1].before.scrollLeft]) {
        const result = fakeResult(); const row = structuredClone(result.tableScroll[0]); change(row); result.tableScroll[0] = row;
        assert.throws(() => assertReadersNativeAcceptance(result));
    }
});
test('table observation deadline also bounds a hung read and discards its late sample', async () => {
    let release; const rows = [], move = fakeResult().tableScroll[0].moves[0], start = performance.now();
    const pending = readerNative.settleReaderTableScroll(() => new Promise(resolve => { release = resolve; }), move.before, move.key, row => rows.push(row));
    await assert.rejects(pending, /Reader table movement timed out/);
    const elapsed = performance.now() - start; assert.ok(elapsed >= 3100 && elapsed < 5000);
    release(move.after); await new Promise(resolve => setTimeout(resolve, 0)); assert.deepEqual(rows, []);
});

// End-to-end local driver I/O: exact production callbacks/writer/capture, real
// temporary files, browser/PNG-header adapters only. This is not Chrome imagery.
function tableDriverIo({ mode = 'normal', collision = null, missingDirectory = false, captureFailure = false } = {}) {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'reader-table-io-'));
    const source = fs.readFileSync(new URL('./admin-readers-native.mjs', import.meta.url), 'utf8');
    const parent = fs.readFileSync(new URL('./package-browser-acceptance.mjs', import.meta.url), 'utf8');
    const writeStart = source.indexOf('    const write = (name, value) => fs.writeFileSync(');
    const write = new Function('fs', 'path', 'output', `${source.slice(writeStart, source.indexOf('\n', writeStart))};return write;`)(fs, path, output);
    const captureStart = parent.indexOf('async function capture(page, name, viewport) {');
    const captures = [];
    const capture = new Function('fs', 'path', 'output', 'assert', 'captures', 'createHash', `${parent.slice(captureStart, parent.indexOf('\nasync function counts()', captureStart))};return capture;`)(fs, path, output, assert, captures, createHash);
    const start = source.indexOf('    async function keyboardCapture(page, subject, width, target, name) {');
    const end = source.indexOf('\n    try {\n        await seedReaderFixture', start);
    const accepted = [], keys = [], writes = [];
    let state;
    const region = { evaluate: async callback => {
        if (callback.toString().includes('getBoundingClientRect')) return { x: 112, y: 200, width: 238, height: 197, region: { x: 72, right: 390 }, viewport: 390, pageWidth: 390, scrollLeft: 0, outline: '3px', outlineOffset: '3px', color: 'rgb(61, 43, 31)', focused: state.focused, centerHit: true, viewportHeight: 844 };
        if (callback.toString().includes('scrollWidth')) return { ...state };
        return state.focused;
    } };
    const page = { locator: selector => { assert.equal(selector, '.reader-table-scroll'); return region; }, keyboard: { press: async key => {
        keys.push(key); if (key === 'Tab') { state.focused = true; return; }
        if (mode !== 'no-movement') state.scrollLeft = Math.max(0, Math.min(402, state.scrollLeft + (key === 'ArrowRight' ? 32 : -32)));
    } }, screenshot: async options => {
        assert.equal(options.fullPage, false); assert.equal(options.path, undefined);
        if (captureFailure && captures.length > 0) throw new Error('capture adapter failure');
        const bytes = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes); bytes.writeUInt32BE(390,16); bytes.writeUInt32BE(844,20);
        return bytes;
    } };
    const expect = () => ({ toHaveCount: async count => assert.equal(count, 1) });
    const run = new Function('expect', 'settleTraceFocusGeometry', 'assertReaderFocusClearance', 'readerTableKeys', 'settleReaderTableScroll', 'assertReaderTableJourney', 'safeTraceFailure', 'tableScroll', 'write', 'capture', `let stage='';${source.slice(start,end)};return tableKeyboard;`)(expect,
        (read, observe) => settleTraceFocusGeometry(read, observe, async () => {}), readerNative.assertReaderFocusClearance,
        readerNative.readerTableKeys, (read, before, key, observe) => readerNative.settleReaderTableScroll(read, before, key, observe, async () => {}), readerNative.assertReaderTableJourney,
        safeTraceFailure, accepted, (name, value) => { write(name, value); writes.push(name); }, capture);
    if (collision !== null) fs.writeFileSync(path.join(output, `admin-readers-suppliers-table-scroll-390${collision}.json`), 'OWNED_COLLISION_SENTINEL', { flag: 'wx' });
    if (missingDirectory) fs.rmdirSync(output);
    return { output, captures, accepted, keys, writes, run: async (subject = 'suppliers', position = 402) => {
        state = { scrollLeft: position, scrollWidth: 640, clientWidth: 238, direction: 'ltr', pageX: 0, pageY: 0, focused: false, viewport: 390, pageWidth: 390 };
        return run(page, subject);
    }, cleanup: () => fs.rmSync(output, { recursive: true, force: true }) };
}
test('actual table focus/capture/writer integration preserves thirty unique files for all five tables', async () => {
    const io = tableDriverIo();
    try {
        for (const [i, subject] of ['margin','sales','analytics','supplier-ranking','suppliers'].entries()) await io.run(subject, [0,402,201][i % 3]);
        const names = fs.readdirSync(io.output); assert.equal(names.length, 30); assert.equal(new Set(io.writes).size, io.writes.length);
        assert.equal(io.accepted.length, 5); assert.equal(io.captures.length, 10);
        for (const row of io.accepted) {
            readerNative.assertReaderTableJourney(row);
            const prefix = `admin-readers-${row.subject}-table-scroll-390`;
            for (const suffix of ['-move-1-before.json','-move-2-before.json','.json','.png']) assert.ok(names.includes(prefix+suffix));
            assert.equal(io.writes.filter(name => name === prefix+'.json').length, 1);
            assert.deepEqual(JSON.parse(fs.readFileSync(path.join(io.output,prefix+'.json'))), row);
        }
        for (const capture of io.captures) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(io.output,capture.name))).digest('hex'), capture.sha256);
        const workflow = fs.readFileSync(new URL('../../../../.github/workflows/ci.yml', import.meta.url), 'utf8');
        const block = workflow.slice(workflow.indexOf('      - name: Preserve quiescent package browser API database evidence'), workflow.indexOf('      - name: Preserve separate PostgreSQL and current POS evidence'));
        assert.match(block, /path: \$\{\{ steps\.package_native\.outputs\.evidence_dir \}\}/);
        assert.match(block, /if-no-files-found: error/); assert.ok(!block.includes('*.'));
    } finally { io.cleanup(); }
});
for (const captureFailure of [false,true]) test(`actual driver I/O retains failed samples and original movement error with capture failure=${captureFailure}`, async () => {
    const io = tableDriverIo({ mode: 'no-movement', captureFailure });
    try {
        await assert.rejects(io.run(), /Reader table movement did not settle/);
        const result = JSON.parse(fs.readFileSync(path.join(io.output,'admin-readers-suppliers-table-scroll-390.json')));
        assert.equal(result.status,'failed'); assert.ok(result.moves[0].samples.length > 0);
        assert.equal(io.writes.filter(name => name.endsWith('table-scroll-390.json')).length,1);
        assert.equal(fs.existsSync(path.join(io.output,'admin-readers-suppliers-table-scroll-390.png')), !captureFailure);
    } finally { io.cleanup(); }
});
for (const collision of ['-move-1-before','-move-2-before','']) test(`immutable driver I/O rejects and preserves collision at ${collision || 'final'}`, async () => {
    const io = tableDriverIo({ collision });
    try {
        await assert.rejects(io.run(), { code: 'EEXIST' });
        assert.equal(fs.readFileSync(path.join(io.output,`admin-readers-suppliers-table-scroll-390${collision}.json`),'utf8'), 'OWNED_COLLISION_SENTINEL');
        assert.ok(fs.existsSync(path.join(io.output,'admin-readers-suppliers-table-scroll-390.png')));
    } finally { io.cleanup(); }
});
test('missing output directory fails closed without silently creating or redirecting evidence', async () => {
    const io = tableDriverIo({ missingDirectory: true });
    try { await assert.rejects(io.run(), { code: 'ENOENT' }); assert.equal(fs.existsSync(io.output),false); }
    finally { io.cleanup(); }
});
test('final summary collision cannot replace an earlier movement error or prevent the failure PNG', async () => {
    const io = tableDriverIo({ mode: 'no-movement', collision: '' });
    try {
        await assert.rejects(io.run(), /Reader table movement did not settle/);
        assert.equal(fs.readFileSync(path.join(io.output,'admin-readers-suppliers-table-scroll-390.json'),'utf8'),'OWNED_COLLISION_SENTINEL');
        assert.ok(fs.existsSync(path.join(io.output,'admin-readers-suppliers-table-scroll-390.png')));
    } finally { io.cleanup(); }
});
test('successful movement cannot turn a missing final PNG into a green driver result', async () => {
    const io = tableDriverIo({ captureFailure: true });
    try {
        await assert.rejects(io.run(), /capture adapter failure/);
        assert.equal(JSON.parse(fs.readFileSync(path.join(io.output,'admin-readers-suppliers-table-scroll-390.json'))).status,'passed');
        assert.equal(fs.existsSync(path.join(io.output,'admin-readers-suppliers-table-scroll-390.png')), false);
    } finally { io.cleanup(); }
});
test('replaying a completed subject cannot overwrite any immutable evidence or final summary', async () => {
    const io = tableDriverIo();
    try {
        await io.run();
        const before = Object.fromEntries(fs.readdirSync(io.output).map(name => [name, fs.readFileSync(path.join(io.output,name)).toString('base64')]));
        await assert.rejects(io.run(), { code: 'EEXIST' });
        const after = Object.fromEntries(fs.readdirSync(io.output).map(name => [name, fs.readFileSync(path.join(io.output,name)).toString('base64')]));
        assert.deepEqual(after,before); assert.equal(io.writes.filter(name => name.endsWith('table-scroll-390.json')).length,1);
    } finally { io.cleanup(); }
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
    const control = { actor: 'readerA', mode: 'normal', paths: [] }, network = [], responses = [], pending = [], dispatched = new WeakMap(), transport = { continued: 0, aborted: 0, fulfilled: [], fetched: 0 };
    const budgetCalls = [];
    const dispatch = new Function('contextId', 'control', 'network', 'dispatched', 'forbidden', 'adminOrigin', 'budget', 'pace', 'tokens', 'readerRequestActor', 'readerEndpoints', 'readerPeriod', 'assert', 'assertReaderResponse', 'expected', 'hash', `let nextRequestId=0; const viewport={width:1366}; return async route => {${source.slice(routeStart, routeEnd)}\n}`)(2, control, network, dispatched, [], 'http://127.0.0.1:12345', { request(endpoint) { budgetCalls.push(endpoint); } }, pace, tokens, readerNative.readerRequestActor, readerEndpoints, '2026-01', assert, () => {}, {readerA:{}}, () => 'a'.repeat(64));
    const receive = new Function('contextId', 'control', 'dispatched', 'responses', 'pending', 'adminOrigin', 'readerEndpoints', 'expected', 'assertReaderResponse', 'hash', 'readerPeriod', `const viewport={width:1366}; return response => {${source.slice(responseStart, responseEnd)}\n}`)(2, control, dispatched, responses, pending, 'http://127.0.0.1:12345', ['/reports/margin'], { readerA: { actor: 'readerA' }, readerB: { actor: 'readerB' } }, (_endpoint, _data, expected) => assert.equal(expected.actor, 'readerA'), () => 'a'.repeat(64), '2026-01');
    async function request(authorization, { endpoint = '/reports/margin', failed = null, detached = false, url: overrideUrl, method = 'GET', resourceType = 'fetch' } = {}) {
        const req = { url: () => overrideUrl ?? 'http://127.0.0.1:12345/api/v1/admin' + endpoint + '?period=2026-01', method: () => method, resourceType: () => resourceType, headers: () => authorization === undefined ? {} : { authorization }, failure: () => failed, frame: () => ({ isDetached: () => detached }) };
        await dispatch({ request: () => req, continue: async () => { transport.continued++; }, abort: async () => { transport.aborted++; }, fulfill: async value => { transport.fulfilled.push(value); }, fetch: async () => { transport.fetched++; return { status: () => 200, text: async () => JSON.stringify({ data: {} }) }; } }); return req;
    }
    return { control, tokens, network, responses, pending, dispatched, receive, request, transport, budgetCalls };
}
test('actual initial-error callback must never replace a reader document with its synthetic API500', async () => {
    const c = actorCallbacks(); c.control.mode = 'fail500'; c.control.paths = ['/reports/cashflow'];
    await c.request(undefined, { url: 'http://127.0.0.1:12345/reports/cashflow', resourceType: 'document' });
    assert.equal(c.transport.continued,1); assert.deepEqual(c.transport.fulfilled,[]);
});
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
    assert.deepEqual(c.transport, { continued: 0, aborted: 1, fulfilled: [], fetched: 0 }); assert.equal(c.dispatched.get(request).cancelledBeforeDispatch, true); assert.equal(c.dispatched.get(request).analyticsCancelledAt, 2150);
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

// Replay the production route callback across transport and URL boundaries.
for (const resourceType of ['document', 'script', 'stylesheet', 'image', 'font', 'media', 'other']) {
    test(`fault boundary: ${resourceType} cannot receive API500 or an analytics pacing slot`, async () => {
        let paced=0; const c=actorCallbacks({pace: async()=>{paced++;return {admitted:true,at:0};}});
        c.control.mode='fail500';c.control.paths=[...readerEndpoints];
        for(const endpoint of readerEndpoints) await c.request(undefined,{endpoint,resourceType});
        assert.equal(c.transport.continued,readerEndpoints.length);assert.deepEqual(c.transport.fulfilled,[]);assert.equal(paced,0);
        assert.equal(c.budgetCalls.length,readerEndpoints.length); // All /api attempts still count.
    });
}
for (const method of ['POST','PUT','DELETE','PATCH','OPTIONS','HEAD']) test(`fault boundary: ${method} is forbidden before injection`,async()=>{
    const c=actorCallbacks();c.control.mode='fail500';c.control.paths=[...readerEndpoints];
    await c.request(undefined,{method});assert.equal(c.transport.aborted,1);assert.equal(c.transport.continued,0);assert.deepEqual(c.transport.fulfilled,[]);
});
for(const origin of ['https://127.0.0.1:12345','http://127.0.0.1:12346','http://localhost:12345','http://example.test:12345']) test(`fault boundary: origin ${origin} is forbidden`,async()=>{
    const c=actorCallbacks();c.control.mode='fail500';c.control.paths=[...readerEndpoints];
    await c.request(undefined,{url:origin+'/api/v1/admin/reports/cashflow'});assert.equal(c.transport.aborted,1);assert.deepEqual(c.transport.fulfilled,[]);
});
for(const pathname of ['/reports/cashflow','/analytics/product-abc','/api/v1/administrator/reports/cashflow','/api/v1/admin/reports/cashflow/','/api/v1/admin/reports/cashflow-extra','/api/v1/admin//reports/cashflow','/api/v1/admin/reports/%63ashflow','/api/v1/admin/auth/me','/api/v1/admin/unknown','/api/v1/admin','/api/v1/admin?path=/reports/cashflow','/index.html#/api/v1/admin/reports/cashflow']) test(`fault boundary: exact namespace/allowlist rejects ${pathname}`,async()=>{
    let paced=0;const c=actorCallbacks({pace:async()=>{paced++;return {admitted:true,at:0};}});c.control.mode='fail500';
    c.control.paths=[...readerEndpoints,'/auth/me','/unknown'];
    await c.request(undefined,{url:'http://127.0.0.1:12345'+pathname});assert.equal(c.transport.continued,1);assert.deepEqual(c.transport.fulfilled,[]);assert.equal(paced,0);
});
for(const resourceType of ['fetch','xhr']) test(`fault boundary: all eight exact ${resourceType} APIs with query/hash get only synthetic500`,async()=>{
    const c=actorCallbacks();c.control.mode='fail500';c.control.paths=[...readerEndpoints];
    for(const endpoint of readerEndpoints) await c.request(`Bearer ${c.tokens.readerA}`,{resourceType,url:'http://127.0.0.1:12345/api/v1/admin'+endpoint+'?period=2026-01&next=/other#fragment'});
    assert.equal(c.transport.fulfilled.length,8);assert.equal(c.transport.continued,0);assert.equal(c.budgetCalls.length,8);
    assert.ok(c.transport.fulfilled.every(row=>row.status===500));assert.ok(c.network.every(row=>row.syntheticTransport500===true));
});
test('fault callback honors selected paths and does not change normal API or auth',async()=>{
    const c=actorCallbacks();c.control.mode='fail500';c.control.paths=['/reports/cashflow','/auth/me'];
    await c.request(undefined,{endpoint:'/reports/margin'});await c.request(undefined,{endpoint:'/auth/me'});
    c.control.mode='normal';await c.request(undefined,{endpoint:'/reports/cashflow'});
    assert.equal(c.transport.continued,3);assert.deepEqual(c.transport.fulfilled,[]);
});
test('fault callback waits for real shell readiness before fulfilling, records linked receipt and fails closed',async()=>{
    const c=actorCallbacks();c.control.mode='fail500';c.control.paths=['/reports/cashflow'];
    let release;const ready=new Promise(resolve=>{release=resolve;});let entered=false;
    c.control.beforeFault=async()=>{entered=true;await ready;return {route:'/reports/cashflow',readerRootMounted:true};};
    const request=c.request(`Bearer ${c.tokens.readerA}`,{endpoint:'/reports/cashflow'});
    await new Promise(resolve=>setImmediate(resolve));assert.equal(entered,true);assert.equal(c.transport.fulfilled.length,0);
    release();await request;assert.deepEqual(c.network[0].faultUiReady,{route:'/reports/cashflow',readerRootMounted:true});assert.equal(c.transport.fulfilled.length,1);
    c.control.beforeFault=async()=>{throw Error('DO_NOT_LEAK_READINESS');};await c.request(undefined,{endpoint:'/reports/cashflow'});
    assert.equal(c.transport.aborted,1);assert.equal(c.transport.fulfilled.length,1);assert.equal(c.network[1].faultUiReadinessRejected,true);assert.ok(!JSON.stringify(c.network).includes('DO_NOT_LEAK'));
});
test('fault shell requires exact URL, one mounted root and visibility without data-heading or a sleep',async()=>{
    const events=[],root={};const page={locator(selector){assert.equal(selector,'.admin-reader-page');return root;}};
    const expect=target=>({async toHaveURL(url,options){assert.equal(target,page);assert.equal(url,'http://127.0.0.1:12345/reports/cashflow');assert.equal(options.timeout,25000);events.push('url');},async toHaveCount(n,options){assert.equal(target,root);assert.equal(n,1);assert.equal(options.timeout,25000);events.push('count');},async toBeVisible(options){assert.equal(target,root);assert.equal(options.timeout,25000);events.push('visible');}});
    assert.deepEqual(await readerNative.waitForReaderFaultShell({page,subject:{route:'/reports/cashflow'},adminOrigin:'http://127.0.0.1:12345',expect}),{route:'/reports/cashflow',readerRootMounted:true});assert.deepEqual(events,['url','count','visible']);
    await assert.rejects(readerNative.waitForReaderFaultShell({page,subject:{route:'/reports/cashflow'},adminOrigin:'http://127.0.0.1:12345',expect:()=>({async toHaveURL(){throw Error('wrong target');}})}),/wrong target/);
});
test('initial-fault acceptance rejects missing, wrong-page, cross-context or replayed request readiness',()=>{
    for(const change of [r=>delete r.emptyCases[0].initialFaultReady,r=>r.emptyCases[0].initialFaultReady.route='/reports/margin',r=>r.emptyCases[0].initialFaultReady.readerRootMounted=false,r=>r.emptyCases[0].initialFaultReady.contextId=99,r=>r.emptyCases[0].initialFaultReady.requestId=0]){
        const r=fakeResult();change(r);assert.throws(()=>assertReadersNativeAcceptance(r));
    }
});
test('held late-response callback only handles exact fetch/xhr Admin margin API',async()=>{
    for(const options of [{url:'http://127.0.0.1:12345/reports/margin?period=2026-01',resourceType:'document'},{resourceType:'script'},{endpoint:'/reports/margin/'}]){
        const c=actorCallbacks();c.control.hold={started:false};await c.request(undefined,options);assert.equal(c.control.hold.started,false);assert.equal(c.transport.fetched,0);assert.equal(c.transport.continued,1);
    }
    const c=actorCallbacks();const events=[];c.control.hold={started:false,ready:{resolve(){events.push('ready');}},release:{promise:Promise.resolve()},done:{resolve(){events.push('done');}}};await c.request(undefined);
    assert.equal(c.transport.fetched,1);assert.equal(c.transport.fulfilled.length,1);assert.deepEqual(events,['ready','done']);assert.equal(c.control.hold.failed,undefined);
});
test('fault callback preserves all five front-end navigation documents and their query/hash', async () => {
    const c=actorCallbacks();c.control.mode='fail500';c.control.paths=[...readerEndpoints];
    for(const route of ['/reports/cashflow','/reports/margin','/reports/sales-ranking','/inventory/analytics','/suppliers'])
        await c.request(undefined,{url:'http://127.0.0.1:12345'+route+'?period=2026-01#/api/v1/admin/reports/cashflow',resourceType:'document'});
    assert.equal(c.transport.continued,5);assert.equal(c.transport.fulfilled.length,0);assert.equal(c.budgetCalls.length,0);
});

for (const initial of ['fail500', 'normal']) test(`queued fault intent is bound before admission: ${initial}`, async () => {
    let admit;const waiting=new Promise(resolve=>{admit=resolve;});const c=actorCallbacks({pace:()=>waiting});
    c.control.mode=initial;c.control.paths=['/analytics/supplier-ranking'];
    const request=c.request(`Bearer ${c.tokens.readerA}`,{endpoint:'/analytics/supplier-ranking'});
    await new Promise(resolve=>setImmediate(resolve));
    c.control.mode=initial==='fail500'?'normal':'fail500';
    admit({admitted:true,at:2150});await request;
    assert.equal(c.transport.fulfilled.length,initial==='fail500'?1:0);
    assert.equal(c.transport.continued,initial==='fail500'?0:1);
});

test('endpoint recovery waits for enabled retry before removing only its own fault',async()=>{
    const control={mode:'fail500',paths:['/analytics/product-abc','/analytics/supplier-ranking']},events=[];
    let release;const ready=new Promise(resolve=>{release=resolve;});
    const retry={async click(){events.push('click');assert.deepEqual(control.paths,['/analytics/supplier-ranking']);}};
    const run=readerNative.retryReaderEndpoint({control,endpoint:'/analytics/product-abc',retry,expect:target=>({async toBeEnabled(options){assert.equal(target,retry);assert.deepEqual(options,{timeout:25000});events.push('waiting');await ready;events.push('enabled');}})});
    await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(events,['waiting']);assert.equal(control.paths.length,2);
    release();await run;assert.deepEqual(events,['waiting','enabled','click']);assert.equal(control.mode,'fail500');
    await assert.rejects(readerNative.retryReaderEndpoint({control,endpoint:'/analytics/product-abc',retry,expect(){throw Error('already recovered');}}));
    await assert.rejects(readerNative.retryReaderEndpoint({control:{mode:'normal',paths:[]},endpoint:'/analytics/product-abc',retry,expect(){}}));
});
test('endpoint readiness failure preserves all fault paths and never clicks',async()=>{
    const control={mode:'fail500',paths:['/reports/cashflow','/reports/cashflow/trend']};let clicks=0;
    await assert.rejects(readerNative.retryReaderEndpoint({control,endpoint:'/reports/cashflow',retry:{async click(){clicks++;}},expect:()=>({async toBeEnabled(){throw Error('still fetching');}})}),/still fetching/);
    assert.deepEqual(control.paths,['/reports/cashflow','/reports/cashflow/trend']);assert.equal(clicks,0);
});
for(const paths of [['/reports/cashflow','/reports/cashflow/trend'],['/reports/margin','/reports/margin/trend'],['/analytics/product-abc','/analytics/supplier-ranking']]) test(`actual callback recovery keeps secondary endpoint faulted: ${paths[0]}`,async()=>{
    const queued=[];const c=actorCallbacks({pace:()=>new Promise(resolve=>queued.push(resolve))});c.control.mode='fail500';c.control.paths=[...paths];
    const requests=[];const drain=async()=>{for(let i=0;i<8;i++){await new Promise(resolve=>setImmediate(resolve));for(const admit of queued.splice(0))admit({admitted:true,at:i*2150});}};
    const oldSecondary=c.request(`Bearer ${c.tokens.readerA}`,{endpoint:paths[1]});await new Promise(resolve=>setImmediate(resolve));
    const main=readerNative.retryReaderEndpoint({control:c.control,endpoint:paths[0],retry:{async click(){requests.push(c.request(`Bearer ${c.tokens.readerA}`,{endpoint:paths[0]}));}},expect:()=>({async toBeEnabled(){}})});await main;await drain();await Promise.all([oldSecondary,...requests]);
    assert.equal(c.transport.fulfilled.length,1);assert.equal(c.transport.continued,1);assert.deepEqual(c.control.paths,[paths[1]]);
    // Even an additional automatic secondary retry remains failed until its own click.
    const automatic=c.request(`Bearer ${c.tokens.readerA}`,{endpoint:paths[1]});await drain();await automatic;assert.equal(c.transport.fulfilled.length,2);
    await readerNative.retryReaderEndpoint({control:c.control,endpoint:paths[1],retry:{async click(){requests.push(c.request(`Bearer ${c.tokens.readerA}`,{endpoint:paths[1]}));}},expect:()=>({async toBeEnabled(){}})});
    await drain();await Promise.all(requests);assert.equal(c.transport.continued,2);assert.deepEqual(c.control.paths,[]);assert.equal(c.budgetCalls.length,4);
});
test('queued captured fault keeps original readiness and cancelled attempt never injects',async()=>{
    let admit;const c=actorCallbacks({pace:()=>new Promise(resolve=>{admit=resolve;})});c.control.mode='fail500';c.control.paths=['/analytics/product-abc'];let called=0;
    c.control.beforeFault=async()=>{called++;return {route:'/inventory/analytics',readerRootMounted:true};};
    const request=c.request(undefined,{endpoint:'/analytics/product-abc'});await new Promise(resolve=>setImmediate(resolve));c.control.beforeFault=async()=>{throw Error('replaced callback must not run');};c.control.paths=[];admit({admitted:true,at:2150});await request;
    assert.equal(called,1);assert.equal(c.network[0].syntheticTransportPlanned,true);assert.equal(c.network[0].syntheticTransport500,true);
    const cancelled=actorCallbacks({pace:async()=>({admitted:false,at:2150})});cancelled.control.mode='fail500';cancelled.control.paths=['/analytics/product-abc'];await cancelled.request(undefined,{endpoint:'/analytics/product-abc',failed:'net::ERR_ABORTED'});
    assert.equal(cancelled.network[0].syntheticTransportPlanned,true);assert.equal(cancelled.network[0].syntheticTransport500,undefined);assert.equal(cancelled.transport.aborted,1);assert.equal(cancelled.budgetCalls.length,1);
});
for(const paths of [['/reports/cashflow','/reports/cashflow/trend'],['/reports/margin','/reports/margin/trend'],['/analytics/product-abc','/analytics/supplier-ranking']]) test(`actual initial recovery transition preserves pending secondary fault: ${paths[0]}`,async()=>{
    const source=fs.readFileSync(new URL('./admin-readers-native.mjs',import.meta.url),'utf8');
    const scope=source.indexOf('stage = `${subject.id} initial error and empty`;');
    const before=source.indexOf('                const recoveryBefore = nextRequestId;',scope);
    const start=source.lastIndexOf('\n',before-2)+1,end=source.indexOf('                const emptyResponse =',before);
    assert.ok(scope>0&&before>scope&&end>before);
    const c=actorCallbacks();c.control.mode='fail500';c.control.paths=[...paths];
    const retry={async click(){await c.request(`Bearer ${c.tokens.readerA}`,{endpoint:paths[0]});}};
    const run=new Function('control','subject','page','retry','expect','retryReaderEndpoint',`return (async()=>{let stage='';const nextRequestId=1;${source.slice(start,end)}})();`);
    await run(c.control,{id:'synthetic',paths},{viewportSize:()=>({width:390})},retry,()=>({async toBeEnabled(){}}),readerNative.retryReaderEndpoint);
    await c.request(`Bearer ${c.tokens.readerA}`,{endpoint:paths[1]});
    assert.equal(c.transport.continued,1);assert.equal(c.transport.fulfilled.length,1);assert.deepEqual(c.control.paths,[paths[1]]);
});
