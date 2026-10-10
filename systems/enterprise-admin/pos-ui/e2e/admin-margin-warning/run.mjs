import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { processOwner } from '../ui-evidence/owned-process.mjs';
import { resolveProvenance } from '../ui-evidence/provenance.mjs';
import { expectedCases } from './cases.mjs';
import { validatePng } from './png.mjs';
import { assertCjkFonts } from './cjk.mjs';
import { cleanupRunProcesses, createRunScope } from './owned-run.mjs';

export const sourceInputs = ['systems/enterprise-admin/admin-ui', 'systems/enterprise-admin/packages/types',
  'systems/enterprise-admin/pnpm-lock.yaml', 'systems/enterprise-admin/pnpm-workspace.yaml', 'systems/enterprise-admin/package.json',
  'systems/enterprise-admin/pos-ui/package.json', 'systems/enterprise-admin/pos-ui/e2e/admin-margin-warning',
  'systems/enterprise-admin/pos-ui/e2e/ui-evidence/owned-process.mjs',
  'systems/enterprise-admin/pos-ui/e2e/ui-evidence/provenance.mjs', '.github/workflows/ci.yml'];
export function assertInputIdentity(git, head, execution) {
  assert.equal(git('diff', '--name-only', head, execution, '--', ...sourceInputs), '', 'Execution inputs differ from submitted head');
}

