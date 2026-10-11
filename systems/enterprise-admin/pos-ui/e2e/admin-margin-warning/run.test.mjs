import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { assertCjkFonts, assertTraceCjkFonts } from './cjk.mjs';
import { assertReport, assertAttachment, childEnvironment, validateEvidence, canPublishEvidence, assertInputIdentity, completionOutcome, validateScreenshot } from './run.mjs';
import { expectedCases } from './cases.mjs';
import { validatePng } from './png.mjs';
import { cleanupRunProcesses, findRunProcesses, signalRunProcess, createRunScope, readRunIdentity, isBaselineIdentity } from './owned-run.mjs';

const report = () => ({ errors: [], suites: [{ specs: expectedCases.map(title => ({ title, ok: true,
  tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', errors: [], duration: 1, attachments: [] }] }] })) }] });
test('registry retains original 22 warning cases and adds two read-only trace flows', () => {
  assert.equal(expectedCases.length, 24); assert.equal(new Set(expectedCases).size, 24);
  assert.equal(expectedCases.filter(name => !name.startsWith('batch-trace ')).length, 22);
  assert.equal(assertReport(report()).length, 24);
});
for (const [name, change] of [
  ['missing case', r => r.suites[0].specs.pop()],
  ['duplicate case', r => r.suites[0].specs.push(r.suites[0].specs[0])],
  ['skipped result', r => { r.suites[0].specs[0].tests[0].results[0].status = 'skipped'; }],
  ['expected failure', r => { r.suites[0].specs[0].tests[0].expectedStatus = 'failed'; }],
  ['hidden retry', r => r.suites[0].specs[0].tests[0].results.unshift({ status: 'failed' })],
  ['worker error', r => r.errors.push({ message: 'worker crashed' })],
]) test(`reject ${name}`, () => { const value = report(); change(value); assert.throws(() => assertReport(value)); });
test('child environment does not inherit DB, auth, Vite or browser override variables', () => {
  const actual = childEnvironment({ PATH: '/bin', HOME: '/home/runner', CI: 'true', DATABASE_URL: 'private',
    GITHUB_TOKEN: 'private', VITE_API_URL: 'private', PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH: 'private', NODE_OPTIONS: 'private' }, '/tmp/owned', 'test-nonce');
  assert.deepEqual(Object.keys(actual).sort(), ['PATH', 'HOME', 'CI', 'MARGIN_UI_OUTPUT', 'MARGIN_UI_BUILD', 'MARGIN_UI_RUN_NONCE', 'BROWSER'].sort());
});
test('artifact publication requires every child process to be quiescent', () => {
  assert.equal(canPublishEvidence({ types: { quiescent: true, exitCode: 1 } }, true), true);
  assert.equal(canPublishEvidence({ types: { quiescent: true }, browser: { quiescent: false } }, false), false);
  assert.equal(canPublishEvidence({ types: { quiescent: true } }, false), false);
  assert.equal(canPublishEvidence({}, true), false);
});
test('evidence rejects absent screenshots and network receipts', () => {
  assert.throws(() => validateEvidence('/tmp/not-used', assertReport(report())));
});
test('PNG validation rejects a header-only counterfeit or truncated image', () => {
  assert.throws(() => validatePng(Buffer.from('89504e470d0a1a0a', 'hex')));
  assert.throws(() => validatePng(Buffer.from('not PNG')));
});
test('attachment ownership rejects traversal and symbolic links', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'margin-guard-'));
  try {
    const owned = path.join(root, 'owned'); fs.mkdirSync(owned);
    const outside = path.join(root, 'outside'); fs.writeFileSync(outside, 'fixture');
    const inside = path.join(owned, 'safe'); fs.writeFileSync(inside, 'fixture');
    assert.equal(assertAttachment(owned, inside).toString(), 'fixture');
    assert.throws(() => assertAttachment(owned, outside));
    const link = path.join(owned, 'link'); fs.symlinkSync(outside, link);
    assert.throws(() => assertAttachment(owned, link));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('real git comparison rejects a workspace-only dependency policy change', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'margin-source-guard-'));
  try {
    const git = (...args) => execFileSync('git', ['-C', root, '-c', 'user.name=Synthetic Test', '-c', 'user.email=test@example.invalid', ...args], { encoding: 'utf8' }).trim();
    git('init', '--quiet');
    const file = path.join(root, 'systems/enterprise-admin/pnpm-workspace.yaml');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'packages: [admin-ui, pos-ui]\n');
    git('add', '.'); git('commit', '--quiet', '-m', 'test: original fixture');
    const head = git('rev-parse', 'HEAD');
    assertInputIdentity(git, head, head);
    fs.writeFileSync(file, 'packages: [admin-ui, pos-ui]\nonlyBuiltDependencies: [synthetic]\n');
    git('add', '.'); git('commit', '--quiet', '-m', 'test: changed fixture');
    assert.throws(() => assertInputIdentity(git, head, git('rev-parse', 'HEAD')), /Execution inputs differ/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('nonce cleanup catches detached grandchildren and leaves another run untouched', async () => {
  const owned = await createRunScope(randomUUID()), unrelated = await createRunScope(randomUUID());
  const spawn = nonce => Number(execFileSync(process.execPath, ['-e',
    `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'}); child.unref(); console.log(child.pid);`],
  { encoding: 'utf8', env: { PATH: process.env.PATH, MARGIN_UI_RUN_NONCE: nonce } }).trim());
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
    environment: async () => `MARGIN_UI_RUN_NONCE=${scope.nonce}\0`,
  }), /identity changed/);
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
  assert.deepEqual(completionOutcome(null, null), { error: null, status: 'passed' });
});
test('CJK receipt rejects missing, zero-glyph, webfont and wrong-node platform evidence', () => {
  const good = ['strong', 'p', 'summary'].map(selector => ({ selector, fonts: [{ familyName: 'Noto Sans CJK JP', glyphCount: 17, isCustomFont: false }] }));
  assertCjkFonts(good, false);
  for (const patch of [{ familyName: 'Arial' }, { glyphCount: 0 }, { isCustomFont: true }]) {
    const bad = structuredClone(good); Object.assign(bad[0].fonts[0], patch);
    assert.throws(() => assertCjkFonts(bad, false), /Actual CJK glyphs missing/);
  }
  assert.throws(() => assertCjkFonts([], false));
  assert.throws(() => assertCjkFonts(good, true));
});

test('locked Playwright loader collects all cases without launching a browser', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'margin-discovery-'));
  const pos = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  try {
    const listed = execFileSync(process.execPath, [path.join(pos, 'node_modules/@playwright/test/cli.js'),
      'test', '--config=e2e/admin-margin-warning/playwright.config.mts', '--list'], {
      cwd: pos, env: childEnvironment(process.env, output, randomUUID()), encoding: 'utf8', timeout: 20000,
    });
    assert.match(listed, /Total: 24 tests in 2 files/);
    for (const name of expectedCases) assert.ok(listed.includes(name), name);
  } finally { fs.rmSync(output, { recursive: true, force: true }); }
});

test('trace CJK receipt requires the actual title, explanation and control glyphs', () => {
  const records = ['#batch-trace-title', '#batch-trace-description', 'button'].map(selector => ({ selector, fonts: [{ familyName: 'Noto Sans CJK TC', glyphCount: 12, isCustomFont: false }] }));
  assertTraceCjkFonts(records);
  assert.throws(() => assertTraceCjkFonts(records.slice(1)));
  for (const patch of [{ familyName: 'Arial' }, { glyphCount: 0 }, { isCustomFont: true }]) {
    const bad = structuredClone(records); Object.assign(bad[0].fonts[0], patch); assert.throws(() => assertTraceCjkFonts(bad));
  }
});

function syntheticPng(width, height) {
  const crc = bytes => {
    let value = 0xffffffff;
    for (const byte of bytes) { value ^= byte; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); }
    return (value ^ 0xffffffff) >>> 0;
  };
  const chunk = (name, body) => {
    const type = Buffer.from(name), size = Buffer.alloc(4), sum = Buffer.alloc(4);
    size.writeUInt32BE(body.length); sum.writeUInt32BE(crc(Buffer.concat([type, body])));
    return Buffer.concat([size, type, body, sum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc((1 + width * 3) * height))), chunk('IEND', Buffer.alloc(0))]);
}
test('only the fixed desktop trace case accepts an exact 1366 by 768 decoded PNG', () => {
  const bytes = syntheticPng(1366, 768);
  assert.deepEqual(validateScreenshot(bytes, 'batch-trace 1366: source lifecycle'), { width: 1366, height: 768 });
  assert.throws(() => validatePng(bytes), 'Original generic minimum must remain 844');
  for (const title of expectedCases.filter(title => title !== 'batch-trace 1366: source lifecycle'))
    assert.throws(() => validateScreenshot(bytes, title), `No 768px exception for ${title}`);
});
test('desktop trace rejects wrong widths and both smaller and larger heights', () => {
  for (const [width, height] of [[1365, 768], [1366, 767], [1366, 769], [390, 844], [1440, 900]])
    assert.throws(() => validateScreenshot(syntheticPng(width, height), 'batch-trace 1366: source lifecycle'));
});
test('screenshot dispatch rejects unknown cases and truncated desktop bytes', () => {
  const bytes = syntheticPng(1366, 768);
  assert.throws(() => validateScreenshot(bytes, 'batch-trace 1024: source lifecycle'), /Unknown screenshot case/);
  assert.throws(() => validateScreenshot(bytes.subarray(0, -8), 'batch-trace 1366: source lifecycle'));
});
test('original warning and mobile dimensions still decode with their unchanged bounds', () => {
  assert.deepEqual(validateScreenshot(syntheticPng(1440, 900), 'margin 1440: pending and empty'), { width: 1440, height: 900 });
  assert.deepEqual(validateScreenshot(syntheticPng(390, 844), 'batch-trace 390: source errors'), { width: 390, height: 844 });
});

test('trace evidence rejects missing null-order screenshot stage', () => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'null-trace-guard-'));
  try {
    const title = 'batch-trace 390: source errors';
    const network = path.join(output, 'network.json');
    fs.writeFileSync(network, JSON.stringify({ title, syntheticHttp: true, physicalDevice: false,
      unexpected: [], pageErrors: [], browser: 'synthetic guard fixture' }));
    const attachments = [{ name: 'network.json', path: network },
      ...['source-long', 'source-403', 'source-404', 'source-500', 'source-empty']
        .map(name => ({ name: `${name}.png`, path: path.join(output, `${name}.png`) }))];
    assert.throws(() => validateEvidence(output, [{ title, duration: 1, attachments }]), /source-null-order/);
  } finally { fs.rmSync(output, { recursive: true, force: true }); }
});
