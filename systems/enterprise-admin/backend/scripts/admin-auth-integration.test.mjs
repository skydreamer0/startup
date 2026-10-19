// Driver/writer integration only. In-memory DB/HTTP/DOM and PNG-header adapters
// are explicit; this does not simulate Argon2 verification or certify Chrome.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const express = require('express');
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { runAdminAuthNative, assertAuthNativeAcceptance } from './admin-auth-native.mjs';
import { buildAuthFixture } from './admin-auth-fixture.mjs';
import { createAuthRouteHandler, createAuthBudget } from './admin-auth-transport.mjs';

const origin='http://127.0.0.1:4321';
const hashPassword=async value=>'$argon2id$v=19$adapter$'+createHash('sha256').update(value).digest('hex');
const tables={tenant:'tenants',user:'users',role:'roles',expense:'expenses',permission:'permissions',auditLog:'audit_logs',rolePermission:'role_permissions',userRole:'user_roles'};
const snake=value=>value.replace(/[A-Z]/g,x=>'_'+x.toLowerCase());
const matches=(row,where={})=>Object.entries(where).every(([key,value])=>value&&typeof value==='object'?value.in.includes(row[key]):row[key]===value);
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function modelDb() {
    const data=Object.fromEntries(Object.keys(tables).map(model=>[model,[]]));
    const events=[],db={}; let tick=0;
    for(const model of Object.keys(tables)) {
        const insert=row=>{const copy=structuredClone(row);if(model==='user')Object.assign(copy,{failedLoginAttempts:0,lastLoginAt:null,updatedAt:'2026-01-01T00:00:00.000Z',totpSecret:null});data[model].push(copy);return structuredClone(copy);};
        db[model]={count:async({where})=>data[model].filter(row=>matches(row,where)).length,createMany:async({data:rows})=>{rows.forEach(insert);return{count:rows.length};},create:async({data:row})=>insert(row),findFirst:async({where})=>structuredClone(data[model].find(row=>matches(row,where))??null),findUnique:async({where})=>structuredClone(data[model].find(row=>matches(row,where))??null),deleteMany:async({where})=>{events.push('delete:'+model);const before=data[model].length;data[model]=data[model].filter(row=>!matches(row,where));return{count:before-data[model].length};}};
    }
    const names=[...Object.values(tables),...Array.from({length:25},(_,i)=>`business_${String.fromCharCode(97+i)}`)].sort();
    db.$queryRaw=async()=>names.map(tablename=>({tablename}));
    db.$queryRawUnsafe=async query=>{const table=query.match(/public\."([a-z_]+)"/)[1],model=Object.keys(tables).find(k=>tables[k]===table);const rows=(model?data[model]:[]).map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[snake(k),v]))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));return[{rows:structuredClone(rows)}];};
    function audit(user,action){data.auditLog.push({id:randomUUID(),tenantId:user.tenantId,userId:user.id,action,resourceType:'users',resourceId:user.id,oldValue:null,newValue:null});}
    function login(user){user.failedLoginAttempts=0;user.lastLoginAt=new Date(Date.UTC(2026,0,1,0,0,++tick)).toISOString();user.updatedAt=user.lastLoginAt;audit(user,'LOGIN');}
    return{db,data,events,audit,login};
}
function fakeExpect(actual) {
    const equal=value=>assert.equal(actual,value);
    return {toBe:equal,toHaveURL:async url=>assert.equal(actual.url,url),toBeVisible:async()=>assert.equal(actual.visible(),true),toBeEnabled:async()=>assert.equal(actual.enabled(),true),toHaveCount:async n=>assert.equal(actual.count(),n),toHaveValue:async v=>assert.equal(actual.value(),v),toContainText:async v=>assert.ok(actual.text().includes(v))};
}
fakeExpect.poll=(read)=>({toBe:async expected=>{for(let i=0;i<200;i++){if(await read()===expected)return;await delay(1);}assert.fail('adapter bounded poll exhausted');},not:{toBeNull:async()=>{for(let i=0;i<200;i++){if(await read()!==null)return;await delay(1);}assert.fail('adapter bounded nonnull poll exhausted');}}});

