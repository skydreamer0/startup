import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { processOwner } from '../ui-evidence/owned-process.mjs';
import { expectedCases } from './cases.mjs';
import { expectedCloseShiftCases } from '../close-shift-dialog/cases.mjs';

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
async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.match(process.version, /^v22\./);
  assert.match(process.env.SKU_QA_HEAD ?? '', /^[a-f0-9]{40}$/);
  for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']) assert.match(process.env[key] ?? '', /^\d+$/);
  const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const root = path.resolve(app, '../../..');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10000 }).trim();
  const assertSource = () => {
    assert.equal(git('rev-parse', 'HEAD'), process.env.SKU_QA_HEAD);
    assert.equal(git('status', '--porcelain'), '', 'Exact-head source must remain clean');
    assert.equal(git('ls-files', '--others', '--ignored', '--exclude-standard', '--', 'systems/enterprise-admin/pos-ui/.env*'), '', 'No ambient Vite env');
    assert.equal(git('ls-files', '-v').split('\n').some(line => /^[a-zS]/.test(line)), false, 'No hidden index flags');
  };
  assertSource();
  const output = path.join(process.env.RUNNER_TEMP, `sku-qa-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`, 'ui');
  fs.mkdirSync(output, { recursive: false });
  const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const identity = { sourceSha: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
    runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, nonce: randomUUID(),
    scope: 'actual exact-head Chromium UI with synthetic intercepted HTTP; separate from PostgreSQL acceptance',
    node: process.version, apiProxy: false, serviceWorkers: 'blocked', webSockets: 'closed by fixture' };
  write('source.json', identity);
  const sourceFiles = git('ls-files', '--', 'systems/enterprise-admin/pos-ui', 'systems/enterprise-admin/packages/types', 'systems/enterprise-admin/pnpm-lock.yaml', '.github/workflows/ci.yml').split('\n');
  write('source-hashes.json', Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])));
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'RUNNER_TEMP', 'CI'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  Object.assign(env, { SKU_UI_OUTPUT: output, SKU_UI_NONCE: identity.nonce, CLOSE_SHIFT_OUTPUT: path.join(output, 'close-shift'), BROWSER: 'none' });
  const owner = processOwner();
  const log = fs.openSync(path.join(output, 'raw.log'), 'wx');
  const phases = {};
  let error = null;
  try {
    for (const [phase, args] of [
      ['types', ['exec', 'tsc', '--project', 'tsconfig.sku-acceptance.json']],
      ['build', ['exec', 'vite', 'build', '--config', 'e2e/sku-acceptance/vite.config.mts']],
      ['browser', ['exec', 'playwright', 'test', '--config', 'e2e/sku-acceptance.config.mts']],
      ['close-shift-contract', ['exec', 'node', '--test', 'e2e/close-shift-dialog/report.test.mjs']],
      ['close-shift-types', ['exec', 'tsc', '--project', 'e2e/close-shift-dialog/tsconfig.json']],
      ['close-shift-browser', ['exec', 'playwright', 'test', '--config', 'e2e/close-shift-dialog/playwright.config.mts']],
    ]) {
      phases[phase] = await owner.run('pnpm', args, { cwd: app, env, stdio: ['ignore', log, log] });
      assert.equal(phases[phase].exitCode, 0, `${phase} must pass`);
      assert.equal(phases[phase].signal, null);
      assert.equal(phases[phase].error, null);
      assert.equal(owner.cancelled, null);
    }
    assertSource();
    const cases = assertReport(JSON.parse(fs.readFileSync(path.join(output, 'report.json'), 'utf8')));
    const closeShiftCases = assertReport(JSON.parse(fs.readFileSync(path.join(output, 'close-shift', 'report.json'), 'utf8')), expectedCloseShiftCases);
    assert.equal(owner.cancelled, null);
    write('accepted.json', { ...identity, status: 'passed', cases, closeShiftCases, phases,
      visualReview: 'Screenshots and measured controls require independent visual review; no whole-page visual acceptance claimed',
      notRun: ['tenant switch through UI (no entry point in current POS)', 'browser UI page zoom at 200% (this suite checks text-only 200%)', 'physical scanner', 'iPad/Safari', 'real API to database through UI', 'whole POS layout and release gates'] });
  } catch (problem) { error = problem; }
  finally {
    fs.closeSync(log); owner.dispose();
    write('completion.json', { ...identity, phases, status: error ? 'failed' : 'passed', error: error?.message ?? null });
  }
  if (error) throw error;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
