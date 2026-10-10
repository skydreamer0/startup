import assert from 'node:assert/strict';
import test from 'node:test';
import { assertEnvironment, allowedRequest, assertReport, assertEvidence, expectedCases, widths, databaseUrl } from './contract.mjs';
import { brandAssets, brandRequest } from '../dialog-acceptance/brand-assets.mjs';
import { origin } from './contract.mjs';
const prefix = '/api/v1/admin/pos';
test('stock opt-in retains the existing exact owned CI database guard', () => {
  const env = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', DATABASE_URL: databaseUrl,
    POS_PRODUCT_LOOKUP_DATABASE_URL: databaseUrl, CATEGORY_QA_DATABASE_URL: databaseUrl, STOCK_QA_DATABASE_URL: databaseUrl,
    SKU_QA_HEAD: 'a'.repeat(40), SKU_QA_CONTAINER: 'b'.repeat(64), SKU_QA_NETWORK: 'github_network_abcd', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1' };
  assertEnvironment(env, 'v22.23.3');
  for (const key of Object.keys(env)) assert.throws(() => assertEnvironment({ ...env, [key]: undefined }, 'v22.23.3'));
  assert.throws(() => assertEnvironment({ ...env, STOCK_QA_DATABASE_URL: databaseUrl + '?schema=other' }, 'v22.23.3'));
  assert.throws(() => assertEnvironment(env, 'v24.19.0'));
});
test('only the existing checkout and UUID refund writes are allowlisted', () => {
  assert.ok(allowedRequest('POST', `${prefix}/checkout`));
  assert.ok(allowedRequest('POST', `${prefix}/orders/${'a'.repeat(36)}/refund`));
  for (const path of ['/staff-login', '/shift/open', '/categories', '/orders/not-uuid/refund', '/customers']) assert.equal(allowedRequest('POST', prefix + path), false);
  for (const method of ['PATCH', 'DELETE', 'PUT']) assert.equal(allowedRequest(method, prefix + '/checkout'), false);
});
const report = () => ({ errors: [], suites: [{ specs: expectedCases.map(title => ({ title, ok: true,
  tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', errors: [], duration: 1 }] }] })) }] });
test('omitted skipped retried or failed cases cannot pass', () => {
  assert.equal(assertReport(report()).length, 2);
  for (const mutate of [r => r.suites[0].specs.pop(), r => r.errors.push('failure'), r => { r.suites[0].specs[0].tests[0].results[0].status = 'skipped'; }, r => r.suites[0].specs[0].tests[0].results.push({ status: 'passed', errors: [] })]) {
    const bad = report(); mutate(bad); assert.throws(() => assertReport(bad));
  }
});
function evidence() {
  const database = { error: null, cancelled: null, beforeEmpty: true, afterEmpty: true, browser: { exitCode: 0, signal: null },
    finalSnapshots: {}, before: { users: ['unchanged'], order_items: [] }, after: { users: ['unchanged'], order_items: [] } };
  const api = { rejected: [], requests: [] }, browser = [];
  for (const [index, width] of widths.entries()) {
    const sale = { product: { stockQuantity: 4 }, batch: { quantity: 4 }, orders: [{ id: String(index), status: 'completed', discountNote: null, updatedAt: 'before' }],
      items: [{ quantity: 1, finalUnitPrice: '20' }], payments: [{ id: 'payment' }], movements: [{ type: 'OUT', quantity: 1 }], allocations: [{ quantity: 1 }], commands: [{ status: 'SUCCEEDED' }], counters: [{ lastSequence: 1 }] };
    const refund = structuredClone(sale); Object.assign(refund.orders[0], { status: 'refunded', discountNote: '[退款] 合成驗收退款', updatedAt: 'after' });
    const rows = [
      { method: 'POST', path: `${prefix}/checkout`, phase: 'checkout-failure', body: { data: { id: String(index) } }, snapshot: sale },
      { method: 'GET', path: `${prefix}/products?inStockOnly=true`, phase: 'checkout-failure', body: { error: 'injected' }, snapshot: sale, injected: true },
      { method: 'GET', path: `${prefix}/products?inStockOnly=true`, phase: 'checkout-recovery', body: { data: [{ stockQuantity: 4 }] }, snapshot: sale },
      { method: 'POST', path: `${prefix}/orders/${String(index)}/refund`, phase: 'refund-failure', body: { data: { id: String(index) } }, snapshot: refund },
      { method: 'GET', path: `${prefix}/products?inStockOnly=true`, phase: 'refund-failure', body: { error: 'injected' }, snapshot: refund, injected: true },
      { method: 'GET', path: `${prefix}/products?inStockOnly=true`, phase: 'refund-recovery', body: { data: [{ stockQuantity: 4 }] }, snapshot: refund },
    ].map((row, i) => ({ ...row, width, id: `${width}:${i}`, status: row.injected ? 500 : row.path.endsWith('/checkout') ? 201 : 200, sha256: 'a'.repeat(64) }));
    // Use a real UUID-shaped identifier in both order receipts and refund path.
    const id = `${index}`.padStart(36, 'a');
    sale.orders[0].id = id; refund.orders[0].id = id; rows[0].body.data.id = id; rows[3].body.data.id = id; rows[3].path = `${prefix}/orders/${id}/refund`;
    api.requests.push(...rows); database.finalSnapshots[width] = refund;
    database.after.order_items.push(...refund.items);
    browser.push({ test: expectedCases[index], contextClosed: true, unexpected: [], pageErrors: [], verifiedBrand: brandAssets.map(asset => ({ method: 'GET', ...asset })), requests: rows.map(row => ({ id: row.id })), responses: rows.map(({ id, method, path, status, sha256 }) => ({ id, method, path, status, sha256 })) });
  }
  database.after.order_items.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return { database, api, browser };
}
test('native receipt rejects stock restoration write retry false recovery and failed cleanup', () => {
  const value = evidence(); assert.equal(assertEvidence(value.database, value.browser, value.api).noWriteRetries, true);
  for (const mutate of [
    v => { v.database.afterEmpty = false; }, v => { v.database.cancelled = 'SIGTERM'; }, v => { v.database.error = 'cleanup failed'; },
    v => { v.api.requests[3].snapshot.product.stockQuantity = 5; },
    v => { v.api.requests[3].snapshot.items[0].finalUnitPrice = '999'; },
    v => { v.database.after.order_items[0].quantity = 99; },
    v => { v.api.requests[2].body.data[0].stockQuantity = 5; },
    v => { v.api.requests[2].sha256 = 'b'.repeat(64); },
    v => { v.api.requests[1].injected = false; },
    v => v.api.rejected.push('duplicate POST'),
    v => { v.database.after.users = ['changed']; },
    v => { v.browser[0].contextClosed = false; },
    v => { delete v.browser[0].verifiedBrand; }, v => { v.browser[0].verifiedBrand[0].sha256 = '0'.repeat(64); },
    v => { v.browser[0].verifiedBrand[0].mime = 'text/html'; }, v => { v.browser[0].verifiedBrand[0].bytes++; },
    v => { v.browser[0].verifiedBrand[0].method = 'POST'; }, v => { v.browser[0].verifiedBrand[0].path = '/brand/unknown.svg'; },
  ]) {
    const bad = structuredClone(evidence()); mutate(bad); assert.throws(() => assertEvidence(bad.database, bad.browser, bad.api));
  }
});
test('stock brand paths never become API writes or allow arbitrary static requests', () => {
  for (const asset of brandAssets) {
    assert.equal(brandRequest(new URL(origin + asset.path), 'GET', origin), asset);
    assert.equal(allowedRequest('GET', asset.path), false);
    assert.equal(allowedRequest('POST', asset.path), false);
    for (const [url, method] of [
      [origin + asset.path, 'HEAD'], [origin + asset.path, 'POST'],
      [origin + asset.path + '?v=1', 'GET'], ['https://unexpected.invalid' + asset.path, 'GET'],
      ['http://user:pass@127.0.0.1:4290' + asset.path, 'GET'],
      [origin + '/brand/flow-capsule-v1/unknown.png', 'GET'],
    ]) assert.equal(brandRequest(new URL(url), method, origin), undefined);
  }
});
