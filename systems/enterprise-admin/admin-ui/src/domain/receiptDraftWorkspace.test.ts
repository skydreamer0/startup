import { test } from 'vitest';
import assert from 'node:assert/strict';
import { addLine, createDraft, reviewLine, summarizeDraft, DraftError } from './receiptDraft.ts';
import type { ReceiptDraft, ReceiptFields } from './receiptDraft.ts';
import { createReceiptWorkspace, WorkspaceError } from './receiptDraftWorkspace.ts';
import type { SuggestionResult, SuggestionTicket, WorkspaceScope } from './receiptDraftWorkspace.ts';

const scope: WorkspaceScope = { tenantId: 'tenant-a', actorId: 'actor-a' };
const fields: ReceiptFields = { productId: 'p1', baseUnit: 'tablet', batchNumber: 'batch', expiryDate: '2028-02-29', quantity: '001.2500', note: 'raw note' };
const one = (id = 'a') => addLine(createDraft(id), 0, 'line-1', fields);
const ready = (result: SuggestionResult) => {
  assert.equal(result.status, 'ready');
  if (result.status !== 'ready') throw new Error('Expected a current proposal');
  return result.suggestion;
};
const error = (code: string) => (value: unknown) => value instanceof WorkspaceError && value.code === code;
const setup = (draft: ReceiptDraft = one()) => {
  const workspace = createReceiptWorkspace();
  return { workspace, view: workspace.open(workspace.getSnapshot(), scope, draft) };
};

test('closed workspace cannot edit or begin lookup', () => {
  const w = createReceiptWorkspace(), closed = w.getSnapshot();
  assert.equal(closed.status, 'closed');
  assert.throws(() => w.dispatch(closed, { type: 'add', lineId: 'x' }), error('WORKSPACE_CLOSED'));
  assert.throws(() => w.beginSuggestion(closed, 'x'), error('WORKSPACE_CLOSED'));
  assert.equal(w.getSnapshot(), closed);
});

test('A to B to A cannot revive a response even with identical draft object and revision', () => {
  const { workspace: w, view: a } = setup(), draft = a.draft;
  const old = w.beginSuggestion(a, 'line-1');
  const b = w.open(a, scope, one('b'));
  const newA = w.open(b, scope, draft);
  assert.notEqual(newA.generation, a.generation);
  assert.equal(newA.draft, a.draft);
  assert.deepEqual(w.receiveSuggestion(old, { quantity: '999' }), { status: 'stale' });
  assert.equal(w.getSnapshot(), newA);
  assert.equal(newA.draft.lines[0].fields.quantity, fields.quantity);
});

test('same draft and row IDs recreated at same revision reject old response', () => {
  const { workspace: w, view: a } = setup();
  const old = w.beginSuggestion(a, 'line-1');
  const rebuilt = w.open(a, scope, one());
  assert.equal(rebuilt.draft.id, a.draft.id);
  assert.equal(rebuilt.draft.revision, a.draft.revision);
  assert.deepEqual(w.receiveSuggestion(old, { productId: 'old-product' }), { status: 'stale' });
  assert.equal(w.getSnapshot(), rebuilt);
});

for (const nextScope of [{ ...scope, actorId: 'actor-b' }, { ...scope, tenantId: 'tenant-b' }]) {
  test(`scope change ${nextScope.tenantId}/${nextScope.actorId} rejects previous workspace data`, () => {
    const { workspace: w, view } = setup();
    const old = w.beginSuggestion(view, 'line-1');
    const next = w.open(view, nextScope, one());
    assert.deepEqual(w.receiveSuggestion(old, { quantity: '99' }), { status: 'stale' });
    assert.equal(w.getSnapshot(), next);
    assert.throws(() => w.dispatch(view, { type: 'review', lineId: 'line-1' }), error('STALE_WORKSPACE'));
  });
}

test('same actor relogin represented by a new open still invalidates old session work', () => {
  const { workspace: w, view } = setup();
  const ticket = w.beginSuggestion(view, 'line-1');
  const relogin = w.open(view, scope, view.draft);
  assert.deepEqual(relogin.scope, view.scope);
  assert.notEqual(relogin.generation, view.generation);
  assert.deepEqual(w.receiveSuggestion(ticket, { quantity: '77' }), { status: 'stale' });
});

