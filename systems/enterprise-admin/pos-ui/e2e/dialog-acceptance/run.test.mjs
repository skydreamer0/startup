import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertReport, assertEvidence, runOwnedPhase, publishEvidenceIfQuiescent, completionOutcome, assertFontEvidence } from './run.mjs';
import { expectedCases } from './cases.mjs';
import { brandAssets, brandRequest, assertBrandSources, assertBrandResponse, assertBrandEvidence } from './brand-assets.mjs';
import { fileURLToPath } from 'node:url';

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
    forwardedStatic: ['GET /', 'GET /assets/app.js'], verifiedBrand: [], browserVersion: '143.0.0.0', keyboardEvents: [{ key: 'Enter', trusted: true }],
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
    rows => { delete rows[0].verifiedBrand; },
    rows => { rows[0].verifiedBrand.push({ method: 'GET', path: '/brand/unknown.svg' }); },
    rows => { rows[0].forwardedStatic.push(`GET ${brandAssets[0].path}`); },
  ]) { const bad = structuredClone(entries); mutate(bad); assert.throws(() => assertEvidence(bad, nonce)); }
});

test('brand forwarding allows only the three observed same-origin GET paths without query or credentials', () => {
  const origin = 'http://127.0.0.1:4288';
  for (const asset of brandAssets) assert.equal(brandRequest(new URL(origin + asset.path), 'GET', origin), asset);
  for (const [url, method] of [
    [origin + brandAssets[0].path, 'POST'], [origin + brandAssets[0].path, 'HEAD'],
    [origin + brandAssets[0].path + '?cache=1', 'GET'], [origin + brandAssets[0].path + '#fragment', 'GET'],
    ['https://unexpected.invalid' + brandAssets[0].path, 'GET'],
    ['http://127.0.0.1:4289' + brandAssets[0].path, 'GET'],
    ['http://user:pass@127.0.0.1:4288' + brandAssets[0].path, 'GET'],
    [origin + '/brand/flow-capsule-v1/favicon.ico', 'GET'],
    [origin + '/brand/flow-capsule-v1/unknown.png', 'GET'],
    [origin + '/brand/flow-capsule-v2/favicon.svg', 'GET'],
    [origin + '/brand/flow-capsule-v1/favicon.svg/extra', 'GET'],
  ]) assert.equal(brandRequest(new URL(url), method, origin), undefined, `${method} ${url}`);
});

test('brand source and response receipts require approved bytes, status and MIME', () => {
  const app = fileURLToPath(new URL('../..', import.meta.url));
  assert.deepEqual(assertBrandSources(app), brandAssets);
  for (const asset of brandAssets) {
    const body = fs.readFileSync(path.join(app, 'public', asset.path));
    const response = { status: 200, contentType: asset.mime + '; charset=utf-8', body };
    const receipt = assertBrandResponse(asset, response);
    assertBrandEvidence([receipt]);
    for (const bad of [
      { ...response, status: 302 }, { ...response, status: 404 },
      { ...response, contentType: 'text/html' }, { ...response, contentType: undefined },
      { ...response, body: body.subarray(1) },
      { ...response, body: Buffer.from(body).fill(0, 0, 1) },
    ]) assert.throws(() => assertBrandResponse(asset, bad));
    for (const bad of [
      { ...receipt, method: 'HEAD' }, { ...receipt, bytes: receipt.bytes + 1 },
      { ...receipt, sha256: '0'.repeat(64) }, { ...receipt, mime: 'text/html' },
      { ...receipt, path: receipt.path + '?query=1' }, { ...receipt, extra: 'unsealed' },
    ]) assert.throws(() => assertBrandEvidence([bad]));
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dialog-brand-source-'));
  try {
    assert.throws(() => assertBrandSources(directory));
    for (const asset of brandAssets) {
      const target = path.join(directory, 'public', asset.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(app, 'public', asset.path), target);
    }
    assertBrandSources(directory);
    const target = path.join(directory, 'public', brandAssets[0].path);
    const altered = fs.readFileSync(target); altered[0] ^= 1; fs.writeFileSync(target, altered);
    assert.throws(() => assertBrandSources(directory), /SHA-256/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
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

test('font evidence requires actual CJK glyphs for every current case', () => {
  const nonce = '00000000-0000-4000-8000-000000000000';
  const receipts = expectedCases.map(title => ({ test: title, nonce, text: '拆單付款', fontFamily: 'Inter, sans-serif', fonts: [{ familyName: 'Noto Sans CJK TC', glyphCount: 4 }] }));
  assert.equal(assertFontEvidence(receipts, nonce), expectedCases.length);
  for (const mutate of [values => values.pop(), values => { values[0].fonts[0].glyphCount = 0; },
    values => { values[0].fonts[0].familyName = 'Arial'; }, values => { values[0].nonce = 'old'; },
    values => { values[0].text = 'No Chinese text'; }]) {
    const invalid = structuredClone(receipts); mutate(invalid); assert.throws(() => assertFontEvidence(invalid, nonce));
  }
});