function modelBrowser(database,options={}) {
    const contexts=[],tokens=new Map(),requests=[],apiLedger=[];let tokenNumber=0;
    const actor=user=>user.fullName.split(' ').at(-1);
    const permissions=user=>{const roles=database.data.userRole.filter(x=>x.userId===user.id).map(x=>x.roleId);const ids=database.data.rolePermission.filter(x=>roles.includes(x.roleId)).map(x=>x.permissionId);return database.data.permission.filter(x=>ids.includes(x.id)).map(x=>`${x.action}:${x.resource}`);};
    async function server(endpoint,body,authorization){
        const user=tokens.get(authorization?.slice(7));
        if(endpoint==='/auth/login'){
            const selected=database.data.user.find(x=>x.email===body.email);
            if(!selected||selected.status!=='active')return{status:401,body:{error:{code:'AUTH_FAILED',message:'Invalid credentials'}}};
            if(selected.passwordHash!==await hashPassword(body.password)){selected.failedLoginAttempts++;return{status:401,body:{error:{code:'AUTH_FAILED',message:'Invalid credentials'}}};}
            database.login(selected);const accessToken=`adapter-access-${++tokenNumber}`,refreshToken=`adapter-refresh-${tokenNumber}`;tokens.set(accessToken,selected);tokens.set(refreshToken,selected);return{status:200,body:{data:{accessToken,refreshToken,user:{id:selected.id}}}};
        }
        if(endpoint==='/auth/refresh'){const selected=tokens.get(body.refreshToken);assert.ok(selected);const accessToken=`adapter-late-${++tokenNumber}`;tokens.set(accessToken,selected);return{status:200,body:{data:{accessToken}}};}
        assert.ok(user,`adapter missing authorized user at ${endpoint}`);
        if(endpoint==='/auth/me')return{status:200,body:{data:{id:user.id,permissions:permissions(user)}}};
        if(endpoint==='/auth/logout'){database.audit(user,'LOGOUT');return{status:200,body:{data:{}}};}
        if(endpoint==='/reports/cashflow'){if(!permissions(user).includes('read:reports'))return{status:403,body:{error:{code:'FORBIDDEN'}}};return{status:200,body:{data:{period:'2026-01',operatingInflows:0,operatingOutflows:43,investingOutflows:0,netCashFlow:-43}}};}
        assert.fail('unexpected adapter endpoint '+endpoint);
    }
    async function newContext({viewport}) {
        const context={closed:false,viewport,handler:null,route:async(_glob,handler)=>{context.handler=handler;},close:async()=>{context.closed=true;}};contexts.push(context);
        const listeners=new Map();const page={url:origin+'/login',access:null,refresh:null,email:'',password:'',month:'2026-10',error:'',focus:null,closed:false};
        async function request(endpoint,{method='GET',body=null}={}){
            const authorization=page.access?'Bearer '+page.access:undefined;const req={url:()=>origin+'/api/v1/admin'+endpoint,method:()=>method,resourceType:()=> 'fetch',headers:()=>authorization?{authorization}:{},postDataJSON:()=>body,failure:()=>context.closed?{errorText:'closed'}:null};
            let reply;requests.push({endpoint,method,actor:tokens.get(page.access)?actor(tokens.get(page.access)):null});
            await context.handler({request:()=>req,fetch:async()=>{const response=await server(endpoint.split('?')[0],body,authorization);const url=new URL(req.url());apiLedger.push(...parentLedgerPath(url.pathname,url.search,response.status));return{status:()=>response.status,json:async()=>response.body};},fulfill:async value=>{reply=value.response?{status:value.response.status(),body:await value.response.json()}:{status:value.status,body:JSON.parse(value.body)};},abort:async()=>{},continue:async()=>{assert.fail('adapter should only generate APIs');}});
            if(!options.omitSettlement)for(const callback of listeners.get('requestfinished')??[])callback(req);
            return reply;
        }
        async function signedIn(){const res=await request('/auth/login',{method:'POST',body:{email:page.email,password:page.password}});if(res.status!==200){page.error='Invalid credentials';return;}page.error='';page.access=res.body.data.accessToken;page.refresh=res.body.data.refreshToken;await request('/auth/me');page.url=origin+'/dashboard';}
        function locator(kind,name){return{
            visible:()=>kind==='alert'?!!page.error:kind==='denied'?page.denied:kind==='heading'||kind==='root'?page.url.endsWith('/reports/cashflow')&&!page.denied:name==='Logout'?!!page.access:page.url.endsWith('/login'),
            enabled:()=>true,count:()=>page.url.endsWith('/reports/cashflow')&&!page.denied?1:0,value:()=>page.month,text:()=>page.error,
            first(){return this;},filter(){return this;},locator(selector){assert.equal(selector,'input[type="month"]');return locator('month');},getByRole(role,args){return locator(role,args.name);},
            fill:async value=>{if(name==='Email')page.email=value;else if(name==='Password')page.password=value;else{assert.equal(kind,'month');page.month=value;await request('/reports/cashflow?period='+value);}},
            focus:async()=>{page.focus=name;},
            click:async()=>{
                if(name==='Sign In')return signedIn();
                if(name==='Logout'){await request('/auth/logout',{method:'POST'});page.access=null;page.refresh=null;page.url=origin+'/login';page.denied=false;return;}
                if(kind==='link'){page.url=origin+'/reports/cashflow';const reply=await request('/reports/cashflow?period=2026-01');page.denied=reply.status===403;return;}
                if(name==='Refresh'){page.pendingRefresh=(async()=>{const reply=await request('/reports/cashflow?period=2026-01');if(reply.status===401){const prior=page.refresh;const refreshed=await request('/auth/refresh',{method:'POST',body:{refreshToken:prior}});if(page.refresh===prior&&refreshed?.status===200)page.access=refreshed.body.data.accessToken;}})();return;}
                assert.fail('unexpected click '+kind+'/'+name);
            },
            evaluate:async()=>{if(options.geometryReadFailure)throw new Error('synthetic-private geometry read');return{x:24,y:200,width:viewport.width-48,height:44,outline:2,offset:2,color:'rgb(10, 90, 180)',focused:page.focus==='Sign In',centerHit:true,viewport:viewport.width,viewportHeight:viewport.height,pageWidth:viewport.width,...options.geometry};},
        };}
        Object.assign(page,{on:(event,callback)=>{const set=listeners.get(event)??new Set();set.add(callback);listeners.set(event,set);},off:(event,callback)=>listeners.get(event)?.delete(callback),goto:async url=>{page.url=!page.access&&url.endsWith('/reports/cashflow')?origin+'/login':url;},getByRole:(role,args={})=>locator(role,args.name),getByLabel:(name)=>locator('label',name),getByText:()=>locator('denied'),locator:selector=>{assert.ok(['a[href="/reports/cashflow"]','.admin-reader-page'].includes(selector));return locator(selector.startsWith('a[')?'link':'root');},evaluate:async()=>page.access===null&&page.refresh===null,isClosed:()=>context.closed,keyboard:{press:async key=>{assert.equal(key,'Tab');assert.equal(page.focus,'Password');page.focus='Sign In';}}});
        context.newPage=async()=>page;context.page=page;return context;
    }
    return{newContext,contexts,requests,apiLedger};
}