test('close and reopen rejects old result; closing alone never persists a draft', () => {
  const { workspace: w, view } = setup();
  const ticket = w.beginSuggestion(view, 'line-1');
  const closed = w.close(view);
  assert.deepEqual(Object.keys(closed).sort(), ['generation', 'status']);
  assert.deepEqual(w.receiveSuggestion(ticket, { quantity: '9' }), { status: 'stale' });
  const reopened = w.open(closed, scope, view.draft);
  assert.notEqual(reopened.generation, view.generation);
  assert.deepEqual(w.receiveSuggestion(ticket, { quantity: '9' }), { status: 'stale' });
  assert.equal(w.getSnapshot(), reopened);
});

test('late close and late open cannot clear or replace newer work', () => {
  const { workspace: w, view } = setup();
  const next = w.open(view, scope, one('b'));
  assert.throws(() => w.close(view), error('STALE_WORKSPACE'));
  assert.throws(() => w.open(view, scope, one('c')), error('STALE_WORKSPACE'));
  assert.equal(w.getSnapshot(), next);
});

test('latest request wins when newer response arrives before older response', () => {
  const { workspace: w, view } = setup();
  const old = w.beginSuggestion(view, 'line-1'), newer = w.beginSuggestion(view, 'line-1');
  const suggestion = ready(w.receiveSuggestion(newer, { quantity: '2' }));
  assert.deepEqual(w.receiveSuggestion(old, { quantity: '88' }), { status: 'stale' });
  assert.deepEqual(w.failSuggestion(old), { status: 'stale' });
  const next = w.applySuggestion(view, suggestion);
  assert.equal(next.draft.lines[0].fields.quantity, '2');
});

test('latest request wins even when obsolete response arrives first', () => {
  const { workspace: w, view } = setup();
  const old = w.beginSuggestion(view, 'line-1'), newer = w.beginSuggestion(view, 'line-1');
  assert.deepEqual(w.receiveSuggestion(old, { quantity: '88' }), { status: 'stale' });
  assert.deepEqual(w.failSuggestion(old), { status: 'stale' });
  const next = w.applySuggestion(view, ready(w.receiveSuggestion(newer, { quantity: '3' })));
  assert.equal(next.draft.lines[0].fields.quantity, '3');
});

test('starting another request invalidates an already visible proposal', () => {
  const { workspace: w, view } = setup();
  const old = ready(w.receiveSuggestion(w.beginSuggestion(view, 'line-1'), { quantity: '2' }));
  const latest = w.beginSuggestion(view, 'line-1');
  assert.throws(() => w.applySuggestion(view, old), error('STALE_SUGGESTION'));
  assert.equal(w.getSnapshot(), view);
  assert.equal(w.applySuggestion(view, ready(w.receiveSuggestion(latest, { quantity: '3' }))).draft.lines[0].fields.quantity, '3');
});

test('old request failure does not clear current pending request or ready proposal', () => {
  const { workspace: w, view } = setup();
  const old = w.beginSuggestion(view, 'line-1'), current = w.beginSuggestion(view, 'line-1');
  assert.deepEqual(w.failSuggestion(old), { status: 'stale' });
  const proposal = ready(w.receiveSuggestion(current, { quantity: '4' }));
  assert.deepEqual(w.failSuggestion(current), { status: 'stale' });
  assert.equal(w.applySuggestion(view, proposal).draft.lines[0].fields.quantity, '4');
});

test('failed current request cannot later succeed or settle twice', () => {
  const { workspace: w, view } = setup();
  const ticket = w.beginSuggestion(view, 'line-1');
  assert.deepEqual(w.failSuggestion(ticket), { status: 'cleared' });
  assert.deepEqual(w.failSuggestion(ticket), { status: 'stale' });
  assert.deepEqual(w.receiveSuggestion(ticket, { quantity: '4' }), { status: 'stale' });
  assert.equal(w.getSnapshot(), view);
});

test('response is a proposal only; no auto-apply or automatic review', () => {
  const { workspace: w, view } = setup();
  const suggestion = ready(w.receiveSuggestion(w.beginSuggestion(view, 'line-1'), { quantity: '2' }));
  assert.equal(w.getSnapshot(), view);
  assert.equal(view.draft.lines[0].fields.quantity, fields.quantity);
  assert.deepEqual(summarizeDraft(view.draft), { reviewed: [], needsReview: ['line-1'], invalid: [] });
  assert.equal(suggestion.fields.quantity, '2');
  const next = w.applySuggestion(view, suggestion);
  assert.equal(next.draft.lines[0].review, null);
  assert.equal(next.draft.revision, view.draft.revision + 1);
});

