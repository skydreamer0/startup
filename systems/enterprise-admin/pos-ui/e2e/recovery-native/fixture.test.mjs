import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { seedFixture, cleanupFixture, cleanupOrder, observeResponse, drainHttp } from './fixture.mjs';
const tenantId='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222',shiftId='33333333-3333-4333-8333-333333333333';
test('actual seed calls keep the existing required batch cost, tenant FKs, active user and valid shift',async()=>{const rows=[];const db=Object.fromEntries(['tenant','user','customer','product','productBatch','shift'].map(model=>[model,{create:async({data})=>{rows.push({model,data});return{id:model+'-id',...data};}}]));const fixture=await seedFixture(db,{tenantId,userId,shiftId});assert.deepEqual(rows.map(row=>row.model),['tenant','user','customer','product','productBatch','shift']);assert.equal(rows[0].data.plan,'pro');assert.equal(rows[1].data.status,'active');assert.equal(rows[2].data.phone,'WALK_IN');assert.equal(rows[3].data.stockQuantity,5);assert.equal(rows[3].data.costPrice,10);assert.equal(rows[3].data.retailPrice,20);assert.equal(rows[4].data.productId,fixture.productId);assert.equal(rows[4].data.costPrice,10);assert.equal(rows[4].data.quantity,5);assert.equal(rows[4].data.status,'RELEASED');assert.equal(rows[4].data.expiryDate.toISOString(),'2099-01-01T00:00:00.000Z');assert.equal(rows[5].data.staffId,userId);assert.equal(rows[5].data.openingCash,0);for(const row of rows.slice(1))assert.equal(row.data.tenantId,tenantId);});
test('actual cleanup uses only this fixture ID in FK order and refuses unknown HTTP activity',async()=>{const calls=[];const db=Object.fromEntries(cleanupOrder.map(model=>[model,{deleteMany:async args=>{calls.push({model,...args});}}]));await assert.rejects(cleanupFixture(db,tenantId,false));assert.deepEqual(calls,[]);await cleanupFixture(db,tenantId,true);assert.deepEqual(calls.map(row=>row.model),cleanupOrder);for(const call of calls)assert.deepEqual(call.where,call.model==='tenant'?{id:tenantId}:{tenantId});await assert.rejects(cleanupFixture(db,'other',true));});
test('real HTTP finish and actual response observer settle before snapshot or cleanup',async()=>{const events=[],pending=new Set();let release;const hold=new Promise(resolve=>{release=resolve;});const server=http.createServer(async(req,res)=>{res.status=code=>{res.statusCode=code;return res;};res.json=body=>res.end(JSON.stringify(body));observeResponse({res,identity:{method:req.method,path:req.url},pending,snapshot:async()=>{events.push('snapshot-start');await hold;events.push('snapshot-ready');return{orders:1};},record:row=>{events.push('record');assert.equal(row.body.success,true);},onError:error=>{throw error;}});res.json({success:true});});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const fetched=fetch(`http://127.0.0.1:${server.address().port}/exact`).then(r=>r.json());while(!pending.size)await new Promise(resolve=>setTimeout(resolve,1));const drain=drainHttp(server,pending).then(()=>{events.push('drained');});assert.deepEqual(events,['snapshot-start']);release();await fetched;await drain;events.push('after-snapshot');events.push('fixture-delete');assert.deepEqual(events,['snapshot-start','snapshot-ready','record','drained','after-snapshot','fixture-delete']);assert.equal(pending.size,0);});
test('HTTP timeout never grants a cleanup lease',async()=>{let close;const server={close:callback=>{close=callback;}};let cleaned=false;await assert.rejects(drainHttp(server,new Set(),10).then(()=>{cleaned=true;}),/did not drain/);assert.equal(cleaned,false);close();});
import { finalizeFixture } from './fixture.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
for (const broken of ['none','drain','snapshot','cleanup','disconnect','remove','ledger','receipt']) test(`actual finalizer preserves first error and attempts immutable report after ${broken}`,async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'recovery-final-')), events=[];
 fs.writeFileSync(path.join(dir,'.bootstrap.json'),'synthetic-private');
 let primary=null,drained=false,afterEmpty=false;
 const fail=(error,stage)=>{primary??={error,stage};};
 const action=(name,fn=()=>{})=>async()=>{events.push(name);if(name===broken)throw new Error(name);await fn();};
 try {
  await finalizeFixture({
   drain:action('drain',()=>{drained=true;}),
   snapshot:action('snapshot',()=>assert.equal(drained,true)),
   cleanup:action('cleanup',()=>{assert.equal(drained,true);afterEmpty=true;}),
   disconnect:action('disconnect'),
   remove:action('remove',()=>fs.rmSync(path.join(dir,'.bootstrap.json'))),
   ledger:action('ledger',()=>fs.writeFileSync(path.join(dir,'api-ledger.json'),'[]',{flag:'wx'})),
   receipt:action('receipt',()=>fs.writeFileSync(path.join(dir,'database-receipt.json'),JSON.stringify({afterEmpty,drained,error:primary?.stage??null}),{flag:'wx'})),
   dispose:action('dispose'),
  },fail);
  assert.deepEqual(events,['drain','snapshot','cleanup','disconnect','remove','ledger','receipt','dispose']);
  assert.equal(primary?.stage??'none',broken);assert.equal(afterEmpty,broken!=='drain'&&broken!=='cleanup');
  if(broken!=='remove')assert.equal(fs.existsSync(path.join(dir,'.bootstrap.json')),false);
  if(broken!=='receipt'){const raw=fs.readFileSync(path.join(dir,'database-receipt.json'),'utf8');assert.equal(JSON.parse(raw).error,broken==='none'?null:broken);assert.throws(()=>fs.writeFileSync(path.join(dir,'database-receipt.json'),'overwrite',{flag:'wx'}),{code:'EEXIST'});assert.equal(fs.readFileSync(path.join(dir,'database-receipt.json'),'utf8'),raw);}
 } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
