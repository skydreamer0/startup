const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const errorName = error => error instanceof Error ? error.name : 'Error';

function withTimeout(operation, timeoutMs, label) {
  let timer;
  const timedOut = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${label} timed out`), { name: 'TimeoutError' })), timeoutMs);
  });
  return Promise.race([Promise.resolve().then(operation), timedOut]).finally(() => clearTimeout(timer));
}

async function settle(operation, timeoutMs, label) {
  try {
    await withTimeout(operation, timeoutMs, label);
    return { status: 'completed', errorName: null };
  } catch (error) {
    return { status: error?.name === 'TimeoutError' ? 'timeout' : 'rejected', errorName: errorName(error) };
  }
}

async function waitUntilRemoved(profileExists, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  do {
    try {
      const exists = await withTimeout(profileExists, Math.max(1, deadline - Date.now()), 'Browser profile observation');
      if (exists === false) return true;
      if (exists !== true) return false;
    } catch { return false; }
    if (Date.now() >= deadline) return false;
    await new Promise(resolve => setTimeout(resolve, Math.min(25, Math.max(1, deadline - Date.now()))));
  } while (Date.now() <= deadline);
  return false;
}

export async function runOwnedPhaseWithRecoveryReceipt(owner, command, args, options, cleanup) {
  const result = await owner.run(command, args, options);
  const cleanupReceipt = await cleanup();
  const validSignals = Array.isArray(result?.recoverySignals)
    && result.recoverySignals.length === result.signalCount;
  const validCleanupSignals = Array.isArray(cleanupReceipt?.signals)
    && cleanupReceipt.signals.length === cleanupReceipt.signalCount;
  if (result?.quiescent !== true || !Object.hasOwn(result ?? {}, 'cancelled') || result.cancelled !== null
    || !Number.isSafeInteger(result?.signalCount) || result.signalCount !== 0
    || !validSignals || cleanupReceipt?.quiescent !== true
    || !Number.isSafeInteger(cleanupReceipt?.signalCount) || cleanupReceipt.signalCount !== 0
    || !validCleanupSignals) {
    throw new Error('Owned phase recovery signals or cleanup prevent normal acceptance');
  }
  return { ...result, cleanup: cleanupReceipt };
}

/**
 * Run a browser callback and always record the graceful close attempt, process
 * exit evidence and profile removal. This function deliberately does not kill
 * a timed-out browser; the run supervisor owns recovery and such recovery can
 * never qualify as a normal receipt.
 */
export async function recordNativeLifecycle({
  identity, profilePath, use, closeServer, closeClient, waitForProcessClose,
  profileExists, onReceipt, timeoutMs = 10_000,
}) {
  // The fixture may await close before its callback finishes. Start its deadline
  // on that first call, and retain the same outcome for final receipt collection.
  let closing;
  const close = () => {
    if (!closing) {
      closing = withTimeout(closeServer, timeoutMs, 'BrowserServer.close');
      // A callback may start close without awaiting it. Preserve the rejection
      // for collection without creating an unhandled-rejection side channel.
      void closing.catch(() => {});
    }
    return closing;
  };
  let callbackError = null;
  let callbackFailed = false;
  let callbackErrorName = null;
  try { await use(close); } catch (error) { callbackFailed = true; callbackError = error; callbackErrorName = errorName(error); }

  const serverClose = await settle(close, timeoutMs, 'BrowserServer.close');
  const clientClose = await settle(closeClient, timeoutMs, 'Browser CDP disconnect');
  let processClose;
  try {
    const value = await withTimeout(waitForProcessClose, timeoutMs, 'Browser process close');
    const exitCodePresent = value != null && Object.hasOwn(value, 'exitCode');
    const signalPresent = value != null && Object.hasOwn(value, 'signal');
    processClose = { status: 'completed', exitCodePresent,
      signalPresent, ...(exitCodePresent ? { exitCode: value.exitCode } : {}),
      ...(signalPresent ? { signal: value.signal } : {}), closeEvent: value?.closeEvent === true };
  } catch (error) {
    processClose = { status: error?.name === 'TimeoutError' ? 'timeout' : 'rejected',
      exitCodePresent: false, signalPresent: false, closeEvent: false, errorName: errorName(error) };
  }
  const profileRemoved = await waitUntilRemoved(profileExists, timeoutMs);
  const receipt = {
    schema: 'native-context-lifecycle/v1',
    runNonce: identity?.runNonce ?? null,
    testNonce: identity?.testNonce ?? null,
    test: identity?.test ?? null,
    process: {
      pid: Number.isInteger(identity?.pid) ? identity.pid : null,
      uid: Number.isInteger(identity?.uid) ? identity.uid : null,
      startTime: typeof identity?.startTime === 'string' && identity.startTime ? identity.startTime : null,
      ...processClose,
    },
    profile: { path: typeof profilePath === 'string' && profilePath ? profilePath : null, removed: profileRemoved },
    callback: { failed: callbackFailed, status: callbackFailed ? 'rejected' : 'fulfilled', errorName: callbackErrorName },
    close: { server: serverClose, client: clientClose },
    forcedRecovery: false,
  };
  receipt.outcome = 'normal';
  if (!validateNativeLifecycleReceipt(receipt).ok) receipt.outcome = 'unverified';
  await onReceipt?.(receipt);
  return { receipt, callbackError, callbackFailed };
}

export function sameProcessIdentity(left, right) {
  return Boolean(left && right && left.pid === right.pid && left.uid === right.uid && left.startTime === right.startTime);
}

export function validateNativeLifecycleReceipt(receipt, expected = {}) {
  const errors = [];
  const fail = message => errors.push(message);
  if (!receipt || receipt.schema !== 'native-context-lifecycle/v1') fail('schema missing or unsupported');
  if (!uuid.test(receipt?.runNonce ?? '') || (expected.runNonce && receipt?.runNonce !== expected.runNonce)) fail('run nonce missing or mismatched');
  if (!uuid.test(receipt?.testNonce ?? '')) fail('test nonce missing or invalid');
  if (expected.test && receipt?.test !== expected.test) fail('test identity mismatched');
  const process = receipt?.process ?? {};
  if (!Number.isSafeInteger(process.pid) || process.pid < 1) fail('process PID missing');
  if (!Number.isSafeInteger(process.uid) || process.uid < 0) fail('process UID missing');
  if (typeof process.startTime !== 'string' || !process.startTime) fail('process start time missing');
  if (process.status !== 'completed' || process.closeEvent !== true) fail('process close event missing');
  if (process.exitCodePresent !== true || process.signalPresent !== true) fail('process exit fields missing');
  if (process.exitCode !== 0 || process.signal !== null) fail('process did not exit normally with code 0 and no signal');
  if (typeof receipt?.profile?.path !== 'string' || !receipt.profile.path) fail('owned profile identity missing');
  if (receipt?.profile?.removed !== true) fail('owned profile removal unverified');
  if (receipt?.callback?.failed !== false || receipt?.callback?.status !== 'fulfilled') fail('test callback failed or was interrupted');
  if (receipt?.close?.server?.status !== 'completed') fail('BrowserServer graceful close incomplete');
  if (receipt?.close?.client?.status !== 'completed') fail('CDP client close incomplete');
  if (receipt?.forcedRecovery !== false) fail('forced recovery cannot count as normal acceptance');
  if (receipt?.outcome !== 'normal') fail('receipt outcome is not normal');
  return { ok: errors.length === 0, errors };
}

export function validateNativeLifecycleSet(receipts, { expectedCases, runNonce, supervisorSignalCount = 0, supervisorQuiescent = true }) {
  const errors = [];
  if (!Array.isArray(receipts)) return { ok: false, errors: ['per-case lifecycle receipts missing'] };
  if (!Array.isArray(expectedCases) || !expectedCases.length) errors.push('expected case set missing');
  if (!Number.isSafeInteger(supervisorSignalCount) || supervisorSignalCount !== 0) errors.push('supervisor forced cleanup observed');
  if (supervisorQuiescent !== true) errors.push('run-owned process tree not quiescent');
  const byTest = new Map();
  for (const receipt of receipts) {
    if (!byTest.has(receipt?.test)) byTest.set(receipt?.test, []);
    byTest.get(receipt?.test).push(receipt);
  }
  for (const test of expectedCases ?? []) {
    const rows = byTest.get(test) ?? [];
    if (rows.length !== 1) errors.push(`${test}: expected exactly one lifecycle receipt, found ${rows.length}`);
    for (const row of rows) {
      const result = validateNativeLifecycleReceipt(row, { runNonce, test });
      errors.push(...result.errors.map(message => `${test}: ${message}`));
    }
  }
  if (receipts.length !== (expectedCases?.length ?? 0)) errors.push('unexpected lifecycle receipts present');
  const unique = (selector, label) => {
    const values = receipts.map(selector).filter(Boolean);
    if (new Set(values).size !== values.length) errors.push(`${label} is not isolated per test`);
  };
  unique(row => row?.testNonce, 'test nonce');
  unique(row => row?.profile?.path, 'browser profile');
  unique(row => {
    const process = row?.process;
    return process?.pid && process?.uid !== null && process?.startTime ? `${process.pid}:${process.uid}:${process.startTime}` : null;
  }, 'process identity');
  return { ok: errors.length === 0, errors };
}
