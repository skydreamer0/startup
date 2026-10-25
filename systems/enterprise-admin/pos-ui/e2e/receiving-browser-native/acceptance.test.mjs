import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { runOwnedBrowser } from './owned-browser-process.mjs';
import { receivingBrowserScope } from './acceptance.mjs';

test('evidence names the tested scope and explicit lifecycle gates left unverified', () => {
  assert.ok(receivingBrowserScope.verified.some(item => item.includes('loser choice is displayed only')));
  assert.ok(receivingBrowserScope.notVerified.includes('save next revision after presenting CAS choice'));
  assert.ok(receivingBrowserScope.notVerified.includes('cross-tenant browser isolation'));
  assert.ok(receivingBrowserScope.notVerified.includes('pending/unknown-outcome navigation guard'));
  assert.ok(receivingBrowserScope.notVerified.includes('read-only actor attempted PUT rejection'));
});

test('owned browser child is asynchronous, waits for process close, and records cleanup receipt', async () => {
  const scope = { nonce: 'synthetic' };
  let cleanupCalls = 0;
  const result = await runOwnedBrowser('node', [], {}, {
    scope, start: () => {
      const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      setImmediate(() => { child.stdout.write('actual stdout'); child.stderr.write('actual stderr'); child.emit('close', 0, null); });
      return child;
    }, cleanup: async value => { assert.equal(value, scope); cleanupCalls++; return { quiescent: true, signalCount: 0 }; },
  });
  assert.equal(result.exitCode, 0); assert.equal(result.signal, null); assert.equal(result.stdout, 'actual stdout');
  assert.equal(result.stderr, 'actual stderr'); assert.equal(result.cleanup.quiescent, true); assert.equal(cleanupCalls, 1);
});

test('owned browser timeout invokes bounded owner cleanup and preserves timeout evidence', async () => {
  let killed = null, cleanupCalls = 0;
  const result = await runOwnedBrowser('node', [], {}, {
    timeoutMs: 5,
    start: () => {
      const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      child.kill = signal => { killed = signal; setImmediate(() => child.emit('close', null, signal)); return true; };
      return child;
    }, cleanup: async () => { cleanupCalls++; return { quiescent: true, signalCount: 1 }; },
  });
  assert.equal(result.timedOut, true); assert.equal(killed, 'SIGTERM'); assert.equal(cleanupCalls, 1);
  assert.equal(result.cleanup.signalCount, 1);
});

test('owned child without a close event settles after verified cleanup and terminate deadlines', async () => {
  const signals = [];
  const result = await runOwnedBrowser('node', [], {}, {
    timeoutMs: 5, cleanupTimeoutMs: 20, closeGraceMs: 5, killGraceMs: 5,
    start: () => { const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      child.kill = signal => { signals.push(signal); return true; }; return child; },
    cleanup: async () => ({ quiescent: true, signalCount: 1 }),
  });
  assert.equal(result.timedOut, true); assert.equal(result.closeTimedOut, true);
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']); assert.deepEqual(result.forcedSignals, signals);
  assert.equal(result.cleanup.quiescent, true);
});

test('owned cleanup rejection is retained while the exact spawned child is terminated and bounded', async () => {
  const signals = [];
  const result = await runOwnedBrowser('node', [], {}, {
    timeoutMs: 5, cleanupTimeoutMs: 20, closeGraceMs: 5, killGraceMs: 5,
    start: () => { const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      child.kill = signal => { signals.push(signal); return true; }; return child; },
    cleanup: async () => { throw new Error('owned scope inspect failed'); },
  });
  assert.equal(result.timedOut, true); assert.equal(result.closeTimedOut, true);
  assert.match(result.cleanupError.message, /owned scope inspect failed/);
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
});

test('cleanup that never settles has an independent deadline and cannot hang child completion', async () => {
  const result = await runOwnedBrowser('node', [], {}, {
    timeoutMs: 5, cleanupTimeoutMs: 5, closeGraceMs: 5, killGraceMs: 5,
    start: () => { const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      child.kill = () => true; return child; },
    cleanup: () => new Promise(() => {}),
  });
  assert.equal(result.closeTimedOut, true);
  assert.match(result.cleanupError.message, /cleanup deadline exceeded/);
});

test('normal child close still settles when owned cleanup never returns', async () => {
  const result = await runOwnedBrowser('node', [], {}, {
    cleanupTimeoutMs: 5,
    start: () => { const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
      setImmediate(() => child.emit('close', 0, null)); return child; },
    cleanup: () => new Promise(() => {}),
  });
  assert.equal(result.exitCode, 0); assert.equal(result.closeTimedOut, false);
  assert.match(result.cleanupError.message, /cleanup deadline exceeded/);
});
