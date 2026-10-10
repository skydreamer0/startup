import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { assertEnvironment, allowedRead, assertFonts, assertReport, assertNetwork, assertDatabase, completionOutcome, expectedCases, databaseUrl } from './contract.mjs';
import { runOwnedPhase, publishEvidence } from './run.mjs';
import { processOwner } from '../ui-evidence/owned-process.mjs';
const env = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', DATABASE_URL: databaseUrl,
  POS_PRODUCT_LOOKUP_DATABASE_URL: databaseUrl, CATEGORY_QA_DATABASE_URL: databaseUrl,
  SKU_QA_HEAD: 'a'.repeat(40), SKU_QA_CONTAINER: 'b'.repeat(64), SKU_QA_NETWORK: 'github_network_abcd', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1' };
test('only explicit current GitHub service opt-ins enable the fixture', () => {
  assertEnvironment(env, 'v22.23.3');
  for (const key of Object.keys(env)) assert.throws(() => assertEnvironment({ ...env, [key]: undefined }, 'v22.23.3'));
  for (const url of [databaseUrl.replace('127.0.0.1', 'localhost'), databaseUrl.replace(':55435', ':5432'), databaseUrl + '?schema=other', databaseUrl + '#other', databaseUrl.replace('test@', 'test:password@'), databaseUrl.replace('checkout_http_recovery_pos_lookup_ci', 'production')]) {
    assert.throws(() => assertEnvironment({ ...env, DATABASE_URL: url, POS_PRODUCT_LOOKUP_DATABASE_URL: url, CATEGORY_QA_DATABASE_URL: url }, 'v22.23.3'));
  }
  assert.throws(() => assertEnvironment({ ...env, RUNNER_ENVIRONMENT: 'self-hosted' }, 'v22.23.3'));
  assert.throws(() => assertEnvironment(env, 'v24.19.0'));
});
test('all writes and undeclared API reads are denied before production handlers', () => {
  assert.equal(allowedRead('GET', '/api/v1/admin/pos/categories'), true);
  for (const method of ['POST', 'PATCH', 'DELETE', 'PUT', 'HEAD', 'OPTIONS']) assert.equal(allowedRead(method, '/api/v1/admin/pos/categories'), false);
  for (const endpoint of ['checkout', 'staff-login', 'refund', 'shift/open', 'customers', 'categories/other']) assert.equal(allowedRead('GET', `/api/v1/admin/pos/${endpoint}`), false);
});
test('the real locked Playwright loader collects all cases without starting a browser', () => {
  const app = fileURLToPath(new URL('../../', import.meta.url));
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'category-discovery-'));
  try {
    const text = execFileSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'e2e/category-native.config.mts', '--list'],
      { cwd: app, env: { PATH: process.env.PATH, HOME: process.env.HOME, CATEGORY_UI_OUTPUT: output }, encoding: 'utf8', timeout: 20000 });
    for (const title of expectedCases) assert.ok(text.includes(title));
    assert.match(text, /Total: 3 tests in 1 file/);
    assert.equal(fs.existsSync(path.join(output, 'tests')), false);
  } finally { fs.rmSync(output, { recursive: true, force: true }); }
});
const report = () => ({ errors: [], suites: [{ specs: expectedCases.map(title => ({ title, ok: true,
  tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', errors: [], duration: 1 }] }] })) }] });
test('missing skipped retried duplicated and failed cases cannot become a pass', () => {
  assert.equal(assertReport(report()).length, 3);
  for (const mutate of [value => value.suites[0].specs.pop(), value => value.suites[0].specs.push(value.suites[0].specs[0]),
    value => value.errors.push('failure'), value => { value.suites[0].specs[0].tests[0].results[0].status = 'skipped'; },
    value => value.suites[0].specs[0].tests[0].results.push({ status: 'passed', errors: [] })]) {
    const bad = report(); mutate(bad); assert.throws(() => assertReport(bad));
  }
});
test('actual noncustom CJK glyphs are required rather than CSS family or tofu', () => {
  assertFonts([{ familyName: 'Noto Sans CJK JP', glyphCount: 8, isCustomFont: false }]);
  for (const fonts of [[], [{ familyName: 'Noto Sans CJK TC', glyphCount: 0 }], [{ familyName: 'Arial', glyphCount: 8 }], [{ familyName: 'Noto Sans CJK JP', glyphCount: 8, isCustomFont: true }]]) assert.throws(() => assertFonts(fonts));
});
const network = () => {
  const row = { id: 'nonce:1', method: 'GET', path: '/api/v1/admin/pos/categories', status: 200, sha256: 'a'.repeat(64) };
  return { browser: [{ contextClosed: true, unexpected: [], pageErrors: [], keys: [{ key: 'Enter', trusted: true }], requests: [{ id: row.id }], responses: [row] }], api: { rejected: [], requests: [{ ...row, body: {} }] } };
};
test('browser response hashes must match unique completed real API requests', () => {
  const value = network(); assert.equal(assertNetwork(value.browser, value.api), 1);
  for (const mutate of [v => v.api.requests.pop(), v => v.api.rejected.push('POST /checkout'), v => { v.api.requests[0].sha256 = 'b'.repeat(64); },
    v => { v.browser[0].responses[0].status = 500; }, v => { v.browser[0].contextClosed = false; },
    v => v.browser[0].unexpected.push('POST /checkout'), v => { v.browser[0].keys[0].trusted = false; },
    v => v.browser[0].requests.push({ id: 'missing-response' }), v => v.browser[0].responses.push(v.browser[0].responses[0])]) {
    const bad = network(); mutate(bad); assert.throws(() => assertNetwork(bad.browser, bad.api));
  }
});
const database = () => {
  const categories = [{ id: 'a', name: '甲' }, { id: 'b', name: '乙' }, { id: 'c', name: '空' }];
  const products = [{ id: '1', sku: 'one', name: '甲', categoryId: 'a', stockQuantity: 5 }, { id: '2', sku: 'two', name: '乙', categoryId: 'b', stockQuantity: 5 }];
  const receipt = { beforeEmpty: true, afterEmpty: true, cancelled: null, before: { products }, after: { products },
    browser: { exitCode: 0, signal: null }, expected: { categories, products }, error: null };
  const requests = [
    ...Array.from({ length: 3 }, () => ({ path: '/api/v1/admin/pos/categories', body: { success: true, data: categories } })),
    ...Array.from({ length: 15 }, () => ({ path: '/api/v1/admin/pos/products?inStockOnly=true', body: { success: true, data: products } })),
    { path: '/api/v1/admin/pos/products?q=one&categoryId=a&inStockOnly=true', body: { success: true, data: [products[0]] } },
    { path: '/api/v1/admin/pos/products?q=missing&inStockOnly=true', body: { success: true, data: [] } },
  ];
  return { receipt, api: { requests } };
};
test('category and product HTTP bodies must agree with independent PG fixture rows', () => {
  const value = database(); assert.equal(assertDatabase(value.receipt, value.api).fixtureRowsRemoved, true);
  for (const mutate of [v => { v.receipt.beforeEmpty = false; }, v => { v.receipt.afterEmpty = false; },
    v => { v.receipt.cancelled = 'SIGTERM'; }, v => { v.receipt.after = { mutated: true }; },
    v => { v.receipt.browser.exitCode = 1; }, v => { v.api.requests[0].body.data = []; },
    v => { v.api.requests.at(-1).body.data = [v.receipt.expected.products[0]]; },
    v => { v.receipt.error = 'cleanup failed'; }]) {
    const bad = structuredClone(database()); mutate(bad); assert.throws(() => assertDatabase(bad.receipt, bad.api));
  }
});
test('cleanup throw or false revokes even earlier safe artifact publication', async () => {
  for (const cleanup of [async () => { throw new Error('not quiescent'); }, async () => ({ quiescent: false })]) {
    const state = { quiescent: true };
    await assert.rejects(runOwnedPhase({ run: async () => ({ quiescent: true }) }, 'unused', [], {}, state, cleanup));
    assert.equal(state.quiescent, false); assert.equal(publishEvidence(state, '/tmp/unused', undefined), false);
  }
});
test('private bootstrap prevents publication even after process quiescence', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'category-publication-'));
  try {
    const bootstrap = path.join(directory, '.bootstrap.json'), output = path.join(directory, 'github-output');
    fs.writeFileSync(bootstrap, 'synthetic-private-fixture');
    assert.throws(() => publishEvidence({ quiescent: true }, directory, output)); assert.equal(fs.existsSync(output), false);
    fs.unlinkSync(bootstrap); assert.equal(publishEvidence({ quiescent: true }, directory, output), true);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('real cancellation listener during final cleanup cannot emit an accepted receipt', async () => {
  const owner = processOwner();
  try {
    await new Promise(resolve => setImmediate(() => { process.emit('SIGTERM'); resolve(); }));
    const terminal = completionOutcome(null, owner.cancelled);
    assert.equal(terminal.status, 'failed'); assert.equal(!terminal.error, false); assert.match(terminal.error.message, /SIGTERM/);
  } finally { owner.dispose(); }
});