test('synthetic high-confidence label has no authority and cannot enter field payload', () => {
  const { workspace: w, view } = setup();
  const evidence = { confidenceLabel: 'high', patch: { quantity: '2' } };
  const ticket = w.beginSuggestion(view, 'line-1');
  assert.throws(() => w.receiveSuggestion(ticket, evidence as never), (e: unknown) => e instanceof DraftError && e.code === 'INVALID_INPUT');
  assert.equal(w.getSnapshot(), view);
  const next = w.applySuggestion(view, ready(w.receiveSuggestion(ticket, evidence.patch)));
  assert.equal(next.draft.lines[0].review, null);
});

test('manual edit invalidates both pending response and visible proposal on all rows', () => {
  let d = one(); d = addLine(d, d.revision, 'line-2', fields);
  const { workspace: w, view } = setup(d);
  const pending = w.beginSuggestion(view, 'line-1');
  const suggestion = ready(w.receiveSuggestion(w.beginSuggestion(view, 'line-2'), { quantity: '5' }));
  const next = w.dispatch(view, { type: 'update', lineId: 'line-1', patch: { quantity: '7' } });
  assert.deepEqual(w.receiveSuggestion(pending, { quantity: '99' }), { status: 'stale' });
  assert.throws(() => w.applySuggestion(view, suggestion), error('STALE_WORKSPACE'));
  assert.throws(() => w.applySuggestion(next, suggestion), error('STALE_SUGGESTION'));
  assert.equal(next.draft.lines[0].fields.quantity, '7');
  assert.equal(next.draft.lines[1].fields.quantity, fields.quantity);
});

test('A to B to A field edits reject old request despite same final raw value', () => {
  const { workspace: w, view } = setup();
  const ticket = w.beginSuggestion(view, 'line-1');
  let next = w.dispatch(view, { type: 'update', lineId: 'line-1', patch: { quantity: '5' } });
  next = w.dispatch(next, { type: 'update', lineId: 'line-1', patch: { quantity: fields.quantity } });
  assert.deepEqual(w.receiveSuggestion(ticket, { quantity: '6' }), { status: 'stale' });
  assert.equal(next.draft.lines[0].fields.quantity, fields.quantity);
});

test('remove and recreate a row rejects previous row response', () => {
  const { workspace: w, view } = setup();
  const ticket = w.beginSuggestion(view, 'line-1');
  let next = w.dispatch(view, { type: 'remove', lineId: 'line-1' });
  next = w.dispatch(next, { type: 'add', lineId: 'line-1', fields });
  assert.deepEqual(w.receiveSuggestion(ticket, { quantity: '6' }), { status: 'stale' });
  assert.equal(next.draft.lines[0].review, null);
});

for (const key of ['productId', 'baseUnit', 'batchNumber', 'expiryDate', 'quantity'] as const) {
  test(`applying changed ${key} revokes only that row review`, () => {
    let d = one(); d = addLine(d, d.revision, 'line-2', fields);
    d = reviewLine(d, d.revision, 'line-1', 'prior-actor');
    d = reviewLine(d, d.revision, 'line-2', 'prior-actor');
    const { workspace: w, view } = setup(d);
    const suggestion = ready(w.receiveSuggestion(w.beginSuggestion(view, 'line-1'), { [key]: '' }));
    assert.ok(view.draft.lines[0].review); // Receiving does not revoke anything yet.
    const next = w.applySuggestion(view, suggestion);
    assert.equal(next.draft.lines[0].review, null);
    assert.equal(next.draft.lines[1], view.draft.lines[1]);
    assert.ok(next.draft.lines[1].review);
    assert.deepEqual(summarizeDraft(next.draft).invalid, ['line-1']);
  });
}

test('note-only suggestion preserves review according to original reducer', () => {
  let d = one(); d = reviewLine(d, d.revision, 'line-1', 'prior-actor');
  const { workspace: w, view } = setup(d);
  const next = w.applySuggestion(view, ready(w.receiveSuggestion(w.beginSuggestion(view, 'line-1'), { note: 'changed' })));
  assert.deepEqual(next.draft.lines[0].review, d.lines[0].review);
  assert.equal(next.draft.revision, d.revision + 1);
});

