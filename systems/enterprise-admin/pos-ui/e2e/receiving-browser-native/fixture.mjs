import assert from 'node:assert/strict';

export const origin = 'http://127.0.0.1:4287';
export const apiPrefix = '/api/v1/admin';
export const draftPath = `${apiPrefix}/receiving-drafts`;
export const ownedDatabaseUrl = 'postgresql://test@127.0.0.1:55438/checkout_http_recovery_receiving_drafts_ci';
export const allowedPaths = new Set([
  '/auth/login', '/auth/logout', '/auth/me', '/tenants/me/plan', '/dashboard/kpis', '/crm/metrics',
  '/analytics/kpis', '/analytics/trends', '/analytics/bonus-gate', '/analytics/heatmap',
  '/analytics/reorder-forecast', '/inventory/products', '/receiving-drafts',
]);

export function receivingRequestAllowed(method, rawUrl, expectedOrigin = origin) {
  const url = new URL(rawUrl);
  if (url.origin !== expectedOrigin || !url.pathname.startsWith(`${apiPrefix}/`)) return false;
  const endpoint = url.pathname.slice(apiPrefix.length);
  if (method === 'POST') return ['/auth/login', '/auth/logout'].includes(endpoint) && !url.search;
  if (method === 'GET') return allowedPaths.has(endpoint)
    || /^\/receiving-drafts\/[0-9a-f-]{36}(?:\/history(?:\/[1-9][0-9]*)?)?$/.test(endpoint);
  return method === 'PUT' && /^\/receiving-drafts\/[0-9a-f-]{36}$/.test(endpoint) && !url.search;
}

export function assertReceivingBrowserEnvironment(env, version) {
  assert.equal(env.GITHUB_ACTIONS, 'true');
  assert.equal(env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.match(version, /^v22\./);
  assert.equal(env.DATABASE_URL, ownedDatabaseUrl);
  assert.equal(env.RECEIVING_DRAFT_DATABASE_URL, ownedDatabaseUrl);
  assert.match(env.RECEIVING_QA_HEAD ?? '', /^[a-f0-9]{40}$/);
  assert.match(env.RECEIVING_QA_CONTAINER ?? '', /^[a-f0-9]{64}$/);
  assert.match(env.RECEIVING_QA_NETWORK ?? '', /^github_network_[a-f0-9]+$/);
  assert.match(env.GITHUB_RUN_ID ?? '', /^\d+$/);
  assert.match(env.GITHUB_RUN_ATTEMPT ?? '', /^\d+$/);
}

export function assertBrowserLedger(ledger) {
  assert.equal(ledger.realLogin, true);
  assert.equal(ledger.syntheticHttp, false);
  assert.equal(ledger.fixtureJwt, false);
  assert.equal(ledger.unexpected.length, 0);
  assert.equal(ledger.forbidden.length, 0);
  assert.ok(ledger.requests.length > 0);
  assert.ok(ledger.requests.every(row => row.allowed && (!row.api || receivingRequestAllowed(row.method, row.url))));
  assert.ok(ledger.requests.some(row => row.method === 'POST' && row.url.endsWith('/auth/login') && row.status === 200));
  assert.ok(ledger.requests.some(row => row.method === 'PUT' && row.url.includes('/receiving-drafts/') && row.status === 200));
  assert.ok(ledger.requests.some(row => row.method === 'GET' && row.url.includes('/receiving-drafts/') && row.status === 200));
  assert.equal(ledger.stockWrites, 0);
  assert.equal(ledger.orderWrites, 0);
  assert.equal(ledger.paymentWrites, 0);
  assert.equal(ledger.postingWrites, 0);
  return { requestCount: ledger.requests.length, viewports: ledger.viewports, saveCalls: ledger.saveCalls };
}
