import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = resolve(dirname(fileURLToPath(import.meta.url)), '../../test-results-ui-evidence');
const entries = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (entry.name !== 'artifact-manifest.json') {
      const bytes = await readFile(path);
      entries.push({ path: relative(output, path), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
}
await walk(output);
entries.sort((a, b) => a.path.localeCompare(b.path));
await writeFile(resolve(output, 'artifact-manifest.json'), JSON.stringify({
  qaHead: process.env.UI_QA_SOURCE_SHA ?? null, runId: process.env.GITHUB_RUN_ID ?? null,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null, entries,
}, null, 2) + '\n');