test('exact no-op retains snapshot and pending work, while suggestion is consumed once', () => {
  const { workspace: w, view } = setup();
  const ticket = w.beginSuggestion(view, 'line-1');
  assert.equal(w.dispatch(view, { type: 'update', lineId: 'line-1', patch: { quantity: fields.quantity } }), view);
  const suggestion = ready(w.receiveSuggestion(ticket, { quantity: fields.quantity }));
  assert.equal(w.applySuggestion(view, suggestion), view);
  assert.throws(() => w.applySuggestion(view, suggestion), error('STALE_SUGGESTION'));
  assert.deepEqual(w.receiveSuggestion(ticket, { quantity: '8' }), { status: 'stale' });
});

test('ten rows retain eight reviewed, one unresolved, and one invalid without posting', () => {
  const w = createReceiptWorkspace();
  let view = w.open(w.getSnapshot(), scope, createDraft('ten'));
  for (let i = 0; i < 10; i++) view = w.dispatch(view, { type: 'add', lineId: `line-${i}`, fields: i === 9 ? { ...fields, expiryDate: '' } : fields });
  for (let i = 0; i < 8; i++) view = w.dispatch(view, { type: 'review', lineId: `line-${i}` });
  assert.deepEqual(summarizeDraft(view.draft), { reviewed: Array.from({ length: 8 }, (_, i) => `line-${i}`), needsReview: ['line-8'], invalid: ['line-9'] });
  assert.equal(view.draft.lines.length, 10);
  assert.deepEqual(Object.keys(view.draft).sort(), ['id', 'lines', 'revision']);
  for (const row of view.draft.lines.slice(0, 8)) assert.equal(row.review?.actorId, scope.actorId);
  assert.throws(() => w.dispatch(view, { type: 'review', lineId: 'line-9' }), (e: unknown) => e instanceof DraftError && e.code === 'LINE_INVALID');
  assert.equal(w.getSnapshot(), view);
});

test('review and revoke remain explicit, scoped, revision checked operations', () => {
  const { workspace: w, view } = setup();
  const ticket = w.beginSuggestion(view, 'line-1');
  const reviewed = w.dispatch(view, { type: 'review', lineId: 'line-1' });
  assert.equal(reviewed.draft.lines[0].review?.actorId, scope.actorId);
  assert.deepEqual(w.receiveSuggestion(ticket, { note: 'late' }), { status: 'stale' });
  assert.throws(() => w.dispatch(view, { type: 'revokeReview', lineId: 'line-1' }), error('STALE_WORKSPACE'));
  const revoked = w.dispatch(reviewed, { type: 'revokeReview', lineId: 'line-1' });
  assert.equal(revoked.draft.lines[0].review, null);
  assert.equal(w.dispatch(revoked, { type: 'revokeReview', lineId: 'line-1' }), revoked);
});

test('independent rows may resolve concurrently but applying one invalidates the other whole-draft proposal', () => {
  let d = one(); d = addLine(d, d.revision, 'line-2', fields);
  const { workspace: w, view } = setup(d);
  const t1 = w.beginSuggestion(view, 'line-1'), t2 = w.beginSuggestion(view, 'line-2');
  const s2 = ready(w.receiveSuggestion(t2, { quantity: '2' }));
  const s1 = ready(w.receiveSuggestion(t1, { quantity: '3' }));
  const next = w.applySuggestion(view, s1);
  assert.throws(() => w.applySuggestion(next, s2), error('STALE_SUGGESTION'));
  assert.equal(next.draft.lines[1].fields.quantity, fields.quantity);
});

test('tickets and proposals from another adapter instance cannot be adopted by matching IDs', () => {
  const a = setup(), b = setup();
  const ticket = a.workspace.beginSuggestion(a.view, 'line-1');
  assert.deepEqual(b.workspace.receiveSuggestion(ticket, { quantity: '9' }), { status: 'stale' });
  const suggestion = ready(a.workspace.receiveSuggestion(ticket, { quantity: '9' }));
  assert.throws(() => b.workspace.applySuggestion(b.view, suggestion), error('STALE_SUGGESTION'));
  assert.throws(() => b.workspace.dispatch(a.view, { type: 'remove', lineId: 'line-1' }), error('STALE_WORKSPACE'));
  assert.equal(b.workspace.getSnapshot(), b.view);
});

