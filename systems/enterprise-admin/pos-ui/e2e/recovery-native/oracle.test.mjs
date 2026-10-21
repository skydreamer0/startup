import assert from 'node:assert/strict';
import test from 'node:test';
import { assertEnvironment, assertReport, assertEvidence, expectedCases, cases, prefix, databaseUrl, digest, safePayload } from './contract.mjs';
const uuid=n=>`${n}`.padStart(8,'0')+'-1111-4111-8111-111111111111';
const tables=['products','product_batches','orders','order_items','order_payments','inventory_transactions','sale_batch_allocations','checkout_commands','order_number_counters'];
function wireOrder(snapshot, payments = true) {
 const result={...structuredClone(snapshot.orders[0]),items:snapshot.items.map(row=>({id:row.id,orderId:row.order_id,productId:row.product_id,quantity:row.quantity,unitPrice:String(row.unit_price),discountRate:Number(row.discount_rate),finalUnitPrice:row.final_unit_price===null?null:String(row.final_unit_price)}))};
 if(payments)result.payments=structuredClone(snapshot.payments);return result;
}
function sample(){
 const database={error:null,cancelled:null,beforeEmpty:true,afterEmpty:true,httpDrainedBeforeSnapshot:true,browser:{exitCode:0,signal:null},expected:{},finalSnapshots:{},before:{users:['fixed'],...Object.fromEntries(tables.map(table=>[table,[]]))},after:{users:['fixed'],...Object.fromEntries(tables.map(table=>[table,[]]))}};
 const api={rejected:[],requests:[]},browsers=[];
 for(const [index,scenario]of cases.entries()){
  const id=uuid(index+1),commandId=uuid(index+10),quantity=scenario.mode==='conflict'?2:1;
  const own={tenantId:scenario.id,userId:'cashier',shiftId:uuid(20+index),productId:uuid(30+index),batchId:uuid(40+index)};database.expected[scenario.id]=own;
  const snapshot={product:{id:own.productId,tenantId:own.tenantId,stockQuantity:5-quantity},batch:{quantity:5-quantity},orders:[{id,status:'completed',totalAmount:quantity*20,discountNote:null,updatedAt:'before'}],items:[{quantity}],payments:[{amount:quantity*20}],movements:[{type:'OUT',quantity}],allocations:[{quantity}],commands:[{status:'SUCCEEDED'}],counters:[{lastSequence:1}],raw:Object.fromEntries(tables.map(table=>[table,[{id:table+index,tenant_id:scenario.id,quantity}]]))};
  Object.assign(snapshot.batch,{id:own.batchId,tenantId:own.tenantId,productId:own.productId});Object.assign(snapshot.orders[0],{tenantId:own.tenantId,shiftId:own.shiftId,salesStaffId:own.userId});for(const key of ['payments','movements','allocations','commands','counters'])for(const row of snapshot[key])row.tenantId=own.tenantId;Object.assign(snapshot.commands[0],{kind:'POS_CHECKOUT',commandId,payloadHash:'a'.repeat(64),orderId:id,result:{id}});Object.assign(snapshot.items[0],{order_id:id,product_id:own.productId});
  Object.assign(snapshot.product,{retailPrice:'20',costPrice:'10'});snapshot.batch.costPrice='10';
  Object.assign(snapshot.orders[0],{customerId:uuid(50+index),shippingAddress:null,orderNumber:'SYNTHETIC-'+index,businessDate:'2026-10-19T00:00:00.000Z',orderType:'WALK_IN',createdAt:'2026-10-19T00:00:01.000Z',paymentMethod:'CASH',paymentStatus:'paid',discountAmount:'0',totalAmount:String(quantity*20)});
  Object.assign(snapshot.payments[0],{id:'payment-'+index,method:'CASH',orderId:id,amount:String(quantity*20)});Object.assign(snapshot.items[0],{id:'item-'+index,unit_price:'20',final_unit_price:'20',discount_rate:'0'});
  Object.assign(snapshot.movements[0],{id:'movement-'+index,productId:own.productId,referenceId:id});
  Object.assign(snapshot.allocations[0],{productId:own.productId,batchId:own.batchId,orderId:id,orderItemId:'item-'+index,movementId:'movement-'+index});
  snapshot.raw.orders[0]={id,tenant_id:scenario.id,status:'completed',discount_note:null,updated_at:'before'};
  const payload=safePayload({commandId,shiftId:uuid(20+index),cartItems:[{productId:uuid(30+index),quantity,discountRate:0}],paymentMethod:'CASH'});
  snapshot.commands[0].result=wireOrder(snapshot);snapshot.raw.checkout_commands[0].result=structuredClone(snapshot.commands[0].result);
  const first={caseId:scenario.id,method:'POST',path:prefix+'/checkout',phase:scenario.mode==='conflict'?'prime':'submit',status:201,body:{success:true,data:wireOrder(snapshot)},payload,snapshot};
  const second=structuredClone(first);second.phase=scenario.id==='query-refund'?'refund':scenario.mode==='conflict'?'submit':'recover';
  if(scenario.id==='query-refund'){second.path=prefix+'/orders/'+id+'/refund';second.status=200;delete second.payload;Object.assign(second.snapshot.orders[0],{status:'refunded',discountNote:'[退款] 合成原生退款',updatedAt:'after'});Object.assign(second.snapshot.raw.orders[0],{status:'refunded',discount_note:'[退款] 合成原生退款',updated_at:'after'});second.body={success:true,data:wireOrder(second.snapshot,false)};}
  if(scenario.mode==='conflict'){second.status=409;second.body={error:{code:'COMMAND_PAYLOAD_CONFLICT'}};second.payload.cartItems[0].quantity=1;}
  const rows=[first,second];
  if(scenario.recovery==='query')rows.push({caseId:scenario.id,method:'GET',path:prefix+'/checkout-commands/'+commandId,phase:'recover',status:200,body:{data:{status:'SUCCEEDED',commandId,payloadHash:'a'.repeat(64),result:wireOrder(snapshot)}},snapshot:structuredClone(snapshot)});
  rows.forEach((row,i)=>{row.id=scenario.id+':'+i;row.sha256=digest(row.body);});api.requests.push(...rows);database.finalSnapshots[scenario.id]=structuredClone(second.snapshot);
  for(const table of tables)database.after[table].push(...structuredClone(second.snapshot.raw[table]));
  const requests=rows.map(({id,caseId,method,path,phase,status,sha256,payload})=>({id,caseId,method,path,phase,status,sha256,payload,dispatched:true}));
  if(scenario.mode==='unknown')requests[0].droppedAfterCommit=true;
  const journey={commandId,noReplacementCommand:true,restoredStatus:scenario.mode==='conflict'?'conflict':'unknown',conflictFrozenAfterRealQuery:scenario.mode==='conflict',cancelSubmitCount:0,pendingDismissCount:0,refundViewport:390,draftBeforeRefund:{quantity:1},draftAfterRefund:{quantity:1}};
  browsers.push({test:scenario.title,caseId:scenario.id,contextClosed:true,pending:0,errors:[],pageErrors:[],verifiedBrand:[],keys:[{key:'Enter',trusted:true}],requests,journey});
 }
 for(const table of tables)database.after[table].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return{database,browsers,api};
}
test('complete evidence matches all real-dispatch identities, mutation counts and raw tables',()=>{const v=sample();assert.equal(assertEvidence(v.database,v.browsers,v.api).committedOrders,3);});
for(const[key,mutate]of Object.entries({
 'wrong-sequence':v=>{v.api.requests[0].snapshot.counters[0].lastSequence=2;},'wrong-payment-method':v=>{v.api.requests[0].snapshot.payments[0].method='CARD';},'wrong-line-price':v=>{v.api.requests[0].snapshot.items[0].final_unit_price='19';},'wrong-allocation-movement':v=>{v.api.requests[0].snapshot.allocations[0].movementId='other';},'wrong-tenant':v=>{v.api.requests[0].snapshot.product.tenantId='other';},'wrong-cashier':v=>{v.api.requests[0].snapshot.orders[0].salesStaffId='other';},'wrong-command-result':v=>{v.api.requests[0].snapshot.commands[0].result.id='other';},'failed-cleanup':v=>{v.database.afterEmpty=false;},'no-http-drain':v=>{v.database.httpDrainedBeforeSnapshot=false;},'failed-browser':v=>{v.database.browser.exitCode=1;},'extra-unrelated-write':v=>{v.database.after.users.push('leaked');},'missing-case':v=>{v.browsers.pop();},'false-network-success':v=>{v.browsers[0].errors.push('request failed');},'missing-actual-request':v=>{v.api.requests.pop();},'forged-response-hash':v=>{v.api.requests[0].sha256='fake';},'refund-stock-restored':v=>{v.api.requests[1].snapshot.product.stockQuantity=5;},'refund-hidden-row-change':v=>{v.api.requests[1].snapshot.raw.products[0].extra='changed';},'duplicate-payment':v=>{v.api.requests[0].snapshot.payments.push({amount:20});},'duplicate-order':v=>{v.api.requests[0].snapshot.orders.push({id:'other'});},'duplicate-movement':v=>{v.api.requests[0].snapshot.movements.push({type:'OUT',quantity:1});},'duplicate-allocation':v=>{v.api.requests[0].snapshot.allocations.push({quantity:1});},'extra-final-raw-row':v=>{v.database.after.order_items.push({id:'unobserved'});},'missing-lost-response-proof':v=>{delete v.browsers[0].requests[0].droppedAfterCommit;},'conflict-auto-cleared':v=>{v.browsers[2].journey.conflictFrozenAfterRealQuery=false;},'replacement-command':v=>{v.browsers[1].journey.noReplacementCommand=false;},'cancel-submitted':v=>{v.browsers[0].journey.cancelSubmitCount=1;},'pending-dismissed':v=>{v.browsers[0].journey.pendingDismissCount=1;},'wrong-refund-viewport':v=>{v.browsers[0].journey.refundViewport=1366;},'lost-new-draft':v=>{v.browsers[0].journey.draftAfterRefund.quantity=0;},
}))test(`oracle rejects ${key}`,()=>{const v=sample();mutate(v);assert.throws(()=>assertEvidence(v.database,v.browsers,v.api));});
test('native inventory rejects omitted, skipped, retried and expected-failure cases',()=>{const make=()=>({errors:[],suites:[{specs:expectedCases.map(title=>({title,ok:true,tests:[{expectedStatus:'passed',status:'expected',results:[{status:'passed',errors:[],duration:1}]}]}))}]});assert.equal(assertReport(make()).length,3);for(const mutate of [r=>r.suites[0].specs.pop(),r=>{r.suites[0].specs[0].tests[0].results[0].status='skipped';},r=>r.suites[0].specs[0].tests[0].results.push({status:'passed',errors:[]}),r=>{r.suites[0].specs[0].tests[0].expectedStatus='failed';}]){const r=make();mutate(r);assert.throws(()=>assertReport(r));}});
test('exact owned DB, host, head, run, Node22 and isolated environment remain mandatory',()=>{const env={GITHUB_ACTIONS:'true',RUNNER_ENVIRONMENT:'github-hosted',DATABASE_URL:databaseUrl,POS_PRODUCT_LOOKUP_DATABASE_URL:databaseUrl,CATEGORY_QA_DATABASE_URL:databaseUrl,RECOVERY_QA_DATABASE_URL:databaseUrl,SKU_QA_HEAD:'a'.repeat(40),SKU_QA_CONTAINER:'b'.repeat(64),SKU_QA_NETWORK:'github_network_abcd',GITHUB_RUN_ID:'1',GITHUB_RUN_ATTEMPT:'1'};assertEnvironment(env,'v22.23.3');for(const key of Object.keys(env))assert.throws(()=>assertEnvironment({...env,[key]:undefined},'v22.23.3'));assert.throws(()=>assertEnvironment({...env,RECOVERY_QA_DATABASE_URL:databaseUrl+'?schema=other'},'v22.23.3'));assert.throws(()=>assertEnvironment(env,'v24.19.0'));});

