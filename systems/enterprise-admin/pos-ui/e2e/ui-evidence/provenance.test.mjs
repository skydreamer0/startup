import './provenance-diagnostics.test.mjs';
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
    UI_QA_EXECUTION_MODE: 'pr-merge', UI_QA_EVENT_BASE_SHA: eventBase, GITHUB_REPOSITORY: 'owner/repo', UI_QA_METADATA_TOKEN: 'synthetic-readonly-token' };
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
    assert.equal(options.headers.Authorization, 'Bearer synthetic-readonly-token');
    assert.equal(options.redirect, 'error');
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
    await assert.rejects(resolveFixture(f, {}, async () => { throw new Error(message); }), /API transport failed/);
  }
  await assert.rejects(resolveFixture(f, {}, async () => ({ ok: true, json: async () => { throw new SyntaxError('bad JSON'); } })), /API invalid JSON/);
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


test('metadata proof rejects tampering, replay and token inheritance', async t => {
  const f = fixture(t);
  const { writeProvenanceProof, readProvenanceProof } = await import('./provenance-proof.mjs');
  const env = { ...f.env, GITHUB_RUN_ID:'100', GITHUB_RUN_ATTEMPT:'1', RUNNER_TEMP:f.cwd };
  const proof = await writeProvenanceProof({cwd:f.cwd,env,fetchCommit:f.fetchCommit});
  assert.equal(env.UI_QA_METADATA_TOKEN,undefined);
  const reading={...env,UI_QA_PROOF_PATH:proof.file,UI_QA_PROOF_SHA256:proof.sha256};
  assert.equal(readProvenanceProof({cwd:f.cwd,env:reading}).commitApiVerified,true);
  for(const override of [{UI_QA_PROOF_SHA256:'a'.repeat(64)},{GITHUB_RUN_ATTEMPT:'2'},{GITHUB_RUN_ID:'101'},{UI_QA_METADATA_TOKEN:'synthetic-token'},{UI_QA_SOURCE_SHA:f.base},{UI_QA_PROOF_PATH:'/wrong'}])assert.throws(()=>readProvenanceProof({cwd:f.cwd,env:{...reading,...override}}));
  writeFileSync(proof.file,readFileSync(proof.file,'utf8').replace('"schema":1','"schema":2'));
  assert.throws(()=>readProvenanceProof({cwd:f.cwd,env:reading}));
});
test('missing credential fails closed; transport errors never echo credential', async t=>{
 const f=fixture(t);await assert.rejects(resolveFixture(f,{UI_QA_METADATA_TOKEN:''}),/Metadata token/);
 await assert.rejects(resolveFixture(f,{},async()=>{throw new Error('synthetic-readonly-token');}),error=>!error.message.includes('synthetic-readonly-token')&&error.message.includes('transport failed'));
 const {writeProvenanceProof}=await import('./provenance-proof.mjs');const env={...f.env,GITHUB_RUN_ID:'1',GITHUB_RUN_ATTEMPT:'1',RUNNER_TEMP:f.cwd};
 await assert.rejects(writeProvenanceProof({cwd:f.cwd,env,fetchCommit:async()=>{throw new Error('secret');}}),/transport failed/);assert.equal(env.UI_QA_METADATA_TOKEN,undefined);
});

test('proof rejects changed QA bytes and forged schema even with a matching digest', async t=>{
 const f=fixture(t);const {writeProvenanceProof,readProvenanceProof}=await import('./provenance-proof.mjs');
 const {createHash}=await import('node:crypto');const env={...f.env,GITHUB_RUN_ID:'400',GITHUB_RUN_ATTEMPT:'1',RUNNER_TEMP:f.cwd};
 const p=await writeProvenanceProof({cwd:f.cwd,env,fetchCommit:f.fetchCommit});const reading={...env,UI_QA_PROOF_PATH:p.file,UI_QA_PROOF_SHA256:p.sha256};
 const original=readFileSync(p.file);const data=JSON.parse(original);
 for(const altered of [{...data,extra:true},{...data,repository:'other/repo'},{...data,record:{...data.record,commitApiVerified:false}},{...data,record:{...data.record,executionParents:[...data.record.executionParents].reverse()}},{...data,qaBlobs:{}}]){
  const bytes=JSON.stringify(altered);writeFileSync(p.file,bytes);
  assert.throws(()=>readProvenanceProof({cwd:f.cwd,env:{...reading,UI_QA_PROOF_SHA256:createHash('sha256').update(bytes).digest('hex')}}));
 }
 writeFileSync(p.file,original);writeFileSync(join(f.cwd,qaPath,'driver.txt'),'changed after preflight\n');
 assert.throws(()=>readProvenanceProof({cwd:f.cwd,env:reading}));f.git('checkout','--',`${qaPath}/driver.txt`);
 assert.equal(readProvenanceProof({cwd:f.cwd,env:reading}).commitApiVerified,true);
 rmSync(p.file);assert.throws(()=>readProvenanceProof({cwd:f.cwd,env:reading}));
});

