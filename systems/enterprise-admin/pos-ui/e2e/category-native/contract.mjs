import assert from 'node:assert/strict';
import { assertBrandEvidence } from '../dialog-acceptance/brand-assets.mjs';
export const widths = [1366, 1024, 390];
export const expectedCases = widths.map(width => `stable categories preserve cart through real API at ${width}px`);
export const stages = ['initial', 'single-sku', 'empty-search', 'keyboard-category', 'pointer-category', 'empty-category', 'restored-all'];
export const origin = 'http://127.0.0.1:4290';
export const apiOrigin = 'http://127.0.0.1:4291';
export const databaseUrl = 'postgresql://test@127.0.0.1:55435/checkout_http_recovery_pos_lookup_ci';
export const readPaths = ['/checkout-context', '/shift/active', '/staff', '/categories', '/products', '/recommendations', '/reorder-forecast'].map(path => `/api/v1/admin/pos${path}`);
export function assertEnvironment(env, nodeVersion) {
  assert.equal(env.GITHUB_ACTIONS, 'true'); assert.equal(env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.match(nodeVersion, /^v22\./);
  for (const key of ['DATABASE_URL', 'POS_PRODUCT_LOOKUP_DATABASE_URL', 'CATEGORY_QA_DATABASE_URL']) assert.equal(env[key], databaseUrl);
  for (const key of ['SKU_QA_HEAD']) assert.match(env[key] ?? '', /^[a-f0-9]{40}$/);
  assert.match(env.SKU_QA_CONTAINER ?? '', /^[a-f0-9]{64}$/);
  assert.match(env.SKU_QA_NETWORK ?? '', /^github_network_[a-f0-9]+$/);
  for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']) assert.match(env[key] ?? '', /^\d+$/);
}
export function allowedRead(method, path) { return method === 'GET' && readPaths.includes(path); }
export function completionOutcome(error, cancelled) {
  const finalError = error ?? (cancelled ? new Error(`Run cancelled during cleanup: ${cancelled}`) : null);
  return { error: finalError, status: finalError ? 'failed' : 'passed' };
}
export function assertReport(report) {
  assert.deepEqual(report.errors, []);
  const specs = []; const visit = suite => { specs.push(...(suite.specs ?? [])); (suite.suites ?? []).forEach(visit); };
  report.suites.forEach(visit);
  assert.deepEqual(specs.map(spec => spec.title).sort(), [...expectedCases].sort());
  return specs.map(spec => {
    assert.equal(spec.ok, true); assert.equal(spec.tests.length, 1);
    const test = spec.tests[0]; assert.equal(test.expectedStatus, 'passed'); assert.equal(test.status, 'expected');
    assert.equal(test.results.length, 1); assert.equal(test.results[0].status, 'passed'); assert.deepEqual(test.results[0].errors, []);
    return { title: spec.title, status: 'passed', duration: test.results[0].duration };
  });
}
export function assertFonts(fonts) {
  assert.ok(fonts.some(font => font.isCustomFont === false && /Noto Sans CJK/.test(font.familyName) && font.glyphCount > 0), 'Real Chinese glyphs require the installed CJK font');
}
export function assertNetwork(browser, api) {
  assert.deepEqual(api.rejected, []);
  const observed = browser.flatMap(entry => {
    assert.equal(entry.contextClosed, true); assert.deepEqual(entry.unexpected, []); assert.deepEqual(entry.pageErrors, []);
    assertBrandEvidence(entry.verifiedBrand);
    assert.ok(entry.keys.some(event => event.key === 'Enter')); assert.ok(entry.keys.every(event => event.trusted));
    assert.ok(entry.responses.length > 0); assert.equal(entry.requests.length, entry.responses.length);
    assert.deepEqual(entry.requests.map(row => row.id).sort(), entry.responses.map(row => row.id).sort());
    return entry.responses;
  });
  assert.equal(new Set(observed.map(row => row.id)).size, observed.length);
  assert.deepEqual(observed.map(row => row.id).sort(), api.requests.map(row => row.id).sort());
  for (const row of observed) {
    assert.ok(allowedRead(row.method, new URL(row.path, origin).pathname)); assert.equal(row.status, 200);
    const actual = api.requests.find(entry => entry.id === row.id);
    assert.deepEqual(row, { id: actual.id, method: actual.method, path: actual.path, status: actual.status, sha256: actual.sha256 });
  }
  return observed.length;
}
export function assertDatabase(receipt, api) {
  assert.equal(receipt.error, null); assert.equal(receipt.beforeEmpty, true); assert.equal(receipt.afterEmpty, true); assert.equal(receipt.cancelled, null);
  assert.deepEqual(receipt.before, receipt.after, 'Browser reads must not change any fixture/business row');
  assert.equal(receipt.browser.exitCode, 0); assert.equal(receipt.browser.signal, null);
  const categories = receipt.expected.categories;
  const products = receipt.expected.products;
  assert.equal(categories.length, 3); assert.equal(products.length, 2);
  let categoryReads = 0, productReads = 0;
  for (const row of api.requests) {
    const url = new URL(row.path, origin);
    if (url.pathname.endsWith('/categories')) { assert.deepEqual(row.body, { success: true, data: categories }); categoryReads++; }
    if (url.pathname.endsWith('/products')) {
      const q = (url.searchParams.get('q') ?? '').toLowerCase(); const category = url.searchParams.get('categoryId');
      const expected = products.filter(product => (!category || product.categoryId === category) && (!q || product.sku.toLowerCase().includes(q) || product.name.toLowerCase().includes(q)) && product.stockQuantity > 0);
      assert.equal(row.body.success, true);
      assert.deepEqual(row.body.data.map(product => ({ id: product.id, sku: product.sku, name: product.name, categoryId: product.categoryId, stockQuantity: product.stockQuantity })), expected);
      productReads++;
    }
  }
  assert.ok(categoryReads >= widths.length); assert.ok(productReads >= widths.length * 5);
  return { categoryReads, productReads, businessRowsUnchanged: true, fixtureRowsRemoved: true };
}