for(const field of ['commandId','payloadHash','result']) test(`query proof rejects wrong ${field} even with a correctly hashed response`,()=>{const v=sample();const lookup=v.api.requests.find(row=>row.method==='GET');lookup.body.data[field]=field==='result'?{id:'different'}:'b'.repeat(64);lookup.sha256=digest(lookup.body);v.browsers.flatMap(row=>row.requests).find(row=>row.id===lookup.id).sha256=lookup.sha256;assert.throws(()=>assertEvidence(v.database,v.browsers,v.api));});

function rehash(v,row){row.sha256=digest(row.body);v.browsers.flatMap(browser=>browser.requests).find(request=>request.id===row.id).sha256=row.sha256;}
for(const [field,value] of Object.entries({id:uuid(999),tenantId:'other-tenant',status:'completed',totalAmount:999,discountAmount:'999',discountNote:'different',customerId:'extra-identity'}))test(`wire refund rejects rehashed wrong ${field} against persisted order`,()=>{
 const v=sample(),row=v.api.requests.find(row=>row.path.endsWith('/refund'));row.body.data[field]=value;rehash(v,row);
 assert.throws(()=>assertEvidence(v.database,v.browsers,v.api),/Every returned order scalar/);
});
for(const [label,mutate,expected]of [
 ['money',data=>{data.totalAmount=999;},/Every returned order scalar/],
 ['identity',data=>{data.customerId='other';},/Every returned order scalar/],
 ['item-price',data=>{data.items[0].unitPrice='999';},/Every returned line/],
 ['item-product',data=>{data.items[0].productId='other';},/Every returned line/],
 ['payment-amount',data=>{data.payments[0].amount=999;},/Returned payments/],
 ['payment-order',data=>{data.payments[0].orderId='other';},/Returned payments/],
])test(`wire checkout rejects coherently rehashed/stored/replayed wrong ${label}`,()=>{
 const v=sample(),rows=v.api.requests.filter(row=>row.caseId==='retry');const data=structuredClone(rows[0].body.data);mutate(data);
 for(const row of rows){row.body.data=structuredClone(data);row.snapshot.commands[0].result=structuredClone(data);row.snapshot.raw.checkout_commands[0].result=structuredClone(data);rehash(v,row);}
 v.database.finalSnapshots.retry=structuredClone(rows[1].snapshot);
 v.database.after.checkout_commands=v.database.after.checkout_commands.map(row=>row.tenant_id==='retry'?structuredClone(rows[1].snapshot.raw.checkout_commands[0]):row).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 assert.throws(()=>assertEvidence(v.database,v.browsers,v.api),expected);
});
test('wire refund rejects invented payment relation and false success with correct hashes',()=>{
 for(const mutate of [body=>{body.data.payments=[];},body=>{body.success=false;}]){
  const v=sample(),row=v.api.requests.find(row=>row.path.endsWith('/refund'));mutate(row.body);rehash(v,row);assert.throws(()=>assertEvidence(v.database,v.browsers,v.api));
 }
});