export function assertReport(report, requiredCases = expectedCases) {
  assert.deepEqual(report.errors, []);
  const specs = [];
  const visit = suite => { specs.push(...(suite.specs ?? [])); (suite.suites ?? []).forEach(visit); };
  report.suites.forEach(visit);
  assert.deepEqual(specs.map(spec => spec.title).sort(), [...requiredCases].sort());
  return specs.map(spec => {
    assert.equal(spec.ok, true, spec.title);
    assert.equal(spec.tests.length, 1);
    const test = spec.tests[0];
    assert.equal(test.expectedStatus, 'passed'); assert.equal(test.status, 'expected');
    assert.equal(test.results.length, 1, 'No retries can hide an earlier failure');
    assert.equal(test.results[0].status, 'passed', spec.title); assert.deepEqual(test.results[0].errors, []);
    return { title: spec.title, duration: test.results[0].duration, attachments: test.results[0].attachments };
  });
}
export function childEnvironment(env, output, nonce) {
  const clean = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'RUNNER_TEMP', 'CI'].filter(key => env[key] !== undefined).map(key => [key, env[key]]));
  return { ...clean, MARGIN_UI_OUTPUT: output, MARGIN_UI_BUILD: path.join(output, 'app'), MARGIN_UI_RUN_NONCE: nonce, BROWSER: 'none' };
}
export function canPublishEvidence(phases, quiescent) {
  return quiescent === true && Object.keys(phases).length > 0 && Object.values(phases).every(phase => phase.quiescent === true);
}
export function completionOutcome(error, cancelled) {
  const finalError = error ?? (cancelled ? new Error(`Run cancelled during cleanup: ${cancelled}`) : null);
  return { error: finalError, status: finalError ? 'failed' : 'passed' };
}
export function assertAttachment(output, file) {
  assert.equal(typeof file, 'string');
  assert.ok(path.resolve(file).startsWith(path.resolve(output) + path.sep), 'Evidence must stay in the owned run');
  assert.equal(fs.lstatSync(file).isSymbolicLink(), false);
  assert.ok(fs.realpathSync(file).startsWith(fs.realpathSync(output) + path.sep));
  return fs.readFileSync(file);
}
export function validateEvidence(output, cases) {
  return cases.map(item => {
    const names = item.attachments.map(a => a.name);
    assert.equal(new Set(names).size, names.length, 'Duplicate evidence names');
    const network = item.attachments.find(a => a.name === 'network.json');
    assert.ok(network, item.title);
    const data = JSON.parse(assertAttachment(output, network.path));
    assert.equal(data.title, item.title); assert.equal(data.syntheticHttp, true); assert.equal(data.physicalDevice, false);
    assert.deepEqual(data.unexpected, []); assert.deepEqual(data.pageErrors, []); assert.ok(data.browser);
    const images = item.attachments.filter(a => a.name.endsWith('.png'));
    const suffix = item.title.split(': ')[1];
    const required = {
      'pending and empty': ['loading', 'empty'],
      'success and inputs': ['keyboard-open', 'pointer-open', 'closed'],
      'initial error and recovery': ['initial-error', 'error-recovered'],
      'refetch failure and recovery': ['refetch-pending', 'refetch-failed', 'refetch-recovered'],
      'period change': ['period-pending', 'period-recovered'],
      'quantity sort': ['sort-pending', 'sort-recovered'],
    }[suffix];
    assert.deepEqual(images.map(a => a.name).sort(), required.map(name => `${name}.png`).sort());
    const observations = images.map(image => {
      const bytes = assertAttachment(output, image.path);
      const dimensions = validatePng(bytes);
      const measure = item.attachments.find(a => a.name === image.name.replace(/\.png$/, '.json'));
      assert.ok(measure);
      const geometry = JSON.parse(assertAttachment(output, measure.path));
      assertCjkFonts(geometry.platformFonts, geometry.detailsOpen);
      return { name: image.name, sha256: createHash('sha256').update(bytes).digest('hex'),
        ...dimensions,
        pageOverflow: geometry.documentWidth > geometry.viewport.width + 1,
        summaryTarget: geometry.summary, warning: geometry.warning, computedFont: geometry.font, platformFonts: geometry.platformFonts };
    });
    return { title: item.title, duration: item.duration, browser: data.browser, viewport: data.viewport, observations };
  });
}
async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true'); assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.match(process.version, /^v22\./);
  for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']) assert.match(process.env[key] ?? '', /^\d+$/);
  const pos = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const admin = path.resolve(pos, '../admin-ui'), root = path.resolve(pos, '../../..');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10000, maxBuffer: 8 * 1024 * 1024 }).trim();
  const provenance = await resolveProvenance({ cwd: root });
  const assertSource = () => {
    assert.equal(git('rev-parse', 'HEAD'), provenance.executionHead);
    assert.equal(git('status', '--porcelain'), '', 'Acceptance source must be clean');
    assertInputIdentity(git, provenance.qaHead, provenance.executionHead);
    assert.equal(git('ls-files', '-v').split('\n').some(line => /^[a-zS]/.test(line)), false, 'Hidden index flags');
    assert.equal(git('ls-files', '--others', '--ignored', '--exclude-standard', '--', 'systems/enterprise-admin/admin-ui/.env*'), '', 'No ambient Admin environment');
  };
  assertSource();
  const output = path.join(process.env.RUNNER_TEMP, `admin-margin-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
  fs.mkdirSync(output, { recursive: false });
  const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const identity = { ...provenance, nonce: randomUUID(), node: process.version, runId: process.env.GITHUB_RUN_ID,
    attempt: process.env.GITHUB_RUN_ATTEMPT, scope: 'actual Admin Google Chrome UI with synthetic HTTP; no backend/database',
    browserChannel: 'chrome', browserSandbox: true, apiProxy: false, serviceWorkers: 'blocked', webSockets: 'blocked', syntheticAuth: true };
  write('source.json', identity);
  write('source-hashes.json', Object.fromEntries(git('ls-files', '--', ...sourceInputs).split('\n').map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])));
  // Snapshot before the first child receives the unique nonce. The baseline
  // records PID/start time only and never reads unrelated process environments.
  const runScope = await createRunScope(identity.nonce);
  write('run-baseline.json', runScope);
  const env = childEnvironment(process.env, output, identity.nonce), owner = processOwner();
  const log = fs.openSync(path.join(output, 'raw.log'), 'wx'), phases = {};
  let error = null, quiescent = true, accepted = null;
  try {
    for (const [phase, cwd, args] of [
      ['types', pos, ['exec', 'tsc', '--project', 'e2e/admin-margin-warning/tsconfig.json']],
      ['build', admin, ['exec', 'vite', 'build', '--config', '../pos-ui/e2e/admin-margin-warning/vite.config.mts']],
      ['browser', pos, ['exec', 'playwright', 'test', '--config', 'e2e/admin-margin-warning/playwright.config.mts']],
    ]) {
      quiescent = false;
      phases[phase] = await owner.run('pnpm', args, { cwd, env, stdio: ['ignore', log, log] });
      phases[phase].runCleanup = await cleanupRunProcesses(runScope);
      quiescent = phases[phase].quiescent === true && phases[phase].runCleanup.quiescent === true;
      assert.equal(phases[phase].exitCode, 0, `${phase} must pass`);
      assert.equal(phases[phase].signal, null); assert.equal(phases[phase].error, null); assert.equal(owner.cancelled, null);
    }
    assertSource();
    const cases = validateEvidence(output, assertReport(JSON.parse(fs.readFileSync(path.join(output, 'report.json'), 'utf8'))));
    accepted = { ...identity, status: 'passed', cases, phases,
      visualReview: 'PNG pixels require separate independent review; automated checks alone are not full visual acceptance',
      knownLimits: ['Existing initial-error zero/empty fallback is not repaired', 'Whole-report layout overflow is recorded separately',
        'Google font CSS stubbed; Ubuntu Noto CJK fallback verified by actual Chrome platform glyphs', 'No native page zoom, physical devices, Safari/iPad, screen reader, financial reconciliation, real API or DB acceptance'] };
  } catch (problem) { error = problem; }
  finally {
    try {
      const cleanup = await cleanupRunProcesses(runScope);
      write('run-cleanup.json', cleanup);
      quiescent = quiescent && cleanup.quiescent === true;
    } catch (problem) { quiescent = false; error ??= problem; }
    const terminal = completionOutcome(error, owner.cancelled);
    error = terminal.error;
    fs.closeSync(log); owner.dispose();
    if (canPublishEvidence(phases, quiescent)) {
      if (!error && accepted) {
        write('accepted.json', accepted);
        console.log(`Admin margin browser: ${accepted.cases.length} cases passed. PNG pixels await independent review.`);
        console.log(JSON.stringify(accepted.cases.map(({ title, observations }) => ({ title, observations }))));
      }
      write('completion.json', { ...identity, phases, status: terminal.status, error: error?.message ?? null });
      if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `evidence_dir=${output}\n`);
    }
    // Raw browser/type/build diagnostics stay inspectable even if a phase fails.
    console.log(fs.readFileSync(path.join(output, 'raw.log'), 'utf8'));
  }
  if (error) throw error;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
