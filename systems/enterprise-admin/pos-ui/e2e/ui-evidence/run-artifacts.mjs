import { randomUUID } from 'node:crypto';
import { readFileSync, realpathSync, lstatSync } from 'node:fs';
import { mkdir, mkdtemp, open, rename, unlink } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const parent = resolve(dirname(fileURLToPath(import.meta.url)), '../../test-results-ui-evidence');
export const identity = (env) => ({
  qaHead: env.UI_QA_SOURCE_SHA ?? null, executionHead: env.UI_QA_EXECUTION_SHA ?? null,
  executionMode: env.UI_QA_EXECUTION_MODE ?? null, baseHead: env.UI_QA_BASE_SHA || null,
  runId: env.GITHUB_RUN_ID ?? null, runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
});
export async function atomicJson(file, value) {
  const temp = `${file}.${randomUUID()}.tmp`;
  let handle;
  let owned = false;
  try {
    handle = await open(temp, 'wx');
    owned = true;
    await handle.writeFile(JSON.stringify(value, null, 2) + '\n');
    await handle.close();
    handle = undefined;
    await rename(temp, file);
  } finally {
    if (handle) await handle.close();
    if (owned) await unlink(temp).catch((error) => { if (error.code !== 'ENOENT') throw error; });
  }
}
export async function beginRun(env = process.env) {
  await mkdir(parent, { recursive: true });
  if (lstatSync(parent).isSymbolicLink()) throw new Error('Evidence parent must not be a symlink');
  const output = await mkdtemp(resolve(parent, 'run-'));
  const context = { schemaVersion: 1, ...identity(env), nonce: randomUUID(), startedAt: new Date().toISOString() };
  await atomicJson(resolve(output, 'run-context.json'), context);
  return { output, context, env: { ...env, UI_QA_EVIDENCE_DIR: output, UI_QA_RUN_NONCE: context.nonce } };
}
export function readRun(env = process.env) {
  const output = env.UI_QA_EVIDENCE_DIR;
  if (!output || !env.UI_QA_RUN_NONCE) throw new Error('Use run.mjs to start a fresh evidence invocation');
  if (lstatSync(parent).isSymbolicLink() || lstatSync(output).isSymbolicLink()
      || dirname(realpathSync(output)) !== realpathSync(parent) || !basename(output).startsWith('run-')) {
    throw new Error('Evidence must be a direct owned run directory');
  }
  const context = JSON.parse(readFileSync(resolve(output, 'run-context.json'), 'utf8'));
  if (context.nonce !== env.UI_QA_RUN_NONCE || Object.entries(identity(env)).some(([key, value]) => context[key] !== value)) {
    throw new Error('Evidence invocation identity mismatch');
  }
  return { output, context };
}
