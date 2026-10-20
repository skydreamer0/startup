import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { createServer, request as httpRequest } from 'node:http';
import { assertEnvironment, databaseUrl, origin, loginPath, allowedRequest, safeResponse, loginAttempt, cases, readPaths, assertReport, assertEvidence, digest } from './contract.mjs';
import { requestClass, createState, createDispatch, endEntry, createPacer } from './network.mjs';
import { createGuard, observeResponse, drainHttp, cleanupFixture, finalizeFixture, seedFixture } from './fixture.mjs';
import { brandAssets } from '../dialog-acceptance/brand-assets.mjs';
const fixture = { nonce: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', userId: 'user', tenantId: 'tenant', productId: 'product', fullName: '合成員工', codes: { inactive: 'SYNTHETIC-I', unknown: 'SYNTHETIC-X', active: 'SYNTHETIC-A' } };
const token = 'SYNTHETIC-TEST-ONLY-NOT-A-CREDENTIAL';
const loginBody = { success: true, data: { accessToken: token, user: { id: fixture.userId, fullName: fixture.fullName }, arbitrary: 'NEVER-SAVE' }, accessToken: 'NEVER-SAVE' };
const rejectedBody = { success: false, error: { message: 'SYNTHETIC-PRIVATE-MESSAGE', token } };
function request(url = origin + loginPath, method = 'POST', resource = 'fetch', body = { employeeCode: fixture.codes.active }) {
  return { url: () => url, method: () => method, resourceType: () => resource, postDataJSON: () => body, headers: () => ({}) };
}
function routeHarness({ req = request(), status = 200, body = loginBody } = {}) {
  const calls = [], route = { request: () => req, abort: async () => calls.push('abort'), continue: async () => calls.push('continue'),
    fetch: async options => { calls.push(['fetch', options]); return { status: () => status, body: async () => Buffer.from(JSON.stringify(body)), dispose: async () => calls.push('dispose') }; },
    fulfill: async options => calls.push(['fulfill', options]),
  };
  return { route, calls };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('environment retains the exact owned Node22/GitHub/loopback boundaries', () => {
  const env = { GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted', DATABASE_URL: databaseUrl, POS_PRODUCT_LOOKUP_DATABASE_URL: databaseUrl, CATEGORY_QA_DATABASE_URL: databaseUrl, STAFF_ENTRY_QA_DATABASE_URL: databaseUrl, SKU_QA_HEAD: 'a'.repeat(40), SKU_QA_CONTAINER: 'b'.repeat(64), SKU_QA_NETWORK: 'github_network_abcd', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1' };
  assertEnvironment(env, 'v22.23.3'); for (const key of Object.keys(env)) assert.throws(() => assertEnvironment({ ...env, [key]: undefined }, 'v22.23.3'));
  for (const version of ['v24.19.0','v20.0.0']) assert.throws(() => assertEnvironment(env, version));
  assert.throws(() => assertEnvironment({ ...env, STAFF_ENTRY_QA_DATABASE_URL: databaseUrl + '?schema=other' }, 'v22.23.3'));
});
for (const [suffix, method, resource, expected] of [
  ['', 'POST','fetch','api'], ['', 'POST','xhr','api'], ['?token=hidden','POST','fetch','deny'], ['?q=test','POST','fetch','deny'], ['#x','POST','fetch','deny'], ['/extra','POST','fetch','deny'],
  ['', 'GET','fetch','deny'], ['', 'DELETE','fetch','deny'], ['', 'POST','document','deny'], ['', 'POST','script','deny'], ['', 'POST','style','deny'], ['', 'POST','image','deny'],
]) test(`exact login boundary ${method}/${resource}/${suffix || 'plain'}`, () => assert.equal(requestClass(request(origin + loginPath + suffix, method, resource)).kind, expected));
for (const url of ['https://127.0.0.1:4290','http://127.0.0.1:4291','http://localhost:4290','http://a:b@127.0.0.1:4290']) test(`foreign origin or credentials denied ${url}`, () => assert.equal(requestClass(request(url + loginPath)).kind, 'deny'));
test('no other write or auth path enters the allowlist, and normal page/resources bypass API', () => {
  for (const path of ['/checkout','/shift/open','/customers','/orders/abc/refund']) assert.equal(allowedRequest('POST','/api/v1/admin/pos'+path), false);
  for (const path of ['/api/v1/admin/auth/me','/api/v1/admin/pos/staff-login-other']) assert.equal(requestClass(request(origin+path)).kind,'deny');
  assert.equal(requestClass(request(origin+'/login','GET','document')).kind,'static');
  assert.equal(requestClass(request(origin+'/assets/example.js','GET','script')).kind,'static');
  assert.equal(requestClass(request(origin+readPaths[0],'GET','fetch')).kind,'api');
  assert.equal(requestClass(request(origin+readPaths[0]+'?token=never','GET','fetch')).kind,'deny');
});
test('synthetic login input and response projections reject malformed bodies and discard all token/unknown fields', () => {
  for (const [key, code] of Object.entries(fixture.codes)) assert.equal(loginAttempt({employeeCode:code},fixture),key);
  for (const body of [null,{},[],{employeeCode:'UNKNOWN'},{employeeCode:1},{employeeCode:fixture.codes.active,extra:true}]) assert.equal(loginAttempt(body,fixture),null);
  assert.deepEqual(safeResponse(loginPath,200,loginBody),{success:true,data:{accessTokenPresent:true,user:{id:'user',fullName:'合成員工'}}});
  assert.deepEqual(safeResponse(loginPath,401,rejectedBody),{success:false,error:{rejected:true}});
  for (const body of [{},{success:false},{success:true,data:{}},{success:true,data:{accessToken:' '}}]) assert.throws(()=>safeResponse(loginPath,200,body));
  assert.throws(()=>safeResponse(loginPath,500,rejectedBody));
  assert.ok(!JSON.stringify(safeResponse(loginPath,200,loginBody)).includes(token));
});
test('actual callback holds only a genuine active login and cancellation never fulfills or replays it', async () => {
  const state=createState(fixture,cases[0]),h=routeHarness(); const work=createDispatch(state,{pace:async()=>true})(h.route);
  await tick(); assert.equal(state.activeReady,true); assert.equal(h.calls.filter(x=>Array.isArray(x)&&x[0]==='fetch').length,1); assert.equal(h.calls.some(x=>Array.isArray(x)&&x[0]==='fulfill'),false);
  state.controllers.get(h.route.request()).abort(); endEntry(state); await work;
  assert.equal(state.requests[0].dispatched,true); assert.equal(state.requests[0].cancelled,true); assert.equal(state.requests[0].delivered,false);
  assert.equal(h.calls.some(x=>Array.isArray(x)&&x[0]==='fulfill'),false); assert.equal(state.controllers.size,0); assert.ok(!JSON.stringify(state.requests).includes(token));
});
test('actual callback fulfills a released genuine login without changing response or saving credentials', async () => {
  const state=createState(fixture,cases[0]),h=routeHarness(); const work=createDispatch(state,{pace:async()=>true})(h.route); await tick(); state.releaseActive(); await work;
  assert.equal(state.requests[0].delivered,true); assert.equal(state.requests[0].sha256,digest(safeResponse(loginPath,200,loginBody)));
  const options=h.calls.find(x=>Array.isArray(x)&&x[0]==='fetch')[1]; assert.equal(options.maxRedirects,0); assert.equal(options.maxRetries,0); assert.equal(options.timeout,20000);
  assert.equal(options.headers.authorization,undefined); assert.ok(!JSON.stringify(state.requests).includes(token));
});
for(const when of ['already-cancelled','queued','ending']) test(`actual queued ${when} login cannot dispatch`,async()=>{
 const state=createState(fixture,cases[0]),h=routeHarness(); let release; const gate=new Promise(r=>{release=r});
 if(when==='already-cancelled')state.cancelled.add(h.route.request());
 const work=createDispatch(state,{pace:async()=>{await gate;return true}})(h.route);
 if(when==='queued')state.controllers.get(h.route.request()).abort(); if(when==='ending')endEntry(state); release(); await work;
 assert.equal(h.calls.some(x=>Array.isArray(x)&&x[0]==='fetch'),false);assert.equal(state.requests[0].cancelled,true);assert.equal(state.controllers.size,0);
});
for(const status of [401,403,500])test(`unexpected active-login HTTP ${status} stays a real failure`,async()=>{
 const state=createState(fixture,cases[0]),h=routeHarness({status,body:rejectedBody});await assert.rejects(createDispatch(state,{pace:async()=>true})(h.route));assert.equal(h.calls.some(x=>Array.isArray(x)&&x[0]==='fulfill'),false);assert.equal(state.controllers.size,0);
});
test('inactive and unknown real 401s are delivered without the active hold',async()=>{
 for(const kind of ['inactive','unknown']){const state=createState(fixture,cases[0]),h=routeHarness({req:request(origin+loginPath,'POST','fetch',{employeeCode:fixture.codes[kind]}),status:401,body:rejectedBody});await createDispatch(state,{pace:async()=>true})(h.route);assert.equal(state.requests[0].delivered,true);assert.equal(state.activeReady,false);assert.ok(!JSON.stringify(state.requests).includes(token));}
});
test('pacer drops an aborted queued request and keeps the finite shared limit',async()=>{
 let now=0,waits=0;const pace=createPacer({spacing:550,limit:2,now:()=>now,wait:async ms=>{waits++;now+=ms}});const a=new AbortController(),b=new AbortController();assert.equal(await pace(a.signal),true);b.abort();assert.equal(await pace(b.signal),false);assert.equal(await pace(a.signal),true);assert.equal(waits,1);await assert.rejects(pace(a.signal));
});

function response(){const res=new EventEmitter();res.statusCode=200;res.destroyed=false;res.writableFinished=false;res.writableEnded=false;res.status=code=>{res.statusCode=code;return res};res.end=()=>{res.writableEnded=true};res.json=body=>{res.sent=body;res.writableFinished=true;res.emit('finish');return res};return res;}
test('real observer handles synchronous finish and stores only projected token-free body',async()=>{
 const res=response(),pending=new Set(),rows=[],errors=[];observeResponse({res,identity:{path:loginPath},verifyLogin:()=>({verifiedSubject:'user'}),pending,record:x=>rows.push(x),onError:x=>errors.push(x)});res.json(loginBody);
 assert.equal(pending.size,0);assert.equal(rows.length,1);assert.deepEqual(errors,[]);assert.equal(res.sent,loginBody);assert.ok(!JSON.stringify(rows).includes(token));assert.ok(!JSON.stringify(rows).includes('NEVER-SAVE'));
});
test('closed or malformed real responses cannot publish a successful receipt',()=>{
 for(const closed of [true,false]){const res=response();res.destroyed=closed;const pending=new Set(),rows=[],errors=[];observeResponse({res,identity:{path:loginPath},verifyLogin:()=>({}),pending,record:x=>rows.push(x),onError:x=>errors.push(x)});res.json(closed?loginBody:{});assert.equal(pending.size,0);assert.equal(rows.length,0);assert.ok(errors.length>0);}
});
test('actual mounted Express guard snapshots safe paths before router mutation and never retains token or query',async()=>{
 // Canonical CI installs Express only in backend. Resolve from that package,
 // not the root or POS dependency graph (which historically hid missing deps).
 const require=createRequire(new URL('../../../backend/package.json',import.meta.url));const express=require('express');
 const app=express(),router=express.Router(),requests=[],rejected=[],errors=[],pending=new Set(),issued=new Set();
 app.use(express.json());app.use(createGuard({fixture,nonce:fixture.nonce,verifyAccessToken:value=>{assert.equal(value,token);return{userId:'user'}},issued,pending,requests,rejected,onError:x=>errors.push(x)}));
 router.post('/staff-login',(req,res)=>res.status(req.body.employeeCode===fixture.codes.active?200:401).json(req.body.employeeCode===fixture.codes.active?loginBody:rejectedBody));
 router.get('/checkout-context',(_req,res)=>res.json({success:true,data:{tenantId:'tenant',userId:'user'}}));app.use('/api/v1/admin/pos',router);
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s))});let i=0;const base=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const kind of ['inactive','unknown','active']){const r=await fetch(base+loginPath,{method:'POST',headers:{'content-type':'application/json','x-staff-qa-request':`${fixture.nonce}:${++i}`,'x-staff-qa-case':cases[0].id},body:JSON.stringify({employeeCode:fixture.codes[kind]})});await r.arrayBuffer();assert.equal(r.status,kind==='active'?200:401);}
  const r=await fetch(base+readPaths[0]+'?q=SYNTHETIC-QUERY-NEVER-SAVE',{headers:{authorization:`Bearer ${token}`,'x-staff-qa-request':`${fixture.nonce}:${++i}`,'x-staff-qa-case':cases[0].id}});await r.arrayBuffer();assert.equal(r.status,200);
  assert.equal(requests.length,4);assert.deepEqual(requests.map(x=>x.path),[loginPath,loginPath,loginPath,readPaths[0]]);assert.equal(requests[3].verifiedSubject,'user');assert.equal(requests[3].issuedByRealLogin,true);assert.deepEqual(errors,[]);assert.deepEqual(rejected,[]);
  const text=JSON.stringify(requests);for(const value of [token,'NEVER-SAVE','SYNTHETIC-QUERY'])assert.ok(!text.includes(value));
  const denied=await fetch(base+'/api/v1/admin/pos/unknown/SYNTHETIC-SECRET?token=secret',{headers:{'x-staff-qa-request':`${fixture.nonce}:${++i}`,'x-staff-qa-case':cases[0].id}});await denied.arrayBuffer();assert.equal(denied.status,405);assert.equal(requests.length,4);assert.ok(!JSON.stringify(rejected).includes('SECRET'));
 }finally{assert.equal(await drainHttp(server,pending),true);}
});

