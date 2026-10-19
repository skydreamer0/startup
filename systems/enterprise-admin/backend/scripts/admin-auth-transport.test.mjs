import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {buildAuthFixture,authCredential} from './admin-auth-fixture.mjs';
import {authRequestPolicy,createAuthBudget,authDispatchActor,projectAuthResponse,createAuthRouteHandler} from './admin-auth-transport.mjs';
const origin='http://127.0.0.1:4321', fixture=()=>buildAuthFixture(randomUUID(),async()=>'$argon2id$v=19$synthetic$not_a_real_hash');
const defer=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{resolve,promise};};
function request(path='/api/v1/admin/auth/me',{method='GET',resource='xhr',base=origin,body=null,authorization,failed=false}={}){return{url:()=>base+path,method:()=>method,resourceType:()=>resource,postDataJSON:()=>body,headers:()=>({authorization}),failure:()=>failed?{errorText:'synthetic cancellation'}:null};}
for(const [path,options,allowed] of [
 ['/api/v1/admin/auth/login',{method:'POST'},true],['/api/v1/admin/auth/logout',{method:'POST'},true],['/api/v1/admin/auth/refresh',{method:'POST'},true],
 ['/api/v1/admin/reports/cashflow?period=2026-01#local',{},true],['/login',{resource:'document'},true],['/assets/app.js',{resource:'script'},true],
 ['/api/v1/admin/auth/login',{method:'GET'},false],['/api/v1/admin/auth/login?x=1',{method:'POST'},false],['/api/v1/admin/auth/login/extra',{method:'POST'},false],
 ['/api/v1/admin/auth/me',{method:'POST'},false],['/api/v1/admin/auth/me',{base:'http://127.0.0.1:4322'},false],['/api/v1/admin/auth/me',{base:'http://localhost:4321'},false],
 ['/api/v1/admin/reports/cashflow',{resource:'document'},false],['/api/v1/admin/auth/me',{resource:'image'},false],['/api/v1/admin/auth/me',{resource:'script'},false],
 ['/api/v1/admin/inventory/products',{method:'POST'},false],['/api/v1/admin/users',{},false],['/api/v1/admin/auth/meX',{},false],['/api/v1/admin/auth/%6de',{},false],
 ['/api/v1/adminish/auth/login',{method:'POST'},false],
])test(`actual auth policy ${options.method??'GET'} ${path} ${options.resource??'xhr'} ${options.base??origin}`,()=>assert.equal(authRequestPolicy(request(path,options),origin).allowed,allowed));
test('budget counts cancelled attempts and enforces both request and time bounds',()=>{let t=0;const a=createAuthBudget(()=>t);for(let i=0;i<160;i++)a.request('/auth/me');assert.throws(()=>a.request('/auth/me'));const b=createAuthBudget(()=>t);for(let i=0;i<60;i++)b.request('/analytics/kpis');assert.throws(()=>b.request('/analytics/kpis'));t=180000;assert.throws(()=>b.check());});
test('actor correlation uses actual request values and safe projection never serializes auth credentials',async()=>{
 const f=await fixture(),tokens=new Map([['synthetic-access-A','allowed'],['synthetic-refresh-D','denied']]);
 assert.equal(authDispatchActor(request('/api/v1/admin/auth/me',{authorization:'Bearer synthetic-access-A'}),'/auth/me',f,tokens),'allowed');
 assert.equal(authDispatchActor(request('/api/v1/admin/auth/refresh',{method:'POST',body:{refreshToken:'synthetic-refresh-D'}}),'/auth/refresh',f,tokens),'denied');
 const c=authCredential(f,'allowed');assert.equal(authDispatchActor(request('/api/v1/admin/auth/login',{method:'POST',body:{email:c.email,password:c.password}}),'/auth/login',f,tokens),'allowed');
 const safe=projectAuthResponse('/auth/login',200,{data:{accessToken:'synthetic-new-A',refreshToken:'synthetic-new-R',user:{id:f.ids.allowed},password:c.password}},'allowed',f,tokens);
 for(const secret of ['synthetic-new-A','synthetic-new-R',c.password,c.passwordHash])assert.ok(!JSON.stringify(safe).includes(secret));assert.equal(tokens.get('synthetic-new-R'),'allowed');
 assert.throws(()=>projectAuthResponse('/auth/me',200,{data:{id:f.ids.denied,permissions:[]}},'allowed',f,tokens));
});
async function harness(req,body={success:true,data:{}},status=200){const f=await fixture(),state={nextRequestId:0,faultOnce:false,transportFailure:false},network=[],responses=[],forbidden=[],pending=[],calls=[];const opts={origin,fixture:f,state,tokenActors:new Map([['synthetic-A','allowed']]),network,responses,forbidden,pending,contextId:1,budget:createAuthBudget(),pace:async()=>({admitted:true,at:1})};const route={request:()=>req,continue:async()=>calls.push('continue'),abort:async()=>calls.push('abort'),fetch:async()=>{calls.push('fetch');return{status:()=>status,json:async()=>body};},fulfill:async arg=>calls.push({fulfilled:arg})};return{...opts,route,calls,run:()=>createAuthRouteHandler(opts)(route)};}
test('actual callback never replaces document or unrelated auth request with fault',async()=>{for(const req of[request('/reports/cashflow',{resource:'document'}),request('/api/v1/admin/auth/me',{authorization:'Bearer synthetic-A'})]){const h=await harness(req);h.state.faultOnce=true;if(req.url().endsWith('/auth/me'))h.route.fetch=async()=>({status:()=>200,json:async()=>({data:{id:h.fixture.ids.allowed,permissions:['read:dashboard','read:crm','read:analytics','read:reports']}})});await h.run();assert.equal(h.network[0].synthetic401,undefined);assert.equal(h.state.faultOnce,true);}});
test('actual callback consumes exactly one endpoint/month fault without touching backend',async()=>{const h=await harness(request('/api/v1/admin/reports/cashflow?period=2026-01',{authorization:'Bearer synthetic-A'}));h.state.faultOnce=true;await h.run();assert.equal(h.state.faultOnce,false);assert.equal(h.calls.includes('fetch'),false);assert.equal(h.responses[0].actor,'allowed');assert.equal(h.responses[0].status,401);});
test('actual refresh callback holds a real successful response, preserves original actor through logout and releases once',async()=>{const h=await harness(request('/api/v1/admin/auth/refresh',{method:'POST',body:{refreshToken:'synthetic-R'}}),{data:{accessToken:'synthetic-new-access'}});h.tokenActors.set('synthetic-R','allowed');const hold={ready:defer(),release:defer()};h.state.holdRefresh=hold;const running=h.run();const proof=await hold.ready.promise;assert.equal(proof.actor,'allowed');assert.equal(h.calls.length,1);h.tokenActors.clear();h.state.holdRefresh=null;hold.release.resolve();await running;assert.equal(h.responses[0].actor,'allowed');assert.equal(h.responses[0].actualTokenIssued,true);assert.equal(h.calls.filter(x=>x.fulfilled).length,1);assert.ok(!JSON.stringify(h.responses).includes('synthetic-new-access'));});
test('actual callback records cancellation without turning it into an unexpected transport failure',async()=>{const h=await harness(request('/api/v1/admin/auth/me',{failed:true}));await h.run();assert.equal(h.network[0].cancelled,true);assert.equal(h.state.transportFailure,false);assert.equal(h.calls.includes('fetch'),false);assert.equal(h.budget.receipt().apiRequests,1);});
test('actual callback fail-closes malformed identity without serializing raw response or error',async()=>{const h=await harness(request('/api/v1/admin/auth/me',{authorization:'Bearer synthetic-A'}),{data:{id:'foreign-user',permissions:[],password:'synthetic-private'}});await h.run();assert.equal(h.state.transportFailure,true);assert.equal(h.responses.length,0);assert.ok(!JSON.stringify(h.network).includes('synthetic-private'));assert.ok(h.calls.includes('abort'));});
test('exact report oracle distinguishes fixture month from unchanged ordinary current month',async()=>{const f=await fixture(),tokens=new Map();const b={data:{period:'2026-01',operatingInflows:0,operatingOutflows:43,investingOutflows:0,netCashFlow:-43}};assert.equal(projectAuthResponse('/reports/cashflow',200,b,'allowed',f,tokens).operatingOutflows,43);b.data.operatingOutflows=44;assert.throws(()=>projectAuthResponse('/reports/cashflow',200,b,'allowed',f,tokens));b.data.period='2026-10';assert.equal(projectAuthResponse('/reports/cashflow',200,b,'allowed',f,tokens).period,'2026-10');});

