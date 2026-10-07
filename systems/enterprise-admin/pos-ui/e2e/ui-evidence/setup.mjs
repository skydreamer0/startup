import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../../..');
const output = resolve(here, '../../test-results-ui-evidence');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

export default async function setup() {
  await mkdir(output, { recursive: true });
  const subjects = JSON.parse(await readFile(resolve(here, 'subjects.json'), 'utf8'));
  const qaHead = process.env.UI_QA_SOURCE_SHA;
  if (!qaHead || !/^[a-f0-9]{40}$/.test(qaHead)) throw new Error('Explicit QA source SHA is required');
  const checkoutHead = git(root, 'rev-parse', 'HEAD');
  const checkoutTree = git(root, 'rev-parse', 'HEAD^{tree}');
  const qaTree = git(root, 'rev-parse', `${qaHead}^{tree}`);
  if (checkoutTree !== qaTree) throw new Error('QA checkout tree differs from the submitted QA head');

  const owned = [];
  const streams = [];
  const record = { qaHead, qaTree, checkoutHead, checkoutTree, node: process.version,
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
    await writeFile(resolve(output, 'runtime-evidence.json'), JSON.stringify(record, null, 2) + '\n');
    return close;
  } catch (error) {
    await close();
    throw error;
  }
}
