import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { expectedReceivingCases } from '../../pos-ui/e2e/receiving-browser-native/acceptance.mjs';

const financialTables = ['orders', 'order_items', 'order_payments', 'expenses', 'product_batches', 'inventory_transactions',
  'product_batch_changes', 'sale_batch_allocations', 'checkout_commands', 'order_number_counters'];
const rowKey = row => row.id ?? `${row.draft_id ?? row.draftId}:${row.revision}`;
const sortedRows = rows => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

export function redactBusinessSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot, (key, value) => /password|token|secret|authorization/i.test(key) ? '[REDACTED]' : value));
}

export async function readSnapshotWithDeadline(readSnapshot, milliseconds) {
  let querySettled = false, timer;
  const operation = Promise.resolve().then(readSnapshot).then(
    value => { querySettled = true; return { status: 'completed', value }; },
    error => { querySettled = true; return { status: 'failed', error }; },
  );
  const deadline = new Promise(resolve => {
    timer = setTimeout(() => resolve({ status: 'deadline' }), milliseconds);
  });
  try {
    const outcome = await Promise.race([operation, deadline]);
    if (outcome.status === 'deadline') return { ...outcome, operation, get querySettled() { return querySettled; } };
    return outcome;
  } finally { clearTimeout(timer); }
}

function assertRowsSameOutsideAllowedFields(beforeRows, afterRows, allowedIds, allowedFields, table) {
  const before = new Map(beforeRows.map(row => [rowKey(row), row]));
  const after = new Map(afterRows.map(row => [rowKey(row), row]));
  assert.equal(after.size, afterRows.length, `${table} snapshot contains duplicate row identities`);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort(), `${table} row set changed unexpectedly`);
  for (const [id, oldRow] of before) {
    const newRow = after.get(id);
    if (allowedIds.has(id)) {
      const stable = row => Object.fromEntries(Object.entries(row).filter(([key]) => !allowedFields.has(key)));
      assert.deepEqual(stable(newRow), stable(oldRow), `${table} changed outside its explicit field allowlist`);
    } else assert.deepEqual(newRow, oldRow, `${table} row changed`);
  }
}

