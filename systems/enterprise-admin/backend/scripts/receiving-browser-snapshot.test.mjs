import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compareReceivingBrowserSnapshots, redactBusinessSnapshot } from './receiving-browser-snapshot.mjs';

const fixture = { ids: { tenant: 'tenant', allowed: 'allowed', denied: 'denied' }, productId: 'product' };
const titles = ['真 API 十行草稿 1440', '真 API 十行草稿 390', '失回應真 API 草稿 1440', '失回應真 API 草稿 390', 'CAS 真 API 勝者 A', 'CAS 真 API 勝者 B'];
const payload = title => ({ title, lines: title.startsWith('真 API 十行') ? Array.from({ length: 10 }, (_, index) => ({ id: `line${index}`, reviewed: false,
  fields: { productId: index === 0 ? 'product' : '', quantity: index === 0 ? '3' : '待確認' } })) : [{ id: 'line', reviewed: false, fields: {} }] });
function snapshots() {
  const before = { users: [
    { id: 'allowed', last_login_at: null, failed_login_attempts: 0, updated_at: '2026-01-01', password_hash: 'private-hash' },
    { id: 'denied', last_login_at: null, failed_login_attempts: 0, updated_at: '2026-01-01', password_hash: 'private-hash-2' },
    { id: 'other', last_login_at: null, failed_login_attempts: 0, updated_at: '2026-01-01' },
  ], audit_logs: [{ id: 'old', user_id: 'other', action: 'OLD', resource_type: 'users', resource_id: 'other', old_value: null, new_value: null, tenant_id: 'other' }],
  receiving_drafts: [], receiving_draft_revisions: [], orders: [{ id: 'order', total: 100 }], products: [{ id: 'product', stock_quantity: 0 }], tenants: [{ id: 'tenant', slug: 'default' }] };
  const after = structuredClone(before);
  after.users[0].last_login_at = '2026-02-01'; after.users[0].updated_at = '2026-02-01';
  after.users[1].last_login_at = '2026-02-01'; after.users[1].updated_at = '2026-02-01';
  after.audit_logs.push({ id: 'login', user_id: 'allowed', action: 'LOGIN', resource_type: 'users', resource_id: 'allowed', old_value: null, new_value: null, tenant_id: 'tenant' });
  after.receiving_drafts = titles.map((title, index) => ({ id: `draft${index}`, tenant_id: 'tenant', owner_id: 'allowed', title: title.startsWith('CAS') ? title : payload(title).title,
    revision: title.startsWith('CAS') ? 2 : 1, payload: payload(title) }));
  after.receiving_draft_revisions = after.receiving_drafts.flatMap(row => [
    { draft_id: row.id, tenant_id: 'tenant', owner_id: 'allowed', revision: 1, payload: row.payload },
    ...(row.revision === 2 ? [{ draft_id: row.id, tenant_id: 'tenant', owner_id: 'allowed', revision: 2, payload: { ...row.payload, title: row.title } }] : []),
  ]);
  return { before, after };
}

test('raw receiving snapshots allow only fixture auth bookkeeping and append-only draft/audit rows', () => {
  const { before, after } = snapshots();
  const responses = [{ endpoint: '/auth/login', status: 200, actorId: 'allowed' }];
  const receipt = compareReceivingBrowserSnapshots(before, after, fixture, responses);
  assert.equal(receipt.draftHeads.length, 6); assert.equal(receipt.draftRevisions.length, 8);
  assert.deepEqual(after.orders, before.orders);
  const sanitized = redactBusinessSnapshot({ users: [{ password_hash: 'secret', jwtToken: 'secret', id: 'allowed' }] });
  assert.deepEqual(sanitized, { users: [{ password_hash: '[REDACTED]', jwtToken: '[REDACTED]', id: 'allowed' }] });
});

test('row-level guard catches financial edits and unrelated fixture-tenant row changes', () => {
  const { before, after } = snapshots();
  const responses = [{ endpoint: '/auth/login', status: 200, actorId: 'allowed' }];
  const changedOrder = structuredClone(after); changedOrder.orders[0].total++;
  assert.throws(() => compareReceivingBrowserSnapshots(before, changedOrder, fixture, responses), /orders/);
  const unrelated = structuredClone(after); unrelated.products[0].stock_quantity++;
  assert.throws(() => compareReceivingBrowserSnapshots(before, unrelated, fixture, responses), /products/);
  const changedHash = structuredClone(after); changedHash.users[0].password_hash = 'changed';
  assert.throws(() => compareReceivingBrowserSnapshots(before, changedHash, fixture, responses), /users/);
});
