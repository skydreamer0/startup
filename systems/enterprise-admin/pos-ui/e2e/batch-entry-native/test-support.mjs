import {randomUUID} from 'node:crypto';
import {buildFixture} from './fixture.mjs';
import {rawTables,cases,digest} from './contract.mjs';
export const clone = value=>structuredClone(value);
export function goodEvidence(){
 const f=buildFixture(randomUUID()),before=Object.fromEntries(rawTables.map(table=>[table,[]]));
 const mapping={tenant:'tenants',user:'users',role:'roles',permission:'permissions',product:'products',productBatch:'product_batches',inventoryTransaction:'inventory_transactions'};
 for(const [model,table] of Object.entries(mapping)) before[table]=f[model].map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key.replace(/[A-Z]/g,c=>'_'+c.toLowerCase()),value])));
 before.users.forEach(row=>row.deleted_at=null);
 for(const actor of f.actors){before.user_roles.push({user_id:actor.userId,role_id:actor.roleId});for(const grant of actor.grants)before.role_permissions.push({role_id:actor.roleId,permission_id:f.permission.find(p=>`${p.action}:${p.resource}`===grant).id});}
 const database={beforeEmpty:true,afterEmpty:true,httpDrainedBeforeSnapshot:true,before,after:clone(before),error:null,cancelled:null,browser:{exitCode:0,signal:null},expected:{tenantA:f.ids.tenantA,actors:f.actors,products:f.product,batches:f.productBatch}};
 const api={requests:[],rejected:[]},browsers=[];
 function add(browser,actor,path,page=null,fault=null){const restricted=path.endsWith('/inventory/products')||path.endsWith('/product-batches'),status=actor.key==='deniedA'&&restricted?403:200;let data={plan:'pro'};
 if(path.endsWith('/auth/me'))data={id:actor.userId,permissions:actor.grants};
 if(path.endsWith('/product-batches'))data=f.productBatch.filter(row=>row.tenantId===actor.tenantId);
 if(path.endsWith('/inventory/products')){const products=f.product.filter(row=>row.tenantId===actor.tenantId).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));data={total:products.length,page,limit:50,data:products.slice((page-1)*50,page*50)};}
 const body=status===403?{success:false,error:{message:'Forbidden'}}:{success:true,data};
 const row={id:f.nonce+':'+randomUUID(),caseId:browser.caseId,actor:actor.key,method:'GET',path,page,status,sha256:digest(body),dispatched:true,delivered:true,cancelled:false};
 api.requests.push({...row,body,userId:actor.userId,tenantId:actor.tenantId});
 if(fault){row.fault=fault;row.deliveredStatus=fault==='http500'?500:200;row.deliveredSha256=digest(fault==='http500'?{success:false,error:{message:'Synthetic batch read transport failure'}}:{...body,data:{...body.data,data:[null]}});}
 browser.requests.push(row);return row;}
 for(const scenario of cases){const actor=f.actors.find(row=>row.key===scenario.actor);const browser={caseId:scenario.id,test:scenario.title,nonce:f.nonce,contextClosed:true,pending:0,errors:[],pageErrors:[],requests:[],journey:{stages:scenario.stages,postCount:0}};
 for(const path of ['auth/me','tenants/me/plan','product-batches','inventory/products'])add(browser,actor,'/api/v1/admin/'+path,path==='inventory/products'?1:null);
 if(['full','cold','reader'].includes(scenario.kind))add(browser,actor,'/api/v1/admin/inventory/products',2);
 if(['full','cold'].includes(scenario.kind))Object.assign(browser.journey,{loadingHeld:true,selectedProduct:f.product.filter(row=>row.tenantId===f.ids.tenantA).at(-1).id,cancelFocusRestored:true});
 if(scenario.kind==='full')for(const fault of ['http500','malformed']){add(browser,actor,'/api/v1/admin/inventory/products',2,fault);browser.journey[`${fault}DraftPreserved`]=true;}
 if(scenario.kind==='reader')browser.journey.createDisabled=true;if(scenario.kind==='denied')browser.journey.deniedNotEmpty=true;if(scenario.kind==='empty')browser.journey.emptyNotError=true;
 browsers.push(browser);}
 return {f,database,browsers,api};
}
