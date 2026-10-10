import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const vanished = error => ['ENOENT', 'ESRCH'].includes(error.code);
const requireNonce = nonce => assert.match(nonce, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
async function metadata(pid) {
  const uid = (await stat(`/proc/${pid}`)).uid;
  if (uid !== process.getuid()) return { pid: Number(pid), uid };
  const text = await readFile(`/proc/${pid}/stat`, 'utf8');
  const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
  return { pid: Number(pid), uid, state: fields[0], startTime: fields[19] };
}
export async function createRunScope(nonce) {
  requireNonce(nonce);
  assert.equal(process.platform, 'linux');
  const baseline = [];
  // Call before passing this newly generated nonce to ANY child. No environment
  // is read here: these identities demonstrably predate all run-owned processes.
  for (const pid of await readdir('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    try {
      const value = await metadata(pid);
      if (value.uid === process.getuid()) baseline.push(Object.freeze(value));
    } catch (error) { if (!vanished(error)) throw error; }
  }
  return Object.freeze({ nonce, baseline: Object.freeze(baseline), capturedAt: new Date().toISOString() });
}
const requireScope = scope => { requireNonce(scope.nonce); assert.ok(Array.isArray(scope.baseline)); };
export const isBaselineIdentity = (candidate, scope) => scope.baseline.some(previous =>
  previous.pid === candidate.pid && previous.uid === candidate.uid && previous.startTime === candidate.startTime);
export async function readRunIdentity(pid, scope, expected = null, readers = {}) {
  requireScope(scope);
  const readMetadata = readers.metadata ?? metadata;
  const readEnvironment = readers.environment ?? (pid => readFile(`/proc/${pid}/environ`, 'utf8'));
  try {
    const before = await readMetadata(pid);
    if (before.uid !== process.getuid()) {
      if (expected) throw new Error('Owned process UID changed; refusing to signal');
      return null;
    }
    if (expected && expected.startTime !== before.startTime) throw new Error('Owned process PID was reused; refusing to signal');
    if (['Z', 'X'].includes(before.state)) return null;
    if (!expected && isBaselineIdentity(before, scope)) return null;
    // Never read baseline processes' environments, or retain/print any other
    // environment entries. New/reused unreadable identities still fail closed.
    const owns = (await readEnvironment(pid)).split('\0').includes(`DIALOG_UI_NONCE=${scope.nonce}`);
    const after = await readMetadata(pid);
    if (before.startTime !== after.startTime || before.uid !== after.uid) {
      throw new Error('Process identity changed while inspecting ownership');
    }
    if (!owns) {
      if (expected) throw new Error('Owned process identity changed; refusing to signal');
      return null;
    }
    if (['Z', 'X'].includes(after.state)) return null;
    assert.notEqual(Number(pid), process.pid, 'The coordinator must not inherit the child nonce');
    return { pid: Number(pid), startTime: after.startTime, uid: after.uid };
  } catch (error) { if (vanished(error)) return null; throw error; }
}
export async function signalRunProcess(candidate, scope, signal, inspect = readRunIdentity, send = process.kill) {
  const current = await inspect(candidate.pid, scope, candidate);
  if (!current) return 'already-exited';
  assert.equal(current.uid, process.getuid(), 'Owned process UID changed');
  assert.equal(current.startTime, candidate.startTime, 'Owned process PID was reused');
  try { send(current.pid, signal); } catch (error) { if (!vanished(error)) throw error; }
  return 'signalled';
}
export async function findRunProcesses(scope) {
  requireScope(scope);
  assert.equal(process.platform, 'linux');
  const found = [];
  for (const pid of await readdir('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    const owned = await readRunIdentity(pid, scope);
    if (owned) found.push(owned);
  }
  return found;
}
export async function cleanupRunProcesses(scope, options = {}) {
  requireScope(scope);
  const inspect = options.inspect ?? findRunProcesses;
  const send = options.send ?? ((candidate, signal) => signalRunProcess(candidate, scope, signal));
  const sleep = options.sleep ?? delay;
  const receipt = { nonce: scope.nonce, baselineCount: scope.baseline.length, baselineCapturedAt: scope.capturedAt,
    discovered: [], signals: [], quiescent: false };
  const seen = new Set();
  for (let attempt = 0; attempt < 50; attempt++) {
    const owned = await inspect(scope);
    if (!owned.length) {
      await sleep(50);
      if (!(await inspect(scope)).length) {
        return { ...receipt, quiescent: true, outcome: receipt.discovered.length ? 'cleaned' : 'already-clean',
          discoveredCount: receipt.discovered.length, signalCount: receipt.signals.length };
      }
      continue;
    }
    for (const process of owned) {
      const key = `${process.pid}:${process.startTime}`;
      if (!seen.has(key)) { seen.add(key); receipt.discovered.push(process); }
      const signal = attempt < 20 ? 'SIGTERM' : 'SIGKILL';
      await send(process, signal);
      receipt.signals.push({ ...process, signal });
    }
    await sleep(100);
  }
  throw new Error('Run-owned processes did not become quiescent; evidence publication is forbidden');
}
