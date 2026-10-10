import assert from 'node:assert/strict';
import { readdir, readFile, stat } from 'node:fs/promises';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const vanished = error => ['ENOENT', 'ESRCH'].includes(error.code);
const requireNonce = nonce => assert.match(nonce, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/);
async function identity(pid, nonce, expected = null) {
  const directory = `/proc/${pid}`;
  try {
    const uid = (await stat(directory)).uid;
    if (uid !== process.getuid()) {
      if (expected) throw new Error('Owned process UID changed; refusing to signal');
      return null;
    }
    const parse = text => {
      const fields = text.slice(text.lastIndexOf(')') + 2).split(' ');
      return { state: fields[0], startTime: fields[19] };
    };
    const before = parse(await readFile(`${directory}/stat`, 'utf8'));
    if (expected && expected.startTime !== before.startTime) throw new Error('Owned process PID was reused; refusing to signal');
    if (['Z', 'X'].includes(before.state)) return null;
    // Never retain or print other environment entries. A same-UID unreadable
    // identity fails closed because ownership cannot then be established.
    const owns = (await readFile(`${directory}/environ`, 'utf8')).split('\0').includes(`MARGIN_UI_RUN_NONCE=${nonce}`);
    const after = parse(await readFile(`${directory}/stat`, 'utf8'));
    if (!owns || before.startTime !== after.startTime) {
      if (expected) throw new Error('Owned process identity changed; refusing to signal');
      return null;
    }
    if (['Z', 'X'].includes(after.state)) return null;
    assert.notEqual(Number(pid), process.pid, 'The coordinator must not inherit the child nonce');
    return { pid: Number(pid), startTime: after.startTime, uid };
  } catch (error) { if (vanished(error)) return null; throw error; }
}
export async function signalRunProcess(candidate, nonce, signal, inspect = identity, send = process.kill) {
  const current = await inspect(candidate.pid, nonce, candidate);
  if (!current) return 'already-exited';
  assert.equal(current.uid, process.getuid(), 'Owned process UID changed');
  assert.equal(current.startTime, candidate.startTime, 'Owned process PID was reused');
  try { send(current.pid, signal); } catch (error) { if (!vanished(error)) throw error; }
  return 'signalled';
}
export async function findRunProcesses(nonce) {
  requireNonce(nonce);
  assert.equal(process.platform, 'linux');
  const found = [];
  for (const pid of await readdir('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    const owned = await identity(pid, nonce);
    if (owned) found.push(owned);
  }
  return found;
}
export async function cleanupRunProcesses(nonce, options = {}) {
  requireNonce(nonce);
  const inspect = options.inspect ?? findRunProcesses;
  const send = options.send ?? ((candidate, signal) => signalRunProcess(candidate, nonce, signal));
  const sleep = options.sleep ?? delay;
  const receipt = { nonce, discovered: [], signals: [], quiescent: false };
  const seen = new Set();
  for (let attempt = 0; attempt < 50; attempt++) {
    const owned = await inspect(nonce);
    if (!owned.length) {
      await sleep(50);
      if (!(await inspect(nonce)).length) {
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
