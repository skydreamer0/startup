import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHttpWorkTracker } from './http-work.mjs';
import { drainAndCloseServers } from './server-shutdown.mjs';

test('transport close before handler start remains active until dispatch and handler completion', () => {
  const tracker = createHttpWorkTracker();
  const request = tracker.begin();
  request.transportClosed();
  assert.equal(tracker.activeCount, 1);
  assert.equal(request.state.settled, false);
  assert.equal(request.state.applicationComplete, false);
  const finish = request.handlerStarted('late async route');
  assert.equal(tracker.activeCount, 1);
  assert.equal(request.state.applicationComplete, false);
  finish(undefined, true);
  assert.equal(tracker.activeCount, 0);
  assert.equal(request.state.settled, true);
});

test('application completion still waits for transport finish and duplicate events settle once', () => {
  const tracker = createHttpWorkTracker();
  const request = tracker.begin();
  request.handlerStarted('async route')(undefined, true);
  assert.equal(tracker.activeCount, 1);
  request.transportFinished(); request.transportClosed();
  assert.equal(tracker.activeCount, 0);
});

test('server closure is attempted in finally after a failed handler drain and errors remain separate', async () => {
  const drainError = new Error('handler still active'); const closed = [];
  const result = await drainAndCloseServers(async () => { throw drainError; }, ['owned-api'], async server => {
    closed.push(server); return { closed: true };
  });
  assert.equal(result.drainError, drainError);
  assert.deepEqual(closed, ['owned-api']);
  assert.deepEqual(result.closeResults, [{ closed: true }]);
});

test('one owned server close rejection does not prevent attempts to close the remaining listeners', async () => {
  const closeError = new Error('close callback deadline'); const attempted = [];
  const result = await drainAndCloseServers(async () => {}, ['first', 'second'], async server => {
    attempted.push(server); if (server === 'first') throw closeError; return { closed: true };
  });
  assert.deepEqual(attempted, ['first', 'second']);
  assert.equal(result.closeResults[0].closed, false); assert.equal(result.closeResults[0].error, closeError);
  assert.deepEqual(result.closeResults[1], { closed: true });
});
