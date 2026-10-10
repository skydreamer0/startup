// A15: two about:blank pages only; no POS/API/DB or synthetic visibility events.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomUUID, createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {processOwner} from '../ui-evidence/owned-process.mjs';
import {createRunScope, cleanupRunProcesses} from './owned-run.mjs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {spawn, execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const script=fileURLToPath(import.meta.url);
const root=path.resolve(path.dirname(script),'../../../../..');
const worker=process.argv[2]==='--worker';
const out=worker?process.argv[3]:null;
if(!worker)await coordinator();
else await probe();

async function probe(){
const chrome=process.env.PROBE_CHROME_PATH??'/opt/google/chrome/chrome';
const pwEntry=path.resolve(path.dirname(script),'../../node_modules/@playwright/test');
const require=createRequire(import.meta.url);
const result={startedAt:new Date().toISOString(),scope:'two blank pages; diagnostic only',node:process.version,chromePath:chrome,display:process.env.DISPLAY??null,arms:[],blockers:[]};
let chromium;
try {result.playwright=require(pwEntry+'/package.json').version;({chromium}=require(pwEntry));} catch(error){result.blockers.push('Locked Playwright unavailable: '+error.message);}
if(result.playwright!=='1.63.0')result.blockers.push('Requires locked Playwright1.63.0');
if(!process.version.startsWith('v22.'))result.blockers.push('Requires Node22');
if(!process.env.DISPLAY)result.blockers.push('No owned headed DISPLAY; Xvfb/display required');
try {result.chrome=execFileSync(chrome,['--version'],{encoding:'utf8',timeout:5000}).trim();if(!/^Google Chrome 154\.0\.8037\.97\b/.test(result.chrome))result.blockers.push('Requires official Google Chrome154.0.8037.97; no browser substitution');} catch(error){result.blockers.push('Official Chrome executable unavailable: '+error.message);}
const publish=()=>{fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');};
async function observe(page){
 if(page.url()!=='about:blank')throw new Error('Only blank pages permitted');
 await page.evaluate(()=>{window.__probeEvents=[];document.addEventListener('visibilitychange',event=>window.__probeEvents.push({utc:new Date().toISOString(),epochMs:Date.now(),performanceMs:performance.now(),eventTimeStamp:event.timeStamp,trusted:event.isTrusted,visibilityState:document.visibilityState,hasFocus:document.hasFocus()}));});
}
async function state(page){return page.evaluate(()=>({url:location.href,utc:new Date().toISOString(),epochMs:Date.now(),performanceMs:performance.now(),visibilityState:document.visibilityState,hasFocus:document.hasFocus(),events:window.__probeEvents}));}
async function identity(context,page){const session=await context.newCDPSession(page);try{const {targetInfo}=await session.send('Target.getTargetInfo');const window=await session.send('Browser.getWindowForTarget',{targetId:targetInfo.targetId});return {targetId:targetInfo.targetId,browserContextId:targetInfo.browserContextId??'default',windowId:window.windowId,bounds:window.bounds};}finally{await session.detach();}}
async function until(page,wanted){const start=Date.now();while(Date.now()-start<3000){if((await state(page)).visibilityState===wanted)return true;await delay(50);}return false;}
async function cycle(context,arm,existing){
 const a=existing??await context.newPage();await observe(a);await a.bringToFront();await until(a,'visible');arm.A=await identity(context,a);
 const browserSession=await context.browser().newBrowserCDPSession();
 try{arm.actualArguments=(await browserSession.send('Browser.getBrowserCommandLine')).arguments;assert.equal(arm.actualArguments.some(arg=>/^--(?:no-sandbox|disable-setuid-sandbox)(?:=|$)/.test(arg)),false,'Sandbox bypass prohibited');}finally{await browserSession.detach();}
 const initial={phase:'A-front-before-B',A:await state(a)};arm.samples=[initial];
 let override;
 try{
  if(arm.mode==='existing-harness'){override=await context.newCDPSession(a);await override.send('Emulation.setFocusEmulationEnabled',{enabled:false});arm.newSessionDisableSentAt=new Date().toISOString();}
  const b=await context.newPage();await observe(b);arm.B=await identity(context,b);arm.sameWindow=arm.A.windowId===arm.B.windowId;
  await b.bringToFront();await until(a,'hidden');await delay(250);arm.samples.push({phase:'B-front',A:await state(a),B:await state(b)});
  await a.bringToFront();await until(a,'visible');await delay(250);arm.samples.push({phase:'A-front-return',A:await state(a),B:await state(b)});
  arm.pageCount=context.pages().length;if(arm.pageCount!==2)throw new Error('Requires exactly two pages');
  arm.aCycle=arm.samples.map(sample=>sample.A.visibilityState);
  const events=arm.samples[2].A.events;
  arm.nativeCycleObserved=JSON.stringify(arm.aCycle)===JSON.stringify(['visible','hidden','visible'])&&events.some(e=>e.trusted&&e.visibilityState==='hidden')&&events.some(e=>e.trusted&&e.visibilityState==='visible');
 }finally{if(override)await override.detach();}
}
async function existingArm(){const arm={mode:'existing-harness',configuration:'sandboxed headed launch, newContext, second session sends false'};result.arms.push(arm);let browser;try{browser=await chromium.launch({executablePath:chrome,headless:false,chromiumSandbox:true});const context=await browser.newContext({viewport:{width:1366,height:900}});await cycle(context,arm);}catch(error){arm.error=String(error.stack??error);}finally{if(browser){await browser.close();arm.browserClosed=true;}}}
async function nativeArm(){
 const arm={mode:'connect-noDefaults-default-context',configuration:'fresh owned profile, loopback CDP, existing default context, noDefaults:true'};result.arms.push(arm);
 const profile=path.join(path.dirname(out),'owned-profile');fs.mkdirSync(profile,{recursive:false});let child,browser,closed=false;
 try{
  arm.chromeArgs=['--enable-automation','--disable-background-networking','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','about:blank'];
  child=spawn(chrome,arm.chromeArgs,{stdio:['ignore','ignore','pipe']});arm.pid=child.pid;
  const stderr=[];child.stderr.on('data',v=>stderr.push(v.toString()));child.on('error',error=>{arm.spawnError=String(error);});child.once('close',()=>{closed=true;});
  const portFile=path.join(profile,'DevToolsActivePort'),deadline=Date.now()+10000;
  while(!fs.existsSync(portFile)&&Date.now()<deadline&&!closed)await delay(50);
  if(!fs.existsSync(portFile))throw new Error('Chrome CDP startup failed: '+stderr.join('').slice(-3000));
  const [port,endpoint]=fs.readFileSync(portFile,'utf8').trim().split('\n');if(!/^\d+$/.test(port)||!endpoint.startsWith('/devtools/browser/'))throw new Error('Invalid owned CDP endpoint');
  arm.cdpHost='127.0.0.1';browser=await chromium.connectOverCDP('ws://127.0.0.1:'+port+endpoint,{noDefaults:true,timeout:10000});
  if(browser.contexts().length!==1)throw new Error('Exactly one existing default context required');
  const context=browser.contexts()[0];if(context.pages().length!==1)throw new Error('Expected one initial blank page');
  await cycle(context,arm,context.pages()[0]);
 }catch(error){arm.error=String(error.stack??error);}finally{
  if(browser){
   try{const session=await browser.newBrowserCDPSession();await Promise.race([
    session.send('Browser.close'),delay(3000).then(()=>{throw new Error('Owned Chrome CDP close timed out');})]);}
   catch(error){arm.shutdownProtocolError=String(error);}
   for(let count=0;count<60&&!closed;count++)await delay(50);
   try{await browser.close();}catch(error){arm.disconnectError=String(error);}
  }
  arm.chromeClosedBeforeCoordinatorCleanup=closed;
  if(child&&!closed)arm.error??='Owned Chrome failed bounded graceful shutdown; parent cleanup required';
  // CDP browser.close disconnects; release worker handles so its owned parent
  // group/nonce cleanup can terminate the external Chrome without a deadlock.
  if(child){child.stderr.destroy();child.unref();}
  // The coordinator's nonce/PID-start-time cleanup owns any remaining Chrome.

 }
}
if(result.blockers.length){result.status='blocked-preflight';publish();console.log(JSON.stringify(result,null,2));process.exitCode=2;}
else{try{await existingArm();await nativeArm();result.status=result.arms.every(arm=>!arm.error&&!arm.cleanupError)?'diagnostic-complete':'diagnostic-error';}finally{result.nativeExpectedCyclePassed=result.arms[1]?.nativeCycleObserved===true&&!result.arms[1]?.error&&!result.arms[1]?.cleanupError;result.finishedAt=new Date().toISOString();publish();console.log(JSON.stringify(result,null,2));}if(result.status!=='diagnostic-complete')process.exitCode=1;}

}

async function coordinator(){
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',timeout:10000}).trim();
 assert.equal(process.env.GITHUB_ACTIONS,'true');
 assert.equal(process.env.RUNNER_ENVIRONMENT,'github-hosted');
 assert.equal(process.env.GITHUB_EVENT_NAME,'push');
 assert.equal(process.env.GITHUB_REF,'refs/heads/chore/pos-category-visibility-probe-20261010');
 assert.match(process.version,/^v22\./);
 assert.equal(process.env.DISPLAY,undefined,'Reject ambient DISPLAY');
 assert.equal(process.env.CATEGORY_UI_NONCE,undefined,'Coordinator must not inherit ownership nonce');
 const subject='78c802ee7e2a01dc869bc757e6448bab1d32b99a';
 const head=git('rev-parse','HEAD');assert.equal(head,process.env.GITHUB_SHA);assert.equal(git('rev-parse','HEAD^'),subject);
 assert.equal(git('status','--porcelain'),'');
 assert.equal(git('ls-files','-v').split('\n').some(line=>/^[a-zS]/.test(line)),false);
 const output=path.join(process.env.RUNNER_TEMP,`category-visibility-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
 fs.mkdirSync(output,{recursive:false});
 const write=(file,value)=>fs.writeFileSync(path.join(output,file),JSON.stringify(value,null,2)+'\n',{flag:'wx'});
 const nonce=randomUUID(),scope=await createRunScope(nonce),owner=processOwner();
 const files=[path.relative(root,script),'.github/workflows/category-visibility-probe.yml',
 'systems/enterprise-admin/pos-ui/e2e/category-native/owned-run.mjs','systems/enterprise-admin/pos-ui/e2e/ui-evidence/owned-process.mjs','systems/enterprise-admin/pnpm-lock.yaml'];
 write('source.json',{head,tree:git('rev-parse','HEAD^{tree}'),subject,runId:process.env.GITHUB_RUN_ID,
 attempt:process.env.GITHUB_RUN_ATTEMPT,event:process.env.GITHUB_EVENT_NAME,workflowSha:process.env.GITHUB_SHA,
 node:process.version,nonce,sandbox:true,scope:'A15 two blank pages per arm; no POS/API/DB; diagnostic only',
 hashes:Object.fromEntries(files.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')]))});
 const env=Object.fromEntries(['PATH','HOME','TMPDIR','RUNNER_TEMP','CI'].filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
 env.CATEGORY_UI_NONCE=nonce;
 const log=fs.openSync(path.join(output,'raw.log'),'wx');let phase=null,error=null,cleanup=null;
 try{
  phase=await owner.run('xvfb-run',['--auto-servernum','--server-args=-screen 0 1366x900x24 -nolisten tcp',process.execPath,script,'--worker',path.join(output,'result.json')],{cwd:root,env,stdio:['ignore',log,log]});
  assert.equal(phase.exitCode,0);assert.equal(phase.error,null);assert.equal(phase.signal,null);assert.equal(owner.cancelled,null);
  assert.equal(git('status','--porcelain'),'');assert.equal(git('rev-parse','HEAD'),head);
 }catch(problem){error=String(problem.stack??problem);}
 finally{
  try{cleanup=await cleanupRunProcesses(scope);write('cleanup.json',cleanup);
   if(owner.cancelled)error??=`Cancelled by ${owner.cancelled}`;
   fs.rmSync(path.join(output,'owned-profile'),{recursive:true,force:true});
   write('completion.json',{status:error?'diagnostic-error':'diagnostic-complete',phase,error,cancelled:owner.cancelled,
    quiescent:cleanup.quiescent,ownedProfileRemoved:!fs.existsSync(path.join(output,'owned-profile')),
    finishedAt:new Date().toISOString(),acceptance:'No Issue49 browser/API/DB acceptance claimed'});
   assert.ok(path.isAbsolute(output));assert.equal(/[\r\n]/.test(output),false);
   fs.appendFileSync(process.env.GITHUB_OUTPUT,`evidence_dir=${output}\n`);
  }finally{owner.dispose();fs.closeSync(log);}
 }
 if(error)process.exitCode=1;
 console.log(JSON.stringify({output,head,phase,error,cleanup},null,2));
}
