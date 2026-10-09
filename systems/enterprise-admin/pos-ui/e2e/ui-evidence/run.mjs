import { appendFileSync, closeSync, openSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, beginRun } from './run-artifacts.mjs';
import { processOwner } from './owned-process.mjs';
import { resolveProvenance } from './provenance.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const owner = processOwner();
let code = 1;
try {
  const provenance = await resolveProvenance({ cwd: resolve(here, '../../../../..') });
  process.env.UI_QA_BASE_SHA = provenance.baseHead ?? '';
  console.log(`UI evidence provenance: ${JSON.stringify(provenance)}`);
  const run = await beginRun();
  await atomicJson(resolve(run.output, 'provenance.json'), { ...run.context, ...provenance });
  console.log(`UI evidence invocation ${run.context.nonce}: ${run.output}`);
  const log = openSync(resolve(run.output, 'raw-run.txt'), 'wx');
  const phases = {};
  try {
    for (const [phase, args] of [
      ['typecheck', ['exec', 'tsc', '--project', 'tsconfig.ui-evidence.json']],
      ['playwright', ['exec', 'playwright', 'test', '--config', 'e2e/ui-evidence.config.mts']],
    ]) {
      const result = await owner.run('pnpm', args, { cwd: resolve(here, '../..'), env: run.env, stdio: ['ignore', log, log] });
      phases[phase] = result;
      code = result.error || result.signal || result.exitCode === null ? 1 : result.exitCode;
      if (code !== 0 || owner.cancelled) break;
    }
  } finally { closeSync(log); }
  const completion = { ...run.context, status: code === 0 && !owner.cancelled ? 'passed' : 'failed',
    phases, cancelled: owner.cancelled, finishedAt: new Date().toISOString() };
  // All owned child groups have reached a non-writing terminal state. A failed
  // quiescence check throws before completion, manifest or upload publication.
  await atomicJson(resolve(run.output, 'completion.json'), completion);
  process.env.UI_QA_EVIDENCE_DIR = run.output;
  process.env.UI_QA_RUN_NONCE = run.context.nonce;
  await import('./manifest.mjs');
  if (owner.cancelled && completion.status === 'passed') {
    completion.status = 'failed'; completion.cancelled = owner.cancelled;
    await atomicJson(resolve(run.output, 'completion.json'), completion);
    await import('./manifest.mjs?cancelled');
  }
  // Publish only a fully hashed, quiescent current bundle. Rejected symlinks,
  // incomplete reports or interrupted pre-publication runs expose no upload path.
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `evidence_dir=${run.output}\n`);
} catch (error) {
  console.error(error);
  code ||= 1;
} finally {
  if (owner.cancelled) code = owner.cancelled === 'SIGINT' ? 130 : 143;
  owner.dispose();
}
process.exitCode = code;
