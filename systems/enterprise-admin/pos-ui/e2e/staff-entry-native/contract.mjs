import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertEnvironment as ownedEnvironment, allowedRead, origin, apiOrigin, databaseUrl, readPaths } from '../category-native/contract.mjs';
import { assertBrandEvidence } from '../dialog-acceptance/brand-assets.mjs';
export { origin, apiOrigin, databaseUrl, readPaths };
export const rawTables = ["accounting_sync_logs", "audit_logs", "checkout_commands", "customer_tags", "customers", "daily_settlements", "expenses", "interactions", "inventory_transactions", "message_broadcasts", "order_items", "order_number_counters", "order_payments", "orders", "permissions", "product_batch_changes", "product_batches", "product_categories", "product_package_identifiers", "product_package_revisions", "product_packages", "products", "receiving_draft_revisions", "receiving_drafts", "role_permissions", "roles", "sale_batch_allocations", "shifts", "suppliers", "tags", "tenants", "user_roles", "users"];
export const loginPath = '/api/v1/admin/pos/staff-login';
export const cases = [1366, 1024, 390].map(width => ({ id: `staff-${width}`, title: `existing employee-code login and read-only POS entry at ${width}px`, width, height: width === 390 ? 844 : 768 }));
export const stages = ['login-ready', 'inactive-rejected', 'unknown-rejected', 'active-pending', 'pos-entered', 'pos-reloaded'];
export const expectedCases = cases.map(row => row.title);
export const requestLimit = 120, requestSpacingMs = 550, nativeDeadlineMs = 120_000;
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function assertEnvironment(env, version) { ownedEnvironment(env, version); assert.equal(env.STAFF_ENTRY_QA_DATABASE_URL, databaseUrl); }
export function allowedRequest(method, path) { return allowedRead(method, path) || method === 'POST' && path === loginPath; }
export function loginAttempt(body, fixture) {
  if (!body || typeof body !== 'object' || Object.keys(body).length !== 1 || typeof body.employeeCode !== 'string') return null;
  return Object.entries(fixture.codes).find(([, code]) => body.employeeCode === code)?.[0] ?? null;
}
// Explicit projection, used on BOTH real server and browser callbacks. Neither
// the token nor unknown response fields/headers/query strings enter evidence.
export function safeResponse(path, status, body) {
  if (path !== loginPath) return body;
  if (status === 200) {
    assert.equal(body?.success, true); assert.equal(typeof body.data?.accessToken, 'string'); assert.ok(body.data.accessToken.trim());
    assert.equal(typeof body.data.user?.id, 'string'); assert.equal(typeof body.data.user?.fullName, 'string');
    return { success: true, data: { accessTokenPresent: true, user: { id: body.data.user.id, fullName: body.data.user.fullName } } };
  }
  assert.equal(status, 401); assert.equal(body?.success, false);
  return { success: false, error: { rejected: true } };
}
export function assertReport(report) {
  assert.deepEqual(report.errors, []); const specs = [];
  const visit = suite => { specs.push(...(suite.specs ?? [])); (suite.suites ?? []).forEach(visit); }; report.suites.forEach(visit);
  assert.deepEqual(specs.map(row => row.title).sort(), [...expectedCases].sort());
  return specs.map(spec => { assert.equal(spec.ok, true); assert.equal(spec.tests.length, 1); const row = spec.tests[0]; assert.equal(row.expectedStatus, 'passed'); assert.equal(row.status, 'expected'); assert.equal(row.results.length, 1); assert.equal(row.results[0].status, 'passed'); assert.deepEqual(row.results[0].errors, []); return { title: spec.title, duration: row.results[0].duration }; });
}
export function assertEvidence(database, browsers, api) {
  for (const key of ['beforeEmpty','afterEmpty','httpDrainedBeforeSnapshot']) assert.equal(database[key], true);
  assert.equal(database.error, null); assert.equal(database.cancelled, null); assert.equal(database.browser.exitCode, 0); assert.equal(database.browser.signal, null);
  assert.deepEqual(database.after, database.before, 'All raw business, identity and permission rows must remain unchanged');
  assert.deepEqual(Object.keys(database.before).sort(), rawTables); assert.deepEqual(api.rejected, []);
  const expected = database.expected, before = database.before;
  const counts = { tenants: 1, users: 2, roles: 1, permissions: 1, role_permissions: 1, user_roles: 1, customers: 1, products: 1, product_batches: 1, shifts: 1 };
  for (const table of rawTables) assert.equal(before[table].length, counts[table] ?? 0, `Exact owned seed rows: ${table}`);
  assert.equal(before.tenants[0].id, expected.tenantId); assert.equal(before.tenants[0].slug, 'default');
  const active = before.users.find(row => row.id === expected.userId), inactive = before.users.find(row => row.id === expected.inactiveId);
  assert.ok(active && inactive); assert.equal(active.status, 'active'); assert.equal(inactive.status, 'suspended'); assert.equal(active.full_name, expected.fullName);
  for (const row of before.users) { assert.equal(row.tenant_id, expected.tenantId); assert.equal(row.deleted_at, null); }
  assert.equal(before.roles[0].id, expected.roleId); assert.equal(before.roles[0].tenant_id, expected.tenantId);
  assert.equal(before.permissions[0].id, expected.permissionId); assert.equal(before.permissions[0].action, 'manage'); assert.equal(before.permissions[0].resource, 'pos');
  assert.deepEqual(before.role_permissions[0], { role_id: expected.roleId, permission_id: expected.permissionId });
  assert.deepEqual(before.user_roles[0], { user_id: expected.userId, role_id: expected.roleId });
  assert.equal(before.products[0].id, expected.productId); assert.equal(before.products[0].stock_quantity, 5);
  assert.equal(before.product_batches[0].id, expected.batchId); assert.equal(before.product_batches[0].product_id, expected.productId); assert.equal(before.product_batches[0].quantity, 5);
  assert.equal(before.shifts[0].id, expected.shiftId); assert.equal(before.shifts[0].staff_id, expected.userId); assert.equal(before.shifts[0].status, 'OPEN');
  assert.deepEqual(browsers.map(row => row.test).sort(), [...expectedCases].sort());
  const sent = browsers.flatMap(row => {
    assert.equal(row.contextClosed, true); assert.equal(row.pending, 0); assert.deepEqual(row.errors, []); assert.deepEqual(row.pageErrors, []);
    assertBrandEvidence(row.verifiedBrand); assert.equal(row.journey.beforeToken, false); assert.equal(row.journey.afterToken, true);
    assert.equal(row.journey.reloadTokenUnchanged, true); assert.equal(row.journey.blankPosts, 0);
    assert.ok(row.journey.loginKeys.some(key => key.key === 'Enter' && key.trusted)); return row.requests.filter(request => request.dispatched);
  });
  assert.ok(sent.length <= requestLimit); assert.equal(new Set(sent.map(row => row.id)).size, sent.length);
  assert.deepEqual(sent.map(row => row.id).sort(), api.requests.map(row => row.id).sort());
  for (const row of sent) {
    const actual = api.requests.find(value => value.id === row.id);
    for (const key of ['caseId','method','path','status','sha256','attempt']) assert.equal(row[key], actual[key]);
    assert.equal(actual.sha256, digest(actual.body)); assert.ok(allowedRequest(row.method, row.path));
    if (row.method === 'GET') { assert.equal(actual.status, 200); assert.equal(actual.verifiedSubject, database.expected.userId); assert.equal(actual.issuedByRealLogin, true); }
  }
  for (const scenario of cases) {
    const rows = api.requests.filter(row => row.caseId === scenario.id), writes = rows.filter(row => row.method === 'POST');
    assert.deepEqual(writes.map(row => [row.attempt, row.status]), [['inactive',401],['unknown',401],['active',200]]);
    assert.equal(writes[2].body.data.user.id, database.expected.userId); assert.equal(writes[2].body.data.user.fullName, database.expected.fullName);
    assert.equal(writes[2].verifiedSubject, database.expected.userId); assert.equal(writes[2].issuedByRealLogin, true);
    for (const pathname of readPaths) assert.ok(rows.some(row => row.method === 'GET' && row.path === pathname), `Real POS entry read required: ${pathname}`);
    const contexts = rows.filter(row => row.path.endsWith('/checkout-context')); assert.ok(contexts.length >= 2, 'Entry and independent full-page reload need real identity reads');
    for (const row of contexts) assert.deepEqual(row.body, { success: true, data: { tenantId: database.expected.tenantId, userId: database.expected.userId } });
    const staff = rows.filter(row => row.path.endsWith('/staff'));
    for (const row of staff) {
      assert.equal(row.body.success, true); assert.equal(row.body.data.length, 1);
      assert.equal(row.body.data[0].id, database.expected.userId); assert.equal(row.body.data[0].fullName, database.expected.fullName);
    }
    const products = rows.filter(row => row.path.endsWith('/products'));
    for (const row of products) { assert.equal(row.body.success, true); assert.ok(row.body.data.some(product => product.id === database.expected.productId && product.stockQuantity === 5)); }
  }
  return { requests: sent.length, realLoginPosts: 9, inactiveRejected: 3, unknownRejected: 3, activeAccepted: 3, postLoginMethods: ['GET'], rawTablesUnchanged: Object.keys(database.before).length };
}
