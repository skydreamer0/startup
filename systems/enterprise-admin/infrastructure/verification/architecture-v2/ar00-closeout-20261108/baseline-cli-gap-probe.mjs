import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Read-only defect reproduction. Pass an exact #205 baseline checkout as argv[2].
// No command strings, application, database or network operations are executed.
if (!process.argv[2]) throw Error('Pass the exact baseline checkout path');
const checkout = path.resolve(process.argv[2]);
const planDir = 'systems/enterprise-admin/infrastructure/plans/architecture-v2';
const pins = {
  'scripts/architecture/verify-plan.mjs': '8de37b93a74238624f5b795a8e64fe8d7a234442',
  [`${planDir}/manifest.json`]: '953d682851d8f6f6c414c5147ea9117894b2262d',
  [`${planDir}/source-inventory.json`]: '5a9a0660f14775b3e37dff2c9253a5eb0561f4a8',
};
for (const [file, expected] of Object.entries(pins)) {
  const bytes = fs.readFileSync(path.join(checkout, file));
  const actual = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (actual !== expected) throw Error(`Unexpected baseline blob: ${file}`);
}
const { loadPlan, readJson, verifyInventory } = await import(pathToFileURL(path.join(checkout, 'scripts/architecture/verify-plan.mjs')).href);
const { manifest } = loadPlan();
const requirements = readJson(path.join(checkout, planDir, 'requirements.json'));
let accepted = 0;
for (const [name, mutate] of [
  ['remove all CLI declarations', i => { i.cli = []; }],
  ['remove db:reset', i => { i.cli = i.cli.filter(c => c.entry !== 'db:reset'); }],
  ['substitute reset command', i => { i.cli.find(c => c.entry === 'db:reset').command = 'echo safe'; }],
]) {
  const inventory = readJson(path.join(checkout, planDir, 'source-inventory.json'));
  mutate(inventory);
  const errors = verifyInventory(inventory, requirements, manifest, true);
  console.log(JSON.stringify({ probe: name, expected: 'rejection', actualErrors: errors, result: errors.length ? 'REJECTED' : 'GAP_ACCEPTED' }));
  if (!errors.length) accepted++;
}
process.exitCode = accepted ? 1 : 0;
