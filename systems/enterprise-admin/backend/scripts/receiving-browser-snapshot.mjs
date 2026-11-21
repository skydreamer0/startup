import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { origin, draftPath } from '../../pos-ui/e2e/receiving-browser-native/fixture.mjs';

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

export function compareReceivingBrowserSnapshots(before, after, fixture, responses, ledgers) {
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
  const actorIds = new Set([fixture.ids.allowed, fixture.ids.denied, fixture.peerId]);
  assertRowsSameOutsideAllowedFields(before.users, after.users, actorIds,
    new Set(['last_login_at', 'failed_login_attempts', 'updated_at']), 'users');
  for (const id of actorIds) {
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
  assert.equal(drafts.length, 8, 'Six original heads and two peer-isolation heads required');
  assert.equal(revisions.length, 10, 'Eight original revisions and two peer-isolation revisions required');
  const receipt = ledgers.find(row => row.ownerIsolation)?.ownerIsolation;
  assert.ok(receipt && fixture.peerId && fixture.peerId !== fixture.ids.allowed);
  assert.equal(receipt.tenantId, fixture.ids.tenant);
  assert.equal(receipt.ownerId, fixture.ids.allowed);
  assert.equal(receipt.peerId, fixture.peerId);
  for (const [title, ownerId, url] of [
    ['同租戶驗收 A 私人草稿', fixture.ids.allowed, receipt.ownerUrl],
    ['同租戶驗收 B 私人草稿', fixture.peerId, receipt.peerUrl],
  ]) {
    const head = drafts.find(row => row.title === title);
    assert.equal(head?.owner_id, ownerId);
    assert.equal(url, origin + draftPath + '/' + head.id);
    assert.equal(head.revision, 1);
    const history = revisions.filter(row => row.draft_id === head.id);
    assert.equal(history.length, 1);
    assert.equal(history[0].revision, 1);
    assert.deepEqual(history[0].payload, head.payload);
    assert.equal(head.payload.title, title);
  }
  assert.ok(drafts.every(row => row.owner_id === (row.title === '同租戶驗收 B 私人草稿' ? fixture.peerId : fixture.ids.allowed)));
  assert.ok(revisions.every(row => drafts.some(head => head.id === row.draft_id && head.owner_id === row.owner_id)));
  const titleRows = new Map(drafts.map(row => [row.title, row]));
  for (const width of [1440, 390]) {
    const tenLine = titleRows.get(`真 API 十行草稿 ${width}`);
    assert.equal(tenLine?.revision, 1); assert.equal(tenLine?.payload?.lines?.length, 10);
    assert.equal(tenLine.payload.lines[0].fields.productId, fixture.productId);
    assert.equal(tenLine.payload.lines[0].fields.quantity, '3'); assert.equal(tenLine.payload.lines[0].reviewed, false);
    assert.equal(titleRows.get(`失回應真 API 草稿 ${width}`)?.revision, 1);
  }
  const casHeads = drafts.filter(row => /^CAS 真 API 勝者 [AB]$/.test(row.title));
  assert.equal(casHeads.length, 2); assert.ok(casHeads.every(row => row.revision === 2 && row.payload?.title === row.title));
  const history = drafts.map(row => revisions.filter(revision => revision.draft_id === row.id).map(row => row.revision).sort());
  assert.deepEqual(history.sort((a, b) => a.length - b.length), [[1], [1], [1], [1], [1], [1], [1, 2], [1, 2]]);
  const digests = snapshot => Object.fromEntries(Object.entries(snapshot).map(([name, rows]) => [name, {
    rows: rows.length, sha256: crypto.createHash('sha256').update(JSON.stringify(sortedRows(rows))).digest('hex'),
  }]));
  return { exactUnchangedBusinessTables: Object.keys(before).filter(name => !['users', 'audit_logs', ...existingDraftRows].includes(name)),
    financialTablesUnchanged: financialTables.filter(name => name in before), expectedAuthAuditRows: addedAudit.map(row => ({ id: row.id, actorId: row.user_id, action: row.action })),
    draftHeads: drafts.map(row => ({ id: row.id, ownerId: row.owner_id, title: row.title, revision: row.revision, payload: row.payload })),
    draftRevisions: revisions.map(row => ({ draftId: row.draft_id, ownerId: row.owner_id, revision: row.revision, payload: row.payload })),
    before: digests(before), after: digests(after) };
}
