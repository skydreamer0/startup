import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { createPacer, createRecoveryDispatch, createState, requestClass, endRecovery, recoveryBoundaryReady } from './network.mjs';
import { cases, origin, prefix, authorizeOwnedWrite } from './contract.mjs';
const commandId='11111111-1111-4111-8111-111111111111', fixture={nonce:'owned-nonce',tenantId:'tenant',userId:'cashier',productId:'product',shiftId:'shift',accessToken:'synthetic-token'};
const payload={commandId,shiftId:'shift',cartItems:[{productId:'product',quantity:1,discountRate:0}],paymentMethod:'CASH',orderDiscountAmount:0,orderDiscountNote:'',salesStaffId:'cashier'};
function request(url=origin+prefix+'/checkout',method='POST',resource='fetch',body=payload){return{url:()=>url,method:()=>method,resourceType:()=>resource,headers:()=>({authorization:'Bearer synthetic-token'}),postDataJSON:()=>structuredClone(body)};}
for(const [url,method,resource] of [['http://user:pass@127.0.0.1:4290'+prefix+'/checkout','POST','fetch'],[origin+prefix+'/checkout/','POST','fetch'],[origin+prefix+'/checkout','DELETE','fetch'],[origin+prefix+'/checkout','POST','document'],[origin+prefix+'/checkout','POST','script'],[origin+prefix+'/checkout','POST','image'],[origin+prefix+'/checkout','POST','stylesheet'],['http://127.0.0.1:4292'+prefix+'/checkout','POST','fetch'],['https://127.0.0.1:4290'+prefix+'/checkout','POST','fetch'],[origin+prefix+'/checkout-extra','POST','fetch'],[origin+prefix+'/checkout?token=secret','POST','fetch'],[origin+prefix+'/checkout#x','POST','fetch'],[origin+'/api/v1/admin/auth/me','GET','fetch'],[origin+prefix+'/orders/'+commandId+'/refund-extra','POST','fetch']]){
 test(`exact request boundary rejects ${method} ${resource} ${new URL(url).pathname} ${new URL(url).search?'query':''} ${new URL(url).port}`,()=>assert.equal(requestClass(request(url,method,resource)).kind,'deny'));
}
test('known API and production assets preserve finite dispatch classes',()=>{assert.equal(requestClass(request()).kind,'api');assert.equal(requestClass(request(origin+prefix+'/products?q=SYNTHETIC&inStockOnly=true','GET')).kind,'api');assert.equal(requestClass(request(origin+'/','GET','document')).kind,'static');assert.equal(requestClass(request(origin+'/assets/index-Ab123.js','GET','script')).kind,'static');});
async function loopback(run,{status,malformed=false}={}){
 const received=[];const server=http.createServer(async(req,res)=>{let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):null;received.push({method:req.method,path:req.url,body});res.statusCode=status??(body?.cartItems?.[0]?.quantity===2?201:received.some(row=>row.body?.cartItems?.[0]?.quantity===2)?409:201);res.setHeader('content-type','application/json');res.end(malformed?'not-json':JSON.stringify(res.statusCode===409?{success:false,error:{code:'COMMAND_PAYLOAD_CONFLICT'}}:{success:true,data:{id:'order',totalAmount:20}}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const port=server.address().port;
 try{return await run(async options=>{const response=await fetch(`http://127.0.0.1:${port}/checkout`,{method:'POST',headers:options.headers,body:options.postData});return{status:()=>response.status,headers:()=>({'content-type':'application/json'}),body:async()=>Buffer.from(await response.arrayBuffer()),dispose:async()=>{}};},received);}finally{await new Promise(resolve=>server.close(resolve));}
}
function routeFor(req,fetch){const calls=[];return{request:()=>req,fetch,abort:async reason=>{calls.push(['abort',reason]);},fulfill:async()=>{calls.push(['fulfill']);},continue:async()=>{calls.push(['continue']);},calls};}
test('actual callback drops only after real loopback 201, preserves original business identity',async()=>loopback(async(fetch,received)=>{const state=createState(fixture,cases[0]);state.phase='submit';const route=routeFor(request(),fetch);await createRecoveryDispatch(state,{pace:async()=>true})(route);assert.equal(received.length,1);assert.deepEqual(received[0].body,payload);assert.deepEqual(route.calls,[['abort','connectionreset']]);assert.equal(state.requests[0].status,201);assert.equal(state.requests[0].droppedAfterCommit,true);assert.equal(JSON.stringify(state.requests).includes(fixture.accessToken),false);}));
test('actual conflict callback sends one different business intent then original and exposes real 409',async()=>loopback(async(fetch,received)=>{const state=createState(fixture,cases[2]);state.phase='submit';const route=routeFor(request(),fetch);await createRecoveryDispatch(state,{pace:async()=>true})(route);assert.equal(received.length,2);assert.equal(received[0].body.cartItems[0].quantity,2);assert.deepEqual(received[1].body,payload);assert.deepEqual(state.requests.map(row=>[row.phase,row.status]),[['prime',201],['submit',409]]);assert.deepEqual(route.calls,[['fulfill']]);}));
for(const scenario of [cases[0],cases[2]])test(`cancelled browser ${scenario.id} is never fetched or replayed`,async()=>{const state=createState(fixture,scenario),req=request();state.cancelled.add(req);let fetched=0;const route=routeFor(req,async()=>{fetched++;throw Error('not allowed');});await createRecoveryDispatch(state)(route);assert.equal(fetched,0);assert.deepEqual(route.calls,[]);assert.ok(state.requests.every(row=>row.dispatched===false));});
test('abort after competing commit prohibits second/original POST',async()=>loopback(async(fetch,received)=>{const state=createState(fixture,cases[2]),req=request();const route=routeFor(req,async options=>{const response=await fetch(options);state.controllers.get(req).abort();return response;});await createRecoveryDispatch(state,{pace:async()=>true})(route);assert.equal(received.length,1);assert.equal(received[0].body.cartItems[0].quantity,2);assert.deepEqual(route.calls,[]);}));
for(const options of [{status:302},{status:500},{status:401},{status:403},{status:201,malformed:true}])test(`real unexpected response ${JSON.stringify(options)} cannot become synthetic success`,async()=>loopback(async(fetch)=>{const state=createState(fixture,cases[0]),route=routeFor(request(),fetch);await assert.rejects(createRecoveryDispatch(state,{pace:async()=>true})(route));assert.deepEqual(route.calls,[]);},options));
test('phase is frozen before queued dispatch, even when UI phase changes',async()=>loopback(async(fetch)=>{const state=createState(fixture,cases[0]);state.phase='submit';let release;const wait=new Promise(resolve=>{release=resolve;});const route=routeFor(request(),fetch);const task=createRecoveryDispatch(state,{pace:async()=>{await wait;return true;}})(route);state.phase='complete';release();await task;assert.equal(state.requests[0].phase,'submit');}));
test('cancelled queued dispatch does not reserve a later rate slot',async()=>{let now=0;const waits=[];const pace=createPacer({spacing:550,now:()=>now,wait:async ms=>{waits.push(ms);now+=ms;}});const a=new AbortController(),b=new AbortController();assert.equal(await pace(a.signal),true);b.abort();assert.equal(await pace(b.signal),false);assert.equal(await pace(a.signal),true);assert.deepEqual(waits,[550]);});
test('request budget rejects extra dispatch and does not silently retry',async()=>{const pace=createPacer({spacing:0,limit:1});const signal=new AbortController().signal;await pace(signal);await assert.rejects(pace(signal),/request limit/);});
test('owned write policy binds fixture, amount, exact path, ordinal, phase and original replay payload',()=>{assert.equal(authorizeOwnedWrite('retry',0,prefix+'/checkout','submit',payload,fixture),true);assert.equal(authorizeOwnedWrite('retry',1,prefix+'/checkout','recover',payload,fixture,{payload}),true);for(const changed of [{...payload,shiftId:'other'},{...payload,customerId:'other'},{...payload,orderDiscountAmount:1},{...payload,adminPin:'secret'},{...payload,cartItems:[{productId:'other',quantity:1}]}])assert.equal(authorizeOwnedWrite('retry',0,prefix+'/checkout','submit',changed,fixture),false);assert.equal(authorizeOwnedWrite('query-refund',1,prefix+'/orders/'+commandId+'/refund','refund',{reason:'合成原生退款'},fixture,{orderId:commandId}),true);assert.equal(authorizeOwnedWrite('query-refund',1,prefix+'/orders/'+commandId+'/refund','refund',{reason:'合成原生退款',extra:'unknown'},fixture,{orderId:commandId}),false);});

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}
test('ending during actual queued callback prohibits POST even when pacer ignores cancellation',async()=>{
 const state=createState(fixture,cases[0]),queue=deferred(),started=deferred();let fetched=0;
 const route=routeFor(request(),async()=>{fetched++;throw new Error('must not send');});
 const task=createRecoveryDispatch(state,{pace:async()=>{started.resolve();await queue.promise;return true;}})(route);
 await started.promise;state.ending=true;queue.resolve();await task;
 assert.equal(fetched,0);assert.equal(state.requests[0].dispatched,false);assert.equal(state.requests[0].cancelled,true);assert.deepEqual(route.calls,[]);assert.equal(state.controllers.size,0);
});
test('actual endRecovery aborts every queued controller, releases hold and reserves no later rate slot',async()=>{
 const state=createState(fixture,cases[0]),queue=deferred(),started=deferred(),signals=[];let fetched=0;
 const dispatch=createRecoveryDispatch(state,{pace:async signal=>{signals.push(signal);if(signals.length===2)started.resolve();await queue.promise;return true;}});
 const routes=[routeFor(request(),async()=>{fetched++;}),routeFor(request(),async()=>{fetched++;})];const tasks=routes.map(dispatch);
 await started.promise;endRecovery(state);assert.equal(state.ending,true);assert.ok(signals.every(signal=>signal.aborted));await state.refundRelease;queue.resolve();await Promise.all(tasks);
 assert.equal(fetched,0);assert.ok(state.requests.every(row=>row.cancelled&&!row.dispatched));assert.equal(state.controllers.size,0);
 const pace=createPacer({spacing:0,limit:1});for(const signal of signals)assert.equal(await pace(signal),false);assert.equal(await pace(new AbortController().signal),true);
});
test('ending during real loopback prime records actual response but never sends original POST',async()=>loopback(async(fetch,received)=>{
 const state=createState(fixture,cases[2]),route=routeFor(request(),async options=>{const response=await fetch(options);state.ending=true;return response;});
 await createRecoveryDispatch(state,{pace:async()=>true})(route);assert.equal(received.length,1);assert.equal(received[0].body.cartItems[0].quantity,2);assert.equal(state.requests[0].status,201);assert.equal(state.requests[0].competingCommit,true);assert.equal(state.requests[0].cancelled,true);assert.deepEqual(route.calls,[]);
}));
test('endRecovery during real committed response settles it without deliberate abort, fulfill or replay',async()=>loopback(async(fetch,received)=>{
 const state=createState(fixture,cases[0]);let disposed=0;const route=routeFor(request(),async options=>{const response=await fetch(options);endRecovery(state);return{...response,dispose:async()=>{disposed++;}};});
 await createRecoveryDispatch(state,{pace:async()=>true})(route);assert.equal(received.length,1);assert.equal(state.requests[0].status,201);assert.equal(state.requests[0].cancelled,true);assert.equal(state.requests[0].droppedAfterCommit,undefined);assert.equal(disposed,1);assert.deepEqual(route.calls,[]);
}));
for(const options of [{status:500},{status:201,malformed:true}])test(`ending does not swallow genuine ${JSON.stringify(options)}`,async()=>loopback(async(fetch)=>{
 const state=createState(fixture,cases[0]),route=routeFor(request(),async options=>{const response=await fetch(options);endRecovery(state);return response;});await assert.rejects(createRecoveryDispatch(state,{pace:async()=>true})(route));assert.deepEqual(route.calls,[]);
},options));
test('endRecovery releases a refund response hold without delivering after close starts',async()=>{
 const state=createState(fixture,cases[0]);let disposed=0;const req=request(origin+prefix+'/orders/'+commandId+'/refund','POST','fetch',{reason:'合成原生退款'});const route=routeFor(req,async()=>({status:()=>200,body:async()=>Buffer.from('{"success":true}'),dispose:async()=>{disposed++;}}));
 const task=createRecoveryDispatch(state,{pace:async()=>true})(route);while(!state.refundReady)await new Promise(resolve=>setTimeout(resolve,1));endRecovery(state);await task;assert.equal(disposed,1);assert.equal(state.requests[0].cancelled,true);assert.deepEqual(route.calls,[]);
});

function terminalRow(scenario=cases[0]){return{caseId:scenario.id,method:'POST',path:prefix+'/checkout',phase:'submit',payload:{commandId},dispatched:true,status:201,sha256:'a'.repeat(64),droppedAfterCommit:true,delivered:false};}
test('recovery boundary does not equate the shared pending heading with unknown completion',()=>{
 const row=terminalRow();assert.equal(recoveryBoundaryReady({status:'pending',payload:{commandId}},[row],cases[0]),false);assert.equal(recoveryBoundaryReady({status:'unknown',payload:{commandId}},[row],cases[0]),true);
});
for(const [label,change]of Object.entries({missing:rows=>rows.pop(),queued:rows=>{rows[0].dispatched=false;},'wrong-command':rows=>{rows[0].payload.commandId='other';},'wrong-case':rows=>{rows[0].caseId='other';},'wrong-phase':rows=>{rows[0].phase='recover';},'real500':rows=>{rows[0].status=500;},'no-real-body':rows=>{delete rows[0].sha256;},'not-dropped':rows=>{rows[0].droppedAfterCommit=false;},delivered:rows=>{rows[0].delivered=true;},duplicate:rows=>rows.push(structuredClone(rows[0]))}))test(`initial recovery refuses ${label} even with persisted unknown`,()=>{
 const rows=[terminalRow()];change(rows);assert.equal(recoveryBoundaryReady({status:'unknown',payload:{commandId}},rows,cases[0]),false);
});
test('initial conflict requires real competing201 and delivered original409 with the same identity',()=>{
 const rows=[{...terminalRow(cases[2]),phase:'prime',competingCommit:true},{...terminalRow(cases[2]),status:409,delivered:true}],intent={status:'conflict',payload:{commandId}};
 assert.equal(recoveryBoundaryReady(intent,rows,cases[2]),true);
 for(const change of [v=>v.pop(),v=>{v[0].competingCommit=false;},v=>{v[0].status=500;},v=>{v[1].delivered=false;},v=>{v[1].status=201;},v=>{v[1].payload.commandId='other';}]){const altered=structuredClone(rows);change(altered);assert.equal(recoveryBoundaryReady(intent,altered,cases[2]),false);}
});
test('actual queued callback must settle committed201/drop and persisted unknown before readiness',async()=>loopback(async(fetch,received)=>{
 const state=createState(fixture,cases[0]),queue=deferred(),entered=deferred(),intent={status:'pending',payload:{commandId}};state.phase='submit';
 const route=routeFor(request(),fetch);route.abort=async reason=>{route.calls.push(['abort',reason]);intent.status='unknown';};
 const task=createRecoveryDispatch(state,{pace:async()=>{entered.resolve();await queue.promise;return true;}})(route);
 await entered.promise;assert.equal(received.length,0);assert.equal(recoveryBoundaryReady(intent,state.requests,cases[0]),false);assert.equal(state.requests[0].dispatched,false);
 queue.resolve();await task;assert.equal(received.length,1);assert.equal(intent.status,'unknown');assert.equal(recoveryBoundaryReady(intent,state.requests,cases[0]),true);assert.deepEqual(route.calls,[['abort','connectionreset']]);
}));
