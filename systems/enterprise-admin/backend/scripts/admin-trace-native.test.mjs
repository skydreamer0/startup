import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertTraceNativeAcceptance } from './admin-trace-native.mjs';
const sample = () => ({ status: 'passed', readOnlySnapshotEqual: true, fixtureCleaned: true, forbidden: [],
  cases: [1366, 1024, 390].map(width => ({ viewport: { width }, status: 'passed', totalAllocations: 132, shownAllocations: 100, exactOrderedRows: true, nullAndNumberedOrders: true, receiptLinked: true, keyboardQuantityRevealed: true, keyboardTraceOpened: true, focusRestored: true, lateScopeSuppressed: true, backForwardReload: true, paginationPreserved: true })),
  realStatuses: { unauthenticated: 401, deniedRole: 403, foreignBatch: 404, missingBatch: 404, crossTenantTrace: 404 }, injectedTransport500Recovered: true, databaseGrantLookup: true,
  beforeSha256: 'a'.repeat(64), afterSha256: 'a'.repeat(64), rawSnapshotTables: 33 });
test('accepts only complete synthetic native scope', () => assert.doesNotThrow(() => assertTraceNativeAcceptance(sample())));
for (const key of ['status', 'readOnlySnapshotEqual', 'fixtureCleaned', 'databaseGrantLookup', 'injectedTransport500Recovered', 'beforeSha256', 'afterSha256', 'rawSnapshotTables']) {
  test(`rejects missing ${key}`, () => { const result = sample(); delete result[key]; assert.throws(() => assertTraceNativeAcceptance(result)); });
}
for (const key of ['exactOrderedRows', 'nullAndNumberedOrders', 'receiptLinked', 'keyboardQuantityRevealed', 'keyboardTraceOpened', 'focusRestored', 'lateScopeSuppressed', 'backForwardReload', 'paginationPreserved']) {
  test(`rejects missing viewport evidence ${key}`, () => { const result = sample(); result.cases[2][key] = false; assert.throws(() => assertTraceNativeAcceptance(result)); });
}
test('rejects omitted/duplicated viewport and unexpected writes', () => {
  for (const mutate of [r => r.cases.pop(), r => { r.cases[1] = r.cases[0]; }, r => r.forbidden.push({ method: 'POST' })]) {
    const result = sample(); mutate(result); assert.throws(() => assertTraceNativeAcceptance(result));
  }
});
test('rejects truncated trace, fabricated totals, missing real denial or snapshot mismatch', () => {
  for (const mutate of [r => r.cases[0].shownAllocations = 99, r => r.cases[0].totalAllocations = 100, r => r.realStatuses.deniedRole = 200, r => r.realStatuses.foreignBatch = 200, r => r.afterSha256 = 'b'.repeat(64), r => r.rawSnapshotTables = 31]) {
    const result = sample(); mutate(result); assert.throws(() => assertTraceNativeAcceptance(result));
  }
});
test('existing mandatory owned runner calls the full journey and rejects its failure', () => {
  const source = fs.readFileSync(new URL('./package-browser-acceptance.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ runAdminTraceNative \} from '\.\/admin-trace-native\.mjs'/);
  assert.match(source, /const trace = await runAdminTraceNative\(/);
  assert.match(source, /assert\.equal\(trace\.status, 'passed'\)/);
  assert.ok(source.indexOf('await runAdminTraceNative(') < source.indexOf('cleanup = await cleanupRunProcesses(scope)'));
});

test('cleanup rejects a failed deletion or nonzero remainder; never reports a false clean fixture', async () => {
  const { cleanupTraceFixture } = await import('./admin-trace-native.mjs');
  const ids = Object.fromEntries(['a','b','foreignProduct','foreignTenant','reader','denied','readerRole','deniedRole','foreignReader','foreignReaderRole','customer'].map((k,i) => [k, `00000000-0000-4000-8000-${String(i).padStart(12,'0')}`]));
  const tenant = '00000000-0000-4000-8000-999999999999';
  function mock(fail, count = 0) {
    const calls=[]; const db={};
    for (const name of ['saleBatchAllocation','orderItem','order','inventoryTransaction','productBatch','product','customer','rolePermission','userRole','role','user','tenant']) db[name] = {
      deleteMany: async query => { calls.push({ name, query }); if(name===fail)throw new Error('synthetic cleanup fault'); return {count:1}; }, count: async()=>count,
    };
    return {db,calls};
  }
  const clean=mock(); assert.deepEqual(Object.values(await cleanupTraceFixture(clean.db,ids,tenant)),[0,0,0,0,0]);
  assert.equal(clean.calls.length,12);
  const failed=mock('order'); await assert.rejects(cleanupTraceFixture(failed.db,ids,tenant)); assert.equal(failed.calls.length,3);
  await assert.rejects(cleanupTraceFixture(mock(null,1).db,ids,tenant));
  await assert.rejects(cleanupTraceFixture(clean.db,{...ids,a:'*'},tenant));
});

for (const cleanupFails of [false, true]) test(`runner failure preserves failed receipt and cleanup=${!cleanupFails}`, async () => {
  const { runAdminTraceNative } = await import('./admin-trace-native.mjs');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const output = mkdtempSync(join(tmpdir(), 'synthetic-trace-guard-'));
  const db = {};
  for (const name of ['saleBatchAllocation','orderItem','order','inventoryTransaction','productBatch','product','customer','rolePermission','userRole','role','user','tenant']) db[name] = {
    deleteMany: async () => { if (cleanupFails) throw new Error('synthetic teardown failure'); return { count: 0 }; }, count: async () => 0,
  };
  db.tenant.create = async () => { throw new Error('synthetic fixture setup failure'); };
  try {
    await assert.rejects(runAdminTraceNative({ db, tenantId: '00000000-0000-4000-8000-999999999999', browser: {}, adminOrigin: 'http://127.0.0.1:1234', nonce: '00000000-0000-4000-8000-111111111111', output }));
    const result = JSON.parse(fs.readFileSync(join(output, 'admin-trace-native.json'), 'utf8'));
    const cleanup = JSON.parse(fs.readFileSync(join(output, 'admin-trace-fixture-cleanup.json'), 'utf8'));
    assert.equal(result.status, 'failed'); assert.equal(result.readOnlySnapshotEqual, false); assert.equal(result.databaseGrantLookup, false);
    assert.equal(result.fixtureCleaned, !cleanupFails); assert.equal(cleanup.status, cleanupFails ? 'failed' : 'passed');
    assert.deepEqual(result.cases, []); assert.doesNotMatch(JSON.stringify(result), /synthetic (fixture setup|teardown) failure/);
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test('actual fixture linked receipt satisfies the unchanged SQL cost constraint', async () => {
  const { runAdminTraceNative } = await import('./admin-trace-native.mjs');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const sql = fs.readFileSync(new URL('../prisma/migrations/20261006100000_atomic_batch_receipts/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /inventory_transactions_receipt_check/);
  assert.match(sql, /"cost_price_at_receipt" IS NOT NULL AND "cost_price_at_receipt" >= 0/);
  const output = mkdtempSync(join(tmpdir(), 'synthetic-trace-receipt-')); let recorded;
  const db = {};
  for (const name of ['saleBatchAllocation','orderItem','order','inventoryTransaction','productBatch','product','customer','rolePermission','userRole','role','user','tenant']) db[name] = {
    create: async ({ data }) => data, createMany: async ({ data }) => ({ count: data.length }), deleteMany: async () => ({ count: 0 }), count: async () => 0,
  };
  db.inventoryTransaction.createMany = async ({ data }) => { recorded = data; throw new Error('Stop mocked execution after recording exact fixture input'); };
  try {
    await assert.rejects(runAdminTraceNative({ db, tenantId: '00000000-0000-4000-8000-999999999999', browser: {}, adminOrigin: 'http://127.0.0.1:1234', nonce: '00000000-0000-4000-8000-111111111111', output }));
    assert.equal(recorded.length,133);
    const linked = recorded.filter(row => row.batchId != null); assert.equal(linked.length,1);
    for (const row of linked) {
      assert.equal(row.type,'IN'); assert.ok(row.quantity>0);
      assert.ok(row.costPriceAtReceipt != null && row.costPriceAtReceipt >= 0, 'Linked receipt requires explicit nonnegative cost, per unchanged SQL CHECK');
      assert.equal(row.costPriceAtReceipt,1);
    }
    const receipt=JSON.parse(fs.readFileSync(join(output,'admin-trace-native.json'),'utf8'));
    assert.equal(receipt.status,'failed'); assert.equal(receipt.databaseGrantLookup,false); assert.equal(receipt.fixtureCleaned,true); assert.deepEqual(receipt.cases,[]);
  } finally { rmSync(output,{recursive:true,force:true}); }
});
test('safe failure diagnostics expose only fixed exception class/code, never message/meta/stack/token', async () => {
  const { safeTraceFailure } = await import('./admin-trace-native.mjs');
  const secret='synthetic-do-not-record-this-value';
  assert.deepEqual(safeTraceFailure({name:'PrismaClientKnownRequestError',code:'P2004',message:secret,stack:secret,meta:{token:secret}}),{kind:'PrismaClientKnownRequestError',code:'P2004'});
  assert.deepEqual(safeTraceFailure({name:secret,code:secret,message:secret}),{kind:'UnknownError',code:null});
  assert.deepEqual(safeTraceFailure(new Error(secret)),{kind:'Error',code:null});
  assert.deepEqual(safeTraceFailure(secret),{kind:'UnknownError',code:null});
});
