import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runAdminReadersNative, assertReadersNativeAcceptance, createReaderBudget } from './admin-readers-native.mjs';
import { readerEndpoints } from './admin-readers-oracle.mjs';
function fakeResult() { const flags = { actualEntry: true, authorizedData: true, stale500Retained: true, real403Hidden: true, failedRetryStillHidden: true, recovered: true, keyboardGeometry: true }; return { status: 'passed', budget: { elapsedMs: 1, deadlineMs: 300000, apiRequests: 1, analyticsRequests: 1 }, fixtureCleaned: true, databaseGrantLookup: true, lateScopeSuppressed: true, readOnlySnapshotEqual: true, rawSnapshotTables: 33, forbidden: [], beforeSha256: 'a'.repeat(64), afterSha256: 'a'.repeat(64), cases: [1366, 1024, 390].map(width => ({ width, readers: ['cashflow', 'margin', 'sales', 'analytics', 'suppliers'].map(id => ({ id, ...flags })) })), pgNegativeControls: { oldOrderItemRevenue: 17844, scopedRevenue: 67, oldSupplierDenominator: 17844, scopedSupplierDenominator: 62 }, httpStatuses: Object.fromEntries(readerEndpoints.map(endpoint => [endpoint, { readerA: 200, readerB: 200, readerEmpty: 200, unauthenticated: 401, denied: 403, inactive: 401, crossTenantHeader: 401 }])), initialErrorRecovered: ['cashflow', 'margin', 'sales', 'analytics', 'suppliers'], authorizedEmpty: ['cashflow', 'margin', 'sales', 'analytics', 'suppliers'] }; }
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
