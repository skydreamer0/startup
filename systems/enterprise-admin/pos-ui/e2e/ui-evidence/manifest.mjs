import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { atomicJson, readRun } from './run-artifacts.mjs';
import { validateCases } from './validate-case-evidence.mjs';

const { output, context } = readRun();
const readJson = async (file) => JSON.parse(await readFile(resolve(output, file), 'utf8'));
const completion = await readJson('completion.json');
const matches = (record) => ['qaHead', 'executionHead', 'executionMode', 'baseHead', 'runId', 'runAttempt', 'nonce']
  .every((key) => record[key] === context[key]);
if (!matches(completion)) throw new Error('Completion belongs to another invocation');
if (completion.status === 'passed') {
  for (const phase of ['typecheck', 'playwright']) {
    const result = completion.phases[phase];
    if (!result || result.exitCode !== 0 || result.signal || result.error || result.quiescent !== true) throw new Error('Runner did not complete successfully');
  }
  if (!matches(await readJson('runtime-evidence.json'))) throw new Error('Runtime belongs to another invocation');

} else if (completion.status !== 'failed') throw new Error('Incomplete runner outcome');
const entries = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = resolve(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not run-owned evidence');
    if (entry.isDirectory()) await walk(file);
    else if (relative(output, file) !== 'artifact-manifest.json') {
      if (!entry.isFile()) throw new Error('Non-regular evidence file');
      const bytes = await readFile(file);
      entries.push({ path: relative(output, file), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
}
await walk(output);
entries.sort((a, b) => a.path.localeCompare(b.path));
if (completion.status === 'passed') await validateCases(output, context, entries);
await atomicJson(resolve(output, 'artifact-manifest.json'), { ...context, status: completion.status, entries });
