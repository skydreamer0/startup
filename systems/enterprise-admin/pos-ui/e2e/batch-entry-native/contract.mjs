import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertEnvironment as staffEnvironment, databaseUrl, rawTables } from '../staff-entry-native/contract.mjs';
export { databaseUrl, rawTables };
export const origin = 'http://127.0.0.1:4290';
export const routePath = '/inventory/batches';
export const requestLimit = 64, requestSpacingMs = 550, nativeDeadlineMs = 90_000;
export const cases = [
  { id: 'batch-1440', width: 1440, height: 900, actor: 'receiverA', kind: 'full', stages: ['loading', 'selected', 'cancelled', 'read-error', 'read-recovered', 'shape-error', 'shape-recovered'] },
  { id: 'batch-1024', width: 1024, height: 768, actor: 'receiverA', kind: 'cold', stages: ['loading', 'selected', 'cancelled'] },
  { id: 'batch-reader', width: 1440, height: 900, actor: 'readerA', kind: 'reader', stages: ['reader'] },
  { id: 'batch-denied', width: 1440, height: 900, actor: 'deniedA', kind: 'denied', stages: ['denied'] },
  { id: 'batch-empty', width: 1440, height: 900, actor: 'receiverEmpty', kind: 'empty', stages: ['empty'] },
].map(row => ({ ...row, title: `existing batch entry ${row.id}` }));
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function assertEnvironment(env, version) {
  staffEnvironment({ ...env, STAFF_ENTRY_QA_DATABASE_URL: env.BATCH_ENTRY_QA_DATABASE_URL }, version);
  assert.equal(env.BATCH_ENTRY_QA_DATABASE_URL, databaseUrl);
}
export function assertReport(report) {
  assert.deepEqual(report.errors, []); const specs = [];
  const visit = suite => { specs.push(...(suite.specs ?? [])); (suite.suites ?? []).forEach(visit); }; report.suites.forEach(visit);
  assert.deepEqual(specs.map(s => s.title).sort(), cases.map(s => s.title).sort());
  return specs.map(spec => { assert.equal(spec.ok, true); assert.equal(spec.tests.length, 1); const test = spec.tests[0]; assert.equal(test.expectedStatus, 'passed'); assert.equal(test.status, 'expected'); assert.equal(test.results.length, 1); assert.equal(test.results[0].status, 'passed'); assert.deepEqual(test.results[0].errors, []); return { title: spec.title, duration: test.results[0].duration }; });
}
export function assertEvidence(database, browsers, api) {
  for (const key of ['beforeEmpty', 'afterEmpty', 'httpDrainedBeforeSnapshot', 'browserQuiescent']) assert.equal(database[key], true);
  assert.equal(database.error, null); assert.equal(database.cancelled, null); assert.equal(database.browser.exitCode, 0); assert.equal(database.browser.signal, null);
  assert.deepEqual(Object.keys(database.before).sort(), rawTables); assert.deepEqual(database.before, database.after); assert.deepEqual(api.rejected, []);
  const expected = database.expected, before = database.before;
  assert.deepEqual(expected.actors.map(row=>row.key).sort(), ['deniedA','readerA','receiverA','receiverEmpty']);
  assert.equal(expected.products.length,62);assert.equal(new Set(expected.products.map(row=>row.id)).size,62);assert.equal(expected.batches.length,2);
  assert.equal(expected.products.filter(row=>row.tenantId===expected.tenantA).length,61);
  const counts = { tenants: 3, users: 4, roles: 4, permissions: 2, role_permissions: 5, user_roles: 4, products: 62, product_batches: 2, inventory_transactions: 2 };
  for (const table of rawTables) assert.equal(before[table].length, counts[table] ?? 0, table);
  for (const actor of expected.actors) {
    assert.deepEqual(actor.grants, actor.key === 'deniedA' ? [] : actor.key === 'readerA' ? ['read:products'] : ['read:products','create:products']);
    if(actor.key!=='receiverEmpty')assert.equal(actor.tenantId,expected.tenantA);else assert.notEqual(actor.tenantId,expected.tenantA);
    const user = before.users.find(row => row.id === actor.userId); assert.ok(user); assert.equal(user.tenant_id, actor.tenantId); assert.equal(user.status, 'active'); assert.equal(user.deleted_at, null);
    assert.ok(before.user_roles.some(row => row.user_id === actor.userId && row.role_id === actor.roleId));
    assert.equal(before.roles.find(row => row.id === actor.roleId)?.tenant_id, actor.tenantId);
    const grants = before.role_permissions.filter(row => row.role_id === actor.roleId).map(row => { const permission = before.permissions.find(p => p.id === row.permission_id); assert.ok(permission); return `${permission.action}:${permission.resource}`; });
    assert.deepEqual(grants.sort(), [...actor.grants].sort());
  }
  for (const product of expected.products) {
    const row = before.products.find(row => row.id === product.id); assert.ok(row);
    for (const [wire, raw] of [['tenantId', 'tenant_id'], ['sku', 'sku'], ['name', 'name'], ['stockQuantity', 'stock_quantity']]) assert.equal(row[raw], product[wire]);
    assert.equal(Number(row.cost_price), product.costPrice); assert.equal(Number(row.retail_price), product.retailPrice);
  }
  for (const batch of expected.batches) {
    const row = before.product_batches.find(row => row.id === batch.id); assert.ok(row);
    assert.equal(row.tenant_id, batch.tenantId); assert.equal(row.product_id, batch.productId); assert.equal(row.quantity, 5); assert.equal(row.status, 'QUARANTINE');
    const receipt = before.inventory_transactions.find(row => row.batch_id === batch.id); assert.ok(receipt);
    assert.equal(receipt.product_id, batch.productId); assert.equal(receipt.tenant_id, batch.tenantId); assert.equal(receipt.type, 'IN'); assert.equal(receipt.quantity, 5); assert.equal(Number(receipt.cost_price_at_receipt), batch.costPrice);
  }
  assert.deepEqual(browsers.map(row => row.caseId).sort(), cases.map(row => row.id).sort());
  const sent = browsers.flatMap(row => row.requests).filter(row => row.dispatched);
  assert.ok(sent.length > 0 && sent.length <= requestLimit); assert.equal(new Set(sent.map(row => row.id)).size, sent.length);
  assert.equal(api.requests.length, sent.length); assert.equal(new Set(api.requests.map(row => row.id)).size, sent.length);
  for (const browser of browsers) {
    const scenario = cases.find(row => row.id === browser.caseId); const actor = expected.actors.find(row => row.key === scenario.actor);
    assert.equal(browser.contextClosed, true); assert.equal(browser.pending, 0); assert.deepEqual(browser.errors, []); assert.deepEqual(browser.pageErrors, []);
    assert.deepEqual(browser.journey.stages, scenario.stages); assert.equal(browser.journey.postCount, 0);
    for (const row of browser.requests) {
      assert.equal(row.method, 'GET'); assert.equal(row.caseId, browser.caseId); assert.equal(row.actor, actor.key);
      if (!row.dispatched) { assert.equal(row.cancelled, true); assert.equal(api.requests.some(api => api.id === row.id), false); continue; }
      const source = api.requests.find(api => api.id === row.id); assert.ok(source); assert.equal(source.userId, actor.userId); assert.equal(source.tenantId, actor.tenantId);
      for (const key of ['path', 'page', 'method', 'actor', 'caseId', 'status', 'sha256']) assert.equal(source[key], row[key]);
      assert.equal(source.sha256, digest(source.body)); assert.equal(row.delivered || row.cancelled, true);
      const restricted = source.path.endsWith('/inventory/products') || source.path.endsWith('/product-batches');
      assert.equal(source.status, actor.key === 'deniedA' && restricted ? 403 : 200);
      if (source.status === 403) { assert.equal(source.body.success, false); continue; }
      assert.equal(source.body.success, true);
      if (source.path.endsWith('/auth/me')) { assert.equal(source.body.data.id, actor.userId); assert.deepEqual([...source.body.data.permissions].sort(), [...actor.grants].sort()); }
      if (source.path.endsWith('/inventory/products')) {
        const products = expected.products.filter(p => p.tenantId === actor.tenantId).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
        const payload = source.body.data; assert.equal(payload.total, products.length); assert.equal(payload.page, row.page); assert.equal(payload.limit, 50);
        const page = products.slice((row.page - 1) * 50, row.page * 50); assert.deepEqual(payload.data.map(p => p.id), page.map(p => p.id));
        for (const p of payload.data) { const original = page.find(row => row.id === p.id); assert.equal(p.tenantId, original.tenantId); assert.equal(p.name, original.name); assert.equal(p.sku, original.sku); assert.equal(p.stockQuantity, original.stockQuantity); assert.equal(Number(p.costPrice), original.costPrice); assert.equal(Number(p.retailPrice), original.retailPrice); }
      }
      if (source.path.endsWith('/product-batches')) { const batches=expected.batches.filter(row=>row.tenantId===actor.tenantId);assert.deepEqual(source.body.data.map(row=>row.id).sort(),batches.map(row=>row.id).sort());for(const row of source.body.data){const batch=batches.find(b=>b.id===row.id);for(const key of ['tenantId','productId','batchNumber','quantity','status'])assert.equal(row[key],batch[key]);assert.equal(Number(row.costPrice),batch.costPrice);assert.equal(new Date(row.expiryDate).toISOString(),new Date(batch.expiryDate).toISOString());} }
      if (row.fault) { assert.equal(row.delivered,true); assert.equal(source.path, '/api/v1/admin/inventory/products'); assert.equal(row.page, 2); assert.equal(source.status, 200); assert.ok(['http500', 'malformed'].includes(row.fault)); const delivered = row.fault === 'http500' ? {success:false,error:{message:'Synthetic batch read transport failure'}} : {...source.body,data:{...source.body.data,data:[null]}};
        assert.equal(row.deliveredSha256,digest(delivered));assert.equal(row.deliveredStatus,row.fault==='http500'?500:200); }
    }
    for(const path of ['/api/v1/admin/auth/me','/api/v1/admin/tenants/me/plan','/api/v1/admin/product-batches','/api/v1/admin/inventory/products'])assert.ok(browser.requests.some(row=>row.path===path&&row.dispatched&&row.delivered),`Required real entry read ${path}`);
    if(['full','cold','reader'].includes(scenario.kind))assert.ok(browser.requests.some(row=>row.path.endsWith('/inventory/products')&&row.page===2&&row.delivered&&!row.fault));
    if (['full', 'cold'].includes(scenario.kind)) { assert.equal(browser.journey.loadingHeld, true); assert.equal(browser.journey.selectedProduct, expected.products.filter(row => row.tenantId === expected.tenantA).at(-1).id); assert.equal(browser.journey.cancelFocusRestored, true); }
    if (scenario.kind === 'full') for (const fault of ['http500', 'malformed']) { assert.ok(browser.requests.some(row => row.fault === fault && row.delivered)); assert.equal(browser.journey[`${fault}DraftPreserved`], true); }
    if (scenario.kind === 'reader') assert.equal(browser.journey.createDisabled, true);
    if (scenario.kind === 'denied') assert.equal(browser.journey.deniedNotEmpty, true);
    if (scenario.kind === 'empty') assert.equal(browser.journey.emptyNotError, true);
  }
  return { requests: sent.length, financialWrites: 0, rawTablesUnchanged: 33, contexts: cases.length, choicesForReceiver: 61 };
}
