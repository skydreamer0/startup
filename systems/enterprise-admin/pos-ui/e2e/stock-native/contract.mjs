import assert from 'node:assert/strict';
import { assertEnvironment as categoryEnvironment, allowedRead, databaseUrl, origin, apiOrigin } from '../category-native/contract.mjs';
export { databaseUrl, origin, apiOrigin };
export const widths = [1366, 1024];
export const expectedCases = widths.map(width => `confirmed checkout and money-only refund recover stale stock at ${width}px`);
export const phases = ['initial', 'checkout-failure', 'checkout-recovery', 'refund-failure', 'refund-recovery'];
export const stages = ['checkout-stale', 'checkout-recovered', 'refund-stale', 'refund-recovered'];
const prefix = '/api/v1/admin/pos';
export function allowedRequest(method, pathname) {
  return allowedRead(method, pathname) || method === 'GET' && pathname === `${prefix}/orders/today`
    || method === 'POST' && (pathname === `${prefix}/checkout` || new RegExp(`^${prefix}/orders/[a-f0-9-]{36}/refund$`).test(pathname));
}
export function assertEnvironment(env, version) {
  categoryEnvironment(env, version);
  assert.equal(env.STOCK_QA_DATABASE_URL, databaseUrl);
}
export function assertReport(report) {
  // Use the same strict single-attempt validator with this slice's exact inventory.
  const cloned = structuredClone(report);
  const specs = []; const visit = suite => { specs.push(...(suite.specs ?? [])); (suite.suites ?? []).forEach(visit); };
  cloned.suites.forEach(visit);
  assert.deepEqual(specs.map(spec => spec.title).sort(), [...expectedCases].sort());
  assert.deepEqual(cloned.errors, []);
  return specs.map(spec => {
    assert.equal(spec.ok, true); assert.equal(spec.tests.length, 1);
    const test = spec.tests[0]; assert.equal(test.expectedStatus, 'passed'); assert.equal(test.status, 'expected');
    assert.equal(test.results.length, 1); assert.equal(test.results[0].status, 'passed'); assert.deepEqual(test.results[0].errors, []);
    return { title: spec.title, status: 'passed', duration: test.results[0].duration };
  });
}
export function assertEvidence(database, browser, api) {
  assert.equal(database.error, null); assert.equal(database.cancelled, null);
  assert.equal(database.beforeEmpty, true); assert.equal(database.afterEmpty, true);
  assert.equal(database.browser.exitCode, 0); assert.equal(database.browser.signal, null);
  assert.deepEqual(api.rejected, []);
  assert.deepEqual(browser.map(row => row.test).sort(), [...expectedCases].sort());
  const responses = browser.flatMap(row => {
    assert.equal(row.contextClosed, true); assert.deepEqual(row.unexpected, []); assert.deepEqual(row.pageErrors, []);
    assert.deepEqual(row.requests.map(r => r.id).sort(), row.responses.map(r => r.id).sort());
    return row.responses;
  });
  assert.equal(new Set(responses.map(row => row.id)).size, responses.length);
  assert.deepEqual(responses.map(row => row.id).sort(), api.requests.map(row => row.id).sort());
  for (const row of responses) {
    const actual = api.requests.find(r => r.id === row.id);
    assert.deepEqual(row, { id: actual.id, method: actual.method, path: actual.path, status: actual.status, sha256: actual.sha256 });
    assert.ok(allowedRequest(row.method, new URL(row.path, origin).pathname));
    const checkout = row.method === 'POST' && new URL(row.path, origin).pathname === `${prefix}/checkout`;
    assert.equal(row.status, actual.injected ? 500 : checkout ? 201 : 200);
  }
  for (const width of widths) {
    const rows = api.requests.filter(row => row.width === width);
    const writes = rows.filter(row => row.method === 'POST');
    assert.equal(writes.length, 2, 'Exactly one checkout and one refund; no write retry');
    assert.ok(writes[0].path.endsWith('/checkout')); assert.ok(writes[1].path.endsWith(`/orders/${writes[0].body.data.id}/refund`));
    assert.equal(writes[0].body.data.id, writes[0].snapshot.orders[0].id);
    assert.equal(writes[1].body.data.id, writes[1].snapshot.orders[0].id);
    assert.equal(writes[0].snapshot.orders[0].status, 'completed'); assert.equal(writes[1].snapshot.orders[0].status, 'refunded');
    const sale = writes[0].snapshot, refund = writes[1].snapshot;
    for (const snapshot of [sale, refund]) {
      assert.equal(snapshot.product.stockQuantity, 4); assert.equal(snapshot.batch.quantity, 4);
      assert.equal(snapshot.orders.length, 1); assert.equal(snapshot.payments.length, 1);
      assert.equal(snapshot.items.length, 1); assert.equal(snapshot.items[0].quantity, 1);
      assert.equal(snapshot.movements.length, 1); assert.equal(snapshot.movements[0].type, 'OUT'); assert.equal(snapshot.movements[0].quantity, 1);
      assert.equal(snapshot.allocations.length, 1); assert.equal(snapshot.allocations[0].quantity, 1);
      assert.equal(snapshot.commands.length, 1); assert.equal(snapshot.commands[0].status, 'SUCCEEDED');
    }
    for (const key of ['product', 'batch', 'items', 'payments', 'movements', 'allocations', 'commands', 'counters']) assert.deepEqual(refund[key], sale[key], `Refund must preserve ${key}`);
    const { status: saleStatus, discountNote: saleNote, updatedAt: saleUpdated, ...saleOrder } = sale.orders[0];
    const { status: refundStatus, discountNote: refundNote, updatedAt: refundUpdated, ...refundOrder } = refund.orders[0];
    assert.deepEqual(refundOrder, saleOrder); assert.ok(refundNote.includes('[退款] 合成驗收退款'));
    for (const phase of ['checkout-failure', 'refund-failure']) assert.ok(rows.some(row => row.phase === phase && row.injected && new URL(row.path, origin).pathname.endsWith('/products')));
    for (const phase of ['checkout-recovery', 'refund-recovery']) {
      const reads = rows.filter(row => row.phase === phase && new URL(row.path, origin).pathname.endsWith('/products'));
      assert.ok(reads.length > 0);
      reads.forEach(row => { assert.equal(row.status, 200); assert.equal(row.body.data[0].stockQuantity, 4); assert.equal(row.snapshot.product.stockQuantity, 4); });
    }
    assert.deepEqual(database.finalSnapshots[width], refund, 'Reads and retries after refund must not mutate business state');
  }
  const changedTables = ['products', 'product_batches', 'orders', 'order_items', 'order_payments', 'inventory_transactions', 'sale_batch_allocations', 'checkout_commands', 'order_number_counters'];
  assert.deepEqual(Object.keys(database.before), Object.keys(database.after));
  for (const table of Object.keys(database.before)) if (!changedTables.includes(table)) assert.deepEqual(database.after[table], database.before[table], `Unrelated table ${table} must be unchanged`);
  assert.deepEqual(database.before.order_items, []);
  const items = widths.flatMap(width => database.finalSnapshots[width].items).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  assert.deepEqual(database.after.order_items, items, 'Full database rows must match the final sold-item snapshots');
  return { requests: responses.length, checkouts: widths.length, refunds: widths.length, refundPhysicalStockUnchanged: true, noWriteRetries: true };
}