test('actual callback cancellation during fetch is an accepted cancellation in final pending results',async()=>{let failed=false;const req=request('/api/v1/admin/auth/me',{authorization:'Bearer synthetic-A'});req.failure=()=>failed?{errorText:'synthetic cancellation'}:null;const h=await harness(req);h.route.fetch=async()=>{failed=true;throw new Error('synthetic aborted fetch');};await h.run();assert.equal(h.network[0].cancelled,true);assert.equal(h.state.transportFailure,false);assert.deepEqual(await Promise.all(h.pending),[true]);});

test('safe response projection rejects unseeded grants and never copies unknown error codes',async()=>{const f=await fixture();assert.throws(()=>projectAuthResponse('/auth/me',200,{data:{id:f.ids.allowed,permissions:['synthetic-private']}},'allowed',f,new Map()));assert.equal(projectAuthResponse('/auth/login',401,{error:{code:'synthetic-private',message:'synthetic-private'}},'allowed',f,new Map()).errorCode,'UNRECOGNIZED');});

test('auth metadata redacts unknown path and query values while excluding non-API fetches',async()=>{for(const req of [request('/api/v1/admin/auth/me?token=synthetic-private'),request('/api/v1/admin/synthetic-private'),request('/synthetic-private?password=synthetic-private',{resource:'document'}),request('/api/other',{resource:'fetch'})]){const p=authRequestPolicy(req,origin);assert.ok(!JSON.stringify(p).includes('synthetic-private'));if(!req.url().includes('/auth/me?'))assert.equal(p.allowed,false);}const h=await harness(request('/api/v1/admin/synthetic-private?token=synthetic-private'));await h.run();assert.equal(h.forbidden.length,1);assert.ok(!JSON.stringify(h.network).includes('synthetic-private'));assert.deepEqual(h.calls,['abort']);});