async function integrated(options={}) {
    const output=fs.mkdtempSync(path.join(os.tmpdir(),'admin-auth-integrated-')),database=modelDb(),browser=modelBrowser(database,options),captures=[];
    const parent=fs.readFileSync(new URL('./package-browser-acceptance.mjs',import.meta.url),'utf8');
    const start=parent.indexOf('async function capture(page, name, viewport) {');
    const actualCapture=new Function('fs','path','output','assert','captures','createHash',`${parent.slice(start,parent.indexOf('\nasync function counts()',start))};return capture;`)(fs,path,output,assert,captures,createHash);
    const capture=async(page,name,viewport)=>{assert.ok(!page.isClosed());page.screenshot=async args=>{assert.equal(args.fullPage,false);if(options.captureFailure&&name.includes(options.captureFailure))throw Object.assign(new Error('private capture failure'),{code:'EIO'});const bytes=Buffer.alloc(24);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);bytes.writeUInt32BE(viewport.width,16);bytes.writeUInt32BE(viewport.height,20);if(args.path)fs.writeFileSync(args.path,bytes);return bytes;};return actualCapture(page,name,viewport);};
    if(options.collision)fs.writeFileSync(path.join(output,options.collision),'IMMUTABLE-PRIOR');
    let result,error;try{result=await runAdminAuthNative({db:database.db,browser,adminOrigin:origin,output,nonce:randomUUID(),expect:fakeExpect,capture,hashPassword});}catch(caught){error=caught;}
    return{output,database,browser,captures,result,error};
}
function checkCleanup(x){assert.ok(Object.values(x.database.data).every(rows=>rows.length===0));assert.ok(x.browser.contexts.every(context=>context.closed));assert.equal(JSON.parse(fs.readFileSync(path.join(x.output,'admin-auth-cleanup.json'))).status,'passed');}
test('actual complete auth driver and exclusive writers produce one final report after owned cleanup',async()=>{
    const x=await integrated();try{
        assert.ifError(x.error);assertAuthNativeAcceptance(x.result);checkCleanup(x);
        assert.equal(x.result.mutations.auditCount,8);assert.equal(x.result.coldEntries.length,3);assert.equal(x.captures.length,12);assert.equal(new Set(x.captures.map(row=>row.name)).size,12);
        const files=fs.readdirSync(x.output);assert.equal(files.length,20);assert.equal(files.filter(x=>x==='admin-auth-native.json').length,1);
        for(const name of files.filter(name=>name.endsWith('.json'))){const bytes=fs.readFileSync(path.join(x.output,name),'utf8');assert.ok(!bytes.includes('$argon2id$'));assert.ok(!bytes.includes('adapter-access-'));assert.ok(!bytes.includes('adapter-refresh-'));}
        assert.equal(x.result.lifecycle.refreshHoldProof.storageEmptyAfterRelease,true);assert.ok(x.browser.apiLedger.length>0);assert.ok(x.browser.apiLedger.every(row=>!row.path.includes('?')));
        assert.ok(x.result.responses.some(row=>row.endpoint==='/auth/refresh'&&row.status===200));
    }finally{fs.rmSync(x.output,{recursive:true});}
});
for(const collision of ['admin-auth-cold-login-1366-geometry.json','admin-auth-recovered-1366.png','admin-auth-after.json','admin-auth-native.json'])test(`full-flow writer refuses immutable collision at ${collision}`,async()=>{
    const x=await integrated({collision});try{assert.ok(x.error);checkCleanup(x);assert.equal(fs.readFileSync(path.join(x.output,collision),'utf8'),'IMMUTABLE-PRIOR');if(collision!=='admin-auth-native.json'){const report=JSON.parse(fs.readFileSync(path.join(x.output,'admin-auth-native.json')));assert.equal(report.status,'failed');}else assert.equal(x.captures.length,12);}finally{fs.rmSync(x.output,{recursive:true});}
});
test('full-flow capture error records original stage/code, attempts failed image before close and cleans all rows',async()=>{
    const x=await integrated({captureFailure:'recovered'});try{assert.ok(x.error);checkCleanup(x);const report=JSON.parse(fs.readFileSync(path.join(x.output,'admin-auth-native.json')));assert.equal(report.stage,'auth allowed actor return');assert.equal(report.status,'failed');assert.ok(x.captures.some(row=>row.name==='admin-auth-failed-1366.png'));assert.ok(!JSON.stringify(report).includes('private capture failure'));}finally{fs.rmSync(x.output,{recursive:true});}
});

