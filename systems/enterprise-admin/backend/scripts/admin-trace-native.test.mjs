import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { assertTraceNativeAcceptance } from './admin-trace-native.mjs';
const sample = () => ({ status: 'passed', readOnlySnapshotEqual: true, fixtureCleaned: true, forbidden: [],
  cases: [1366, 1024, 390].map(width => ({ viewport: { width }, status: 'passed', totalAllocations: 132, shownAllocations: 100, exactOrderedRows: true, nullAndNumberedOrders: true, receiptLinked: true, keyboardQuantityRevealed: true, keyboardTraceOpened: true, focusRestored: true, lateScopeSuppressed: true, cancelledTraceRequests: [{id:1,ready:true,aborted:true,settled:true,fulfilled:false}], backForwardReload: true, paginationPreserved: true })),
  realStatuses: { unauthenticated: 401, deniedRole: 403, foreignBatch: 404, missingBatch: 404, crossTenantTrace: 404 }, injectedTransport500Recovered: true, databaseGrantLookup: true,
  beforeSha256: 'a'.repeat(64), afterSha256: 'a'.repeat(64), rawSnapshotTables: 33 });
test('accepts only complete synthetic native scope', () => assert.doesNotThrow(() => assertTraceNativeAcceptance(sample())));
for (const key of ['status', 'readOnlySnapshotEqual', 'fixtureCleaned', 'databaseGrantLookup', 'injectedTransport500Recovered', 'beforeSha256', 'afterSha256', 'rawSnapshotTables']) {
  test(`rejects missing ${key}`, () => { const result = sample(); delete result[key]; assert.throws(() => assertTraceNativeAcceptance(result)); });
}
for (const key of ['exactOrderedRows', 'nullAndNumberedOrders', 'receiptLinked', 'keyboardQuantityRevealed', 'keyboardTraceOpened', 'focusRestored', 'lateScopeSuppressed', 'backForwardReload', 'paginationPreserved']) {
  test(`rejects missing viewport evidence ${key}`, () => { const result = sample(); result.cases[2][key] = false; assert.throws(() => assertTraceNativeAcceptance(result)); });
}
test('rejects omitted/duplicated viewport and unexpected writes', () => {
  for (const mutate of [r => r.cases.pop(), r => { r.cases[1] = r.cases[0]; }, r => r.forbidden.push({ method: 'POST' })]) {
    const result = sample(); mutate(result); assert.throws(() => assertTraceNativeAcceptance(result));
  }
});
test('rejects truncated trace, fabricated totals, missing real denial or snapshot mismatch', () => {
  for (const mutate of [r => r.cases[0].shownAllocations = 99, r => r.cases[0].totalAllocations = 100, r => r.realStatuses.deniedRole = 200, r => r.realStatuses.foreignBatch = 200, r => r.afterSha256 = 'b'.repeat(64), r => r.rawSnapshotTables = 31]) {
    const result = sample(); mutate(result); assert.throws(() => assertTraceNativeAcceptance(result));
  }
});
test('existing mandatory owned runner calls the full journey and rejects its failure', () => {
  const source = fs.readFileSync(new URL('./package-browser-acceptance.mjs', import.meta.url), 'utf8');
  assert.match(source, /import \{ runAdminTraceNative \} from '\.\/admin-trace-native\.mjs'/);
  assert.match(source, /const trace = await runAdminTraceNative\(/);
  assert.match(source, /assert\.equal\(trace\.status, 'passed'\)/);
  assert.ok(source.indexOf('await runAdminTraceNative(') < source.indexOf('cleanup = await cleanupRunProcesses(scope)'));
});

test('cleanup rejects a failed deletion or nonzero remainder; never reports a false clean fixture', async () => {
  const { cleanupTraceFixture } = await import('./admin-trace-native.mjs');
  const ids = Object.fromEntries(['a','b','foreignProduct','foreignTenant','reader','denied','readerRole','deniedRole','foreignReader','foreignReaderRole','customer'].map((k,i) => [k, `00000000-0000-4000-8000-${String(i).padStart(12,'0')}`]));
  const tenant = '00000000-0000-4000-8000-999999999999';
  function mock(fail, count = 0) {
    const calls=[]; const db={};
    for (const name of ['saleBatchAllocation','orderItem','order','inventoryTransaction','productBatch','product','customer','rolePermission','userRole','role','user','tenant']) db[name] = {
      deleteMany: async query => { calls.push({ name, query }); if(name===fail)throw new Error('synthetic cleanup fault'); return {count:1}; }, count: async()=>count,
    };
    return {db,calls};
  }
  const clean=mock(); assert.deepEqual(Object.values(await cleanupTraceFixture(clean.db,ids,tenant)),[0,0,0,0,0]);
  assert.equal(clean.calls.length,12);
  const failed=mock('order'); await assert.rejects(cleanupTraceFixture(failed.db,ids,tenant)); assert.equal(failed.calls.length,3);
  await assert.rejects(cleanupTraceFixture(mock(null,1).db,ids,tenant));
  await assert.rejects(cleanupTraceFixture(clean.db,{...ids,a:'*'},tenant));
});

for (const cleanupFails of [false, true]) test(`runner failure preserves failed receipt and cleanup=${!cleanupFails}`, async () => {
  const { runAdminTraceNative } = await import('./admin-trace-native.mjs');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const output = mkdtempSync(join(tmpdir(), 'synthetic-trace-guard-'));
  const db = {};
  for (const name of ['saleBatchAllocation','orderItem','order','inventoryTransaction','productBatch','product','customer','rolePermission','userRole','role','user','tenant']) db[name] = {
    deleteMany: async () => { if (cleanupFails) throw new Error('synthetic teardown failure'); return { count: 0 }; }, count: async () => 0,
  };
  db.tenant.create = async () => { throw new Error('synthetic fixture setup failure'); };
  try {
    await assert.rejects(runAdminTraceNative({ db, tenantId: '00000000-0000-4000-8000-999999999999', browser: {}, adminOrigin: 'http://127.0.0.1:1234', nonce: '00000000-0000-4000-8000-111111111111', output }));
    const result = JSON.parse(fs.readFileSync(join(output, 'admin-trace-native.json'), 'utf8'));
    const cleanup = JSON.parse(fs.readFileSync(join(output, 'admin-trace-fixture-cleanup.json'), 'utf8'));
    assert.equal(result.status, 'failed'); assert.equal(result.readOnlySnapshotEqual, false); assert.equal(result.databaseGrantLookup, false);
    assert.equal(result.fixtureCleaned, !cleanupFails); assert.equal(cleanup.status, cleanupFails ? 'failed' : 'passed');
    assert.deepEqual(result.cases, []); assert.doesNotMatch(JSON.stringify(result), /synthetic (fixture setup|teardown) failure/);
  } finally { rmSync(output, { recursive: true, force: true }); }
});

test('actual fixture linked receipt satisfies the unchanged SQL cost constraint', async () => {
  const { runAdminTraceNative } = await import('./admin-trace-native.mjs');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const sql = fs.readFileSync(new URL('../prisma/migrations/20261006100000_atomic_batch_receipts/migration.sql', import.meta.url), 'utf8');
  assert.match(sql, /inventory_transactions_receipt_check/);
  assert.match(sql, /"cost_price_at_receipt" IS NOT NULL AND "cost_price_at_receipt" >= 0/);
  const output = mkdtempSync(join(tmpdir(), 'synthetic-trace-receipt-')); let recorded;
  const db = {};
  for (const name of ['saleBatchAllocation','orderItem','order','inventoryTransaction','productBatch','product','customer','rolePermission','userRole','role','user','tenant']) db[name] = {
    create: async ({ data }) => data, createMany: async ({ data }) => ({ count: data.length }), deleteMany: async () => ({ count: 0 }), count: async () => 0,
  };
  db.inventoryTransaction.createMany = async ({ data }) => { recorded = data; throw new Error('Stop mocked execution after recording exact fixture input'); };
  try {
    await assert.rejects(runAdminTraceNative({ db, tenantId: '00000000-0000-4000-8000-999999999999', browser: {}, adminOrigin: 'http://127.0.0.1:1234', nonce: '00000000-0000-4000-8000-111111111111', output }));
    assert.equal(recorded.length,133);
    const linked = recorded.filter(row => row.batchId != null); assert.equal(linked.length,1);
    for (const row of linked) {
      assert.equal(row.type,'IN'); assert.ok(row.quantity>0);
      assert.ok(row.costPriceAtReceipt != null && row.costPriceAtReceipt >= 0, 'Linked receipt requires explicit nonnegative cost, per unchanged SQL CHECK');
      assert.equal(row.costPriceAtReceipt,1);
    }
    const receipt=JSON.parse(fs.readFileSync(join(output,'admin-trace-native.json'),'utf8'));
    assert.equal(receipt.status,'failed'); assert.equal(receipt.databaseGrantLookup,false); assert.equal(receipt.fixtureCleaned,true); assert.deepEqual(receipt.cases,[]);
  } finally { rmSync(output,{recursive:true,force:true}); }
});
test('safe failure diagnostics expose only fixed exception class/code, never message/meta/stack/token', async () => {
  const { safeTraceFailure } = await import('./admin-trace-native.mjs');
  const secret='synthetic-do-not-record-this-value';
  assert.deepEqual(safeTraceFailure({name:'PrismaClientKnownRequestError',code:'P2004',message:secret,stack:secret,meta:{token:secret}}),{kind:'PrismaClientKnownRequestError',code:'P2004'});
  assert.deepEqual(safeTraceFailure({name:secret,code:secret,message:secret}),{kind:'UnknownError',code:null});
  assert.deepEqual(safeTraceFailure(new Error(secret)),{kind:'Error',code:null});
  assert.deepEqual(safeTraceFailure(secret),{kind:'UnknownError',code:null});
});

const focusGeometry = () => ({ x: 193, y: 470, width: 129, height: 44, region: { x: 112, right: 350 }, pageWidth: 390, viewport: 390, scrollLeft: 664, outline: '3px', color: 'rgb(61, 43, 31)', focused: true, centerHit: true });
test('focus observation waits for native scroll and outline transition without moving the page', async () => {
  const { settleTraceFocusGeometry } = await import('./admin-trace-native.mjs');
  const samples = [{ ...focusGeometry(), x: 328, scrollLeft: 529, outline: '1px' }, { ...focusGeometry(), outline: '2px' }, focusGeometry(), focusGeometry()];
  const observed = []; let reads = 0, waits = 0;
  const result = await settleTraceFocusGeometry(async () => samples[reads++], value => observed.push(value), async ms => { assert.equal(ms, 50); waits++; });
  assert.equal(result, samples[3]); assert.equal(reads, 4); assert.equal(waits, 3);
  assert.deepEqual(observed[0].issues, ['clipped-horizontal','outline-under-3px']);
  assert.deepEqual(observed.at(-1).issues, []);
});
test('focus observation rejects persistent original geometry failures and new focus/hit-test failures', async () => {
  const { settleTraceFocusGeometry } = await import('./admin-trace-native.mjs');
  for (const patch of [{x:328},{outline:'2px'},{color:'rgba(0, 0, 0, 0)'},{width:43},{height:43},{pageWidth:391},{focused:false},{centerHit:false},{x:NaN}]) {
    let reads=0;const observations=[];
    await assert.rejects(settleTraceFocusGeometry(async()=>{reads++;return {...focusGeometry(),...patch};},x=>observations.push(x),async()=>{}));
    assert.equal(reads,61);assert.ok(observations.every(x=>x.issues.length>0));
  }
});
test('focus observation rejects unstable or briefly-valid geometry and preserves samples', async () => {
  const { settleTraceFocusGeometry } = await import('./admin-trace-native.mjs');
  for(const transient of [false,true]){
    let reads=0;const observations=[];
    await assert.rejects(settleTraceFocusGeometry(async()=>{reads++;return transient&&reads%2?{...focusGeometry(),outline:'1px'}:{...focusGeometry(),x:193+reads%2};},x=>observations.push(x),async()=>{}));
    assert.equal(reads,61);assert.equal(observations.length,61);
  }
});
test('driver records focus observations and failure PNG before closing context; no forced scroll substitute', () => {
  const source=fs.readFileSync(new URL('./admin-trace-native.mjs',import.meta.url),'utf8');
  const block=source.slice(source.indexOf('stage = `trace entry focus geometry'),source.indexOf('stage = `trace API and DB rows'));
  assert.match(block,/await settleTraceFocusGeometry/);assert.match(block,/admin-trace-focus-failed-/);
  assert.match(block,/status: 'failed', observations/);assert.match(block,/status: 'passed', observations/);
  assert.match(block,/document.elementFromPoint/);assert.match(block,/scrollLeft: container.scrollLeft/);
  assert.doesNotMatch(block,/scrollIntoView\(|scrollLeft\s*=|force:\s*true|style\.[a-zA-Z]+\s*=/);
});
test('focus observation has a real finite deadline even when a geometry read never settles', async () => {
  const { settleTraceFocusGeometry } = await import('./admin-trace-native.mjs');
  let release, observations=0;
  const pending=new Promise(resolve=>{release=resolve;});
  await assert.rejects(settleTraceFocusGeometry(()=>pending,()=>observations++),/timed out/);
  release(focusGeometry());await new Promise(resolve=>setImmediate(resolve));assert.equal(observations,0);
});

// Actual driver route callback with deterministic transport/event adapters.
// Browser cancellation is explicit; these cases are not native Chrome proof.
const traceDeferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
const traceTick=()=>new Promise(resolve=>setImmediate(resolve));
async function traceHoldHarness() {
 const {createTraceRequestHold}=await import('./admin-trace-native.mjs');
 const adminOrigin='http://127.0.0.1:4321',tracePath='/api/v1/admin/product-batches/00000000-0000-4000-8000-000000000001',hold=createTraceRequestHold({origin:adminOrigin,pathname:tracePath});
 const source=fs.readFileSync(new URL('./admin-trace-native.mjs',import.meta.url),'utf8');const start=source.indexOf("await context.route('**/*', async route => {"),end=source.indexOf('\n      const page =',start);
 const network=[],forbidden=[];let callback;const context={route:(_glob,handler)=>{callback=handler;}};
 const ready=traceDeferred(),release=traceDeferred(),handled=traceDeferred();
 // Exact old callback remains executable for a true prior-source negative.
 const factory=new Function('context','adminOrigin','tracePath','network','forbidden','hold','ready','release','handled','assert','hash','bounded',`const viewport={width:1366};let mode='hold',held=false,heldError;return (async()=>{${source.slice(start,end)};})();`);
 await factory(context,adminOrigin,tracePath,network,forbidden,hold,ready,release,handled,assert,value=>String(value),async promise=>promise);
 const tasks=[],routes=[];
 function request({url=adminOrigin+tracePath,method='GET',resourceType='xhr',fetchGate,status=200,error}={}) {
  let failure=null;const req={url:()=>url,method:()=>method,resourceType:()=>resourceType,failure:()=>failure};const record={request:req,fetches:0,fulfilled:0,continued:0,aborted:0};
  const route={request:()=>req,fetch:async()=>{record.fetches++;if(fetchGate)await fetchGate.promise;if(error)throw error;return{status:()=>status,text:async()=>'synthetic actual-body-adapter'};},fulfill:async()=>{record.fulfilled++;},continue:async()=>{record.continued++;},abort:async()=>{record.aborted++;}};
  routes.push(record);const task=callback(route);tasks.push(task);return{...record,record,task,cancel:(text='net::ERR_ABORTED')=>{failure={errorText:text};hold.aborted(req);}};
 }
 return{hold,request,network,forbidden,routes,close:async()=>{hold.release();release.resolve();await Promise.all(tasks);await hold.settle();}};
}
test('actual trace callback holds the replacement request after an aborted probe instead of allowing an unheld200',async()=>{
 const x=await traceHoldHarness();try{const first=x.request();await traceTick();first.cancel();await traceTick();const live=x.request();await traceTick();
  assert.equal(live.record.continued,0);assert.equal(live.record.fetches,1);assert.equal(x.hold.activeRequests().has(live.record.request),true);assert.equal(x.hold.activeRequests().has(first.record.request),false);
  assert.equal(first.record.fulfilled,0);live.cancel();await traceTick();assert.equal(x.hold.wasAborted(live.record.request),true);assert.equal(x.hold.activeRequests().size,0);
 }finally{await x.close();}assert.ok(x.routes.every(row=>row.fulfilled===0));assert.ok(x.network.every(row=>row.cancelledBeforeFulfill===true));
});
test('actual trace callback holds every live same-scope request and releases only after explicit decision',async()=>{
 const x=await traceHoldHarness();try{const a=x.request(),b=x.request();await traceTick();assert.equal(x.hold.activeRequests().size,2);assert.ok(x.routes.every(row=>row.fulfilled===0&&row.continued===0));x.hold.release();await Promise.all([a.task,b.task]);assert.ok(x.routes.every(row=>row.fulfilled===1));}finally{await x.close();}
});
test('actual trace callback cancellation before fetch completion cannot satisfy later readiness or replay bytes',async()=>{
 const x=await traceHoldHarness(),gate=traceDeferred();try{const old=x.request({fetchGate:gate});old.cancel();const live=x.request();await traceTick();assert.equal(x.hold.activeRequests().size,1);assert.equal(x.hold.activeRequests().has(live.record.request),true);gate.resolve();await traceTick();assert.equal(old.record.fulfilled,0);assert.equal(x.hold.wasAborted(old.record.request),true);live.cancel();}finally{gate.resolve();await x.close();}assert.ok(x.routes.every(row=>row.fulfilled===0));
});
test('actual trace callback never holds other batches documents origins or methods',async()=>{
 const x=await traceHoldHarness();try{
  for(const url of ['http://127.0.0.1:4321/inventory','http://127.0.0.1:4321/api/v1/admin/auth/me','http://127.0.0.1:4321/api/v1/admin/product-batches/other','http://127.0.0.1:4321/api/v1/admin/product-batches/00000000-0000-4000-8000-000000000001/extra']){const r=x.request({url});await r.task;assert.equal(r.record.continued,1);assert.equal(r.record.fetches,0);}
  for(const args of [{url:'http://127.0.0.1:9999/api/v1/admin/product-batches/00000000-0000-4000-8000-000000000001'},{method:'POST'}]){const r=x.request(args);await r.task;assert.equal(r.record.aborted,1);assert.equal(r.record.fetches,0);}
  for(const resourceType of ['document','script','stylesheet','image']){const r=x.request({resourceType});await r.task;assert.equal(r.record.continued,1);assert.equal(r.record.fetches,0);}
  assert.equal(x.hold.receipt().length,0);assert.equal(x.forbidden.length,2);
 }finally{await x.close();}
});
test('trace hold rejects duplicate capture replay and non-abort failure cannot certify cancellation',async()=>{
 const x=await traceHoldHarness();try{const r=x.request();await traceTick();assert.throws(()=>x.hold.capture({request:()=>r.record.request},{}),/replayed/);r.cancel('net::ERR_CONNECTION_RESET');assert.equal(x.hold.wasAborted(r.record.request),false);assert.throws(()=>x.hold.assertHealthy(),/without browser abort/);}finally{await assert.rejects(x.close(),/without browser abort/);}
});
for(const status of [401,403,500])test(`actual trace hold fails closed on authentic unexpected status${status}`,async()=>{
 const x=await traceHoldHarness();const r=x.request({status});await r.task;assert.throws(()=>x.hold.assertHealthy(),/Authentic held/);assert.equal(r.record.fulfilled,0);await assert.rejects(x.close());
});
test('trace hold deadline failure cannot become ready success or replay a held response',async()=>{
 const {createTraceRequestHold}=await import('./admin-trace-native.mjs');const hold=createTraceRequestHold({origin:'http://127.0.0.1:4321',pathname:'/trace',wait:async()=>{throw new Error('synthetic bounded deadline');}});let fulfilled=0;
 await hold.capture({request:()=>({url:()=> 'http://127.0.0.1:4321/trace',method:()=> 'GET',resourceType:()=> 'xhr',failure:()=>null}),fetch:async()=>({status:()=>200,text:async()=> 'body'}),fulfill:async()=>{fulfilled++;}},{});assert.throws(()=>hold.assertHealthy());assert.equal(fulfilled,0);assert.equal(hold.activeRequests().size,0);
});
for(const phase of ['settle','write','close'])test(`trace held context preserves primary failure and still closes after ${phase} diagnostic failure`,async()=>{
 const {finishTraceHeldContext}=await import('./admin-trace-native.mjs');const events=[],primary=new Error('original'),error=new Error('secondary');
 const args={hold:{release:()=>events.push('release'),settle:async()=>{events.push('settle');if(phase==='settle')throw error;},receipt:()=>[]},page:{off:()=>events.push('off')},context:{close:async()=>{events.push('close');if(phase==='close')throw error;}},write:()=>{events.push('write');if(phase==='write')throw error;},name:'safe.json',primaryError:primary};
 await finishTraceHeldContext(args);assert.deepEqual(events,['release','settle','write','off','close']);events.length=0;await assert.rejects(finishTraceHeldContext({...args,primaryError:undefined}),e=>e===error);assert.equal(events.at(-1),'close');
});

test('trace cancellation acceptance rejects absent unready uncancelled replayed or duplicated request proof',async()=>{
 const {assertTraceCancelledRequests}=await import('./admin-trace-native.mjs');const valid=[{id:1,ready:true,aborted:true,settled:true,fulfilled:false}];assert.doesNotThrow(()=>assertTraceCancelledRequests(valid));
 for(const rows of [[],[{...valid[0],ready:false}],[{...valid[0],aborted:false}],[{...valid[0],settled:false}],[{...valid[0],fulfilled:true}],[valid[0],valid[0]]])assert.throws(()=>assertTraceCancelledRequests(rows));
});