test('copied snapshots, tickets and suggestions are not valid capabilities', () => {
  const { workspace: w, view } = setup();
  assert.throws(() => w.close({ ...view }), error('STALE_WORKSPACE'));
  const ticket = w.beginSuggestion(view, 'line-1');
  assert.deepEqual(w.receiveSuggestion({ ...ticket }, { quantity: '9' }), { status: 'stale' });
  const suggestion = ready(w.receiveSuggestion(ticket, { quantity: '9' }));
  assert.throws(() => w.applySuggestion(view, { ...suggestion }), error('STALE_SUGGESTION'));
  assert.equal(w.applySuggestion(view, suggestion).draft.lines[0].fields.quantity, '9');
});

test('stale payload getters are not inspected and current payload getters are rejected without execution', () => {
  const { workspace: w, view } = setup();
  const old = w.beginSuggestion(view, 'line-1'), current = w.beginSuggestion(view, 'line-1');
  let reads = 0;
  const patch = { get quantity() { reads++; return '9'; } };
  assert.deepEqual(w.receiveSuggestion(old, patch), { status: 'stale' });
  assert.throws(() => w.receiveSuggestion(current, patch), (e: unknown) => e instanceof DraftError && e.code === 'INVALID_INPUT');
  assert.equal(reads, 0);
  assert.equal(w.getSnapshot(), view);
  assert.equal(w.applySuggestion(view, ready(w.receiveSuggestion(current, { quantity: '2' }))).draft.lines[0].fields.quantity, '2');
});

test('malformed scope never replaces current work or cancels pending result', () => {
  const { workspace: w, view } = setup();
  const ticket = w.beginSuggestion(view, 'line-1');
  let reads = 0;
  for (const bad of [null, [], { actorId: 'x' }, { ...scope, tenantId: '' }, { ...scope, extra: 'x' }, { tenantId: 't', get actorId() { reads++; return 'a'; } }]) {
    assert.throws(() => w.open(view, bad as never, one('bad')), error('INVALID_SCOPE'));
    assert.equal(w.getSnapshot(), view);
  }
  assert.equal(reads, 0);
  assert.equal(w.applySuggestion(view, ready(w.receiveSuggestion(ticket, { note: 'still current' }))).draft.lines[0].fields.note, 'still current');
});

test('scope is copied and output objects are frozen', () => {
  const w = createReceiptWorkspace(), input = { ...scope };
  const view = w.open(w.getSnapshot(), input, one());
  input.actorId = 'mutated';
  const ticket = w.beginSuggestion(view, 'line-1');
  const result = w.receiveSuggestion(ticket, { quantity: '2' }), suggestion = ready(result);
  for (const value of [w, view, view.scope, ticket, result, suggestion, suggestion.fields]) assert.ok(Object.isFrozen(value));
  assert.equal(view.scope.actorId, scope.actorId);
  assert.throws(() => { (view as { scope: WorkspaceScope }).scope = input; }, TypeError);
});

test('generation stays stable for edits but snapshot identity advances and old commands fail', () => {
  const { workspace: w, view } = setup();
  const next = w.dispatch(view, { type: 'update', lineId: 'line-1', patch: { note: 'memo' } });
  assert.equal(next.generation, view.generation);
  assert.notEqual(next, view);
  assert.throws(() => w.dispatch(view, { type: 'add', lineId: 'line-2' }), error('STALE_WORKSPACE'));
  assert.throws(() => w.close(view), error('STALE_WORKSPACE'));
  assert.equal(w.getSnapshot(), next);
});

test('invalid action or absent row does not replace snapshot or consume pending request', () => {
  const { workspace: w, view } = setup();
  const ticket = w.beginSuggestion(view, 'line-1');
  assert.throws(() => w.dispatch(view, { type: 'post', lineId: 'line-1' } as never), error('INVALID_COMMAND'));
  assert.throws(() => w.beginSuggestion(view, 'missing'), (e: unknown) => e instanceof DraftError && e.code === 'LINE_NOT_FOUND');
  assert.throws(() => w.dispatch(view, { type: 'add', lineId: 'line-1' }), (e: unknown) => e instanceof DraftError && e.code === 'DUPLICATE_LINE');
  assert.equal(w.getSnapshot(), view);
  assert.equal(w.applySuggestion(view, ready(w.receiveSuggestion(ticket, { quantity: '2' }))).draft.lines[0].fields.quantity, '2');
});

