import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertReport, assertEvidence, runOwnedPhase, publishEvidenceIfQuiescent, completionOutcome } from './run.mjs';
import { expectedCases } from './cases.mjs';

test('browser evidence requires every exact case without retries or skips', () => {
  const report = { errors: [], suites: [{ specs: expectedCases.map(title => ({ title, ok: true,
    tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', errors: [], duration: 1 }] }],
  })) }] };
  assert.equal(assertReport(report).length, expectedCases.length);
  for (const mutate of [
    value => value.suites[0].specs.pop(),
    value => { value.suites[0].specs[0].title = 'substitute'; },
    value => { value.suites[0].specs[0].tests[0].results[0].status = 'skipped'; },
    value => { value.suites[0].specs[0].tests[0].expectedStatus = 'failed'; },
    value => { value.suites[0].specs[0].tests[0].results.push({ status: 'passed' }); },
    value => { value.errors.push({ message: 'swallowed failure' }); },
    value => { value.suites[0].specs[0].ok = false; },
  ]) {
    const invalid = structuredClone(report); mutate(invalid);
    assert.throws(() => assertReport(invalid));
  }
});

test('sealed ledgers reject omitted cases, extra writes, egress, wrong nonce and untrusted keys', () => {
  const nonce = '00000000-0000-4000-8000-000000000000';
  const entries = expectedCases.map(title => ({ test: title, nonce, contextClosed: true, unexpected: [], pageErrors: [],
    forwardedStatic: ['GET /', 'GET /assets/app.js'], browserVersion: '143.0.0.0', keyboardEvents: [{ key: 'Enter', trusted: true }],
    expectedWrites: [{ method: 'POST', path: '/api/v1/admin/pos/staff-login', body: { employeeCode: 'SYNTHETIC-CASHIER' } },
      ...(title.includes('submits exactly once') || title.includes('preserves payload') ? [{ method: 'POST', path: '/api/v1/admin/pos/checkout' }] : [])] }));
  assert.equal(assertEvidence(entries, nonce), expectedCases.length);
  for (const mutate of [
    rows => rows.pop(), rows => rows.push(rows[0]), rows => { rows[0].nonce = 'old-run'; },
    rows => { rows[0].contextClosed = false; }, rows => { rows[0].keyboardEvents[0].trusted = false; },
    rows => { rows[0].forwardedStatic.push('GET /api/v1/admin/pos/checkout'); },
    rows => { rows[0].unexpected.push('WebSocket wss://unexpected.invalid'); },
    rows => { rows[0].expectedWrites.push({ method: 'POST', path: '/api/v1/admin/pos/checkout' }); },
    rows => { rows[0].pageErrors.push('uncaught error'); },
  ]) { const bad = structuredClone(entries); mutate(bad); assert.throws(() => assertEvidence(bad, nonce)); }
});

test('cleanup rejection revokes publication even after a previous successful phase', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dialog-publication-'));
  const output = path.join(directory, 'github-output');
  try {
    for (const run of [async () => { throw new Error('Owned process group did not become quiescent'); }, async () => ({ quiescent: false })]) {
      const state = { quiescent: true };
      await assert.rejects(runOwnedPhase({ run }, 'unused', [], {}, state, async () => ({ quiescent: true })));
      assert.equal(state.quiescent, false);
      assert.equal(publishEvidenceIfQuiescent(state, directory, output), false);
      assert.equal(fs.existsSync(output), false);
    }
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test('detached cleanup failure cannot publish after the direct process group exits', async () => {
  for (const cleanup of [async () => { throw new Error('detached cleanup denied'); }, async () => ({ quiescent: false })]) {
    const state = { quiescent: true };
    await assert.rejects(runOwnedPhase({ run: async () => ({ quiescent: true }) }, 'unused', [], {}, state, cleanup));
    assert.equal(state.quiescent, false);
    assert.equal(publishEvidenceIfQuiescent(state, '/tmp/unused', undefined), false);
  }
});
test('a failed but quiescent phase may publish diagnostic evidence without a pass', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dialog-publication-'));
  const output = path.join(directory, 'github-output');
  try {
    const state = { quiescent: false };
    const result = await runOwnedPhase({ run: async () => ({ quiescent: true, exitCode: 1 }) }, 'unused', [], {}, state, async () => ({ quiescent: true }));
    assert.equal(result.exitCode, 1); assert.equal(publishEvidenceIfQuiescent(state, directory, output), true);
    assert.equal(fs.readFileSync(output, 'utf8'), `evidence_dir=${directory}\n`);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test('cancellation during delayed final cleanup cannot become an accepted result', async () => {
  const owner = { cancelled: null };
  const cleanup = async () => {
    await new Promise(resolve => setImmediate(() => { owner.cancelled = 'SIGTERM'; resolve(); }));
    return { quiescent: true };
  };
  const receipt = await cleanup();
  const terminal = completionOutcome(null, owner.cancelled);
  assert.equal(receipt.quiescent, true);
  assert.equal(terminal.status, 'failed');
  assert.match(terminal.error.message, /cancelled during cleanup: SIGTERM/);
  assert.equal(!terminal.error, false, 'The acceptance-write condition must remain false');
  const prior = new Error('original phase failure');
  assert.equal(completionOutcome(prior, owner.cancelled).error, prior);
});
