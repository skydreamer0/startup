import assert from 'node:assert/strict';

export function assertBrowserQuietBeforeOwnedDrop(cleanup) {
  assert.ok(cleanup && typeof cleanup === 'object', 'Browser teardown evidence is required before dropping the owned DB');
  assert.equal(cleanup.processes?.quiescent, true, 'Owned browser processes must be quiescent before dropping the owned DB');
  assert.equal(cleanup.http?.drained, true, 'Every real API handler Promise and transport must settle before dropping the owned DB');
  assert.equal(cleanup.http?.activeHandlers, 0, 'No real API work may remain before dropping the owned DB');
  assert.equal(cleanup.server?.closed, true, 'Every owned API server must be closed before dropping the owned DB');
  assert.equal(cleanup.afterSnapshot?.status, 'saved-after-quiescence', 'A timed-out or unverified after-snapshot forbids dropping the owned DB');
  assert.equal(cleanup.database?.disconnected, true, 'The snapshot database client must disconnect before dropping the owned DB');
  assert.equal(cleanup.credentials?.removed, true, 'Synthetic credentials must be removed before dropping the owned DB');
  return true;
}
