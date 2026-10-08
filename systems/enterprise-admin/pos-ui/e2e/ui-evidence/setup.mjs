import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { readRun, atomicJson } from './run-artifacts.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');
const { output, context: invocation } = readRun();
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const requireSha = (value, label) => {
  if (!value || !/^[a-f0-9]{40}$/.test(value)) throw new Error(`Explicit ${label} SHA is required`);
  return value;
};
function assertCleanSource(cwd, label, sourcePaths = ['.']) {
  if (git(cwd, 'diff', '--name-only', 'HEAD', '--', '.') ||
      git(cwd, 'diff', '--cached', '--name-only', 'HEAD', '--', '.')) {
    throw new Error(`Dirty tracked ${label} source`);
  }
  if (git(cwd, 'ls-files', '--others', '--exclude-standard', '--', ...sourcePaths)) {
    throw new Error(`Untracked ${label} source`);
  }
  // Ignored local Vite environment files also change the running application.
  if (git(cwd, 'ls-files', '--others', '--ignored', '--exclude-standard', '--', 'systems/enterprise-admin/pos-ui/.env*', 'systems/enterprise-admin/admin-ui/.env*')) {
    throw new Error(`Untracked ${label} environment file`);
  }
  // Read flags only; never clear index bits or change ignore/security settings.
  const trackedFlags = git(cwd, 'ls-files', '-v', '-z').split('\0').filter(Boolean);
  if (trackedFlags.some((entry) => /^[a-zS]/.test(entry))) {
    throw new Error(`Hidden tracked ${label} source: assume-unchanged or skip-worktree`);
  }
  // Ignore rules are not an authority to add runnable source. Only these known
  // dependency/generated locations are exempt; arbitrary nested node_modules
  // or dist directories inside source are not exempt.
  const generatedPaths = ['node_modules', 'systems/enterprise-admin/node_modules'];
  for (const app of ['pos-ui', 'admin-ui', 'backend', 'packages/types']) {
    const prefix = `systems/enterprise-admin/${app}`;
    for (const directory of ['node_modules', 'dist', 'coverage', 'test-results', 'test-results-ui-evidence', 'playwright-report']) {
      generatedPaths.push(`${prefix}/${directory}`);
    }
    generatedPaths.push(`${prefix}/*.tsbuildinfo`);
  }
  // Exclude known generated locations at enumeration time, so installed package
  // trees cannot overflow execFileSync's buffer or dominate this source check.
  const ignored = git(cwd, 'ls-files', '--others', '--ignored', '--exclude-standard', '-z', '--', ...sourcePaths,
    ...generatedPaths.map((file) => `:(exclude,glob)${file}`));
  if (ignored) throw new Error(`Ignored untracked ${label} source`);
}


export default async function setup() {
  await mkdir(output, { recursive: true });
  const subjects = JSON.parse(await readFile(resolve(here, 'subjects.json'), 'utf8'));
  const qaHead = requireSha(process.env.UI_QA_SOURCE_SHA, 'QA source');
  const executionHead = requireSha(process.env.UI_QA_EXECUTION_SHA, 'QA execution');
  const checkoutHead = git(root, 'rev-parse', 'HEAD');
  const checkoutTree = git(root, 'rev-parse', 'HEAD^{tree}');
  const qaTree = git(root, 'rev-parse', `${qaHead}^{tree}`);
  if (checkoutHead !== executionHead) throw new Error('QA checkout is not the expected execution commit');
  const executionMode = process.env.UI_QA_EXECUTION_MODE;
  let baseHead = null;
  let executionParents = [];
  if (executionMode === 'pr-merge') {
    baseHead = requireSha(process.env.UI_QA_BASE_SHA, 'QA base');
    executionParents = git(root, 'show', '-s', '--format=%P', checkoutHead).split(' ');
    if (executionParents.length !== 2 || executionParents[0] !== baseHead || executionParents[1] !== qaHead) {
      throw new Error('QA execution commit is not the exact base + submitted-head merge');
    }
  } else if (executionMode === 'head') {
    if (checkoutHead !== qaHead || checkoutTree !== qaTree) throw new Error('QA head checkout mismatch');
    if (process.env.UI_QA_BASE_SHA) throw new Error('Unexpected QA base in head mode');
  } else {
    throw new Error('Explicit QA execution mode must be head or pr-merge');
  }
  // The merge may advance application/dependency files, never silently alter the submitted QA driver.
  const qaInputs = [
    'systems/enterprise-admin/pos-ui/e2e/ui-evidence',
    'systems/enterprise-admin/pos-ui/e2e/ui-evidence.config.ts',
    'systems/enterprise-admin/pos-ui/tsconfig.ui-evidence.json',
  ];
  if (git(root, 'diff', '--name-only', qaHead, checkoutHead, '--', ...qaInputs)) {
    throw new Error('Submitted QA inputs differ in the execution commit');
  }
  assertCleanSource(root, 'QA', [
    'systems/enterprise-admin/pos-ui/e2e',
    'systems/enterprise-admin/pos-ui/tsconfig.ui-evidence.json',
    '.github/workflows',
  ]);

  const owned = [];
  const streams = [];
  const record = { nonce: invocation.nonce, qaHead, qaTree, checkoutHead, checkoutTree, executionHead, executionMode,
    baseHead, executionParents, evidenceScope: 'historical-fixed-subject-ui', node: process.version,
    runId: process.env.GITHUB_RUN_ID ?? null, runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    mode: 'real Chromium UI; synthetic intercepted API; no backend or database', subjects: {} };
  async function close() {
    for (const child of owned) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      child.kill('SIGTERM');
      await Promise.race([new Promise((done) => child.once('exit', done)), delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }
    for (const stream of streams) stream.end();
  }
  try {
    for (const [name, expected] of Object.entries(subjects)) {
      const cwd = resolve(root, '.ui-evidence-subjects', name);
      const actualHead = git(cwd, 'rev-parse', 'HEAD');
      const actualTree = git(cwd, 'rev-parse', 'HEAD^{tree}');
      if (actualHead !== expected.head || actualTree !== expected.tree) throw new Error(`Wrong ${name} subject`);
      assertCleanSource(cwd, name);
      const app = resolve(cwd, 'systems/enterprise-admin', expected.app);
      const origin = `http://127.0.0.1:${expected.port}`;
      // Refuse to reuse any server already listening at the fixed loopback port.
      try {
        await fetch(origin, { signal: AbortSignal.timeout(500) });
        throw new Error(`Port already occupied: ${origin}`);
      } catch (error) {
        if (error.message?.startsWith('Port already occupied')) throw error;
      }
      const log = createWriteStream(resolve(output, `${name}-vite.log`));
      streams.push(log);
      const child = spawn(process.execPath, [resolve(app, 'node_modules/vite/bin/vite.js'),
        '--host', '127.0.0.1', '--port', String(expected.port), '--strictPort'], {
        cwd: app, env: { ...process.env, BROWSER: 'none' }, stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.pipe(log); child.stderr.pipe(log); owned.push(child);
      const deadline = Date.now() + 30_000;
      let ready = false;
      while (Date.now() < deadline && child.exitCode === null) {
        try { if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* owned server starting */ }
        await delay(100);
      }
      if (!ready) throw new Error(`Owned ${name} Vite did not become ready`);
      record.subjects[name] = { ...expected, actualHead, actualTree, origin, ownedPid: child.pid };
    }
    await atomicJson(resolve(output, 'runtime-evidence.json'), record);
    return close;
  } catch (error) {
    await close();
    throw error;
  }
}