test('actual auth callback admits every exact icon declared by the real Admin HTML without spending API budget',async()=>{
 const fs=await import('node:fs');const html=fs.readFileSync(new URL('../../admin-ui/index.html',import.meta.url),'utf8');
 const paths=[...html.matchAll(/href="%BASE_URL%(brand\/[^"]+)"/g)].map(match=>'/'+match[1]);assert.equal(paths.length,5);
 for(const path of paths)for(const resource of ['image','other']){
  const h=await harness(request(path,{resource}));h.state.faultOnce=true;await h.run();
  assert.deepEqual(h.calls,['continue']);assert.equal(h.forbidden.length,0);assert.equal(h.network[0].path,path);assert.equal(h.budget.receipt().apiRequests,0);assert.equal(h.state.faultOnce,true);
 }
});
test('actual icon route rejects similar paths query hash methods resources and origin changes with safe metadata',async()=>{
 const path='/brand/flow-capsule-v1/favicon.svg';
 for(const [value,options]of[
  [path+'x',{resource:'other'}],[path+'/extra',{resource:'other'}],[path.replace('favicon','%66avicon'),{resource:'other'}],
  [path+'?token=synthetic-private',{resource:'other'}],[path+'#synthetic-private',{resource:'other'}],
  [path,{method:'POST',resource:'other'}],[path,{resource:'document'}],[path,{resource:'fetch'}],[path,{resource:'xhr'}],[path,{resource:'script'}],[path,{resource:'stylesheet'}],[path,{resource:'font'}],
  [path,{base:'http://127.0.0.1:4322',resource:'other'}],[path,{base:'https://127.0.0.1:4321',resource:'other'}],[path,{base:'http://localhost:4321',resource:'other'}],
  ['/brand/flow-capsule-v1/synthetic-private.svg',{resource:'other'}],
 ]){const h=await harness(request(value,options));await h.run();assert.deepEqual(h.calls,['abort']);assert.equal(h.forbidden.length,1);assert.ok(!JSON.stringify(h.network).includes('synthetic-private'));assert.equal(h.budget.receipt().apiRequests,0);}
});