test('fixture failure cleanup remains exact, ordered, and refuses unknown HTTP ownership',async()=>{
 const calls=[],ids=Object.fromEntries(['tenantId','userId','inactiveId','roleId','permissionId','shiftId'].map((x,i)=>[x,`${i}`.padStart(36,'a')]));
 const db=Object.fromEntries(['userRole','rolePermission','role','permission','shift','customer','productBatch','product','user','tenant'].map(model=>[model,{deleteMany:async where=>calls.push([model,where])}]));
 await assert.rejects(cleanupFixture(db,ids,false));assert.equal(calls.length,0);await cleanupFixture(db,ids,true);
 assert.deepEqual(calls.map(x=>x[0]),['userRole','rolePermission','role','permission','shift','customer','productBatch','product','user','tenant']);
 for(const [,query]of calls)assert.ok(Object.keys(query.where).length>0);
 const stages=[],errors=[];await finalizeFixture({drain:async()=>{stages.push('drain');throw Error('primary')},snapshot:async()=>{stages.push('snapshot');throw Error('secondary')},remove:async()=>stages.push('remove'),report:async()=>stages.push('report')},e=>errors.push(e.message));
 assert.deepEqual(stages,['drain','snapshot','remove','report']);assert.deepEqual(errors,['primary','secondary']);
});

