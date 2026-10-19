import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
export function verifyGate(planResult,selection,results){
 assert.equal(planResult,'success');assert.ok(selection==='true'||selection==='false');
 assert.ok(Array.isArray(results)&&results.length>0);
 for(const result of results)assert.equal(result,selection==='true'?'success':'skipped');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const needs=JSON.parse(process.env.CI_NEEDS);const group=process.env.CI_GROUP;
 const jobs={backend:['backend','products-pagination','batch-audit','order-sequence'],admin:['admin-ui'],pos:['pos-ui','pos-sku-acceptance','pos-dialog-acceptance']}[group];
 assert.ok(jobs);verifyGate(needs.plan?.result,needs.plan?.outputs?.[group],jobs.map(id=>needs[id]?.result));
 console.log(`${group}: selected workers verified or explicitly not applicable`);
}
