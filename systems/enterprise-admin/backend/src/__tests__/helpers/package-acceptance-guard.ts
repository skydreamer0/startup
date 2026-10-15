import assert from 'node:assert/strict';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/** Opt-in is deliberately absent from ordinary unit tests. Never use ambient DB. */
export function packageAcceptanceDatabase() {
  const value = process.env.PACKAGE_LOOKUP_DATABASE_URL;
  if (!value) return undefined;
  const env = process.env;
  const expected = 'postgresql://test@127.0.0.1:55435/checkout_http_recovery_pos_lookup_ci';
  assert.equal(value, expected); assert.equal(env.DATABASE_URL, expected);
  assert.equal(env.POS_PRODUCT_LOOKUP_DATABASE_URL, expected);
  assert.equal(env.PACKAGE_LOOKUP_ALLOW_SYNTHETIC, '1');
  assert.equal(env.NODE_ENV, 'test'); assert.equal(env.GITHUB_ACTIONS, 'true');
  assert.equal(env.RUNNER_ENVIRONMENT, 'github-hosted'); assert.match(process.version, /^v22\./);
  assert.ok(env.RUNNER_TEMP); assert.match(env.GITHUB_RUN_ID ?? '', /^\d+$/); assert.match(env.GITHUB_RUN_ATTEMPT ?? '', /^\d+$/);
  assert.match(env.SKU_QA_CONTAINER ?? '', /^[a-f0-9]{64}$/); assert.match(env.SKU_QA_NETWORK ?? '', /^github_network_[a-f0-9]+$/);
  const root = path.resolve(__dirname, '../../../../../..');
  const git = (ref: string) => execFileSync('git', ['rev-parse', ref], { cwd: root, encoding: 'utf8' }).trim();
  const head = git('HEAD'); assert.equal(head, env.SKU_QA_HEAD);
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(), '');
  const proofFile = path.join(env.RUNNER_TEMP, `sku-qa-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`, 'ownership.json');
  assert.equal(env.PACKAGE_LOOKUP_OWNERSHIP_FILE, proofFile);
  const proof = JSON.parse(readFileSync(proofFile, 'utf8'));
  assert.equal(proof.head, head); assert.equal(proof.tree, git('HEAD^{tree}'));
  assert.equal(proof.runId, env.GITHUB_RUN_ID); assert.equal(proof.attempt, env.GITHUB_RUN_ATTEMPT);
  assert.equal(proof.node, process.version); assert.equal(proof.database, 'checkout_http_recovery_pos_lookup_ci');
  assert.equal(proof.syntheticOnly, true); assert.deepEqual(proof.initialPublicTables, []);
  assert.equal(proof.service.container, env.SKU_QA_CONTAINER); assert.equal(proof.service.network, env.SKU_QA_NETWORK);
  assert.deepEqual(proof.service.bindings, { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55435' }] });
  return value;
}
