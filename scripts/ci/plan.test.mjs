import test from 'node:test';import assert from 'node:assert/strict';import {classify,parseDiff} from './plan.mjs';import{verifyGate}from'./gate.mjs';
const full={backend:true,admin:true,pos:true};
for(const event of ['push','workflow_dispatch','unknown'])test(`full for ${event}`,()=>assert.deepEqual(classify(event,[]),full));
for(const path of ['systems/enterprise-admin/backend/src/app.ts','systems/enterprise-admin/packages/types/src/index.ts','.github/workflows/ci.yml','pnpm-lock.yaml','systems/enterprise-admin/pos-ui/e2e/stock-native/stock.spec.ts','unknown','systems/enterprise-admin/admin-ui/package.json'])test(`full dependency ${path}`,()=>assert.deepEqual(classify('pull_request',[{status:'M',path}]),full));
for(const status of ['A','D','R100','C100','?'])test(`full status ${status}`,()=>assert.deepEqual(classify('pull_request',[{status,path:'README.md'}]),full));
test('admin-only selects real admin browser but not unrelated POS/PG',()=>assert.deepEqual(classify('pull_request',[{status:'M',path:'systems/enterprise-admin/admin-ui/src/pages/X.tsx'}]),{backend:false,admin:true,pos:false}));
test('POS selects backend and all native/browser contracts',()=>assert.deepEqual(classify('pull_request',[{status:'M',path:'systems/enterprise-admin/pos-ui/src/pages/X.tsx'}]),{...full,admin:false}));
test('mixed frontend selects full',()=>assert.deepEqual(classify('pull_request',[{status:'M',path:'systems/enterprise-admin/pos-ui/src/a.ts'},{status:'M',path:'systems/enterprise-admin/admin-ui/src/b.ts'}]),full));
test('tiny docs whitelist explicit skip only',()=>assert.deepEqual(classify('pull_request',[{status:'M',path:'README.md'}]),{backend:false,admin:false,pos:false}));
test('empty or invalid diff full',()=>{assert.deepEqual(classify('pull_request',[]),full);assert.deepEqual(classify('pull_request',null),full);});
test('NUL paths retained and untruncated >300 files',()=>{const changes=Array.from({length:350},(_,i)=>`M\0systems/enterprise-admin/admin-ui/src/file ${i}.tsx\0`).join('')+'M\0backend.ts\0';assert.equal(parseDiff(changes).length,351);assert.deepEqual(classify('pull_request',parseDiff(changes)),full);});
for(const selected of ['true','false'])for(const status of ['success','skipped','failure','cancelled',undefined,'unknown'])test(`gate ${selected}/${status}`,()=>{if(status===(selected==='true'?'success':'skipped'))assert.doesNotThrow(()=>verifyGate('success',selected,[status]));else assert.throws(()=>verifyGate('success',selected,[status]));});
test('failed/missing plan and malformed selection fail',()=>{for(const p of ['failure',undefined,'cancelled'])assert.throws(()=>verifyGate(p,'false',['skipped']));for(const s of ['',undefined,'maybe'])assert.throws(()=>verifyGate('success',s,['skipped']));assert.throws(()=>verifyGate('success','true',[]));});

import {mkdtempSync,mkdirSync,writeFileSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{execFileSync}from'node:child_process';import{planFromGit}from'./plan.mjs';
test('stacked PR binds actual two parents; stale event base is not authority',t=>{
 const cwd=mkdtempSync(join(tmpdir(),'ci-plan-'));t.after(()=>rmSync(cwd,{recursive:true,force:true}));const git=(...a)=>execFileSync('git',a,{cwd,encoding:'utf8'}).trim();
 git('init','-q');git('config','user.name','Synthetic');git('config','user.email','synthetic@example.invalid');
 mkdirSync(join(cwd,'systems/enterprise-admin/admin-ui/src'),{recursive:true});writeFileSync(join(cwd,'systems/enterprise-admin/admin-ui/src/page.ts'),'old');writeFileSync(join(cwd,'README.md'),'old');git('add','.');git('commit','-qm','base');const base=git('rev-parse','HEAD');
 writeFileSync(join(cwd,'systems/enterprise-admin/admin-ui/src/page.ts'),'new');git('commit','-qam','head');const head=git('rev-parse','HEAD');git('checkout','-q','--detach',base);writeFileSync(join(cwd,'README.md'),'advance');git('commit','-qam','advance');git('merge','-q','--no-ff',head,'-m','merge');
 const execution=git('rev-parse','HEAD'),event=join(cwd,'event.json');writeFileSync(event,JSON.stringify({pull_request:{head:{sha:head},base:{sha:'a'.repeat(40),ref:'stacked/parent'}}}));
 const env={GITHUB_EVENT_NAME:'pull_request',GITHUB_SHA:execution,GITHUB_EVENT_PATH:event};
 assert.deepEqual(planFromGit({cwd,env}),{backend:false,admin:true,pos:false});
 assert.deepEqual(planFromGit({cwd,env:{...env,GITHUB_SHA:head}}),full);
 writeFileSync(event,'invalid');assert.deepEqual(planFromGit({cwd,env}),full);
});
