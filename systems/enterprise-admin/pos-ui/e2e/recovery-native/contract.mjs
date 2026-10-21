import assert from 'node:assert/strict';
import { assertBrandEvidence } from '../dialog-acceptance/brand-assets.mjs';
import { createHash } from 'node:crypto';
import { assertEnvironment as ownedEnvironment, allowedRead, origin, apiOrigin, databaseUrl } from '../category-native/contract.mjs';
export { origin, apiOrigin, databaseUrl };
export const cases = [
  { id: 'query-refund', title: 'unknown checkout query then money-only refund at 390px', width: 1366, height: 768, mode: 'unknown', recovery: 'query' },
  { id: 'retry', title: 'unknown checkout replays the same intent at 1024px', width: 1024, height: 768, mode: 'unknown', recovery: 'retry' },
  { id: 'conflict', title: 'real checkout conflict stays frozen after query at 390px', width: 390, height: 844, mode: 'conflict', recovery: 'query' },
];
export const stagesByCase = {
  'query-refund': ['unknown-or-conflict','after-refresh','original-order-confirmed','lookup-keyboard-390','refund-open-390','refund-short-keyboard-390','refund-pending-390','refund-complete-390'],
  retry: ['unknown-or-conflict','after-refresh','original-order-confirmed'],
  conflict: ['unknown-or-conflict','after-refresh','conflict-remains-frozen'],
};
export const expectedCases = cases.map(row => row.title);
export const prefix = '/api/v1/admin/pos';
export const phases = ['initial', 'submit', 'prime', 'reload', 'recover', 'refund', 'complete'];
export const requestLimit = 180;
export const requestSpacingMs = 550; // At most 110/minute, below unchanged POS 120/minute.
export const nativeDeadlineMs = 180_000;
const uuid = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
export function allowedRequest(method, pathname) {
  return allowedRead(method, pathname) || method === 'GET' && (pathname === `${prefix}/orders/today` || new RegExp(`^${prefix}/checkout-commands/${uuid}$`).test(pathname))
    || method === 'POST' && (pathname === `${prefix}/checkout` || new RegExp(`^${prefix}/orders/${uuid}/refund$`).test(pathname));
}
export function assertEnvironment(env, version) { ownedEnvironment(env, version); assert.equal(env.RECOVERY_QA_DATABASE_URL, databaseUrl); }
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function safePayload(value) {
  assert.ok(value && typeof value === 'object');
  // Exactly the frozen business fields. Never retain Authorization, adminPin or arbitrary input.
  const result = Object.fromEntries(['commandId', 'paymentMethod', 'orderDiscountAmount', 'orderDiscountNote', 'customerId', 'shiftId', 'salesStaffId'].filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
  if (Array.isArray(value.cartItems)) result.cartItems = value.cartItems.map(({ productId, quantity, discountRate }) => ({ productId, quantity, ...(discountRate === undefined ? {} : { discountRate }) }));
  if (Array.isArray(value.payments)) result.payments = value.payments.map(({ method, amount }) => ({ method, amount }));
  return result;
}
export function authorizeOwnedWrite(caseId, index, pathname, phase, body, fixture, original) {
  if (!cases.some(row => row.id === caseId) || index < 0 || index > 1) return false;
  if (caseId === 'query-refund' && index === 1) return phase === 'refund' && !!original?.orderId && pathname === `${prefix}/orders/${original.orderId}/refund`
    && body?.reason === '合成原生退款' && Object.keys(body).every(key => key === 'reason');
  if (pathname !== `${prefix}/checkout` || !body || Object.keys(body).some(key => !['commandId','cartItems','paymentMethod','payments','orderDiscountAmount','orderDiscountNote','customerId','shiftId','salesStaffId'].includes(key))) return false;
  const quantity = caseId === 'conflict' && index === 0 ? 2 : 1;
  if (!new RegExp(`^${uuid}$`).test(body.commandId ?? '') || body.shiftId !== fixture.shiftId || body.paymentMethod !== 'CASH'
      || !Array.isArray(body.cartItems) || body.cartItems.length !== 1 || body.cartItems[0].productId !== fixture.productId
      || body.cartItems[0].quantity !== quantity || (body.cartItems[0].discountRate ?? 0) !== 0
      || (body.orderDiscountAmount ?? 0) !== 0 || (body.orderDiscountNote ?? '') !== '' || body.payments?.length || body.customerId
      || body.salesStaffId && body.salesStaffId !== fixture.userId) return false;
  if (index === 0) return phase === (caseId === 'conflict' ? 'prime' : 'submit');
  return phase === (caseId === 'conflict' ? 'submit' : 'recover') && body.commandId === original?.payload?.commandId
    && (caseId === 'conflict' || digest(safePayload(body)) === digest(safePayload(original.payload)));
}
export function assertReport(report) {
  assert.deepEqual(report.errors, []); const specs = [];
  const visit = suite => { specs.push(...(suite.specs ?? [])); (suite.suites ?? []).forEach(visit); };
  report.suites.forEach(visit); assert.deepEqual(specs.map(row => row.title).sort(), [...expectedCases].sort());
  return specs.map(spec => { assert.equal(spec.ok, true); assert.equal(spec.tests.length, 1); const test = spec.tests[0]; assert.equal(test.expectedStatus, 'passed'); assert.equal(test.status, 'expected'); assert.equal(test.results.length, 1); assert.equal(test.results[0].status, 'passed'); assert.deepEqual(test.results[0].errors, []); return { title: spec.title, duration: test.results[0].duration }; });
}
function assertWireOrder(body, snapshot, includePayments) {
  assert.equal(body.success, true, 'Real order response must report success');
  const { items, payments, ...order } = body.data;
  assert.deepEqual(order, snapshot.orders[0], 'Every returned order scalar must match persisted identity, status and money');
  const sort = rows => [...rows].sort((a, b) => a.id.localeCompare(b.id));
  // Prisma Decimal JSON is a string; raw row_to_json decimals are numbers.
  // This fixed projection mirrors the unchanged OrderItem schema, not wire input.
  const expectedItems = snapshot.items.map(row => ({
    id: row.id, orderId: row.order_id, productId: row.product_id, quantity: row.quantity,
    unitPrice: String(row.unit_price), discountRate: Number(row.discount_rate),
    finalUnitPrice: row.final_unit_price === null ? null : String(row.final_unit_price),
  }));
  assert.deepEqual(sort(items), sort(expectedItems), 'Every returned line must match the actual persisted line');
  if (includePayments) assert.deepEqual(sort(payments), sort(snapshot.payments), 'Returned payments must match persisted payments');
  else assert.equal(payments, undefined, 'Refund uses the unchanged order-with-items response');
}
function assertSale(snapshot, quantity, own) {
  assert.ok(own); assert.equal(snapshot.product.id, own.productId); assert.equal(snapshot.product.tenantId, own.tenantId);
  assert.equal(snapshot.batch.id, own.batchId); assert.equal(snapshot.batch.productId, own.productId); assert.equal(snapshot.batch.tenantId, own.tenantId);
  assert.equal(snapshot.orders[0]?.tenantId, own.tenantId); assert.equal(snapshot.orders[0]?.shiftId, own.shiftId); assert.equal(snapshot.orders[0]?.salesStaffId, own.userId);
  for (const key of ['payments','movements','allocations','commands','counters']) for (const row of snapshot[key]) assert.equal(row.tenantId, own.tenantId);
  for (const [table, rows] of Object.entries(snapshot.raw)) if (table !== 'order_items') for (const row of rows) assert.equal(row.tenant_id, own.tenantId);

  assert.equal(snapshot.product.stockQuantity, 5 - quantity); assert.equal(snapshot.batch.quantity, 5 - quantity);
  for (const key of ['orders', 'payments', 'items', 'movements', 'allocations', 'commands', 'counters']) assert.equal(snapshot[key].length, 1, `Exactly one ${key} row`);
  assert.equal(snapshot.items[0].quantity, quantity); assert.equal(snapshot.movements[0].quantity, quantity); assert.equal(snapshot.movements[0].type, 'OUT'); assert.equal(snapshot.allocations[0].quantity, quantity);
  assert.equal(snapshot.commands[0].status, 'SUCCEEDED'); assert.equal(Number(snapshot.orders[0].totalAmount), quantity * 20); assert.equal(Number(snapshot.payments[0].amount), quantity * 20);
  assert.equal(Number(snapshot.product.retailPrice), 20); assert.equal(Number(snapshot.product.costPrice), 10); assert.equal(Number(snapshot.batch.costPrice), 10);
  assert.equal(snapshot.orders[0].paymentMethod, 'CASH'); assert.equal(snapshot.orders[0].paymentStatus, 'paid'); assert.equal(Number(snapshot.orders[0].discountAmount), 0);
  assert.equal(snapshot.payments[0].method, 'CASH'); assert.equal(snapshot.payments[0].orderId, snapshot.orders[0].id);
  assert.equal(Number(snapshot.items[0].unit_price), 20); assert.equal(Number(snapshot.items[0].final_unit_price), 20); assert.equal(Number(snapshot.items[0].discount_rate), 0);
  assert.equal(snapshot.movements[0].productId, own.productId); assert.equal(snapshot.movements[0].referenceId, snapshot.orders[0].id);
  assert.equal(snapshot.allocations[0].productId, own.productId); assert.equal(snapshot.allocations[0].batchId, own.batchId);
  assert.equal(snapshot.allocations[0].orderId, snapshot.orders[0].id); assert.equal(snapshot.allocations[0].orderItemId, snapshot.items[0].id); assert.equal(snapshot.allocations[0].movementId, snapshot.movements[0].id);
  assert.equal(snapshot.counters[0].lastSequence, 1);

}
export function assertEvidence(database, browsers, api) {
  assert.equal(database.error, null); assert.equal(database.cancelled, null); assert.equal(database.beforeEmpty, true); assert.equal(database.afterEmpty, true); assert.equal(database.httpDrainedBeforeSnapshot, true);
  assert.equal(database.browser.exitCode, 0); assert.equal(database.browser.signal, null); assert.deepEqual(api.rejected, []);
  assert.deepEqual(browsers.map(row => row.test).sort(), [...expectedCases].sort());
  const sent = browsers.flatMap(row => {
    assert.equal(row.contextClosed, true); assert.equal(row.pending, 0); assert.deepEqual(row.errors, []); assert.deepEqual(row.pageErrors, []);
    assertBrandEvidence(row.verifiedBrand); assert.ok(row.requests.length > 0); return row.requests.filter(request => request.dispatched);
  });
  assert.ok(sent.length <= requestLimit); assert.equal(new Set(sent.map(row => row.id)).size, sent.length);
  assert.deepEqual(sent.map(row => row.id).sort(), api.requests.map(row => row.id).sort());
  for (const row of sent) {
    const actual = api.requests.find(value => value.id === row.id); assert.equal(row.caseId, actual.caseId); assert.equal(row.method, actual.method); assert.equal(row.path, actual.path); assert.equal(row.status, actual.status); assert.equal(row.sha256, actual.sha256); assert.equal(actual.sha256, digest(actual.body));
    assert.ok(allowedRequest(row.method, new URL(row.path, origin).pathname));
    if (row.method === 'POST' && row.path === `${prefix}/checkout`) assert.deepEqual(row.payload, actual.payload);
  }
  for (const scenario of cases) {
    const rows = api.requests.filter(row => row.caseId === scenario.id), writes = rows.filter(row => row.method === 'POST'); assert.equal(writes.length, 2);
    const first = writes[0], second = writes[1]; assert.equal(first.path, `${prefix}/checkout`); assert.equal(first.status, 201); assertSale(first.snapshot, scenario.mode === 'conflict' ? 2 : 1, database.expected[scenario.id]);
    assert.equal(first.snapshot.orders[0].status, 'completed'); assertWireOrder(first.body, first.snapshot, true);
    assert.equal(first.snapshot.commands[0].kind, 'POS_CHECKOUT'); assert.equal(first.snapshot.commands[0].commandId, first.payload.commandId); assert.equal(first.snapshot.commands[0].orderId, first.body.data.id); assert.deepEqual(first.snapshot.commands[0].result, first.body.data);
    for (const item of first.snapshot.items) { assert.equal(item.order_id, first.body.data.id); assert.equal(item.product_id, database.expected[scenario.id].productId); }
    if (scenario.id === 'query-refund') {
      assert.equal(second.path, `${prefix}/orders/${first.body.data.id}/refund`); assert.equal(second.status, 200); assertSale(second.snapshot, 1, database.expected[scenario.id]);
      assertWireOrder(second.body, second.snapshot, false);
      for (const key of ['product', 'batch', 'items', 'payments', 'movements', 'allocations', 'commands', 'counters']) assert.deepEqual(second.snapshot[key], first.snapshot[key], `Refund must preserve ${key}`);
      for (const table of Object.keys(first.snapshot.raw)) if (table !== 'orders') assert.deepEqual(second.snapshot.raw[table], first.snapshot.raw[table], `Raw refund preservation: ${table}`);
      const rawStrip = ({ status, discount_note, updated_at, ...rest }) => rest; assert.deepEqual(second.snapshot.raw.orders.map(rawStrip), first.snapshot.raw.orders.map(rawStrip));
      const strip = ({ status, discountNote, updatedAt, ...rest }) => rest;
      assert.deepEqual(strip(second.snapshot.orders[0]), strip(first.snapshot.orders[0])); assert.equal(second.snapshot.orders[0].status, 'refunded'); assert.ok(second.snapshot.orders[0].discountNote.includes('[退款] 合成原生退款'));
    } else {
      assert.equal(second.path, `${prefix}/checkout`); assert.equal(second.status, scenario.mode === 'conflict' ? 409 : 201); assert.deepEqual(second.snapshot, first.snapshot);
      assert.equal(second.payload.commandId, first.payload.commandId);
      if (scenario.mode === 'conflict') { assert.equal(second.body.error.code, 'COMMAND_PAYLOAD_CONFLICT'); assert.equal(first.payload.cartItems[0].quantity, 2); assert.equal(second.payload.cartItems[0].quantity, 1); }
      else { assert.deepEqual(second.payload, first.payload); assert.deepEqual(second.body, first.body); }
    }
    assert.deepEqual(database.finalSnapshots[scenario.id], second.snapshot);
    if (scenario.recovery === 'query') {
      const lookups = rows.filter(row => row.path === `${prefix}/checkout-commands/${first.payload.commandId}`); assert.ok(lookups.length > 0);
      for (const lookup of lookups) { assert.equal(lookup.status, 200); assert.equal(lookup.body.data.status, 'SUCCEEDED'); assert.equal(lookup.body.data.commandId, first.payload.commandId); assert.match(lookup.body.data.payloadHash, /^[a-f0-9]{64}$/); assert.equal(lookup.body.data.payloadHash, first.snapshot.commands[0].payloadHash); assert.deepEqual(lookup.body.data.result, first.body.data); }
    }
    const browser = browsers.find(row => row.caseId === scenario.id); assert.ok(browser.keys.some(row => row.key === 'Enter' && row.trusted));
    assert.equal(browser.journey.commandId, first.payload.commandId); assert.equal(browser.journey.noReplacementCommand, true);
    if (scenario.mode === 'unknown') { assert.equal(browser.requests.filter(row => row.droppedAfterCommit).length, 1); assert.equal(browser.journey.restoredStatus, 'unknown'); }
    else { assert.equal(browser.journey.restoredStatus, 'conflict'); assert.equal(browser.journey.conflictFrozenAfterRealQuery, true); assert.equal(browser.requests.filter(row => row.phase === 'prime').length, 1); }
    if (scenario.id === 'query-refund') { assert.equal(browser.journey.cancelSubmitCount, 0); assert.equal(browser.journey.pendingDismissCount, 0); assert.equal(browser.journey.refundViewport, 390); assert.deepEqual(browser.journey.draftBeforeRefund, browser.journey.draftAfterRefund); }
  }
  const mutable = new Set(['products', 'product_batches', 'orders', 'order_items', 'order_payments', 'inventory_transactions', 'sale_batch_allocations', 'checkout_commands', 'order_number_counters']);
  assert.deepEqual(Object.keys(database.before), Object.keys(database.after));
  for (const table of Object.keys(database.before)) if (!mutable.has(table)) assert.deepEqual(database.after[table], database.before[table], `Unrelated ${table}`);
  const sort = rows => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  for (const table of mutable) {
    const expected = cases.flatMap(row => database.finalSnapshots[row.id].raw[table]);
    assert.deepEqual(database.after[table], sort(expected), `Every final raw ${table} row must match the per-case snapshots`);
  }

  return { requests: sent.length, actualCheckoutPosts: 5, actualRefundPosts: 1, committedOrders: 3, unchangedRefundStock: true, conflictWrites: 0, replayWrites: 0 };
}