export function compareReceivingBrowserSnapshots(before, after, fixture, responses, ledgers = []) {
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
  const actorIds = new Set([fixture.ids.allowed, fixture.ids.denied]);
  const authUserIds = new Set([fixture.ids.allowed, fixture.ids.denied]);
  assertRowsSameOutsideAllowedFields(before.users, after.users, authUserIds,
    new Set(['last_login_at', 'failed_login_attempts', 'updated_at']), 'users');
  for (const id of authUserIds) {
    const oldRow = before.users.find(row => row.id === id), row = after.users.find(value => value.id === id);
    assert.ok(row && oldRow);
    assert.equal(row.failed_login_attempts, 0, 'Only successful synthetic authentication is expected');
    assert.ok(row.last_login_at, 'Each synthetic actor must complete the real login route');
    if (row.last_login_at !== oldRow.last_login_at) assert.ok(Date.parse(row.last_login_at) >= Date.parse(oldRow.last_login_at ?? '1970-01-01'));
  }

  const beforeAudit = new Map(before.audit_logs.map(row => [row.id, row]));
  const afterAudit = new Map(after.audit_logs.map(row => [row.id, row]));
  for (const [id, row] of beforeAudit) assert.deepEqual(afterAudit.get(id), row, 'Existing audit rows are append-only');
  const addedAudit = after.audit_logs.filter(row => !beforeAudit.has(row.id));
  for (const row of addedAudit) {
    assert.equal(row.tenant_id, fixture.ids.tenant); assert.ok(actorIds.has(row.user_id));
    assert.ok(['LOGIN', 'LOGOUT'].includes(row.action)); assert.equal(row.resource_type, 'users');
    assert.equal(row.resource_id, row.user_id); assert.equal(row.old_value, null); assert.equal(row.new_value, null);
  }
  const expectedAudit = responses.filter(row => row.status === 200 && ['/auth/login', '/auth/logout'].includes(row.endpoint));
  assert.deepEqual(addedAudit.map(row => `${row.user_id}/${row.action}`).sort(), expectedAudit.map(row => {
    assert.ok(actorIds.has(row.actorId), 'Successful auth response must identify one synthetic actor');
    return `${row.actorId}/${row.endpoint === '/auth/login' ? 'LOGIN' : 'LOGOUT'}`;
  }).sort(), 'Actual successful auth responses must match the exact append-only audit additions');

  const existingDraftRows = ['receiving_drafts', 'receiving_draft_revisions'];
  for (const table of existingDraftRows) {
    const oldById = new Map(before[table].map(row => [rowKey(row), row]));
    const newById = new Map(after[table].map(row => [rowKey(row), row]));
    assert.equal(newById.size, after[table].length, `${table} snapshot contains duplicate row identities`);
    for (const [id, oldRow] of oldById) assert.deepEqual(newById.get(id), oldRow, `${table} existing row was modified`);
    const additions = after[table].filter(row => !oldById.has(rowKey(row)));
    assert.ok(additions.every(row => row.tenant_id === fixture.ids.tenant && actorIds.has(row.owner_id)), `${table} has a non-fixture append`);
  }
  for (const table of Object.keys(before).filter(name => !['users', 'audit_logs', ...existingDraftRows].includes(name))) {
    assert.deepEqual(after[table], before[table], `${table} business rows must remain byte-for-byte unchanged`);
  }
  for (const table of financialTables) if (table in before) assert.deepEqual(after[table], before[table], `${table} must remain unchanged for every tenant`);

  const drafts = after.receiving_drafts.filter(row => row.tenant_id === fixture.ids.tenant);
  const revisions = after.receiving_draft_revisions.filter(row => row.tenant_id === fixture.ids.tenant);
  assert.equal(drafts.length, 6, 'Exactly six saved heads (three journeys at two viewports) are expected');
  assert.ok(drafts.every(row => row.owner_id === fixture.ids.allowed), 'No other synthetic identity may own receiving drafts');
  assert.equal(revisions.length, 10, 'Exactly ten immutable revisions are expected, including two CAS retained saves');
  assert.ok(revisions.every(row => row.owner_id === fixture.ids.allowed), 'Every revision must belong to the allowed actor');
  assert.ok(revisions.every(row => drafts.some(draft => draft.id === row.draft_id)), 'Every revision must belong to a saved fixture head');
  const titleRows = new Map(drafts.map(row => [row.title, row]));
  for (const width of [1440, 390]) {
    const tenLine = titleRows.get(`真 API 十行草稿 ${width}`);
    assert.equal(tenLine?.revision, 1); assert.equal(tenLine?.payload?.lines?.length, 10);
    assert.equal(tenLine.payload.lines[0].fields.productId, fixture.productId);
    assert.equal(tenLine.payload.lines[0].fields.quantity, '3'); assert.equal(tenLine.payload.lines[0].reviewed, false);
    assert.equal(titleRows.get(`失回應真 API 草稿 ${width}`)?.revision, 1);
  }
  for (const head of drafts) {
    const history = revisions.filter(row => row.draft_id === head.id).sort((a, b) => a.revision - b.revision);
    const isCas = /^CAS 真 API 勝者 [AB]$/.test(head.title);
    assert.deepEqual(history.map(row => row.revision), isCas ? [1, 2, 3] : [1], 'Each head needs its exact immutable history');
    assert.deepEqual(head.payload, history.at(-1).payload, 'Each head payload must equal its latest immutable revision');
    assert.equal(head.payload.title, head.title);
    const successfulSaves = responses.filter(row => row.method === 'PUT' && row.status === 200
      && row.url === `http://127.0.0.1:4287/api/v1/admin/receiving-drafts/${head.id}`);
    assert.equal(successfulSaves.length, history.length, 'Raw history must match the exact successful API saves');
  }
  const casHeads = drafts.filter(row => /^CAS 真 API 勝者 [AB]$/.test(row.title));
  assert.equal(casHeads.length, 2);
  const casLedgers = ledgers.filter(row => row.title === expectedReceivingCases[2].title);
  assert.equal(casLedgers.length, 2, 'Require the two CAS browser receipts');
  assert.deepEqual(casLedgers.map(row => row.viewport).sort((a, b) => a - b), [390, 1440], 'Require both CAS browser viewports');
  const receiptHeadIds = [];
  for (const ledger of casLedgers) {
    const receipt = ledger.casResolution;
    const head = casHeads.find(row => receipt?.draftUrl === `http://127.0.0.1:4287/api/v1/admin/receiving-drafts/${row.id}`);
    assert.ok(head, 'Each CAS receipt must identify its saved fixture head');
    receiptHeadIds.push(head.id);
    assert.equal(head.revision, 3, 'CAS head must be revision 3');
    assert.equal(head.title, receipt.retainedTitle, 'CAS head must match the retained browser title');
    assert.equal(receipt.originalTitle, `CAS 真 API 草稿 ${ledger.viewport}`);
    assert.equal(receipt.expectedRevision, 2); assert.equal(receipt.savedRevision, 3); assert.equal(receipt.reopenedRevision, 3);
    assert.equal(receipt.reopenedTitle, head.title);
    assert.deepEqual([receipt.winnerTitle, receipt.retainedTitle].sort(), ['CAS 真 API 勝者 A', 'CAS 真 API 勝者 B']);
    const history = revisions.filter(row => row.draft_id === head.id).sort((a, b) => a.revision - b.revision);
    const expectedHistory = [
      { revision: 1, title: receipt.originalTitle }, { revision: 2, title: receipt.winnerTitle }, { revision: 3, title: receipt.retainedTitle },
    ];
    assert.deepEqual(receipt.history, expectedHistory, 'CAS browser history must preserve all three versions');
    assert.deepEqual(history.map(row => ({ revision: row.revision, title: row.payload.title })), expectedHistory, 'CAS raw history must match the browser-observed original, winner and retained titles');
    const withoutTitle = payload => Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'title'));
    for (const row of history) assert.deepEqual(withoutTitle(row.payload), withoutTitle(head.payload), 'Only the title changes in the CAS journey');
  }
  assert.deepEqual(receiptHeadIds.sort(), casHeads.map(row => row.id).sort(), 'CAS browser receipts must identify distinct saved heads');
  const digests = snapshot => Object.fromEntries(Object.entries(snapshot).map(([name, rows]) => [name, {
    rows: rows.length, sha256: crypto.createHash('sha256').update(JSON.stringify(sortedRows(rows))).digest('hex'),
  }]));
  return { exactUnchangedBusinessTables: Object.keys(before).filter(name => !['users', 'audit_logs', ...existingDraftRows].includes(name)),
    financialTablesUnchanged: financialTables.filter(name => name in before), expectedAuthAuditRows: addedAudit.map(row => ({ id: row.id, actorId: row.user_id, action: row.action })),
    draftHeads: drafts.map(row => ({ id: row.id, ownerId: row.owner_id, title: row.title, revision: row.revision, payload: row.payload })),
    draftRevisions: revisions.map(row => ({ draftId: row.draft_id, ownerId: row.owner_id, revision: row.revision, payload: row.payload })),
    before: digests(before), after: digests(after) };
}