function proof() {
  const expected={...fixture,inactiveId:'inactive',roleId:'role',permissionId:'permission',batchId:'batch',shiftId:'shift'};
  const before=Object.fromEntries(rawTables.map(name=>[name,[]]));
  Object.assign(before,{tenants:[{id:'tenant',slug:'default'}],users:[{id:'user',status:'active',full_name:'合成員工',tenant_id:'tenant',deleted_at:null},{id:'inactive',status:'suspended',tenant_id:'tenant',deleted_at:null}],roles:[{id:'role',tenant_id:'tenant'}],permissions:[{id:'permission',action:'manage',resource:'pos'}],role_permissions:[{role_id:'role',permission_id:'permission'}],user_roles:[{user_id:'user',role_id:'role'}],customers:[{}],products:[{id:'product',stock_quantity:5}],product_batches:[{id:'batch',product_id:'product',quantity:5}],shifts:[{id:'shift',staff_id:'user',status:'OPEN'}]});
  const database={beforeEmpty:true,afterEmpty:true,httpDrainedBeforeSnapshot:true,error:null,cancelled:null,browser:{exitCode:0,signal:null},expected,before,after:structuredClone(before)};
  const api={requests:[],rejected:[]},browsers=[];
  for(const scenario of cases){
    const rows=[...['inactive','unknown','active'].map(attempt=>({method:'POST',path:loginPath,attempt,status:attempt==='active'?200:401,body:safeResponse(loginPath,attempt==='active'?200:401,attempt==='active'?loginBody:rejectedBody),verifiedSubject:attempt==='active'?'user':null,issuedByRealLogin:attempt==='active'})),...([...readPaths,readPaths[0]]).map(path=>({method:'GET',path,attempt:null,status:200,verifiedSubject:'user',issuedByRealLogin:true,body:path.endsWith('/checkout-context')?{success:true,data:{tenantId:'tenant',userId:'user'}}:path.endsWith('/products')?{success:true,data:[{id:'product',stockQuantity:5}]}:path.endsWith('/staff')?{success:true,data:[{id:'user',fullName:'合成員工'}]}:{success:true,data:[]}}))].map((row,index)=>({...row,caseId:scenario.id,id:`${scenario.id}:${index}`,sha256:digest(row.body)}));
    api.requests.push(...rows);browsers.push({test:scenario.title,contextClosed:true,pending:0,errors:[],pageErrors:[],verifiedBrand:brandAssets.map(asset=>({method:'GET',...asset})),journey:{beforeToken:false,afterToken:true,reloadTokenUnchanged:true,blankPosts:0,loginKeys:[{key:'Enter',trusted:true}]},requests:rows.map(({body,...row})=>({...row,dispatched:true,cancelled:false,delivered:true}))});
  }
  return{database,browsers,api};
}
import { rawTables } from './contract.mjs';
test('full real-entry oracle accepts the exact closed synthetic proof shape',()=>{const p=proof();assert.deepEqual(assertEvidence(p.database,p.browsers,p.api),{requests:33,realLoginPosts:9,inactiveRejected:3,unknownRejected:3,activeAccepted:3,postLoginMethods:['GET'],rawTablesUnchanged:33});});
for(const[name,mutate]of Object.entries({
 'cleanup not empty':p=>p.database.afterEmpty=false,
 'HTTP not drained':p=>p.database.httpDrainedBeforeSnapshot=false,
 'wrong actor':p=>p.api.requests[3].verifiedSubject='other',
 'token not issued':p=>p.api.requests[3].issuedByRealLogin=false,
 'wrong returned user':p=>{p.api.requests[2].body.data.user.id='other';p.api.requests[2].sha256=digest(p.api.requests[2].body);p.browsers[0].requests[2].sha256=p.api.requests[2].sha256},
 'raw table missing':p=>{delete p.database.before.audit_logs;delete p.database.after.audit_logs},
 'raw write occurred':p=>p.database.after.products[0].stock_quantity=4,
 'inactive fixture is active':p=>{p.database.before.users[1].status='active';p.database.after.users[1].status='active'},
 'role points elsewhere':p=>{p.database.before.user_roles[0].user_id='inactive';p.database.after.user_roles[0].user_id='inactive'},
 'global permission changed':p=>{p.database.before.permissions[0].resource='users';p.database.after.permissions[0].resource='users'},
 'wrong identity read':p=>{p.api.requests[3].body.data.tenantId='other';p.api.requests[3].sha256=digest(p.api.requests[3].body);p.browsers[0].requests[3].sha256=p.api.requests[3].sha256},
 'missing server request':p=>p.api.requests.pop(),
 'untrusted key':p=>p.browsers[0].journey.loginKeys[0].trusted=false,
 'seeded browser token':p=>p.browsers[0].journey.beforeToken=true,
 'session changed after reload':p=>p.browsers[0].journey.reloadTokenUnchanged=false,
 'browser pending':p=>p.browsers[0].pending=1,
 'unexpected browser error':p=>p.browsers[0].pageErrors.push('Error'),
 'native child failed':p=>p.database.browser.exitCode=1,
 'cancelled':p=>p.database.cancelled='SIGTERM',
 'rejected request':p=>p.api.rejected.push('scope'),
}))test(`oracle fails closed: ${name}`,()=>{const p=proof();mutate(p);assert.throws(()=>assertEvidence(p.database,p.browsers,p.api));});

