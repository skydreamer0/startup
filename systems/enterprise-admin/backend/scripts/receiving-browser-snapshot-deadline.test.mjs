import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSnapshotWithDeadline } from './receiving-browser-snapshot.mjs';
import { assertBrowserQuietBeforeOwnedDrop } from './receiving-browser-cleanup.mjs';

test('snapshot deadline marks unfinished DB work unverified and cannot authorize the owned DB drop', async () => {
  let finish;
  const source = new Promise(resolve => { finish = resolve; });
  const outcome = await readSnapshotWithDeadline(() => source, 5);
  assert.equal(outcome.status, 'deadline');
  assert.equal(outcome.querySettled, false);
  const cleanup = { processes: { quiescent: true }, http: { drained: true, activeHandlers: 0 }, server: { closed: true },
    afterSnapshot: { status: 'unverified', reason: 'Post-run owned PostgreSQL after-snapshot deadline exceeded' },
    database: { disconnected: false }, credentials: { removed: true } };
  assert.throws(() => assertBrowserQuietBeforeOwnedDrop(cleanup), /unverified after-snapshot forbids/);
  finish({ rows: [] });
  assert.equal((await outcome.operation).status, 'completed');
  assert.equal(outcome.querySettled, true);
});

test('rejected raw-row snapshot settles with a failure outcome rather than a false quiet result', async () => {
  const error = new Error('synthetic snapshot rejection');
  const outcome = await readSnapshotWithDeadline(() => Promise.reject(error), 100);
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.error, error);
});