test('complete driver rejects a released refresh without browser request settlement proof',async()=>{const x=await integrated({omitSettlement:true});try{assert.ok(x.error);checkCleanup(x);const report=JSON.parse(fs.readFileSync(path.join(x.output,'admin-auth-native.json')));assert.equal(report.status,'failed');assert.equal(report.stage,'auth held actual refresh');assert.equal(report.lifecycle.lateRefreshSuppressed,undefined);}finally{fs.rmSync(x.output,{recursive:true});}});

for(const [name,geometry]of[['undersized',{height:43.6}],['invisible ring',{outline:0}],['clipped top',{y:2}],['lost focus',{focused:false}]])test(`actual complete driver rejects ${name} geometry without changing product CSS`,async()=>{const x=await integrated({geometry});try{assert.ok(x.error);checkCleanup(x);const report=JSON.parse(fs.readFileSync(path.join(x.output,'admin-auth-native.json')));assert.equal(report.stage,'auth cold focus 1366');assert.equal(report.coldEntries.length,0);}finally{fs.rmSync(x.output,{recursive:true});}});

function actualParentMiddleware(apiLedger, realApp) {
    const parent=fs.readFileSync(new URL('./package-browser-acceptance.mjs',import.meta.url),'utf8');
    const start=parent.indexOf('function packageApiEvidencePath('),end=parent.indexOf('async function capture(',start);
    const projector=start>=0?new Function(`${parent.slice(start,end)};return packageApiEvidencePath;`)():undefined;
    const middlewareStart=parent.indexOf('app.use((req, res, next) => {',parent.indexOf('async function serve('));
    const middlewareEnd=parent.indexOf('\n    });',middlewareStart)+7;
    assert.ok(middlewareStart>0&&middlewareEnd>middlewareStart);
    let handler;const app={use:callback=>{handler=callback;}};
    new Function('app','realApp','apiLedger','packageApiEvidencePath',parent.slice(middlewareStart,middlewareEnd))(app,realApp,apiLedger,projector);
    return handler;
}
function parentLedgerPath(requestPath,query='?token=SYNTHETIC_PRIVATE_QUERY',status=200) {
    const apiLedger=[];let finish;const req={method:'GET',path:requestPath,originalUrl:requestPath+query},res={statusCode:status,on:(name,callback)=>{assert.equal(name,'finish');finish=callback;}};
    actualParentMiddleware(apiLedger,()=>finish())(req,res,()=>assert.fail('known API must reach actual parent ledger'));return apiLedger;
}
for(const endpoint of ['/api/v1/admin/auth/me','/api/v1/admin/reports/cashflow','/api/v1/admin/analytics/kpis'])test(`actual parent finish callback drops sensitive query for ${endpoint}`,()=>{const rows=parentLedgerPath(endpoint);assert.equal(rows[0].path,endpoint);assert.ok(!JSON.stringify(rows).includes('SYNTHETIC_PRIVATE_QUERY'));});
test('actual parent finish callback masks unknown paths while retaining only verified literal/UUID routes',()=>{for(const endpoint of ['/api/v1/admin/auth/SYNTHETIC_PRIVATE_PATH','/api/v1/admin/inventory/products/SYNTHETIC_PRIVATE_PATH','/api/v1/adminish/auth/me','/api/v1/admin/auth/%6de']){const rows=parentLedgerPath(endpoint);assert.equal(rows[0].path,'/api/[unrecognized]');assert.ok(!JSON.stringify(rows).includes('SYNTHETIC_PRIVATE'));}const product='/api/v1/admin/inventory/products/00000000-0000-4000-8000-000000000001/packages/00000000-0000-4000-8000-000000000002/retire';assert.equal(parentLedgerPath(product)[0].path,product);assert.equal(parentLedgerPath('/api/v1/admin/pos/packages/resolve')[0].path,'/api/v1/admin/pos/packages/resolve');});

