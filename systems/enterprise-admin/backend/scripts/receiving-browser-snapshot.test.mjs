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
    revision: title.startsWith('CAS') ? 3 : 1, payload: payload(title) }));
  const ledgers = [1440, 390].map((viewport, index) => {
    const draft = after.receiving_drafts[4 + index];
    const retainedTitle = draft.title;
    const originalTitle = `CAS 真 API 草稿 ${viewport}`;
    const winnerTitle = retainedTitle.endsWith('A') ? 'CAS 真 API 勝者 B' : 'CAS 真 API 勝者 A';
    return { viewport, title: 'two real pages race the same revision and expose an explicit CAS choice',
      casResolution: { draftUrl: `http://127.0.0.1:4287/api/v1/admin/receiving-drafts/${draft.id}`,
        expectedRevision: 2, savedRevision: 3, originalTitle, winnerTitle, retainedTitle,
        reopenedTitle: retainedTitle, reopenedRevision: 3,
        history: [{ revision: 1, title: originalTitle }, { revision: 2, title: winnerTitle }, { revision: 3, title: retainedTitle }] } };
  });
  after.receiving_draft_revisions = after.receiving_drafts.flatMap(row => {
    const cas = ledgers.find(ledger => ledger.casResolution.draftUrl.endsWith(`/${row.id}`))?.casResolution;
    return (cas?.history ?? [{ revision: 1, title: row.title }]).map(version => ({
      draft_id: row.id, tenant_id: 'tenant', owner_id: 'allowed', revision: version.revision, payload: { ...row.payload, title: version.title },
    }));
  });
  const responses = [{ endpoint: '/auth/login', status: 200, actorId: 'allowed' },
    ...after.receiving_draft_revisions.map(row => ({ method: 'PUT', status: 200,
      url: `http://127.0.0.1:4287/api/v1/admin/receiving-drafts/${row.draft_id}` }))];
  return { before, after, responses, ledgers };
}

test('raw receiving snapshots allow only fixture auth bookkeeping and append-only draft/audit rows', () => {
  const { before, after, responses, ledgers } = snapshots();
  const receipt = compareReceivingBrowserSnapshots(before, after, fixture, responses, ledgers);
  assert.equal(receipt.draftHeads.length, 6); assert.equal(receipt.draftRevisions.length, 10);
  assert.deepEqual(after.orders, before.orders);
  const sanitized = redactBusinessSnapshot({ users: [{ password_hash: 'secret', jwtToken: 'secret', id: 'allowed' }] });
  assert.deepEqual(sanitized, { users: [{ password_hash: '[REDACTED]', jwtToken: '[REDACTED]', id: 'allowed' }] });
});

test('row-level guard catches financial edits and unrelated fixture-tenant row changes', () => {
  const { before, after, responses, ledgers } = snapshots();
  const changedOrder = structuredClone(after); changedOrder.orders[0].total++;
  assert.throws(() => compareReceivingBrowserSnapshots(before, changedOrder, fixture, responses, ledgers), /orders/);
  const unrelated = structuredClone(after); unrelated.products[0].stock_quantity++;
  assert.throws(() => compareReceivingBrowserSnapshots(before, unrelated, fixture, responses, ledgers), /products/);
  const changedHash = structuredClone(after); changedHash.users[0].password_hash = 'changed';
  assert.throws(() => compareReceivingBrowserSnapshots(before, changedHash, fixture, responses, ledgers), /users/);
});

// Keep the exact count while breaking each structural/evidence invariant: simply
// changing the old total from eight to ten must not make these cases acceptable.
for (const [name, change, error] of [
  ['missing CAS v3', ({ after }) => { after.receiving_draft_revisions.pop(); }, /ten immutable/],
  ['unexpected extra revision', ({ after }) => { after.receiving_draft_revisions.push({ ...after.receiving_draft_revisions.at(-1), revision: 4 }); }, /ten immutable/],
  ['duplicate revision identity at the same total', ({ after }) => { after.receiving_draft_revisions[9] = structuredClone(after.receiving_draft_revisions[8]); }, /duplicate row identities/],
  ['wrong head revision at the same total', ({ after }) => { after.receiving_drafts[4].revision = 2; }, /CAS head must be revision 3/],
  ['rewritten original history at the same total', ({ after }) => { after.receiving_draft_revisions[4].payload.title = 'rewritten'; }, /CAS raw history/],
  ['rewritten winner history at the same total', ({ after }) => { after.receiving_draft_revisions[5].payload.title = 'rewritten'; }, /CAS raw history/],
  ['head payload differs from immutable v3', ({ after }) => { after.receiving_drafts[4].payload.lines = []; }, /head payload must equal/],
  ['unexpected historical content mutation', ({ after }) => { after.receiving_draft_revisions[4].payload.lines = []; }, /Only the title changes/],
  ['different actor owns a revision', ({ after }) => { after.receiving_draft_revisions[4].owner_id = 'denied'; }, /allowed actor/],
  ['orphan revision at the same total', ({ after }) => { after.receiving_draft_revisions[4].draft_id = 'unknown'; }, /saved fixture head/],
  ['wrong history distribution at the same total', ({ after }) => { after.receiving_draft_revisions[4].draft_id = 'draft0'; after.receiving_draft_revisions[4].revision = 2; }, /exact immutable history/],
  ['missing browser evidence', ({ ledgers }) => { ledgers.pop(); }, /two CAS browser receipts/],
  ['duplicate browser viewport', ({ ledgers }) => { ledgers[1].viewport = 1440; }, /CAS browser viewports/],
  ['browser receipt for a different draft', ({ ledgers }) => { ledgers[0].casResolution.draftUrl += '-other'; }, /CAS receipt must identify/],
  ['browser receipt for different retained content', ({ ledgers }) => { ledgers[0].casResolution.retainedTitle = 'other'; }, /retained browser title/],
  ['missing committed API response', ({ responses }) => { responses.pop(); }, /successful API saves/],
]) {
  test(`snapshot rejection: ${name}`, () => {
    const data = snapshots(); change(data);
    assert.throws(() => compareReceivingBrowserSnapshots(data.before, data.after, fixture, data.responses, data.ledgers), error);
  });
}
