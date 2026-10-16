import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import vm from 'node:vm';
import { recordNativeLifecycle, runOwnedPhaseWithRecoveryReceipt, sameProcessIdentity, validateNativeLifecycleReceipt, validateNativeLifecycleSet } from './native-context.lifecycle.mjs';

const cases = ['stable-1366', 'stable-1024', 'stable-390', 'lifecycle-1366', 'lifecycle-1024', 'lifecycle-390', 'empty-390'];
const runNonce = randomUUID();
const identity = test => ({ runNonce, testNonce: randomUUID(), test, pid: 7000 + cases.indexOf(test), uid: 1000, startTime: `start-${test}` });
const healthy = test => ({ schema: 'native-context-lifecycle/v1', runNonce, testNonce: randomUUID(), test,
  process: { pid: 7000 + cases.indexOf(test), uid: 1000, startTime: `start-${test}`, status: 'completed', exitCodePresent: true, signalPresent: true, exitCode: 0, signal: null, closeEvent: true },
  profile: { path: `/tmp/profile-${test}`, removed: true }, callback: { failed: false, status: 'fulfilled', errorName: null },
  close: { server: { status: 'completed' }, client: { status: 'completed' } }, forcedRecovery: false, outcome: 'normal' });

async function record(testName, overrides = {}) {
  let exists = overrides.profileExists ?? false;
  const { receipt, callbackError, callbackFailed } = await recordNativeLifecycle({
    identity: identity(testName), profilePath: `/tmp/profile-${testName}`,
    use: overrides.use ?? (async () => {}),
    closeServer: overrides.closeServer ?? (async () => {}),
    closeClient: overrides.closeClient ?? (async () => {}),
    waitForProcessClose: overrides.waitForProcessClose ?? (async () => ({ exitCode: 0, signal: null, closeEvent: true })),
    profileExists: async () => exists,
    timeoutMs: overrides.timeoutMs ?? 30,
  });
  return { receipt, callbackError, callbackFailed };
}

test('normal BrowserServer close requires process exit evidence and actual profile removal', async () => {
  const { receipt, callbackError } = await record(cases[0]);
  assert.equal(callbackError, null);
  assert.equal(receipt.process.exitCodePresent, true);
  assert.equal(receipt.process.signalPresent, true);
  assert.deepEqual(validateNativeLifecycleReceipt(receipt, { runNonce, test: cases[0] }), { ok: true, errors: [] });
});

test('callback failure is recorded and cannot become a normal lifecycle pass', async () => {
  const callbackError = new Error('fixture callback failed');
  const result = await record(cases[0], { use: async () => { throw callbackError; } });
  assert.equal(result.callbackError, callbackError);
  assert.equal(result.receipt.close.server.status, 'completed');
  assert.equal(result.receipt.outcome, 'unverified');
  assert.ok(validateNativeLifecycleReceipt(result.receipt).errors.includes('test callback failed or was interrupted'));
});

test('close rejection and timeout are retained as non-normal outcomes', async () => {
  const rejected = await record(cases[0], { closeServer: async () => { throw new Error('close rejected'); } });
  assert.equal(rejected.receipt.close.server.status, 'rejected');
  assert.equal(rejected.receipt.outcome, 'unverified');
  const timedOut = await record(cases[0], { timeoutMs: 5, closeServer: () => new Promise(() => {}) });
  assert.equal(timedOut.receipt.close.server.status, 'timeout');
  assert.equal(timedOut.receipt.outcome, 'unverified');
  const clientRejected = await record(cases[0], { closeClient: async () => { throw new Error('CDP close rejected'); } });
  assert.equal(clientRejected.receipt.close.client.status, 'rejected');
  assert.equal(clientRejected.receipt.outcome, 'unverified');
});

test('missing exit code/signal, close event or profile removal fails closed', () => {
  for (const mutate of [
    row => { delete row.process.exitCode; },
    row => { delete row.process.signal; },
    row => { delete row.process.exitCodePresent; },
    row => { delete row.process.signalPresent; },
    row => { row.process.closeEvent = false; },
    row => { row.profile.removed = false; },
  ]) {
    const receipt = healthy(cases[0]); mutate(receipt);
    assert.equal(validateNativeLifecycleReceipt(receipt).ok, false);
  }
});

