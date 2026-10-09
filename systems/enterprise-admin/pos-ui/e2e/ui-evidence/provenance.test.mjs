import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const qaPath = 'systems/enterprise-admin/pos-ui/e2e/ui-evidence';
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'ui-provenance-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Synthetic QA'); git('config', 'user.email', 'qa@example.invalid');
  mkdirSync(join(cwd, qaPath), { recursive: true });
  for (const file of ['setup.mjs', 'run-artifacts.mjs']) writeFileSync(join(cwd, qaPath, file), readFileSync(join(here, file)));
  writeFileSync(join(cwd, qaPath, 'subjects.json'), '{}\n');
  writeFileSync(join(cwd, '.gitignore'), 'systems/enterprise-admin/pos-ui/test-results-ui-evidence/\n');
  git('add', '.'); git('commit', '-qm', 'test(pos-ui): synthetic old base');
  const eventBase = git('rev-parse', 'HEAD');
  writeFileSync(join(cwd, qaPath, 'driver.txt'), 'submitted QA\n');
  git('add', '.'); git('commit', '-qm', 'test(pos-ui): synthetic submitted head');
  const source = git('rev-parse', 'HEAD');
  git('checkout', '-q', '--detach', eventBase);
  writeFileSync(join(cwd, 'application.txt'), 'advanced application\n');
  git('add', '.'); git('commit', '-qm', 'test(pos-ui): synthetic advanced base');
  const base = git('rev-parse', 'HEAD');
  git('merge', '-q', '--no-ff', source, '-m', 'test(pos-ui): synthetic execution merge');
  const execution = git('rev-parse', 'HEAD');
  const env = { UI_QA_SOURCE_SHA: source, UI_QA_EXECUTION_SHA: execution,
    UI_QA_EXECUTION_MODE: 'pr-merge', UI_QA_EVENT_BASE_SHA: eventBase, GITHUB_REPOSITORY: 'owner/repo' };
  const api = { sha: execution, commit: { tree: { sha: git('rev-parse', 'HEAD^{tree}') } }, parents: [base, source].map(sha => ({ sha })) };
  const fetchCommit = async () => ({ ok: true, json: async () => api });
  function setup(baseSha = base, overrides = {}) {
    const script = `const { beginRun } = await import(${JSON.stringify(pathToFileURL(join(cwd, qaPath, 'run-artifacts.mjs')).href)});
      Object.assign(process.env, (await beginRun()).env);
      const { default: setup } = await import(${JSON.stringify(pathToFileURL(join(cwd, qaPath, 'setup.mjs')).href)});
      await (await setup())();`;
    return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd, encoding: 'utf8', env: { PATH: process.env.PATH, ...env, UI_QA_BASE_SHA: baseSha, ...overrides },
    });
  }
  return { cwd, git, env, api, fetchCommit, setup, eventBase, base, source, execution };
}

test('stale event base is rejected by original setup, while pinned merge base succeeds', async t => {
  const f = fixture(t);
  const original = f.setup(f.eventBase);
  assert.notEqual(original.status, 0);
  assert.match(original.stderr, /not the exact base \+ submitted-head merge/);
  const { resolveProvenance } = await import('./provenance.mjs');
  const record = await resolveProvenance({ cwd: f.cwd, env: f.env, fetchCommit: f.fetchCommit });
  assert.equal(record.baseHead, f.base);
  assert.equal(record.eventBaseHead, f.eventBase);
  assert.equal(record.eventBaseMismatch, true);
  const fixed = f.setup(record.baseHead);
  assert.equal(fixed.status, 0, fixed.stderr);
});

async function resolveFixture(f, overrides = {}, fetchCommit = f.fetchCommit) {
  const { resolveProvenance } = await import('./provenance.mjs');
  return resolveProvenance({ cwd: f.cwd, env: { ...f.env, ...overrides }, fetchCommit });
}

test('fixed SHA API URL, tree and ordered parents are all cross-checked', async t => {
  const f = fixture(t);
  await resolveFixture(f, {}, async (url, options) => {
    assert.equal(url, `https://api.github.com/repos/owner/repo/commits/${f.execution}`);
    assert.equal(options.headers.Authorization, undefined);
    return f.fetchCommit();
  });
  for (const change of [
    { sha: f.base }, { commit: { tree: { sha: f.source } } },
    { parents: [{ sha: f.source }, { sha: f.base }] }, { parents: [{ sha: f.base }] },
  ]) {
    await assert.rejects(resolveFixture(f, {}, async () => ({ ok: true, json: async () => ({ ...f.api, ...change }) })), /API disagrees/);
  }
});

test('moving current base ref cannot affect the pinned merge result', async t => {
  const f = fixture(t);
  f.git('update-ref', 'refs/heads/master', f.source);
  assert.equal((await resolveFixture(f)).baseHead, f.base);
  assert.equal((await resolveFixture(f, { UI_QA_EVENT_BASE_SHA: f.base })).eventBaseMismatch, false);
});

test('checkout execution SHA and submitted head parent must match', async t => {
  const f = fixture(t);
  await assert.rejects(resolveFixture(f, { UI_QA_EXECUTION_SHA: f.source }), /expected execution commit/);
  await assert.rejects(resolveFixture(f, { UI_QA_SOURCE_SHA: f.base }), /submitted-head merge/);
});

