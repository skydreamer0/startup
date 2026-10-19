import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../../.github/workflows/ci.yml',import.meta.url),'utf8');
const jobs=Object.fromEntries([...workflow.matchAll(/^  ([a-z][\w-]*):\n([\s\S]*?)(?=^  [a-z][\w-]*:\n|$(?![\s\S]))/gm)].map(m=>[m[1],m[2]]));
test('four stable required names are unique; agent context remains unconditional',()=>{
 for(const name of ['Agent Context Validation','Backend CI','Admin UI CI','POS UI CI'])assert.equal([...workflow.matchAll(new RegExp(`^    name: ${name}$`,'gm'))].length,1);
 assert.ok(!/^    if:/m.test(jobs['agent-context']));
 for(const command of ['validate-agent-context.sh','validate-dependency-locks.mjs','scripts/ocr-evaluation/verify.py'])assert.ok(jobs['agent-context'].includes(command));
});
test('required aggregates wire every selected worker and always evaluate',()=>{
 for(const [group,ids]of Object.entries({backend:['backend','products-pagination','batch-audit','order-sequence'],admin:['admin-ui'],pos:['pos-ui','pos-sku-acceptance','pos-dialog-acceptance']})){
  const gate=jobs[group+'-required'];assert.ok(gate.includes('if: ${{ always() }}'));assert.ok(gate.includes(`needs: [plan, ${ids.join(', ')}]`));assert.ok(gate.includes('CI_NEEDS: ${{ toJSON(needs) }}'));assert.ok(gate.includes(`CI_GROUP: ${group}`));assert.ok(gate.includes('node scripts/ci/gate.mjs'));
  for(const id of ids){assert.ok(jobs[id].includes('needs: plan'));assert.ok(jobs[id].includes(`if: \${{ needs.plan.outputs.${group} == 'true' }}`));}
 }
});
test('only metadata step receives token; browser reads step-bound digest',()=>{
 assert.equal([...workflow.matchAll(/UI_QA_METADATA_TOKEN:/g)].length,1);
 assert.match(jobs['pos-ui'],/id: provenance_metadata[\s\S]*?UI_QA_METADATA_TOKEN: \$\{\{ github.token \}\}[\s\S]*?run: node pos-ui\/e2e\/ui-evidence\/provenance-proof.mjs/);
 assert.match(jobs['pos-ui'],/UI_QA_PROOF_SHA256: \$\{\{ steps.provenance_metadata.outputs.proof_sha256 \}\}/);
 assert.match(jobs['pos-ui'],/UI_QA_PROOF_PATH: \$\{\{ steps.provenance_metadata.outputs.proof_path \}\}/);
 assert.match(workflow,/^permissions:\n  contents: read\n/m);assert.ok(!workflow.includes('pull_request_target'));
});