test('raw suggestion precision is retained and mutation of caller patch cannot alter accepted data', () => {
  const { workspace: w, view } = setup();
  const patch = { quantity: '000.00000000000000000001', note: ' raw ' };
  const suggestion = ready(w.receiveSuggestion(w.beginSuggestion(view, 'line-1'), patch));
  patch.quantity = '7';
  const next = w.applySuggestion(view, suggestion);
  assert.equal(next.draft.lines[0].fields.quantity, '000.00000000000000000001');
  assert.equal(next.draft.lines[0].fields.note, ' raw ');
});

test('re-entrant response validation cannot overwrite a newer request slot', () => {
  const { workspace: w, view } = setup();
  const old = w.beginSuggestion(view, 'line-1');
  let latest: SuggestionTicket | undefined;
  const patch = new Proxy({ quantity: '99' }, {
    ownKeys(target) { latest = w.beginSuggestion(view, 'line-1'); return Reflect.ownKeys(target); },
  });
  assert.deepEqual(w.receiveSuggestion(old, patch), { status: 'stale' });
  assert.ok(latest);
  assert.equal(w.applySuggestion(view, ready(w.receiveSuggestion(latest, { quantity: '2' }))).draft.lines[0].fields.quantity, '2');
});

test('re-entrant manual patch validation cannot overwrite a newer workspace', () => {
  const { workspace: w, view } = setup();
  const patch = new Proxy({ quantity: '99' }, {
    ownKeys(target) { w.open(w.getSnapshot(), scope, one('new')); return Reflect.ownKeys(target); },
  });
  assert.throws(() => w.dispatch(view, { type: 'update', lineId: 'line-1', patch }), error('STALE_WORKSPACE'));
  const current = w.getSnapshot();
  assert.equal(current.status, 'open');
  if (current.status === 'open') {
    assert.equal(current.draft.id, 'new');
    assert.equal(current.draft.lines[0].fields.quantity, fields.quantity);
  }
});

test('re-entrant scope validation cannot replace a newer open', () => {
  const { workspace: w, view } = setup();
  const delayedScope = new Proxy({ ...scope }, {
    getPrototypeOf(target) { w.open(w.getSnapshot(), scope, one('new')); return Reflect.getPrototypeOf(target); },
  });
  assert.throws(() => w.open(view, delayedScope, one('stale')), error('STALE_WORKSPACE'));
  const current = w.getSnapshot();
  assert.equal(current.status, 'open');
  if (current.status === 'open') assert.equal(current.draft.id, 'new');
});

test('visible suggestions are paired with current view and cannot cross workspace navigation', () => {
  const { workspace: w, view } = setup();
  assert.deepEqual(w.suggestionFor(view, 'line-1'), { status: 'idle' });
  const ticket = w.beginSuggestion(view, 'line-1');
  assert.deepEqual(w.suggestionFor(view, 'line-1'), { status: 'pending' });
  const result = w.receiveSuggestion(ticket, { quantity: '2' });
  const suggestion = ready(result);
  assert.deepEqual(w.suggestionFor(view, 'line-1'), { status: 'ready', view, suggestion });
  const next = w.open(view, scope, one('b'));
  assert.deepEqual(w.suggestionFor(next, 'line-1'), { status: 'idle' });
  assert.throws(() => w.suggestionFor(view, 'line-1'), error('STALE_WORKSPACE'));
  if (result.status === 'ready') assert.notEqual(result.view, w.getSnapshot());
});

test('display state follows latest request and is preserved against stale failures', () => {
  const { workspace: w, view } = setup();
  const old = w.beginSuggestion(view, 'line-1');
  const first = ready(w.receiveSuggestion(old, { quantity: '2' }));
  assert.equal(w.suggestionFor(view, 'line-1').status, 'ready');
  const latest = w.beginSuggestion(view, 'line-1');
  assert.deepEqual(w.suggestionFor(view, 'line-1'), { status: 'pending' });
  assert.deepEqual(w.failSuggestion(old), { status: 'stale' });
  assert.deepEqual(w.suggestionFor(view, 'line-1'), { status: 'pending' });
  assert.throws(() => w.applySuggestion(view, first), error('STALE_SUGGESTION'));
  assert.deepEqual(w.failSuggestion(latest), { status: 'cleared' });
  assert.deepEqual(w.suggestionFor(view, 'line-1'), { status: 'idle' });
});
