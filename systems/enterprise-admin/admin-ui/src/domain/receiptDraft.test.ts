import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createDraft, addLine, updateLine, removeLine, reviewLine, revokeReview, summarizeDraft, issuesFor, DraftError } from './receiptDraft.ts';
import type { ReceiptDraft, ReceiptFields } from './receiptDraft.ts';
const raw: ReceiptFields = { productId: 'p1', baseUnit: 'tablet', batchNumber: ' batch ', expiryDate: '2028-02-29', quantity: '001.2500', note: ' original ' };
const one = () => addLine(createDraft('draft-1'), 0, 'line-1', raw);
const error = (code: string) => (e: unknown) => e instanceof DraftError && e.code === code;

test('empty draft has no reviewed or pending lines, never represents posting', () => {
  const d = createDraft('d'); assert.equal(d.revision, 0);
  assert.deepEqual(summarizeDraft(d), { reviewed: [], needsReview: [], invalid: [] });
  assert.deepEqual(Object.keys(d).sort(), ['id', 'lines', 'revision']);
});
test('raw values retained exactly, no number/date conversion or input mutation', () => {
  const input = { ...raw }; const d = addLine(createDraft('d'), 0, 'a', input);
  assert.deepEqual(d.lines[0].fields, raw); input.quantity = '9';
  assert.equal(d.lines[0].fields.quantity, '001.2500'); assert.deepEqual(raw.quantity, '001.2500');
});
test('ten lines eight reviewed and two unresolved remain independently accessible', () => {
  let d = createDraft('d');
  for (let i = 0; i < 10; i++) d = addLine(d, d.revision, `line-${i}`, i === 9 ? { ...raw, expiryDate: '' } : raw);
  for (let i = 0; i < 8; i++) d = reviewLine(d, d.revision, `line-${i}`, 'actor');
  assert.deepEqual(summarizeDraft(d), { reviewed: Array.from({ length: 8 }, (_, i) => `line-${i}`), needsReview: ['line-8'], invalid: ['line-9'] });
  assert.equal(d.lines.length, 10);
});
for (const key of ['productId', 'baseUnit', 'batchNumber', 'expiryDate', 'quantity'] as const) {
  test(`changing ${key} revokes only that line review`, () => {
    let d = one(); d = addLine(d, d.revision, 'line-2', raw);
    d = reviewLine(d, d.revision, 'line-1', 'actor'); d = reviewLine(d, d.revision, 'line-2', 'actor');
    const before = d, second = d.lines[1]; d = updateLine(d, d.revision, 'line-1', { [key]: '' });
    assert.equal(d.lines[0].review, null); assert.ok(before.lines[0].review); assert.equal(d.lines[1], second); assert.ok(second.review);
  });
}
test('note edit preserves review; exact no-op retains revision and identity', () => {
  let d = one(); d = reviewLine(d, d.revision, 'line-1', 'actor'); const review = d.lines[0].review;
  const changed = updateLine(d, d.revision, 'line-1', { note: 'memo' });
  assert.deepEqual(changed.lines[0].review, review); assert.equal(changed.revision, d.revision + 1);
  assert.equal(updateLine(changed, changed.revision, 'line-1', { note: 'memo' }), changed);
});
test('A to B to A cannot revive old review request', () => {
  let d = one(); const stale = d.revision;
  d = updateLine(d, d.revision, 'line-1', { quantity: '2' });
  d = updateLine(d, d.revision, 'line-1', { quantity: raw.quantity });
  assert.throws(() => reviewLine(d, stale, 'line-1', 'actor'), error('STALE_REVISION'));
});
test('remove and recreate same id rejects stale review and stale mutation', () => {
  let d = one(); const stale = d.revision;
  d = removeLine(d, d.revision, 'line-1'); d = addLine(d, d.revision, 'line-1', raw);
  assert.throws(() => reviewLine(d, stale, 'line-1', 'actor'), error('STALE_REVISION'));
  assert.throws(() => updateLine(d, stale, 'line-1', { note: 'late' }), error('STALE_REVISION'));
  assert.equal(d.lines[0].review, null);
});
test('duplicate identity rejected while same product and batch across distinct rows allowed', () => {
  const d = one(); assert.throws(() => addLine(d, d.revision, 'line-1', raw), error('DUPLICATE_LINE'));
  const next = addLine(d, d.revision, 'line-2', raw); assert.equal(next.lines.length, 2);
  assert.equal(d.lines.length, 1);
});
test('unknown row operations fail atomically', () => {
  const d = one(), before = JSON.stringify(d);
  for (const action of [() => removeLine(d, d.revision, 'missing'), () => updateLine(d, d.revision, 'missing', {}), () => reviewLine(d, d.revision, 'missing', 'actor'), () => revokeReview(d, d.revision, 'missing')]) assert.throws(action, error('LINE_NOT_FOUND'));
  assert.equal(JSON.stringify(d), before);
});
test('all mutation operations require current revision including no-ops', () => {
  const d = one();
  for (const action of [() => addLine(d, 0, 'b'), () => updateLine(d, 0, 'line-1', {}), () => removeLine(d, 0, 'line-1'), () => reviewLine(d, 0, 'line-1', 'a'), () => revokeReview(d, 0, 'line-1')]) assert.throws(action, error('STALE_REVISION'));
});
test('review rejects unresolved data but allows a completed row without modifying others', () => {
  let d = addLine(createDraft('d'), 0, 'a');
  assert.equal(issuesFor(d.lines[0].fields).length, 5);
  assert.throws(() => reviewLine(d, d.revision, 'a', 'actor'), error('LINE_INVALID'));
  d = updateLine(d, d.revision, 'a', raw); d = reviewLine(d, d.revision, 'a', 'actor');
  assert.deepEqual(d.lines[0].review, { actorId: 'actor', reviewedAtRevision: d.revision });
});
test('explicit revoke changes review only and respects no-op semantics', () => {
  let d = one(); assert.equal(revokeReview(d, d.revision, 'line-1'), d);
  d = reviewLine(d, d.revision, 'line-1', 'a'); const old = d;
  d = revokeReview(d, d.revision, 'line-1'); assert.equal(d.lines[0].review, null);
  assert.deepEqual(d.lines[0].fields, old.lines[0].fields); assert.ok(old.lines[0].review);
});
test('calendar grammar rejects partial invalid and normalized-away dates', () => {
  for (const date of ['2028-02', '2027-02-29', '1900-02-29', '2028-13-01', '2028-04-31', '0000-01-01', ' 2028-01-01', '2028-01-01T00:00:00Z', '2028-01-01\n']) {
    assert.ok(issuesFor({ ...raw, expiryDate: date }).some(i => i.code === 'invalid_date'), date);
  }
  for (const date of ['2000-02-29', '2028-02-29', '2027-12-31', '2000-01-01']) assert.equal(issuesFor({ ...raw, expiryDate: date }).length, 0, date);
});
test('quantity syntax retains arbitrary exact decimal, does no stock-unit precision policy', () => {
  for (const value of ['0', '000.000', '-1', '+1', '1e3', 'NaN', 'Infinity', '1,000', '.5', ' 1', '1.', '1\n']) assert.ok(issuesFor({ ...raw, quantity: value }).some(i => i.code === 'invalid_quantity'), value);
  for (const value of ['1', '0001', '0.0000000000000000000000001', '999999999999999999999999999999']) assert.equal(issuesFor({ ...raw, quantity: value }).length, 0, value);
});
test('unknown fields, prototype keys, symbols, getters and non-string raw values rejected', () => {
  const d = one(); let getterRead = false;
  for (const patch of [{ quantity: 1 }, { extra: 'x' }, JSON.parse('{"__proto__":"x"}'), { [Symbol('x')]: 'x' }, { get note() { getterRead = true; return 'x'; } }, [], null]) {
    assert.throws(() => updateLine(d, d.revision, 'line-1', patch as never), error('INVALID_INPUT'));
  }
  assert.equal(getterRead, false);
});
test('identities and revision tokens reject invalid inputs', () => {
  for (const id of ['', '  ', null, 12]) assert.throws(() => createDraft(id as never), error('INVALID_INPUT'));
  const d = one();
  for (const rev of [-1, 0.2, NaN, Infinity, '1']) assert.throws(() => addLine(d, rev as never, 'b'), error('INVALID_INPUT'));
  assert.throws(() => reviewLine(d, d.revision, 'line-1', ''), error('INVALID_INPUT'));
});
test('snapshot nested fields reviews arrays and summaries are frozen', () => {
  let d = one(); d = reviewLine(d, d.revision, 'line-1', 'a');
  for (const value of [d, d.lines, d.lines[0], d.lines[0].fields, d.lines[0].review, summarizeDraft(d), summarizeDraft(d).reviewed]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { (d.lines[0].fields as { quantity: string }).quantity = '99'; }, TypeError);
});
test('independent drafts do not share editable state', () => {
  const a = one(), b = one(); const changed = updateLine(a, a.revision, 'line-1', { quantity: '8' });
  assert.equal(b.lines[0].fields.quantity, raw.quantity); assert.equal(changed.lines[0].fields.quantity, '8');
});
test('revision exhaustion fails without wraparound', () => {
  const forgedLimit = { ...one(), revision: Number.MAX_SAFE_INTEGER } as ReceiptDraft;
  assert.throws(() => removeLine(forgedLimit, forgedLimit.revision, 'line-1'), error('REVISION_EXHAUSTED'));
});