test('single and three-parent executions fail closed before API', async t => {
  const f = fixture(t);
  for (const parents of [[f.source], [f.base, f.source, f.eventBase]]) {
    const execution = f.git('commit-tree', f.api.commit.tree.sha, ...parents.flatMap(p => ['-p', p]), '-m', 'test(pos-ui): wrong parent count');
    f.git('checkout', '-q', '--detach', execution);
    await assert.rejects(resolveFixture(f, { UI_QA_EXECUTION_SHA: execution }, () => { throw new Error('API must not run'); }), /two-parent/);
  }
});

test('tampered resolver base is rejected by resolver and independently by original setup', async t => {
  const f = fixture(t);
  await assert.rejects(resolveFixture(f, { UI_QA_BASE_SHA: f.eventBase }), /Supplied QA base differs/);
  const rejected = f.setup(f.eventBase);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /not the exact base \+ submitted-head merge/);
});

test('original setup still rejects merge changes to submitted QA driver', async t => {
  const f = fixture(t);
  writeFileSync(join(f.cwd, qaPath, 'driver.txt'), 'merge-altered QA\n');
  f.git('add', '.');
  const tree = f.git('write-tree');
  const execution = f.git('commit-tree', tree, '-p', f.base, '-p', f.source, '-m', 'test(pos-ui): altered merge QA');
  f.git('checkout', '-q', '--detach', execution);
  const api = { ...f.api, sha: execution, commit: { tree: { sha: tree } } };
  const record = await resolveFixture(f, { UI_QA_EXECUTION_SHA: execution }, async () => ({ ok: true, json: async () => api }));
  const rejected = f.setup(record.baseHead, { UI_QA_EXECUTION_SHA: execution });
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Submitted QA inputs differ/);
});

test('head mode keeps base empty, requires exact source, and never calls API', async t => {
  const f = fixture(t);
  const env = { UI_QA_EXECUTION_MODE: 'head', UI_QA_SOURCE_SHA: f.execution, UI_QA_EVENT_BASE_SHA: '' };
  const noApi = () => { throw new Error('API must not run'); };
  assert.equal((await resolveFixture(f, env, noApi)).baseHead, null);
  assert.equal(f.setup('', env).status, 0);
  await assert.rejects(resolveFixture(f, { ...env, UI_QA_SOURCE_SHA: f.source }, noApi), /head checkout mismatch/);
  for (const key of ['UI_QA_BASE_SHA', 'UI_QA_EVENT_BASE_SHA']) {
    await assert.rejects(resolveFixture(f, { ...env, [key]: f.base }, noApi), /Unexpected QA base/);
  }
});

test('API HTTP, network, timeout and invalid JSON failures have no fallback', async t => {
  const f = fixture(t);
  await assert.rejects(resolveFixture(f, {}, async () => ({ ok: false, status: 503 })), /API failed: HTTP 503/);
  for (const message of ['network unavailable', 'request timeout']) {
    await assert.rejects(resolveFixture(f, {}, async () => { throw new Error(message); }), new RegExp(message));
  }
  await assert.rejects(resolveFixture(f, {}, async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } })), /bad JSON/);
});

test('missing SHA, repository and invalid mode fail closed', async t => {
  const f = fixture(t);
  for (const key of ['UI_QA_SOURCE_SHA', 'UI_QA_EXECUTION_SHA', 'UI_QA_EVENT_BASE_SHA']) {
    await assert.rejects(resolveFixture(f, { [key]: '' }), /SHA is required/);
  }
  await assert.rejects(resolveFixture(f, { GITHUB_REPOSITORY: '' }), /repository is required/);
  await assert.rejects(resolveFixture(f, { UI_QA_EXECUTION_MODE: 'anything' }), /mode must be/);
});

test('original setup retains dirty tracked, untracked and ignored source guards', async t => {
  const f = fixture(t);
  for (const [file, message] of [[`${qaPath}/driver.txt`, /Dirty tracked/], [`${qaPath}/extra.mjs`, /Untracked QA source/]]) {
    writeFileSync(join(f.cwd, file), 'dirty\n');
    const rejected = f.setup();
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, message);
    if (file.endsWith('driver.txt')) f.git('checkout', '--', file);
    else rmSync(join(f.cwd, file));
  }
  writeFileSync(join(f.cwd, '.git/info/exclude'), '*.local.mjs\n');
  writeFileSync(join(f.cwd, qaPath, 'extra.local.mjs'), 'ignored source\n');
  assert.match(f.setup().stderr, /Ignored untracked QA source/);
});

test('original setup still rejects hidden index flags and unexpected base in head mode', async t => {
  const f = fixture(t);
  const head = { UI_QA_EXECUTION_MODE: 'head', UI_QA_SOURCE_SHA: f.execution, UI_QA_EVENT_BASE_SHA: '' };
  assert.match(f.setup(f.base, head).stderr, /Unexpected QA base in head mode/);
  assert.match(f.setup('', { ...head, UI_QA_SOURCE_SHA: f.source }).stderr, /QA head checkout mismatch/);
  f.git('update-index', '--assume-unchanged', `${qaPath}/driver.txt`);
  assert.match(f.setup().stderr, /Hidden tracked QA source/);
  f.git('update-index', '--no-assume-unchanged', `${qaPath}/driver.txt`);
  f.git('update-index', '--skip-worktree', `${qaPath}/driver.txt`);
  assert.match(f.setup().stderr, /Hidden tracked QA source/);
});
