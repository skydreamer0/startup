import assert from 'node:assert/strict';
import { test } from 'node:test';
import { taipeiBusinessDay } from '../src/lib/business-day.ts';

test('Taipei midnight separates business dates independently of server timezone', () => {
  const before = taipeiBusinessDay(new Date('2026-10-08T15:59:59.999Z'));
  const after = taipeiBusinessDay(new Date('2026-10-08T16:00:00.000Z'));
  assert.equal(before.date, '2026-10-08');
  assert.equal(after.date, '2026-10-09');
  assert.equal(before.end.toISOString(), after.start.toISOString());
  assert.equal(after.start.toISOString(), '2026-10-08T16:00:00.000Z');
  assert.equal(after.end.toISOString(), '2026-10-09T16:00:00.000Z');
});

test('calendar boundary handles leap days and year rollover', () => {
  assert.equal(taipeiBusinessDay(new Date('2024-02-28T16:00:00Z')).date, '2024-02-29');
  assert.equal(taipeiBusinessDay(new Date('2024-02-29T16:00:00Z')).date, '2024-03-01');
  assert.equal(taipeiBusinessDay(new Date('2026-12-31T16:00:00Z')).date, '2027-01-01');
  assert.throws(() => taipeiBusinessDay(new Date('invalid')), RangeError);
});
