import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { inspectEvidence } from './run.mjs';
import { capture,writeJson } from '../recovery-native/evidence.mjs';
import { cases,stages,requestLimit,requestSpacingMs,nativeDeadlineMs,rawTables } from './contract.mjs';
import { proof,geometry,layout,report,nonce } from './test-support.mjs';
const source=rel=>fs.readFileSync(new URL(rel,import.meta.url),'utf8');
const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;};
function png(width,height){const chunk=(name,data)=>{const type=Buffer.from(name),head=Buffer.alloc(4),crc=Buffer.alloc(4);head.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([head,type,data,crc]);};const h=Buffer.alloc(13);h.writeUInt32BE(width);h.writeUInt32BE(height,4);h[8]=8;h[9]=2;return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',h),chunk('IDAT',deflateSync(Buffer.alloc((width*3+1)*height))),chunk('IEND',Buffer.alloc(0))]);}
async function populate(root){
 const p=proof();writeJson(root,'report.json',report());writeJson(root,'api-ledger.json',p.api);writeJson(root,'database-receipt.json',p.database);
 for(const[cIndex,c]of cases.entries()){
  const dir=path.join(root,'tests',c.id),bytes=png(c.width,c.height);writeJson(dir,'network.json',p.browsers[cIndex]);
  // A synthetic PNG adapter verifies the REAL shared wx writer and REAL full
  // runner postprocessor. It is explicitly not a browser visual/geometry pass.
  const page={evaluate:async()=>{},screenshot:async options=>{assert.deepEqual(options,{fullPage:false});return bytes;},viewportSize:()=>({width:c.width,height:c.height})};
  for(const stage of stages)await capture(page,dir,stage,{caseId:c.id,nonce,fonts:[{isCustomFont:false,familyName:'Noto Sans CJK TC',glyphCount:2}]});
  const expected=['search',...p.database.expected.products.map(p=>'add-'+p.sku),'cart-total','checkout','payment-cancel','split','split-cancel','shift','shift-cancel','clear-first','clear-confirm'];const g=geometry(c.width,c.height);
  writeJson(dir,'layout-geometry.json',{caseId:c.id,nonce,controls:expected.map(name=>({name,samples:[g,g],final:g})),layouts:['initial','populated','cleared'].map(stage=>({stage,...layout(c.width,c.height,c.mode)}))});
 }
 return p;
}
test('actual runner postprocessor consumes all 54 PNG through the real immutable writer and six complete geometry receipts',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'layout-writer-'));try{await populate(root);const result=inspectEvidence(root,nonce);assert.equal(result.captures.length,54);assert.equal(result.geometry.length,6);assert.equal(result.reportCases.length,6);assert.equal(result.databaseProof.financialWrites,0);
 const stagePath=path.join(root,'tests',cases[0].id,'layout-ready.png'),before=fs.readFileSync(stagePath),page={evaluate:async()=>{},screenshot:async()=>Buffer.from('would overwrite'),viewportSize:()=>({width:1440,height:900})};await assert.rejects(capture(page,path.dirname(stagePath),'layout-ready',{}),{code:'EEXIST'});assert.deepEqual(fs.readFileSync(stagePath),before);assert.throws(()=>writeJson(root,'report.json',{}),{code:'EEXIST'});assert.throws(()=>writeJson(root,'../outside.json',{}));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
for(const [name,change]of Object.entries({
 'missing original PNG':root=>fs.unlinkSync(path.join(root,'tests',cases[0].id,'payment-open.png')),
 'wrong dimension receipt':root=>mutate(root,'tests/'+cases[0].id+'/payment-open.json',r=>r.viewport.width=390),
 'wrong capture hash':root=>mutate(root,'tests/'+cases[0].id+'/payment-open.json',r=>r.sha256='bad'),
 'wrong nonce':root=>mutate(root,'tests/'+cases[0].id+'/layout-geometry.json',r=>r.nonce='other'),
 'clipped last geometry':root=>mutate(root,'tests/'+cases[0].id+'/layout-geometry.json',r=>r.controls[0].samples.at(-1).clips[0].right=1),
 'geometry wrong viewport':root=>mutate(root,'tests/'+cases[0].id+'/layout-geometry.json',r=>r.controls[0].samples.forEach(v=>v.viewportWidth=2000)),
 'unstable geometry':root=>mutate(root,'tests/'+cases[0].id+'/layout-geometry.json',r=>{r.controls[0].samples[0].x++;r.controls[0].samples[0].right++;}),
 'layout wrong viewport':root=>mutate(root,'tests/'+cases[0].id+'/layout-geometry.json',r=>r.layouts[0].height=1000),
 'missing read-only total':root=>mutate(root,'tests/'+cases[0].id+'/layout-geometry.json',r=>r.controls=r.controls.filter(c=>c.name!=='cart-total')),
 'hidden read-only total':root=>mutate(root,'tests/'+cases[0].id+'/layout-geometry.json',r=>r.controls.find(c=>c.name==='cart-total').samples.forEach(v=>v.visible=false)),
 'layout/visual viewport mismatch':root=>mutate(root,'tests/'+cases[0].id+'/layout-geometry.json',r=>r.layouts[0].visualViewport.width=980),
 'wrong mobile touch mode':root=>mutate(root,'tests/'+cases[1].id+'/layout-geometry.json',r=>r.layouts[0].touchPoints=0),
 'missing selected control':root=>mutate(root,'tests/'+cases[0].id+'/layout-geometry.json',r=>r.controls.pop()),
 'extra duplicate stage':root=>{const dir=path.join(root,'tests',cases[0].id);fs.mkdirSync(path.join(dir,'replay'));for(const suffix of ['png','json'])fs.copyFileSync(path.join(dir,'layout-ready.'+suffix),path.join(dir,'replay/layout-ready.'+suffix));},
}))test('actual postprocessor rejects '+name,async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'layout-negative-'));try{await populate(root);change(root);assert.throws(()=>inspectEvidence(root,nonce));}finally{fs.rmSync(root,{recursive:true,force:true});}});
function mutate(root,file,change){const target=path.join(root,file),value=JSON.parse(fs.readFileSync(target));change(value);fs.writeFileSync(target,JSON.stringify(value));}
test('failure PNG preserves original writer errors and no receipt fabricates a missing screenshot',async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'layout-failed-png-'));try{const primary=new Error('synthetic screenshot failure');await assert.rejects(capture({evaluate:async()=>{},screenshot:async()=>{throw primary}},root,'failed-control',{}),e=>e===primary);assert.deepEqual(fs.readdirSync(root),[]);}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('actual parent uses unchanged drain-before-snapshot and scoped cleanup, source ownership and token-safe observer',()=>{
 const parent=source('../../../backend/scripts/pos-layout-browser-fixture.ts'),runner=source('./run.mjs'),fixture=source('./fixtures.ts');
 assert.ok(parent.indexOf('outer.use(createGuard(')<parent.indexOf('outer.use(app)'));const final=parent.slice(parent.indexOf('await finalizeFixture({'));let last=-1;for(const name of ['owned-http-drain','after-snapshot','exact-fixture-cleanup','database-disconnect','private-bootstrap-removal','api-ledger-write','database-receipt-write','signal-disposal']){const at=final.indexOf(`'${name}':`);assert.ok(at>last);last=at;}
 assert.match(final,/'after-snapshot': async \(\) => \{ assert.equal\(httpDrainedBeforeSnapshot, true\)/);assert.match(final,/'exact-fixture-cleanup': async \(\) => \{\s+assert.equal\(httpDrainedBeforeSnapshot, true\)/);
 for(const s of ['assertSource();','assertOwnership(','assertService(','inspectEvidence(output,nonce)','cleanupRunProcesses(scope)'])assert.ok(runner.includes(s),s);
 assert.ok(runner.indexOf("write('accepted.json', accepted)")>runner.indexOf("write('run-cleanup.json', cleanup)"));assert.ok(runner.indexOf('publishEvidence(state, output')>runner.indexOf("write('completion.json'"));assert.equal(runner.split("write('accepted.json', accepted)").length,2);
 assert.ok(!parent.includes('signAccessToken'));assert.ok(!parent.includes('req.originalUrl'));assert.ok(!fixture.includes('localStorage.setItem'));assert.ok(fixture.indexOf('endEntry(state);')<fixture.indexOf('await context.close()'));assert.ok(fixture.indexOf('await capture(page')<fixture.indexOf('await context.close()'));
});
test('new step/config and actual driver preserve finite budget and genuine pointer actions, not DOM/force/scale substitutions',()=>{
 const cfg=source('../layout-native.config.mts'),spec=source('./layout.spec.ts'),yaml=source('../../../../../.github/workflows/ci.yml');
 for(const text of ['workers: 1','retries: 0','forbidOnly: true','globalTimeout: 150_000','chromiumSandbox: true',"trace: 'off'","video: 'off'",'reuseExistingServer: false'])assert.ok(cfg.includes(text));
 assert.equal(requestLimit,120);assert.equal(requestSpacingMs,550);assert.equal(nativeDeadlineMs,150000);assert.equal((requestLimit-1)*requestSpacingMs,65450);assert.ok((requestLimit-1)*requestSpacingMs<nativeDeadlineMs);
 for(const text of ['await control.tap()','await control.click()','await page.mouse.wheel','await page.keyboard.press(\'Tab\')','await expect(checkout).toBeFocused()','await expect(split).toBeFocused()','await expect(shift).toBeFocused()','readCart(cart)'])assert.ok(spec.includes(text),text);
 for(const pattern of [/force:\s*true/,/\.scrollIntoView\(/,/\.dispatchEvent\(/,/\.evaluate\([^\n]*\.click\(/,/document\.body\.style/])assert.equal(pattern.test(spec),false);
 const worker=yaml.slice(yaml.indexOf('  pos-sku-acceptance:'),yaml.indexOf('  batch-audit:'));assert.match(worker,/timeout-minutes: 20/);assert.match(worker,/id: layout_native\n        timeout-minutes: 4/);assert.ok(worker.includes('always() && steps.layout_native.outputs.evidence_dir'));assert.ok(!worker.includes('continue-on-error:'));assert.ok(!worker.includes('include-hidden-files: true'));
});
test('raw table inventory remains all mapped production tables',()=>{const schema=source('../../../backend/prisma/schema.prisma');assert.deepEqual([...schema.matchAll(/@@map\("([a-z_]+)"\)/g)].map(m=>m[1]).sort(),rawTables);});
