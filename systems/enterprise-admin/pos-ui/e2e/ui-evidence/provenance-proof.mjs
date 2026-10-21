import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, lstatSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inspectProvenance, resolveProvenance } from './provenance.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function binding(cwd, env) {
  assert.match(env.GITHUB_RUN_ID ?? '', /^\d+$/);
  assert.match(env.GITHUB_RUN_ATTEMPT ?? '', /^\d+$/);
  assert.match(env.GITHUB_REPOSITORY ?? '', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  assert.ok(env.RUNNER_TEMP);
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const prefix = 'systems/enterprise-admin/pos-ui/e2e/ui-evidence';
  assert.equal(git('ls-files','--others','--exclude-standard','--',prefix),'');
  assert.equal(git('ls-files','--others','--ignored','--exclude-standard','--',prefix),'');
  const files = git('ls-files','-z','--',prefix).split('\0').filter(Boolean).sort();
  assert.ok(files.length > 0);
  const qaBlobs = {};
  for (const file of files) {
    assert.equal(lstatSync(resolve(cwd,file)).isSymbolicLink(),false);
    const actual = git('hash-object','--',file);
    assert.equal(actual,git('rev-parse',`HEAD:${file}`));
    qaBlobs[file] = actual;
  }
  return { schema:1, repository:env.GITHUB_REPOSITORY, runId:env.GITHUB_RUN_ID, attempt:env.GITHUB_RUN_ATTEMPT, qaBlobs };
}
export async function writeProvenanceProof({cwd,env=process.env,fetchCommit=fetch}) {
  try {
    const context = binding(cwd,env);
    const record = await resolveProvenance({cwd,env,fetchCommit});
    const file = resolve(env.RUNNER_TEMP,`ui-provenance-${context.runId}-${context.attempt}-${record.executionHead}.json`);
    const bytes=JSON.stringify({...context,record})+'\n';
    writeFileSync(file,bytes,{flag:'wx',mode:0o600});
    return {file,sha256:digest(bytes)};
  } finally { delete env.UI_QA_METADATA_TOKEN; }
}
export function readProvenanceProof({cwd,env=process.env}) {
  if (env.UI_QA_METADATA_TOKEN !== undefined) {
    delete env.UI_QA_METADATA_TOKEN;
    throw new Error('Metadata token must not reach browser execution');
  }
  // Local exact-head use predates CI proofs. Any CI/runner/proof context forces
  // the authenticated path; missing fields must never silently downgrade.
  const ciContext = Object.keys(env).some(key => key === 'CI' || key.startsWith('GITHUB_')
    || key.startsWith('RUNNER_') || key.startsWith('UI_QA_PROOF_'));
  if (!ciContext) {
    if (env.UI_QA_EXECUTION_MODE !== 'head') throw new Error('Local provenance requires exact head mode');
    return inspectProvenance({cwd,env});
  }
  const context=binding(cwd,env), local=inspectProvenance({cwd,env});
  const file=resolve(env.RUNNER_TEMP,`ui-provenance-${context.runId}-${context.attempt}-${local.executionHead}.json`);
  assert.equal(env.UI_QA_PROOF_PATH,file); assert.match(env.UI_QA_PROOF_SHA256??'',/^[a-f0-9]{64}$/);
  const stat=lstatSync(file);assert.equal(stat.isSymbolicLink(),false);assert.ok(stat.isFile()&&stat.size<1024*1024);
  const bytes=readFileSync(file);assert.equal(digest(bytes),env.UI_QA_PROOF_SHA256);
  const proof=JSON.parse(bytes);
  const expected={...context,record:{...local,commitApiVerified:local.executionMode==='pr-merge'}};
  assert.deepEqual(proof,expected);
  return proof.record;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const cwd=fileURLToPath(new URL('../../../../..',import.meta.url));
  const result=await writeProvenanceProof({cwd});
  assert.ok(process.env.GITHUB_OUTPUT);
  appendFileSync(process.env.GITHUB_OUTPUT,`proof_path=${result.file}\nproof_sha256=${result.sha256}\n`);
}
