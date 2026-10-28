import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { fixtureLifecycle, finalizeBatchFixture } from './lifecycle.mjs';
import { processOwner } from '../ui-evidence/owned-process.mjs';
import { fixtureProcessOwner } from './process-owner.mjs';
import { createRunScope, cleanupRunProcesses } from '../category-native/owned-run.mjs';
import { completionOutcome } from '../category-native/contract.mjs';
import { assertEvidence } from './contract.mjs';
import { goodEvidence } from './test-support.mjs';

// Execute the actual fixture's resource-owning body, not a parallel implementation.
// Only preflight/import dependencies are injected; no app, DB or browser is loaded.
test('scope initialization rejection reaches the actual fixture terminal boundary', async () => {
  const source = fs.readFileSync(new URL('../../../backend/scripts/admin-batch-entry-browser-fixture.ts', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('  const lifecycle ='), source.lastIndexOf('\n}\nmain()'));
  assert.ok(body.includes('await createRunScope('));
  const failure = Object.assign(new Error('injected scope failure'), { code: 'SCOPE_INJECTED' });
  const calls = [], receipts = {}, tokens = { synthetic: 'private' };
  const counts = ['SIGTERM', 'SIGINT'].map(name => process.listenerCount(name));
  const dependencies = {
    fixtureLifecycle, processOwner, finalizeBatchFixture, assert, tokens, server: undefined,
    createRunScope: async () => { throw failure; },
    cleanupRunProcesses: async () => { throw new Error('scope unavailable'); },
    db: { $disconnect: async () => calls.push('disconnect'), $queryRaw: () => { throw new Error('must not query'); } },
    drainHttp: async () => { calls.push('drain'); return true; },
    fs: { rmSync: () => calls.push('purge') }, bootstrap: 'synthetic',
    write: (name, value) => { calls.push(name); receipts[name] = value; },
    console: { error: () => {} },
  };
  const execute = new (Object.getPrototypeOf(async function () {}).constructor)(...Object.keys(dependencies), stripTypeScriptTypes(body));
  await assert.rejects(execute(...Object.values(dependencies)), error => error === failure);
  assert.deepEqual(calls, ['drain', 'disconnect', 'purge', 'api-ledger.json', 'database-receipt.json']);
  assert.deepEqual(tokens, {});
  assert.deepEqual(['SIGTERM', 'SIGINT'].map(name => process.listenerCount(name)), counts);
  assert.equal(receipts['database-receipt.json'].browserQuiescent, false);
  assert.equal(receipts['database-receipt.json'].afterEmpty, false);
  assert.equal(receipts['database-receipt.json'].error.stage, 'browser-scope-initialization');
  assert.equal(receipts['database-receipt.json'].error.code, 'SCOPE_INJECTED');
});

const url = name => new URL(name, import.meta.url).href;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function ready(file) {
  const until = Date.now() + 5000;
  while (!fs.existsSync(file)) {
    assert.ok(Date.now() < until, 'owned probe did not become ready');
    await delay(10);
  }
}
function live(pid) {
  try { return !['Z', 'X'].includes(fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ')[0]); }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

for (const mode of ['cooperative', 'nonce-recovery', 'unknown-stop']) {
  test(`two-layer cancellation: ${mode} preserves ownership and never accepts`, { timeout: 15000 }, async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-two-layer-'));
    const nonce = randomUUID();
    // Same nonce, but predating the fixture scope: must never be signalled.
    const sentinel = spawn(process.execPath, ['-e', 'setInterval(() => {}, 100)'], {
      detached: true, env: { CATEGORY_UI_NONCE: nonce }, stdio: 'ignore',
    });
    const sentinelClosed = new Promise(resolve => sentinel.once('close', resolve));
    const scope = await createRunScope(nonce);
    const owner = fixtureProcessOwner();
    let running;
    const browserScript = `
      import fs from 'node:fs';
      import { spawn } from 'node:child_process';
      const [root, mode] = process.argv.slice(1);
      if (mode === 'nonce-recovery') {
        const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 100)'], {detached:true, env:process.env, stdio:'ignore'});
        fs.writeFileSync(root + '/descendant', String(child.pid)); child.unref();
      }
      fs.writeFileSync(root + '/ready', String(process.pid));
      setInterval(() => {}, 100);
    `;
    const fixtureScript = `
      import fs from 'node:fs';
      import assert from 'node:assert/strict';
      import { fixtureLifecycle, finalizeBatchFixture } from ${JSON.stringify(url('./lifecycle.mjs'))};
      import { processOwner } from ${JSON.stringify(url('../ui-evidence/owned-process.mjs'))};
      import { createRunScope, cleanupRunProcesses, readRunIdentity, signalRunProcess } from ${JSON.stringify(url('../category-native/owned-run.mjs'))};
      const [root, mode, browserScript, sentinel] = process.argv.slice(1);
      const lifecycle = fixtureLifecycle(), owner = processOwner();
      const scope = await createRunScope(process.env.CATEGORY_UI_NONCE);
      const calls = [], proof = {}; let failure = null, browser;
      const fail = error => { failure ??= error; };
      try {
        browser = await owner.run(process.execPath, ['--input-type=module', '-e', browserScript, root, mode], { env:process.env, stdio:'ignore' });
        lifecycle.checkpoint();
      } catch (error) { fail(error); }
      finally {
        await finalizeBatchFixture({
          stopBrowser: async () => {
            assert.equal(await readRunIdentity(Number(sentinel), scope), null);
            if (mode === 'nonce-recovery') {
              const pid = Number(fs.readFileSync(root + '/descendant', 'utf8'));
              const identity = await readRunIdentity(pid, scope); assert.ok(identity);
              assert.equal(await readRunIdentity(pid, {...scope, nonce:'00000000-0000-0000-0000-000000000000'}), null);
              await assert.rejects(signalRunProcess({...identity, startTime:'invalid'}, scope, 'SIGTERM'), /PID was reused/);
              let sent = false;
              await assert.rejects(signalRunProcess(identity, scope, 'SIGTERM', async () => ({...identity, uid:identity.uid + 1}), () => { sent = true; }));
              assert.equal(sent, false); proof.identityGuards = true;
            }
            proof.cleanup = await cleanupRunProcesses(scope);
            calls.push('stop');
            return mode === 'unknown-stop' ? undefined : proof.cleanup.quiescent;
          },
          drainHttp: async () => { calls.push('drain'); return true; },
          afterSnapshot: async () => { calls.push('snapshot'); },
          cleanupRows: async () => { calls.push('rows'); },
          disconnect: async () => { calls.push('disconnect'); },
          purgePrivate: async () => { calls.push('purge'); },
          writeLedger: async () => {}, writeReceipt: async value => { proof.terminal = value; },
          dispose: () => { owner.dispose(); lifecycle.dispose(); calls.push('dispose'); },
        }, fail);
        fs.writeFileSync(root + '/receipt', JSON.stringify({calls, proof, browser, cancelled:lifecycle.stopped, failed:failure !== null}));
      }
      process.exitCode = failure ? 1 : 0;
    `;
    try {
      running = owner.run(process.execPath, ['--input-type=module', '-e', fixtureScript, root, mode, browserScript, String(sentinel.pid)], {
        env: { CATEGORY_UI_NONCE: nonce }, stdio: ['ignore', 'ignore', 'inherit'],
      });
      await ready(path.join(root, 'ready'));
      process.emit('SIGTERM');
      const result = await running;
      const receipt = JSON.parse(fs.readFileSync(path.join(root, 'receipt'), 'utf8'));
      assert.equal(result.cancelled, 'SIGTERM');
      assert.equal(result.exitCode, 1);
      assert.equal(result.quiescent, true);
      assert.equal(result.signal, null);
      assert.deepEqual(result.recoverySignals.map(row => row.signal), ['SIGTERM']);
      assert.equal(receipt.browser.cancelled, 'SIGTERM');
      assert.equal(receipt.browser.quiescent, true);
      assert.equal(receipt.cancelled, 'SIGTERM');
      assert.equal(receipt.failed, true);
      assert.equal(receipt.proof.cleanup.quiescent, true);
      assert.equal(live(Number(fs.readFileSync(path.join(root, 'ready'), 'utf8'))), false);
      assert.equal(live(sentinel.pid), true);
      assert.equal(receipt.calls.includes('rows'), mode !== 'unknown-stop');
      assert.equal(receipt.calls.includes('snapshot'), mode !== 'unknown-stop');
      assert.deepEqual(receipt.calls.slice(-3), ['disconnect', 'purge', 'dispose']);
      if (mode === 'nonce-recovery') {
        assert.equal(receipt.proof.identityGuards, true);
        assert.equal(receipt.proof.cleanup.discoveredCount, 1);
        assert.equal(live(Number(fs.readFileSync(path.join(root, 'descendant'), 'utf8'))), false);
      }
      assert.notEqual(completionOutcome(null, result.cancelled).status, 'passed');
      const evidence = goodEvidence(); evidence.database.cancelled = receipt.cancelled;
      assert.throws(() => assertEvidence(evidence.database, evidence.browsers, evidence.api));
    } finally {
      if (running) { process.emit('SIGTERM'); await running; }
      owner.dispose();
      await cleanupRunProcesses(scope);
      sentinel.kill('SIGTERM'); await sentinelClosed;
      fs.rmSync(root, {recursive:true, force:true});
    }
  });
}
