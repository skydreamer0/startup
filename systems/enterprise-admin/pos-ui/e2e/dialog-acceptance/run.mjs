import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { processOwner } from '../ui-evidence/owned-process.mjs';
import { expectedCases } from './cases.mjs';
import { createRunScope, cleanupRunProcesses } from './owned-run.mjs';

export function assertReport(report, requiredCases = expectedCases) {
  assert.deepEqual(report.errors, []);
  const specs = [];
  const visit = suite => { specs.push(...(suite.specs ?? [])); for (const child of suite.suites ?? []) visit(child); };
  report.suites.forEach(visit);
  assert.deepEqual(specs.map(spec => spec.title).sort(), [...requiredCases].sort());
  return specs.map(spec => {
    assert.equal(spec.ok, true, spec.title);
    assert.equal(spec.tests.length, 1);
    const test = spec.tests[0];
    assert.equal(test.expectedStatus, 'passed');
    assert.equal(test.status, 'expected');
    assert.equal(test.results.length, 1, 'No retries can hide a failed attempt');
    assert.equal(test.results[0].status, 'passed', spec.title);
    assert.deepEqual(test.results[0].errors, []);
    return { title: spec.title, status: 'passed', duration: test.results[0].duration };
  });
}
export function assertEvidence(ledgers, nonce) {
  assert.match(nonce, /^[0-9a-f-]{36}$/);
  assert.deepEqual(ledgers.map(entry => entry.test).sort(), [...expectedCases].sort());
  for (const entry of ledgers) {
    assert.equal(entry.nonce, nonce); assert.equal(entry.contextClosed, true);
    assert.deepEqual(entry.unexpected, []); assert.deepEqual(entry.pageErrors, []);
    assert.ok(entry.forwardedStatic.length > 0);
    assert.ok(entry.forwardedStatic.every(url => /^(GET|HEAD) \/(assets\/[^?]+|login|favicon\.ico)?$/.test(url)));
    assert.ok(entry.keyboardEvents.every(event => event.trusted === true));
    assert.match(entry.browserVersion, /^\d+\.\d+\.\d+\.\d+$/);
    const submits = entry.test.includes('submits exactly once') || entry.test.includes('preserves payload');
    assert.equal(entry.expectedWrites.length, submits ? 2 : 1);
    assert.deepEqual(entry.expectedWrites[0], { method: 'POST', path: '/api/v1/admin/pos/staff-login', body: { employeeCode: 'SYNTHETIC-CASHIER' } });
    if (submits) {
      assert.equal(entry.expectedWrites[1].method, 'POST');
      assert.equal(entry.expectedWrites[1].path, '/api/v1/admin/pos/checkout');
      assert.ok(entry.keyboardEvents.some(event => event.key === 'Enter'));
    }
  }
  return ledgers.length;
}
export function assertFontEvidence(receipts, nonce) {
  assert.deepEqual([...new Set(receipts.map(receipt => receipt.test))].sort(), [...expectedCases].sort());
  for (const receipt of receipts) {
    assert.equal(receipt.nonce, nonce); assert.match(receipt.text ?? '', /[\u3400-\u9fff]/);
    assert.ok(receipt.fonts.some(font => /Noto Sans CJK/.test(font.familyName) && font.glyphCount > 0));
    assert.equal(typeof receipt.fontFamily, 'string');
  }
  return receipts.length;
}
export async function runOwnedPhase(owner, command, args, options, state, cleanup) {
  // A throw from process-group cleanup must revoke even an earlier safe phase.
  state.quiescent = false;
  const result = await owner.run(command, args, options);
  const runCleanup = await cleanup();
  state.quiescent = result.quiescent === true && runCleanup.quiescent === true;
  assert.equal(state.quiescent, true, 'Owned process tree must be quiescent');
  return { ...result, runCleanup };
}
export function publishEvidenceIfQuiescent(state, output, githubOutput) {
  if (!state.quiescent) return false;
  assert.equal(typeof githubOutput, 'string');
  assert.ok(path.isAbsolute(output)); assert.equal(/[\r\n]/.test(output), false);
  fs.appendFileSync(githubOutput, `evidence_dir=${output}\n`);
  return true;
}
export function completionOutcome(error, cancelled) {
  const finalError = error ?? (cancelled ? new Error(`Run cancelled during cleanup: ${cancelled}`) : null);
  return { error: finalError, status: finalError ? 'failed' : 'passed' };
}
async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.match(process.version, /^v22\./);
  assert.match(process.env.DIALOG_QA_HEAD ?? '', /^[a-f0-9]{40}$/);
  for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']) assert.match(process.env[key] ?? '', /^\d+$/);
  const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const root = path.resolve(app, '../../..');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10000 }).trim();
  const assertSource = () => {
    assert.equal(git('rev-parse', 'HEAD'), process.env.DIALOG_QA_HEAD);
    assert.equal(git('status', '--porcelain'), '', 'Exact-head source must remain clean');
    assert.equal(git('ls-files', '--others', '--ignored', '--exclude-standard', '--', 'systems/enterprise-admin/pos-ui/.env*'), '', 'No ambient Vite env');
    assert.equal(git('ls-files', '-v').split('\n').some(line => /^[a-zS]/.test(line)), false, 'No hidden index flags');
  };
  assertSource();
  const chromeVersion = execFileSync('google-chrome', ['--version'], { encoding: 'utf8', timeout: 10000 }).trim();
  assert.match(chromeVersion, /^Google Chrome /);
  const output = path.join(process.env.RUNNER_TEMP, `dialog-qa-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
  fs.mkdirSync(output, { recursive: false });
  const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const identity = { sourceSha: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
    runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, nonce: randomUUID(),
    scope: 'actual exact-head official Google Chrome UI with synthetic intercepted HTTP; separate from PostgreSQL acceptance',
    node: process.version, chromeVersion, chromeSandbox: true, apiProxy: false, serviceWorkers: 'blocked', webSockets: 'closed by fixture' };
  write('source.json', identity);
  const sourceFiles = git('ls-files', '--', 'systems/enterprise-admin/pos-ui', 'systems/enterprise-admin/packages/types', 'systems/enterprise-admin/pnpm-lock.yaml', '.github/workflows/ci.yml').split('\n');
  write('source-hashes.json', Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])));
  // Snapshot before any child receives this new nonce; never inspect baseline environments.
  const processScope = await createRunScope(identity.nonce);
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'RUNNER_TEMP', 'CI'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  Object.assign(env, { DIALOG_UI_OUTPUT: output, DIALOG_UI_NONCE: identity.nonce, BROWSER: 'none' });
  const owner = processOwner();
  const log = fs.openSync(path.join(output, 'raw.log'), 'wx');
  const phases = {};
  const processState = { quiescent: true };
  let error = null, accepted = null;
  try {
    for (const [phase, args] of [
      ['types', ['exec', 'tsc', '--project', 'tsconfig.dialog-acceptance.json']],
      ['build', ['exec', 'vite', 'build', '--config', 'e2e/dialog-acceptance/vite.config.mts']],
      ['browser', ['exec', 'playwright', 'test', '--config', 'e2e/dialog-acceptance.config.mts']],
    ]) {
      phases[phase] = await runOwnedPhase(owner, 'pnpm', args, { cwd: app, env, stdio: ['ignore', log, log] }, processState, () => cleanupRunProcesses(processScope));
      assert.equal(phases[phase].exitCode, 0, `${phase} must pass`);
      assert.equal(phases[phase].signal, null);
      assert.equal(phases[phase].error, null);
      assert.equal(owner.cancelled, null);
    }
    assertSource();
    const cases = assertReport(JSON.parse(fs.readFileSync(path.join(output, 'report.json'), 'utf8')));
    const ledgers = fs.readdirSync(path.join(output, 'tests'), { recursive: true }).filter(file => file.endsWith('network-evidence.json')).map(file => JSON.parse(fs.readFileSync(path.join(output, 'tests', file), 'utf8')));
    const sealedLedgers = assertEvidence(ledgers, identity.nonce);
    const fonts = fs.readdirSync(path.join(output, 'tests'), { recursive: true }).filter(file => file.endsWith('.fonts.json')).map(file => JSON.parse(fs.readFileSync(path.join(output, 'tests', file), 'utf8')));
    const fontReceipts = assertFontEvidence(fonts, identity.nonce);
    assert.equal(owner.cancelled, null);
    accepted = { ...identity, status: 'passed', cases, sealedLedgers, fontReceipts, phases,
      visualReview: 'Screenshots and measured controls require independent visual review; no whole-page visual acceptance claimed',
      notRun: ['tenant switch through UI (no entry point in current POS)', 'native browser zoom at 200%' , 'physical scanner', 'iPad/Safari', 'real API to database through UI', 'whole POS layout and release gates'] };
  } catch (problem) { error = problem; }
  finally {
    try {
      const cleanup = await cleanupRunProcesses(processScope);
      assert.equal(cleanup.quiescent, true, 'Final owned-process cleanup must be quiescent');
      write('run-cleanup.json', cleanup);
      processState.quiescent = processState.quiescent && cleanup.quiescent === true;
    } catch (problem) { processState.quiescent = false; error ??= problem; }
    const terminal = completionOutcome(error, owner.cancelled);
    error = terminal.error;
    fs.closeSync(log); owner.dispose();
    process.stdout.write(fs.readFileSync(path.join(output, 'raw.log'), 'utf8'));
    write('completion.json', { ...identity, phases, quiescent: processState.quiescent, status: terminal.status, error: error?.message ?? null });
    if (processState.quiescent && !error && accepted) write('accepted.json', accepted);
    // GitHub uploads only this output, never a fixed path while a producer is live.
    publishEvidenceIfQuiescent(processState, output, process.env.GITHUB_OUTPUT);
  }
  if (error) throw error;
  console.log('DIALOG_ACCEPTED_RECEIPT ' + fs.readFileSync(path.join(output, 'accepted.json'), 'utf8'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