test('actual auth route and parent finish callback jointly redact a known GET query before either ledger is persisted',async()=>{
 const fixture=await buildAuthFixture(randomUUID(),hashPassword),network=[],responses=[],forbidden=[],pending=[],apiLedger=[];
 const pathname='/api/v1/admin/auth/me',query='?token=SYNTHETIC_PRIVATE_QUERY';
 const request={url:()=>origin+pathname+query,method:()=> 'GET',resourceType:()=> 'fetch',headers:()=>({authorization:'Bearer adapter-only'}),failure:()=>null};
 const state={nextRequestId:0,transportFailure:false};
 const route={request:()=>request,fetch:async()=>{apiLedger.push(...parentLedgerPath(pathname,query));return{status:()=>200,json:async()=>({data:{id:fixture.ids.allowed,permissions:['read:dashboard','read:crm','read:analytics','read:reports']}})};},fulfill:async()=>{},abort:async()=>assert.fail('valid synthetic profile unexpectedly aborted')};
 await createAuthRouteHandler({origin,fixture,tokenActors:new Map([['adapter-only','allowed']]),state,budget:createAuthBudget(),pace:async()=>({admitted:true}),network,responses,forbidden,pending,contextId:1})(route);
 assert.equal(state.transportFailure,false);assert.equal(forbidden.length,0);assert.equal(responses[0].status,200);assert.equal(apiLedger[0].path,pathname);
 assert.ok(!JSON.stringify({network,responses,apiLedger}).includes('SYNTHETIC_PRIVATE_QUERY'));
});