test('actual finalizer retains an earlier browser error even if every cleanup/report action fails',async()=>{const original=new Error('browser');let primary=original,count=0;await finalizeFixture(Object.fromEntries(['drain','snapshot','cleanup','disconnect','remove','ledger','receipt','dispose'].map(key=>[key,async()=>{count++;throw new Error(key);} ])),error=>{primary??=error;});assert.equal(count,8);assert.equal(primary,original);});

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
for(const snapshotFails of [false,true]) test(`real HTTP close during pending snapshot retains original close and awaits snapshot (failure=${snapshotFails})`,{timeout:2000},async()=>{
 const hold=deferred(),started=deferred(),closed=deferred(),pending=new Set(),rows=[],errors=[],events=[];
 const server=http.createServer((req,res)=>{
  res.status=code=>{res.statusCode=code;return res;};res.json=body=>res.end(JSON.stringify(body));res.once('close',()=>{events.push('close');closed.resolve();});
  observeResponse({res,identity:{id:'owned'},pending,snapshot:async()=>{started.resolve();await hold.promise;events.push('snapshot-settled');if(snapshotFails)throw new Error('snapshot-secondary');return{actual:'snapshot'};},record:row=>rows.push(row),onError:error=>{errors.push(error);events.push('original-error');}});
  res.json({success:true});
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const req=http.get(`http://127.0.0.1:${server.address().port}/owned`);req.on('error',()=>{});
 try{
  await started.promise;req.destroy();await closed.promise;assert.equal(pending.size,1);assert.deepEqual(errors,[]);assert.deepEqual(rows,[]);
  hold.resolve();await drainHttp(server,pending,100);
  assert.equal(pending.size,0);assert.equal(errors.length,1);assert.match(errors[0].message,/closed before finish/);assert.deepEqual(rows,[]);
  assert.deepEqual(events,['close','snapshot-settled','original-error']);
 }finally{hold.resolve();req.destroy();server.close();}
});
test('real snapshot failure returns 500, records no successful body, settles before cleanup', {timeout:2000},async()=>{
 const pending=new Set(),rows=[],errors=[];const original=new Error('snapshot-original');
 const server=http.createServer((req,res)=>{res.status=code=>{res.statusCode=code;return res;};res.json=body=>res.end(JSON.stringify(body));observeResponse({res,identity:{},pending,snapshot:async()=>{throw original;},record:row=>rows.push(row),onError:error=>errors.push(error)});res.json({success:true});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const response=await fetch(`http://127.0.0.1:${server.address().port}/`);assert.equal(response.status,500);await response.text();await drainHttp(server,pending,100);assert.deepEqual(errors,[original]);assert.deepEqual(rows,[]);assert.equal(pending.size,0);}finally{server.close();}
});
test('real response finish before owned emission fails closed without inventing JSON receipt',{timeout:2000},async()=>{
 const hold=deferred(),started=deferred(),pending=new Set(),rows=[],errors=[];let response;
 const server=http.createServer((req,res)=>{response=res;res.status=code=>{res.statusCode=code;return res;};res.json=body=>res.end(JSON.stringify(body));observeResponse({res,identity:{},pending,snapshot:async()=>{started.resolve();await hold.promise;return{};},record:row=>rows.push(row),onError:error=>errors.push(error)});res.json({success:true});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const fetched=fetch(`http://127.0.0.1:${server.address().port}/`).then(response=>response.text());
 try{await started.promise;response.end('unexpected body');assert.equal(await fetched,'unexpected body');assert.equal(pending.size,1);hold.resolve();await drainHttp(server,pending,100);assert.equal(pending.size,0);assert.equal(errors.length,1);assert.match(errors[0].message,/finished before owned JSON emission/);assert.deepEqual(rows,[]);}finally{hold.resolve();server.close();}
});
test('real close after owned JSON emission reports failure, does not create a successful row',{timeout:2000},async()=>{
 const pending=new Set(),rows=[],errors=[],closed=deferred();
 const server=http.createServer((req,res)=>{res.status=code=>{res.statusCode=code;return res;};res.json=()=>res.destroy();res.once('close',()=>closed.resolve());observeResponse({res,identity:{},pending,snapshot:async()=>({}),record:row=>rows.push(row),onError:error=>errors.push(error)});res.json({success:true});});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const req=http.get(`http://127.0.0.1:${server.address().port}/`);req.on('error',()=>{});
 try{await closed.promise;await drainHttp(server,pending,100);assert.equal(pending.size,0);assert.equal(errors.length,1);assert.match(errors[0].message,/closed before finish/);assert.deepEqual(rows,[]);}finally{req.destroy();server.close();}
});
