// Issue #30 only. Compose the unchanged Actions-only native/rollback harness.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { databaseUrl } from './order-sequence-ci.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(backend, '../../..');
export const retryCases = [
  ...['40001', '40P01'].map(code => `retries server SQLSTATE ${code} after all sale writes and replays only one sale`),
  ...['40001', '40P01'].map(code => `exhausts server SQLSTATE ${code} at three attempts, rolls back and reuses the same command`),
  'propagates a nonretry server failure after all sale writes and rolls back once',
  'allows concurrent resends during an aborted attempt with only one committed sale',
  'retries a real PostgreSQL deadlock victim after late writes without duplicate effects',
];
export function assertRetryReport(report) {
  assert.equal(report.success, true);
  assert.equal(report.numTotalTests, retryCases.length);
  assert.equal(report.numPassedTests, retryCases.length);
  for (const key of ['numFailedTests', 'numPendingTests', 'numTodoTests']) assert.equal(report[key], 0);
  assert.equal(report.testResults.length, 1);
  const suite = report.testResults[0];
  assert.equal(suite.status, 'passed');
  assert.ok(suite.name.endsWith('/src/__tests__/checkout-command-retry.integration.test.ts'));
  assert.deepEqual(suite.assertionResults.map(test => test.title).sort(), [...retryCases].sort());
  assert.ok(suite.assertionResults.every(test => test.status === 'passed'));
  return suite.assertionResults.map(({ title, status, duration }) => ({ title, status, duration }));
}

function main(mode) {
  assert.ok(['preflight', 'run', 'cleanup'].includes(mode));
  // Never manufacture Actions identity locally or loosen the original guard.
  const original = spawnSync(process.execPath, ['scripts/order-sequence-ci.mjs', mode], {
    cwd: backend, env: process.env, stdio: 'inherit', timeout: 300000,
  });
  assert.equal(original.error, undefined);
  assert.equal(original.signal, null);
  assert.equal(original.status, 0, `Original ${mode} guard/harness must pass`);
  const evidence = path.join(process.env.RUNNER_TEMP, `order-sequence-qa-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
  const save = (name, value) => fs.writeFileSync(path.join(evidence, name), `${JSON.stringify(value, null, 2)}\n`);
  const read = name => JSON.parse(fs.readFileSync(path.join(evidence, name), 'utf8'));
  const ownership = read('ownership.json');
  assert.equal(ownership.head, process.env.ORDER_SEQUENCE_QA_HEAD);

  if (mode === 'preflight') {
    const files = ['.github/workflows/checkout-abort-retry.yml', ...[
      'src/modules/pos/checkout-command.service.ts', 'src/modules/pos/checkout.service.ts',
      'src/__tests__/checkout-command-retry.test.ts', 'src/__tests__/checkout-command-retry.integration.test.ts',
      'scripts/checkout-retry-ci.mjs', 'scripts/checkout-retry-ci.test.mjs',
    ].map(file => `systems/enterprise-admin/backend/${file}`)];
    save('retry-source.json', { ...ownership, hashes: Object.fromEntries(files.map(file => [file,
      createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) });
    return;
  }
  if (mode === 'cleanup') {
    const originalAcceptance = read('accepted.json');
    assert.equal(originalAcceptance.status, 'passed');
    const cases = assertRetryReport(read('retry.json'));
    assert.equal(read('retry-command.json').status, 0);
    save('retry-accepted.json', { ...ownership, status: 'passed', cases,
      originalAcceptance: 'accepted.json', cleanup: read('cleanup.json'), productionDataUsed: false });
    return;
  }
  const args = ['node_modules/vitest/vitest.mjs', 'run', 'src/__tests__/checkout-command-retry.integration.test.ts',
    '--maxWorkers=1', '--no-file-parallelism', '--reporter=verbose', '--reporter=json',
    `--outputFile.json=${path.join(evidence, 'retry.json')}`];
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'CI'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  Object.assign(env, { NODE_ENV: 'test', DATABASE_URL: databaseUrl, CHECKOUT_RETRY_DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: 'synthetic-retry-access-test-only-000000', JWT_REFRESH_SECRET: 'synthetic-retry-refresh-test-only-000000' });
  const result = spawnSync(process.execPath, args, { cwd: backend, env, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
  fs.writeFileSync(path.join(evidence, 'retry.log'), (result.stdout || '') + (result.stderr || ''));
  save('retry-command.json', { executable: process.execPath, args, status: result.status, signal: result.signal, error: result.error?.message ?? null });
  process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0);
  assertRetryReport(read('retry.json'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { main(process.argv[2]); } catch (error) { console.error(error); process.exitCode = 1; }
}
