import test from 'node:test';import assert from 'node:assert/strict';
import {assertEvidence,digest,cases,assertReport} from './contract.mjs';import {goodEvidence} from './test-support.mjs';
const check=e=>assertEvidence(e.database,e.browsers,e.api);
test('complete read-only receipt with both fault kinds is accepted',()=>assert.equal(check(goodEvidence()).financialWrites,0));
const mutations={
 'raw mutation':e=>e.database.after.products[0].stock_quantity++,
 'foreign product':e=>{const r=e.api.requests.find(r=>r.path.endsWith('/inventory/products')&&r.status===200);r.body.data.data[0].tenantId=e.f.ids.tenantB;r.body.data.data[0].id=e.f.product[61].id;r.sha256=digest(r.body);e.browsers.flatMap(b=>b.requests).find(b=>b.id===r.id).sha256=r.sha256;},
 'forged status':e=>e.browsers[0].requests[0].status=500,
 'wrong actor':e=>e.api.requests[0].userId=e.f.ids.deniedA,
 'absent auth read':e=>{const r=e.browsers[0].requests.shift();e.api.requests=e.api.requests.filter(a=>a.id!==r.id);},
 'wrong page total':e=>{const r=e.api.requests.find(r=>r.page===2);r.body.data.total=1;r.sha256=digest(r.body);e.browsers.flatMap(b=>b.requests).find(b=>b.id===r.id).sha256=r.sha256;},
 'forged synthetic hash':e=>e.browsers[0].requests.find(r=>r.fault).deliveredSha256='a'.repeat(64),
 'forged synthetic status':e=>e.browsers[0].requests.find(r=>r.fault).deliveredStatus=200,
 'page one injection':e=>e.browsers[0].requests.find(r=>r.fault).page=1,
 'cancelled only fault':e=>{const r=e.browsers[0].requests.find(r=>r.fault);r.delivered=false;r.cancelled=true;},
 'financial POST':e=>e.browsers[0].requests[0].method='POST',
 'unknown rows':e=>e.database.before.audit_logs.push({id:'unexpected'}),
 'hidden cleanup error':e=>e.database.error={name:'Error'},
 'not drained':e=>e.database.httpDrainedBeforeSnapshot=false,
 'wrong permissions':e=>e.database.expected.actors[0].grants.push('release:products'),
 'reader got create':e=>e.browsers.find(b=>b.caseId==='batch-reader').journey.createDisabled=false,
 'lost draft':e=>e.browsers[0].journey.malformedDraftPreserved=false,
 'missing stage':e=>e.browsers[0].journey.stages=[],
 'missing geometry lifetime':e=>e.browsers[0].contextClosed=false,
 'duplicate request':e=>e.api.requests.push(e.api.requests[0]),
};
for(const[name,mutate]of Object.entries(mutations))test('oracle rejects '+name,()=>{const e=goodEvidence();mutate(e);assert.throws(()=>check(e));});
test('report requires exact five cases without retries',()=>{const report={errors:[],suites:[{specs:cases.map(c=>({title:c.title,ok:true,tests:[{expectedStatus:'passed',status:'expected',results:[{status:'passed',errors:[],duration:1}]}]}))}]};assert.equal(assertReport(report).length,5);report.suites[0].specs[0].tests[0].results.push({status:'passed',errors:[]});assert.throws(()=>assertReport(report));});
