import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRunScope, cleanupRunProcesses, findRunProcesses, signalRunProcess, readRunIdentity, isBaselineIdentity } from './owned-run.mjs';

test('nonce cleanup catches detached grandchildren and leaves another run untouched', async () => {
  const owned = await createRunScope(randomUUID()), unrelated = await createRunScope(randomUUID());
  const spawn = nonce => Number(execFileSync(process.execPath, ['-e',
    `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'}); child.unref(); console.log(child.pid);`],
  { encoding: 'utf8', env: { PATH: process.env.PATH, DIALOG_UI_NONCE: nonce } }).trim());
  let ownedPid, unrelatedPid;
  try {
    ownedPid = spawn(owned.nonce); unrelatedPid = spawn(unrelated.nonce);
    assert.ok((await findRunProcesses(owned)).some(p => p.pid === ownedPid));
    const receipt = await cleanupRunProcesses(owned);
    assert.equal(receipt.quiescent, true);
    assert.ok(receipt.discovered.some(p => p.pid === ownedPid));
    assert.deepEqual(await findRunProcesses(owned), []);
    assert.ok((await findRunProcesses(unrelated)).some(p => p.pid === unrelatedPid));
  } finally { await cleanupRunProcesses(owned); await cleanupRunProcesses(unrelated); }
});
test('unreadable identity and non-quiescent ownership fail closed', async () => {
  const scope = await createRunScope(randomUUID());
  await assert.rejects(cleanupRunProcesses(scope, { inspect: async () => { throw new Error('unreadable identity'); } }), /unreadable identity/);
  await assert.rejects(cleanupRunProcesses(scope, { inspect: async () => [{ pid: 123, startTime: '456' }],
    send: async () => {}, sleep: async () => {} }), /publication is forbidden/);
});
test('stale PID identity is not signalled and fails closed', async () => {
  const scope = await createRunScope(randomUUID()), candidate = { pid: 123, startTime: '456', uid: process.getuid() };
  let signalled = false;
  await assert.rejects(signalRunProcess(candidate, scope, 'SIGTERM', async () => ({ ...candidate, startTime: '789' }), () => { signalled = true; }), /PID was reused/);
  assert.equal(signalled, false);
  assert.equal(await signalRunProcess(candidate, scope, 'SIGTERM', async () => null, () => { signalled = true; }), 'already-exited');
  assert.equal(signalled, false);
});
test('baseline excludes only exact pre-run identities without reading their environment', async () => {
  const before = { pid: 123, uid: process.getuid(), startTime: '456', state: 'S' };
  const scope = { nonce: randomUUID(), baseline: [before] };
  let reads = 0;
  const environment = async () => { reads++; throw Object.assign(new Error('synthetic EACCES'), { code: 'EACCES' }); };
  assert.equal(await readRunIdentity(123, scope, null, { metadata: async () => before, environment }), null);
  assert.equal(reads, 0);
  const reused = { ...before, startTime: '789' };
  assert.equal(isBaselineIdentity(reused, scope), false);
  await assert.rejects(readRunIdentity(123, scope, null, { metadata: async () => reused, environment }), /EACCES/);
  const added = { ...before, pid: 124 };
  assert.equal(isBaselineIdentity(added, scope), false);
  await assert.rejects(readRunIdentity(124, scope, null, { metadata: async () => added, environment }), /EACCES/);
  assert.equal(reads, 2);
});
test('identity changes during an ownership read fail closed', async () => {
  const scope = { nonce: randomUUID(), baseline: [] };
  let reads = 0;
  await assert.rejects(readRunIdentity(123, scope, null, {
    metadata: async () => ({ pid: 123, uid: process.getuid(), state: 'S', startTime: ++reads === 1 ? '456' : '789' }),
    environment: async () => `DIALOG_UI_NONCE=${scope.nonce}\0`,
  }), /identity changed/);
});