test('collector does not invent a successful null signal when the exit receipt omits it', async () => {
  const { receipt } = await record(cases[0], {
    waitForProcessClose: async () => ({ exitCode: 0, closeEvent: true }),
  });
  assert.equal(receipt.outcome, 'unverified');
  assert.equal(receipt.process.signalPresent, false);
});

test('falsy thrown callback values are still recorded as failures', async () => {
  for (const thrown of [null, 0]) {
    const { receipt, callbackError, callbackFailed } = await record(cases[0], { use: async () => { throw thrown; } });
    assert.equal(callbackError, thrown);
    assert.equal(callbackFailed, true);
    assert.equal(receipt.outcome, 'unverified');
    assert.equal(receipt.callback.failed, true);
    assert.equal(receipt.callback.status, 'rejected');
  }
});

test('process-owner recovery signals revoke zero-exit acceptance', async () => {
  const observed = [];
  await assert.rejects(runOwnedPhaseWithRecoveryReceipt({ run: async () => {
    observed.push({ pid: -7123, signal: 'SIGTERM' });
    return { exitCode: 0, signal: null, error: null, quiescent: true, cancelled: null,
      signalCount: 1, recoverySignals: [{ source: 'settle', signal: 'SIGTERM' }] };
  } }, 'unused', [], {}, async () => ({ quiescent: true, signalCount: 0 })), /recovery signals/);
  assert.deepEqual(observed, [{ pid: -7123, signal: 'SIGTERM' }]);
});

test('process-owner recovery evidence is required even when the count appears clean', async () => {
  await assert.rejects(runOwnedPhaseWithRecoveryReceipt({ run: async () => ({ exitCode: 0, signal: null,
    quiescent: true, cancelled: null, signalCount: 0 }) }, 'unused', [], {},
  async () => ({ quiescent: true, signalCount: 0 })), /recovery signals/);
});

test('clean phase acceptance requires explicit cancellation and cleanup signal receipts', async () => {
  const owner = { run: async () => ({ exitCode: 0, signal: null, quiescent: true, cancelled: null,
    signalCount: 0, recoverySignals: [] }) };
  const accepted = await runOwnedPhaseWithRecoveryReceipt(owner, 'unused', [], {},
    async () => ({ quiescent: true, signalCount: 0, signals: [] }));
  assert.equal(accepted.exitCode, 0);
  await assert.rejects(runOwnedPhaseWithRecoveryReceipt({ run: async () => ({ ...await owner.run(), cancelled: undefined }) },
    'unused', [], {}, async () => ({ quiescent: true, signalCount: 0, signals: [] })), /recovery signals/);
  await assert.rejects(runOwnedPhaseWithRecoveryReceipt(owner, 'unused', [], {},
    async () => ({ quiescent: true, signalCount: 0 })), /recovery signals/);
});

test('a zero-exit child with a residual owned member records and rejects settle recovery', async () => {
  let child = new EventEmitter(); child.pid = 123;
  const signals = []; let residual = true;
  const processStub = new EventEmitter();
  Object.assign(processStub, { platform: 'linux', kill: (pid, signal) => { signals.push({ pid, signal }); residual = false; } });
  let cancelDuringSpawn = false;
  const ownerPath = new URL('../ui-evidence/owned-process.mjs', import.meta.url);
  const ownerSource = readFileSync(ownerPath, 'utf8').replace(/^import .*;\n/gm, '').replace('export function processOwner', 'function processOwner');
  const context = vm.createContext({ process: processStub, setTimeout, clearTimeout,
    spawn: () => { if (cancelDuringSpawn) processStub.emit('SIGINT'); setImmediate(() => child.emit('close', 0, null)); return child; },
    readdir: async () => residual ? ['321'] : [],
    readFile: async () => '321 (fake owned child) S 1 123 0 0',
  });
  vm.runInContext(`${ownerSource}\nglobalThis.makeOwner = processOwner;`, context);
  const owner = context.makeOwner();
  let cancellationOwner;
  try {
    const result = await owner.run('fake-command', [], {});
    assert.equal(result.exitCode, 0);
    assert.deepEqual(signals, [{ pid: -123, signal: 'SIGTERM' }]);
    assert.equal(result.signalCount, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(result.recoverySignals)), [{ source: 'settle', signal: 'SIGTERM' }]);
    await assert.rejects(runOwnedPhaseWithRecoveryReceipt({ run: async () => result }, 'unused', [], {},
      async () => ({ quiescent: true, signalCount: 0 })), /recovery signals/);
    owner.dispose();

    child = new EventEmitter(); child.pid = 124; residual = true; signals.length = 0; cancelDuringSpawn = true;
    cancellationOwner = context.makeOwner();
    const cancelled = await cancellationOwner.run('fake-command', [], {});
    assert.equal(cancelled.cancelled, 'SIGINT');
    assert.deepEqual(signals, [{ pid: -124, signal: 'SIGTERM' }]);
    assert.equal(cancelled.signalCount, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(cancelled.recoverySignals)), [{ source: 'cancel', signal: 'SIGTERM' }]);
    await assert.rejects(runOwnedPhaseWithRecoveryReceipt({ run: async () => cancelled }, 'unused', [], {},
      async () => ({ quiescent: true, signalCount: 0, signals: [] })), /recovery signals/);
  } finally { owner.dispose(); cancellationOwner?.dispose(); }
});