// Real Express 5 nested routing and loopback HTTP, with synthetic terminal handlers.
// This checks the parent middleware composition, not JWT/RBAC/database acceptance.
async function withMountedParent(run,{rewrite=false}={}) {
    const ledger=[],atTerminal=[];const realApp=express(),api=express.Router();
    const terminal=(req,res)=>{atTerminal.push({path:req.path,baseUrl:req.baseUrl});if(rewrite)req.url='/api/v1/admin/auth/me?token=SYNTHETIC_LATE_QUERY';setImmediate(()=>res.status(Number(req.headers['x-synthetic-status'])||200).json({synthetic:true}));};
    for(const group of ['auth','tenants','dashboard','crm','analytics','reports','inventory','product-batches','pos','unknown']){
        const router=express.Router();
        if(group==='inventory'){const products=express.Router();products.use(terminal);router.use('/products',products);}
        if(group==='pos'){const packages=express.Router();packages.use(terminal);router.use('/packages',packages);}
        router.use(terminal);api.use('/'+group,router);
    }
    api.use(terminal);realApp.use('/api/v1/admin',api);realApp.use((_req,res)=>res.status(404).end());
    const app=express();app.use(actualParentMiddleware(ledger,realApp));app.use((_req,res)=>res.status(404).end());
    const server=app.listen(0,'127.0.0.1');
    try{
        await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
        const request=(requestPath,{method='GET',status=200}={})=>new Promise((resolve,reject)=>{const req=http.request({hostname:'127.0.0.1',port:server.address().port,path:requestPath,method,headers:{'x-synthetic-status':String(status)}},res=>{res.resume();res.once('end',()=>resolve(res.statusCode));});req.once('error',reject);req.end();});
        await run({ledger,atTerminal,request});
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}
const sharedLiteralPaths=[
 '/auth/login','/auth/logout','/auth/refresh','/auth/me','/tenants/me/plan','/dashboard/kpis','/crm/metrics',
 '/analytics/kpis','/analytics/trends','/analytics/bonus-gate','/analytics/heatmap','/analytics/reorder-forecast',
 '/analytics/product-abc','/analytics/supplier-ranking','/reports/cashflow','/reports/cashflow/trend',
 '/reports/margin','/reports/margin/trend','/reports/sales-ranking','/inventory/products','/inventory/suppliers',
 '/inventory/stock-reconciliation','/product-batches','/pos/categories','/pos/checkout-context','/pos/packages/lookup',
 '/pos/packages/resolve','/pos/products','/pos/recommendations','/pos/reorder-forecast','/pos/shift/active','/pos/staff',
];
const uuidA='00000000-0000-4000-8000-000000000001',uuidB='00000000-0000-4000-8000-000000000002';
const sharedDynamicPaths=[`/product-batches/${uuidA}`,`/inventory/products/${uuidA}`,`/inventory/products/${uuidA}/packages`,`/inventory/products/${uuidA}/packages/${uuidB}/revisions`,`/inventory/products/${uuidA}/packages/${uuidB}/retire`];
test('real mounted Express preserves all 37 shared parent literal and UUID paths before nested routing finishes',async()=>{
 await withMountedParent(async({ledger,atTerminal,request})=>{for(const [index,endpoint] of [...sharedLiteralPaths,...sharedDynamicPaths].entries()){
  const full='/api/v1/admin'+endpoint,method=index%2?'POST':'GET',status=[200,201,401,403,409,500][index%6];assert.equal(await request(full+'?token=SYNTHETIC_PRIVATE_QUERY',{method,status}),status);
  assert.equal(ledger.length,index+1);assert.deepEqual({method:ledger.at(-1).method,path:ledger.at(-1).path,status:ledger.at(-1).status},{method,path:full,status});assert.notEqual(atTerminal.at(-1).path,full);assert.ok(ledger.at(-1).elapsedMs>=0);
 }assert.ok(!JSON.stringify(ledger).includes('SYNTHETIC_PRIVATE_QUERY'));});
});
test('real mounted Express ledger preserves actual camera and final package acceptance predicates',async()=>{
 await withMountedParent(async({ledger,request})=>{
  const parent=fs.readFileSync(new URL('./package-browser-acceptance.mjs',import.meta.url),'utf8'),camera=fs.readFileSync(new URL('./package-camera-native.mjs',import.meta.url),'utf8');
  const cameraLine=camera.split('\n').find(line=>line.includes('const packageRequests ='));
  await request('/api/v1/admin/pos/packages/lookup?namespace=MANUFACTURER&value=00Case-390+');await request('/api/v1/admin/pos/packages/resolve',{method:'POST'});
  const requests=new Function('apiLedger','apiStart',cameraLine+';return packageRequests();')(ledger,0);assert.equal(requests.filter(row=>row.method==='GET').length,1);assert.equal(requests.filter(row=>row.method==='POST').length,1);
  await request(`/api/v1/admin/inventory/products/${uuidA}/packages`,{method:'POST',status:201});for(let i=0;i<3;i++)await request('/api/v1/admin/pos/packages/resolve',{method:'POST',status:409});
  const lines=parent.split('\n').filter(line=>line.includes('assert.equal(apiLedger.')).join('\n');assert.equal(lines.split('\n').length,2);new Function('apiLedger','assert',lines)(ledger,assert);
 });
});
test('real mounted Express masks unknown and encoded paths without copying query data or late router rewrites',async()=>{
 await withMountedParent(async({ledger,request})=>{
  for(const endpoint of ['/unknown/SYNTHETIC_PRIVATE_PATH','/auth/SYNTHETIC_PRIVATE_PATH','/inventory/products/SYNTHETIC_PRIVATE_PATH','/auth/%6de','/auth/me/extra','/pos/packages/lookupish']){
   await request('/api/v1/admin'+endpoint+'?token=SYNTHETIC_PRIVATE_QUERY',{status:403});assert.equal(ledger.at(-1).path,'/api/[unrecognized]');
  }
  assert.ok(!JSON.stringify(ledger).includes('SYNTHETIC'));assert.ok(ledger.every(row=>row.status===403));
 },{rewrite:true});
});
test('real mounted Express excludes non-API documents and masks similar API prefixes',async()=>{
 await withMountedParent(async({ledger,request})=>{
  for(const document of ['/login?token=SYNTHETIC_PRIVATE_QUERY','/assets/app.js','/apiish/auth/me']){assert.equal(await request(document),404);assert.equal(ledger.length,0);}
  assert.equal(await request('/api/v1/adminish/auth/me?token=SYNTHETIC_PRIVATE_QUERY'),404);assert.equal(ledger.length,1);assert.equal(ledger[0].path,'/api/[unrecognized]');assert.ok(!JSON.stringify(ledger).includes('SYNTHETIC'));
 });
});

for(const [name,geometry]of[['undersized',{height:43.6}],['transparent',{color:'rgba(0, 0, 0, 0)'}],['clipped bottom',{y:740}],['obscured',{centerHit:false}]])test(`auth failed focus persists actual geometry samples before close: ${name}`,async()=>{
 const x=await integrated({geometry});try{
  assert.ok(x.error);checkCleanup(x);const report=JSON.parse(fs.readFileSync(path.join(x.output,'admin-auth-native.json')));
  const proof=JSON.parse(fs.readFileSync(path.join(x.output,'admin-auth-cold-login-1366-geometry.json')));
  assert.ok(proof.samples.length>0);assert.deepEqual(proof.geometry,proof.samples.at(-1));
  for(const[key,value]of Object.entries(geometry))assert.equal(proof.geometry[key],value);
  assert.equal(report.stage,'auth cold focus 1366');assert.equal(report.budget.apiRequests,0);assert.ok(x.captures.some(row=>row.name==='admin-auth-failed-1366.png'));
 }finally{fs.rmSync(x.output,{recursive:true});}
});
test('auth failed focus keeps primary error when its immutable diagnostic already exists',async()=>{
 const x=await integrated({geometry:{height:43.6},collision:'admin-auth-cold-login-1366-geometry.json'});try{
  assert.ok(x.error);checkCleanup(x);const report=JSON.parse(fs.readFileSync(path.join(x.output,'admin-auth-native.json')));
  assert.equal(report.stage,'auth cold focus 1366');assert.equal(report.failureDetail.code,'ERR_ASSERTION');assert.equal(fs.readFileSync(path.join(x.output,'admin-auth-cold-login-1366-geometry.json'),'utf8'),'IMMUTABLE-PRIOR');
 }finally{fs.rmSync(x.output,{recursive:true});}
});

for(const [name,options]of[['read failure',{geometryReadFailure:true}],['image failure',{captureFailure:'cold-login'}]])test(`auth focus diagnostics survive ${name} and still clean exact fixtures`,async()=>{
 const x=await integrated(options);try{
  assert.ok(x.error);checkCleanup(x);const report=JSON.parse(fs.readFileSync(path.join(x.output,'admin-auth-native.json')));const proof=JSON.parse(fs.readFileSync(path.join(x.output,'admin-auth-cold-login-1366-geometry.json')));
  assert.equal(report.stage,'auth cold focus 1366');assert.ok(!JSON.stringify(report).includes('synthetic-private'));assert.ok(x.captures.some(row=>row.name==='admin-auth-failed-1366.png'));
  if(options.geometryReadFailure){assert.deepEqual(proof.samples,[]);assert.equal(proof.geometry,null);}else{assert.ok(proof.samples.length>=2);assert.equal(proof.geometry.height,44);}
 }finally{fs.rmSync(x.output,{recursive:true});}
});