test('report rejects missing, failed, skipped or retried cases',()=>{
 const make=()=>({errors:[],suites:[{specs:cases.map(c=>({title:c.title,ok:true,tests:[{expectedStatus:'passed',status:'expected',results:[{status:'passed',errors:[],duration:1}]}]}))}]});assert.equal(assertReport(make()).length,3);
 for(const change of [x=>x.suites[0].specs.pop(),x=>x.errors.push('failed'),x=>x.suites[0].specs[0].tests[0].results.push({status:'passed',errors:[]}),x=>x.suites[0].specs[0].tests[0].results[0].status='skipped']){const r=make();change(r);assert.throws(()=>assertReport(r));}
});

test('actual real HTTP client abort during async handler remains owned until the late body settles',async()=>{
 const pending=new Set(),rows=[],errors=[];let entered,release;const enteredPromise=new Promise(r=>{entered=r}),gate=new Promise(r=>{release=r});
 const server=createServer((req,res)=>{res.status=code=>{res.statusCode=code;return res};res.json=body=>res.end(JSON.stringify(body));observeResponse({res,identity:{path:loginPath},verifyLogin:()=>({verifiedSubject:'user'}),pending,record:row=>rows.push(row),onError:e=>errors.push(e.name)});entered();void gate.then(()=>res.json(loginBody));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const req=httpRequest({host:'127.0.0.1',port:server.address().port,path:'/',method:'GET'});req.on('error',()=>{});
 try {
  req.end();await enteredPromise;req.destroy();await tick();await tick();
  assert.equal(pending.size,1);let drained=false;const draining=drainHttp(server,pending,1000).then(()=>{drained=true});await tick();assert.equal(drained,false);
  release();await draining;assert.equal(pending.size,0);assert.equal(rows.length,0);assert.ok(errors.length>0);
 } finally { req.destroy(); release(); await Promise.all([...pending]); if(server.listening)await new Promise(resolve=>server.close(resolve)); }
});
test('unknown closed handler that never settles fails the bounded drain and cannot authorize cleanup',async()=>{
 const res=response(),pending=new Set(),rows=[],errors=[];observeResponse({res,identity:{path:loginPath},verifyLogin:()=>({}),pending,record:x=>rows.push(x),onError:x=>errors.push(x)});res.destroyed=true;res.emit('close');
 await assert.rejects(drainHttp(undefined,pending,10),/did not drain/);assert.equal(pending.size,1);assert.equal(rows.length,0);
 res.json(loginBody);await Promise.all([...pending]);assert.equal(pending.size,0);
});

test('actual seed keeps all existing product cost/quantity checks and exact default tenant/user/role linkage',async()=>{
 const calls=[],ids={tenantId:'tenant',userId:'user',inactiveId:'inactive',shiftId:'shift',roleId:'role',permissionId:'permission'};
 const db=Object.fromEntries(['tenant','user','customer','product','productBatch','shift','permission','role','rolePermission','userRole'].map(model=>[model,{create:async({data})=>{calls.push([model,'create',data]);return{id:model==='product'?'product':model==='productBatch'?'batch':data.id}},update:async args=>{calls.push([model,'update',args]);return args.data}}]));
 const seeded=await seedFixture(db,ids);assert.equal(seeded.userId,'user');assert.equal(seeded.productId,'product');assert.equal(seeded.batchId,'batch');
 const created=model=>calls.find(x=>x[0]===model&&x[1]==='create')[2];
 assert.equal(created('product').costPrice,10);assert.equal(created('product').retailPrice,20);assert.equal(created('product').stockQuantity,5);
 assert.equal(created('productBatch').costPrice,10);assert.equal(created('productBatch').quantity,5);assert.equal(created('productBatch').status,'RELEASED');assert.equal(created('productBatch').productId,'product');
 assert.equal(created('shift').staffId,'user');assert.equal(created('shift').openingCash,0);assert.equal(created('shift').status,'OPEN');
 assert.deepEqual(calls.find(x=>x[0]==='tenant'&&x[1]==='update')[2],{where:{id:'tenant'},data:{slug:'default'}});
 assert.equal(calls.filter(x=>x[0]==='user'&&x[1]==='create')[1][2].status,'suspended');
 assert.deepEqual(created('permission'),{id:'permission',action:'manage',resource:'pos'});assert.deepEqual(created('rolePermission'),{roleId:'role',permissionId:'permission'});assert.deepEqual(created('userRole'),{userId:'user',roleId:'role'});
});