test('worker interruption or escaped-child cleanup cannot publish normal acceptance', () => {
  const missingCase = validateNativeLifecycleSet(cases.slice(1).map(healthy), { expectedCases: cases, runNonce });
  assert.equal(missingCase.ok, false);
  assert.ok(missingCase.errors.some(error => error.includes('found 0')));
  const escaped = validateNativeLifecycleSet(cases.map(healthy), { expectedCases: cases, runNonce, supervisorSignalCount: 1 });
  assert.equal(escaped.ok, false);
  assert.ok(escaped.errors.includes('supervisor forced cleanup observed'));
  const survivingChild = validateNativeLifecycleSet(cases.map(healthy), { expectedCases: cases, runNonce, supervisorQuiescent: false });
  assert.equal(survivingChild.ok, false);
  assert.ok(survivingChild.errors.includes('run-owned process tree not quiescent'));
});

test('same-run peers require separate case nonces, profiles and process identities', () => {
  const receipts = cases.map(healthy);
  receipts[1].profile.path = receipts[0].profile.path;
  receipts[2].testNonce = receipts[0].testNonce;
  receipts[3].process = { ...receipts[0].process };
  const isolated = validateNativeLifecycleSet(receipts, { expectedCases: cases, runNonce });
  assert.equal(isolated.ok, false);
  assert.ok(isolated.errors.some(error => error.includes('not isolated per test')));
  const wrongRun = cases.map(healthy);
  wrongRun[0].runNonce = randomUUID();
  assert.ok(validateNativeLifecycleSet(wrongRun, { expectedCases: cases, runNonce }).errors.some(error => error.includes('run nonce missing or mismatched')));
});

test('PID reuse is distinguished by start time, not treated as the same process', () => {
  const original = { pid: 42, uid: 1000, startTime: '100' };
  const reused = { pid: 42, uid: 1000, startTime: '200' };
  assert.equal(sameProcessIdentity(original, original), true);
  assert.equal(sameProcessIdentity(original, reused), false);
  const receipts = cases.map(healthy);
  receipts[1].process.pid = receipts[0].process.pid;
  receipts[1].process.startTime = 'reused-after-exit';
  assert.equal(validateNativeLifecycleSet(receipts, { expectedCases: cases, runNonce }).ok, true);
});

test('forced recovery never satisfies a normal per-case receipt', () => {
  const receipt = healthy(cases[0]);
  receipt.forcedRecovery = true;
  assert.ok(validateNativeLifecycleReceipt(receipt).errors.includes('forced recovery cannot count as normal acceptance'));
});