test('preflight CLI derives repository root and writes only digest/path outputs in head mode', async t=>{
 const f=fixture(t);
 for(const file of ['provenance.mjs','provenance-proof.mjs'])writeFileSync(join(f.cwd,qaPath,file),readFileSync(join(here,file)));
 f.git('add','.');f.git('commit','-qm','test: proof CLI');const head=f.git('rev-parse','HEAD');
 const output=join(f.cwd,'step-output');
 const result=spawnSync(process.execPath,[join(f.cwd,qaPath,'provenance-proof.mjs')],{cwd:join(f.cwd,'systems/enterprise-admin'),encoding:'utf8',env:{...process.env,GITHUB_REPOSITORY:'owner/repo',GITHUB_RUN_ID:'500',GITHUB_RUN_ATTEMPT:'1',RUNNER_TEMP:f.cwd,GITHUB_OUTPUT:output,UI_QA_EXECUTION_MODE:'head',UI_QA_EXECUTION_SHA:head,UI_QA_SOURCE_SHA:head,UI_QA_EVENT_BASE_SHA:'',UI_QA_BASE_SHA:'',UI_QA_METADATA_TOKEN:'synthetic-cli-token'}});
 assert.equal(result.status,0,result.stderr);const lines=readFileSync(output,'utf8').trim().split('\n');assert.equal(lines.length,2);assert.match(lines[0],/^proof_path=/);assert.match(lines[1],/^proof_sha256=[a-f0-9]{64}$/);assert.ok(!result.stdout.includes('synthetic-cli-token'));assert.ok(!readFileSync(output,'utf8').includes('synthetic-cli-token'));
});

test('unexpected browser token is removed and never appears in rendered rejection', async t=>{
 const f=fixture(t);const {readProvenanceProof}=await import('./provenance-proof.mjs');const {inspect,format}=await import('node:util');
 const sentinel='synthetic-browser-secret-should-never-be-logged';const env={UI_QA_METADATA_TOKEN:sentinel};
 let caught;try{readProvenanceProof({cwd:f.cwd,env});}catch(error){caught=error;}
 assert.ok(caught);assert.equal(caught.message,'Metadata token must not reach browser execution');
 for(const rendered of [String(caught),inspect(caught),format(caught),caught.stack,JSON.stringify(caught)])assert.ok(!rendered.includes(sentinel));
 assert.equal(env.UI_QA_METADATA_TOKEN,undefined);
});

test('genuine local exact head remains no-API; any CI context prevents proof downgrade',async t=>{
 const f=fixture(t);const {readProvenanceProof}=await import('./provenance-proof.mjs');
 const env={UI_QA_SOURCE_SHA:f.execution,UI_QA_EXECUTION_SHA:f.execution,UI_QA_EXECUTION_MODE:'head'};
 const local=readProvenanceProof({cwd:f.cwd,env});assert.equal(local.commitApiVerified,false);assert.equal(local.baseHead,null);
 for(const key of ['CI','GITHUB_ACTIONS','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_REPOSITORY','RUNNER_TEMP','RUNNER_NAME','UI_QA_PROOF_PATH','UI_QA_PROOF_SHA256'])for(const value of ['', 'false','1'])assert.throws(()=>readProvenanceProof({cwd:f.cwd,env:{...env,[key]:value}}),`${key}=${value}`);
 assert.throws(()=>readProvenanceProof({cwd:f.cwd,env:{...env,UI_QA_EXECUTION_MODE:'pr-merge'}}));
 assert.throws(()=>readProvenanceProof({cwd:f.cwd,env:{...env,UI_QA_SOURCE_SHA:f.base}}));
});