const options = {
  identity: { runNonce: '00000000-0000-0000-0000-000000000001', testNonce: '00000000-0000-0000-0000-000000000002', test: 'unit-case', pid: 42, uid: 1000, startTime: '123' },
  profilePath: '/unit-owned-profile', use: async () => {}, closeServer: async () => {}, closeClient: async () => {},
  waitForProcessClose: async () => ({ exitCode: 0, signal: null, closeEvent: true }), timeoutMs: 5,
};
test('profile observer unknown falsey values cannot assert removal', async () => {
  for (const value of [undefined, null, 0, '']) {
    const { receipt } = await recordNativeLifecycle({ ...options, profileExists: async () => value });
    assert.equal(receipt.profile.removed, false);
    assert.equal(receipt.outcome, 'unverified');
  }
});
test('hung profile observer completes an unverified receipt within its deadline', async () => {
  let timer;
  try {
    const result = await Promise.race([
      recordNativeLifecycle({ ...options, profileExists: async () => new Promise(() => {}) }),
      new Promise(resolve => { timer = setTimeout(() => resolve('HUNG'), 100); }),
    ]);
    assert.notEqual(result, 'HUNG');
    assert.equal(result.receipt.profile.removed, false);
    assert.equal(result.receipt.outcome, 'unverified');
  } finally { clearTimeout(timer); }
});

test('callback-side close shares the collection deadline and calls the server only once', async () => {
  let calls = 0;
  const { receipt, callbackFailed } = await recordNativeLifecycle({ ...options,
    use: async close => { await close(); await close(); },
    closeServer: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 40)); },
    profileExists: async () => false,
  });
  assert.equal(calls, 1);
  assert.equal(callbackFailed, true);
  assert.equal(receipt.close.server.status, 'timeout');
  assert.equal(receipt.outcome, 'unverified');
});

test('callback-side hung close still disconnects the client and emits an unverified receipt', async () => {
  let calls = 0, clientClosed = false, timer;
  try {
    const result = await Promise.race([
      recordNativeLifecycle({ ...options,
        use: async close => { await close(); },
        closeServer: async () => { calls++; await new Promise(() => {}); },
        closeClient: async () => { clientClosed = true; },
        profileExists: async () => false,
      }),
      new Promise(resolve => { timer = setTimeout(() => resolve('HUNG'), 100); }),
    ]);
    assert.notEqual(result, 'HUNG');
    assert.equal(calls, 1); assert.equal(clientClosed, true);
    assert.equal(result.receipt.close.server.status, 'timeout');
    assert.equal(result.receipt.outcome, 'unverified');
  } finally { clearTimeout(timer); }
});

test('catching a close timeout or ignoring its promise cannot erase the stored close failure', async () => {
  for (const mode of ['caught', 'ignored']) {
    let calls = 0;
    const { receipt } = await recordNativeLifecycle({ ...options,
      use: async close => {
        if (mode === 'caught') { try { await close(); } catch {} }
        else { void close(); await new Promise(resolve => setTimeout(resolve, 15)); }
      },
      closeServer: async () => { calls++; await new Promise(() => {}); },
      profileExists: async () => false,
    });
    assert.equal(calls, 1); assert.equal(receipt.callback.failed, false);
    assert.equal(receipt.close.server.status, 'timeout');
    assert.equal(receipt.outcome, 'unverified');
  }
});

test('late server completion cannot replace a timeout even after callback catches it', async () => {
  let calls = 0, serverCompleted = false, clientCalls = 0;
  const { receipt } = await recordNativeLifecycle({ ...options,
    use: async close => {
      try { await close(); } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    },
    closeServer: async () => {
      calls++; await new Promise(resolve => setTimeout(resolve, 40)); serverCompleted = true;
    },
    closeClient: async () => { clientCalls++; },
    profileExists: async () => false,
  });
  assert.equal(serverCompleted, true); assert.equal(calls, 1); assert.equal(clientCalls, 1);
  assert.equal(receipt.callback.failed, false);
  assert.equal(receipt.close.server.status, 'timeout');
  assert.equal(receipt.outcome, 'unverified');
});

test('close deadline does not limit the valid test callback duration', async () => {
  let calls = 0;
  const { receipt } = await recordNativeLifecycle({ ...options,
    use: async close => {
      await new Promise(resolve => setTimeout(resolve, 15));
      await close(); await close();
    },
    closeServer: async () => { calls++; }, profileExists: async () => false,
  });
  assert.equal(calls, 1); assert.equal(receipt.callback.failed, false);
  assert.equal(receipt.close.server.status, 'completed');
  assert.equal(receipt.outcome, 'normal');
});
