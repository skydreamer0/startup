import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const planDir = 'systems/enterprise-admin/infrastructure/plans/architecture-v2';
export const readJson = name => JSON.parse(fs.readFileSync(name, 'utf8'));
const hex = /^[0-9a-f]{40}$/;
const hash = /^[0-9a-f]{64}$/;
export const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export const overlaps = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
const list = value => Array.isArray(value) ? value : [];
const safePath = p => typeof p === 'string' && p.length > 0 && !path.isAbsolute(p) && !p.includes('\\') && !p.split('/').some(x => !x || x === '.' || x === '..') && !/[?*\x00]/.test(p);

// This intentionally validates only the documented evidence format, without dependencies,
// DB access, executing commands, loading .env, network calls or dispatching workers.
export function validateEvidence(e) {
  const errors = [];
  if (!e || typeof e !== 'object' || Array.isArray(e)) return ['evidence must be an object'];
  for (const key of ['id', 'taskId', 'command', 'executor', 'recordedAt', 'environment', 'scope', 'result']) {
    if (typeof e[key] !== 'string' || !e[key].trim()) errors.push(`evidence ${key} required`);
  }
  if (!/^AR-\d{2}$/.test(e.taskId)) errors.push('evidence taskId invalid');
  if (!Number.isFinite(Date.parse(e.recordedAt)) || !/Z$/.test(e.recordedAt)) errors.push('evidence time must be UTC ISO');
  if (!Array.isArray(e.checkIds) || !e.checkIds.length || e.checkIds.some(c => typeof c !== 'string' || !c)) errors.push('evidence checkIds required');
  if (!hex.test(e.subject?.sha) || !hex.test(e.subject?.tree)) errors.push('evidence requires full source SHA/tree');
  if (typeof e.subject?.dirty !== 'boolean') errors.push('evidence dirty flag required');
  if (!['PASS','FAIL','SKIP','NOT_RUN','BLOCKED'].includes(e.result)) errors.push('evidence result invalid');
  if (!(e.exitCode === null || Number.isInteger(e.exitCode))) errors.push('evidence exitCode must be integer or null');
  if (!Array.isArray(e.artifacts)) errors.push('evidence artifacts must be an array');
  for (const a of list(e.artifacts)) if (typeof a.uri !== 'string' || !a.uri || !hash.test(a.sha256)) errors.push('artifact URI and SHA256 required');
  if (['PASS','FAIL'].includes(e.result) && (e.exitCode === null || !list(e.artifacts).length)) errors.push('executed result needs exit code and artifact hash');
  if (e.result === 'PASS' && (e.exitCode !== 0 || e.subject?.dirty)) errors.push('PASS requires exit 0 and clean committed source');
  if (['NOT_RUN','BLOCKED','SKIP'].includes(e.result) && (typeof e.reason !== 'string' || !e.reason.trim())) errors.push('non-pass unexecuted result needs reason');
  if (['NOT_RUN','BLOCKED'].includes(e.result) && e.exitCode !== null) errors.push('unexecuted result cannot claim exit code');
  if (e.counts != null) {
    for (const key of ['passed','failed','skipped','notRun']) if (!Number.isInteger(e.counts[key]) || e.counts[key] < 0) errors.push('evidence counts must be nonnegative integers');
    if (e.result === 'PASS' && (e.counts.failed !== 0 || e.counts.skipped !== 0 || e.counts.notRun !== 0)) errors.push('PASS check cannot conceal failed/skipped/not-run cases; split records by scope');
  }
  if (!Array.isArray(e.limitations)) errors.push('evidence limitations must be an array');
  if (e.review != null && (typeof e.review.reviewer !== 'string' || !e.review.reviewer || !hex.test(e.review.sha) || !['PASS','FAIL','NOT_RUN'].includes(e.review.result))) errors.push('review invalid');
  return errors;
}

export function integrationLockBlockers(task, tasks) {
  const byId=new Map(tasks.map(t=>[t.id,t])), seen=new Set();
  function visit(id){if(seen.has(id))return;seen.add(id);const t=byId.get(id);if(!t)return;for(const d of [...list(t.dependsOn),...list(t.integrationDependsOn)])visit(d);}
  for(const id of list(task.integrationDependsOn))visit(id);
  return [...seen].filter(id=>{const t=byId.get(id);return t && t.status!=='complete' && list(task.exclusiveLocks).some(l=>list(t.exclusiveLocks).includes(l));}).sort();
}

export function verifyManifest(m, evidence = []) {
  const errors = [];
  if (!m || typeof m !== 'object') return ['manifest must be an object'];
  if (m.schemaVersion !== 1 || m.schedulerMode !== 'read-only' || m.maxWorkers !== 3) errors.push('schemaVersion/read-only/three-worker boundary invalid');
  if (!hex.test(m.sourceHead) || !hex.test(m.sourceTree) || !hex.test(m.master?.sha) || !hex.test(m.master?.tree)) errors.push('baseline requires full SHAs');
  const tasks = list(m.tasks), ids = new Set(tasks.map(t => t.id));
  if (!tasks.length || ids.size !== tasks.length) errors.push('task IDs missing or duplicated');
  const locks = new Map(list(m.locks).map(l => [l.id,l]));
  if (locks.size !== list(m.locks).length) errors.push('duplicate locks');
  for (const l of locks.values()) if (!l.owner || !list(l.paths).length || l.paths.some(p => !safePath(p))) errors.push(`invalid lock ${l.id}`);
  for (const id of ['schema-migrations','package-locks','composition']) if (locks.get(id)?.owner !== 'integration-owner') errors.push(`${id} must have single integration owner`);
  const decisions = new Map(list(m.decisions).map(d => [d.id,d]));
  const gates = new Map(list(m.activationGates).map(g => [g.id,g]));
  if (decisions.size !== 9 || gates.size !== 8) errors.push('D01-D09 and G0-G7 required');
  for (let i=1;i<=9;i++) if (!decisions.has(`D${String(i).padStart(2,'0')}`)) errors.push(`missing D${i}`);
  for (let i=0;i<8;i++) if (!gates.has(`G${i}`)) errors.push(`missing G${i}`);
  for (const d of decisions.values()) {
    if (!['UNAPPROVED','APPROVED'].includes(d.status) || d.scope !== 'activation-only' || d.testProfile !== 'TEST_ONLY') errors.push(`invalid decision ${d.id}`);
    if (d.status === 'APPROVED' && (typeof d.approvalSource !== 'string' || !d.approvalSource.startsWith('https://'))) errors.push(`${d.id} missing explicit approval source`);
  }
  if (!Array.isArray(evidence)) errors.push('evidence ledger must be an array');
  for (const g of gates.values()) if (!['PASS','FAIL','SKIP','NOT_RUN','BLOCKED'].includes(g.status)) errors.push(`invalid gate status ${g.id}`);
  for (const e of list(evidence)) errors.push(...validateEvidence(e).map(x => `${e?.id ?? 'unknown'}: ${x}`));
  if (new Set(list(evidence).map(e => e.id)).size !== list(evidence).length) errors.push('duplicate evidence IDs');
  const byEvidence = new Map(list(evidence).map(e => [e.id,e]));
  for (const g of gates.values()) {
    if (!Array.isArray(g.completionEvidence) || !list(g.requiredChecks).length) errors.push(`${g.id} requires gate check/evidence declarations`);
    if (g.status === 'PASS') {
      if (!hex.test(g.verificationSubject?.sha) || !hex.test(g.verificationSubject?.tree) || typeof g.scope !== 'string' || !g.scope.trim() || !g.reviewer) errors.push(`${g.id} PASS requires frozen source, scope and reviewer`);
      const proofs=list(g.completionEvidence).map(id=>byEvidence.get(id));
      for (const check of list(g.requiredChecks)) if (!proofs.some(e=>e && !validateEvidence(e).length && e.result==='PASS' && e.subject.sha===g.verificationSubject?.sha && e.subject.tree===g.verificationSubject?.tree && e.scope===g.scope && list(e.gateIds).includes(g.id) && e.checkIds.includes(check.id) && e.review?.result==='PASS' && e.review.sha===e.subject.sha && e.review.reviewer===g.reviewer && e.review.reviewer!==e.executor)) errors.push(`${g.id} missing exact scoped reviewed PASS for ${check.id}`);
    }
  }
  const allChecks = new Set();
  for (const t of tasks) {
    if (!/^AR-\d{2}$/.test(t.id) || t.issue !== 180 + Number(t.id?.slice(3))) errors.push(`invalid task identity ${t.id}`);
    for (const k of ['dependsOn','integrationDependsOn','substeps','sourcePaths','newPaths','writePaths','exclusiveLocks','requiredChecks','decisionGates','activationGates','completionEvidence']) if (!Array.isArray(t[k])) errors.push(`${t.id} ${k} must be an array`);
    for (const d of [...list(t.dependsOn),...list(t.integrationDependsOn)]) if (!ids.has(d) || d===t.id) errors.push(`${t.id} unknown/self dependency ${d}`);
    for (const p of [...list(t.sourcePaths),...list(t.newPaths),...list(t.writePaths)]) if (!safePath(p)) errors.push(`${t.id} unsafe path ${p}`);
    for (const l of list(t.exclusiveLocks)) if (!locks.has(l)) errors.push(`${t.id} unknown lock ${l}`);
    for (const [id,l] of locks) if (list(t.writePaths).some(p => l.paths.some(q => overlaps(p,q))) && !list(t.exclusiveLocks).includes(id)) errors.push(`${t.id} missing overlapping lock ${id}`);
    for (const d of list(t.decisionGates)) if (!decisions.has(d)) errors.push(`${t.id} unknown decision ${d}`);
    for (const g of list(t.activationGates)) if (!gates.has(g)) errors.push(`${t.id} unknown activation gate ${g}`);
    if (!['planned','active','complete','paused'].includes(t.status)) errors.push(`${t.id} invalid status`);
    if (!['PASS','FAIL','SKIP','NOT_RUN','BLOCKED'].includes(t.verification)) errors.push(`${t.id} invalid verification`);
    if (!['BLOCKED','READY'].includes(t.activation)) errors.push(`${t.id} invalid activation`);
    if (!list(t.requiredChecks).length) errors.push(`${t.id} missing required checks`);
    for (const c of list(t.requiredChecks)) {
      if (!c.id || !c.description || allChecks.has(c.id)) errors.push(`${t.id} duplicate/empty check`);
      allChecks.add(c.id);
    }
    if (t.status === 'complete') {
      if (!hex.test(t.verificationSubject?.sha) || !hex.test(t.verificationSubject?.tree)) errors.push(`${t.id} requires one frozen verification subject`);
      if (!t.owner || !t.reviewer || t.owner===t.reviewer || t.verification!=='PASS') errors.push(`${t.id} completion requires independent reviewed verification`);
      const proofs=list(t.completionEvidence).map(id=>byEvidence.get(id));
      for (const c of list(t.requiredChecks)) if (!proofs.some(e => e && !validateEvidence(e).length && e.taskId===t.id && e.subject.sha===t.verificationSubject?.sha && e.subject.tree===t.verificationSubject?.tree && e.checkIds.includes(c.id) && e.result==='PASS' && e.review?.result==='PASS' && e.review.sha===e.subject.sha && e.review.reviewer===t.reviewer && e.review.reviewer!==e.executor)) errors.push(`${t.id} missing exact reviewed PASS for ${c.id}`);
      for (const d of [...list(t.dependsOn),...list(t.integrationDependsOn)]) if (tasks.find(v=>v.id===d)?.status!=='complete') errors.push(`${t.id} completion has unfinished dependency ${d}`);
    } else if (t.verification === 'PASS') errors.push(`${t.id} task verification PASS requires completed acceptance, not a focused green check`);
    if (t.activation==='READY' && (!hex.test(t.activationSubject?.sha) || !hex.test(t.activationSubject?.tree) || typeof t.activationScope!=='string' || !t.activationScope.trim() || list(t.activationGates).some(id=>{const g=gates.get(id);return g?.verificationSubject?.sha!==t.activationSubject.sha || g?.verificationSubject?.tree!==t.activationSubject.tree || g?.scope!==t.activationScope;}))) errors.push(`${t.id} activation needs matching scoped gate subject`);
    if (t.activation==='READY' && (t.status!=='complete' || t.decisionGates.some(d=>decisions.get(d)?.status!=='APPROVED') || t.activationGates.some(g=>gates.get(g)?.status!=='PASS'))) errors.push(`${t.id} activation cannot bypass incomplete evidence or decisions`);
  }
  const visiting=new Set(), visited=new Set();
  function visit(id) { if(visiting.has(id)){errors.push(`dependency cycle at ${id}`);return;} if(visited.has(id))return;visiting.add(id); const t=tasks.find(t=>t.id===id); for(const d of [...list(t?.dependsOn),...list(t?.integrationDependsOn)])if(ids.has(d))visit(d);visiting.delete(id);visited.add(id); }
  for(const t of tasks)visit(t.id);
  for(let i=0;i<tasks.length;i++)for(let j=i+1;j<tasks.length;j++){
    const a=tasks[i],b=tasks[j];
    if(list(a.writePaths).some(p=>list(b.writePaths).some(q=>overlaps(p,q))) && !list(a.exclusiveLocks).some(l=>list(b.exclusiveLocks).includes(l)))errors.push(`unlocked write overlap ${a.id}/${b.id}`);
  }
  const active=tasks.filter(t=>t.status==='active');
  if(active.length>m.maxWorkers)errors.push('more than three active workers');
  for(const t of active)if(integrationLockBlockers(t,tasks).length)errors.push(`${t.id} active would hold locks while waiting on integration prerequisites: ${integrationLockBlockers(t,tasks).join(',')}`);
  for(const t of active)if(list(t.dependsOn).some(d=>tasks.find(v=>v.id===d)?.status!=='complete'))errors.push(`${t.id} active before dependency completion`);
  for(let i=0;i<active.length;i++)for(let j=i+1;j<active.length;j++)if(active[i].exclusiveLocks.some(l=>active[j].exclusiveLocks.includes(l)))errors.push(`active lock conflict ${active[i].id}/${active[j].id}`);
  return errors;
}

export function verifyInventory(inventory, requirements, m, checkSource = false) {
  const errors=[], ids=new Set(m.tasks.map(t=>t.id)), checks=new Set(m.tasks.flatMap(t=>t.requiredChecks.map(c=>c.id)));
  if(inventory.sourceHead!==m.sourceHead || inventory.sourceTree!==m.sourceTree)errors.push('inventory source differs');
  for(const [model,info] of Object.entries(inventory.models)) if(!info.owner || !info.destination.length || info.destination.some(d=>!ids.has(d)))errors.push(`unowned model ${model}`);
  const routeKeys=new Set();
  for(const r of inventory.routes){const key=`${r.method} ${r.path}`;if(routeKeys.has(key)||!r.owner||!r.destination.length||r.destination.some(d=>!ids.has(d)))errors.push(`unowned/duplicate route ${key}`);routeKeys.add(key);}
  const reqIds=new Set(); const counts={};
  for(const r of requirements.requirements){if(reqIds.has(r.id)||!r.owners.length||r.owners.some(o=>!ids.has(o))||!r.requiredChecks.length||r.requiredChecks.some(c=>!checks.has(c))||!hash.test(r.sourceTextSha256))errors.push(`requirement incomplete ${r.id}`);reqIds.add(r.id);counts[r.issue]=(counts[r.issue]||0)+1;}
  if(JSON.stringify(Object.entries(counts).sort())!==JSON.stringify(Object.entries(requirements.counts).sort()))errors.push('requirements count mismatch');
  const snapshotPath=path.join(root,planDir,'source-snapshot.json');
  const snapshot=readJson(snapshotPath), sources=readJson(path.join(root,planDir,'requirements-sources.json'));
  if (!hash.test(m.sourceSnapshotSha256) || digest(fs.readFileSync(snapshotPath))!==m.sourceSnapshotSha256) errors.push('frozen source snapshot hash mismatch');
  const expected=[];
  for(const source of sources.sources){
    const authority=snapshot.issues.find(s=>s.issue===source.issue);
    if(!authority || source.url!==authority.url || digest(source.body)!==authority.sha256)errors.push(`source body hash mismatch #${source.issue}`);
    let count=0,section='';
    source.body.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/).forEach((line,index)=>{
      if(line.startsWith('#'))section=line.replace(/^[# ]+/,'').trim();
      const match=line.match(/^\s*[-*] \[([ xX])\]\s*(.*)/);if(!match)return;
      count++;expected.push({id:`R${source.issue}-${String(count).padStart(3,'0')}`,issue:source.issue,source:source.url,sourceLine:index+1,section,text:match[2],sourceChecked:match[1].toLowerCase()==='x',sourceTextSha256:digest(line)});
    });
    if(count!==authority?.checklistCount)errors.push(`source checklist count mismatch #${source.issue}`);
  }
  const expectedSources=snapshot.issues.filter(s=>s.checklistCount!==null).map(s=>s.issue).sort((a,b)=>a-b), actualSources=sources.sources.map(s=>s.issue).sort((a,b)=>a-b);
  if(JSON.stringify(expectedSources)!==JSON.stringify(actualSources))errors.push('requirement source issue coverage mismatch');
  if(expected.length!==requirements.requirements.length)errors.push('source requirement set mismatch');
  const actualById=new Map(requirements.requirements.map(r=>[r.id,r]));
  for(const e of expected){const r=actualById.get(e.id);if(!r || Object.keys(e).some(k=>r[k]!==e[k]))errors.push(`source requirement mismatch ${e.id}`);}
  if(checkSource) {
    const backend=path.join(root,'systems/enterprise-admin/backend');
    const app=fs.readFileSync(path.join(backend,'src/app.ts'),'utf8');
    const imports=new Map([...app.matchAll(/import (\w+) from '([^']+)'/g)].map(m=>[m[1],m[2]]));
    const found=['GET /health','GET /ready'];
    for(const m of app.matchAll(/apiRouter\.use\('([^']+)', (\w+)\)/g)){
      const route=fs.readFileSync(path.resolve(backend,'src',`${imports.get(m[2])}.ts`),'utf8');
      for(const r of route.matchAll(/router\.(get|post|put|patch|delete)\(\s*(['"])(.*?)\2/gs))found.push(`${r[1].toUpperCase()} /api/v1/admin${m[1]}${r[3]}`);
    }
    if(JSON.stringify(found.sort())!==JSON.stringify([...routeKeys].sort()))errors.push('mounted endpoint coverage mismatch');
    const modelNames=[...fs.readFileSync(path.join(backend,'prisma/schema.prisma'),'utf8').matchAll(/^model (\w+) \{/gm)].map(m=>m[1]);
    if(JSON.stringify(modelNames.sort())!==JSON.stringify(Object.keys(inventory.models).sort()))errors.push('schema model coverage mismatch');
    function sourceFiles(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.name==='__tests__'?[]:e.isDirectory()?sourceFiles(path.join(dir,e.name)):e.name.endsWith('.ts')&&!/\.(test|spec)\.ts$/.test(e.name)?[path.relative(root,path.join(dir,e.name)).split(path.sep).join('/')]:[]);}
    const actual=sourceFiles(path.join(backend,'src')).sort(), indexed=inventory.sourceFiles.map(f=>f.path).filter(p=>p.startsWith('systems/enterprise-admin/backend/src/')).sort();
    if(JSON.stringify(actual)!==JSON.stringify(indexed))errors.push('runtime source coverage mismatch');
  }
  if(checkSource)for(const f of inventory.sourceFiles){if(!safePath(f.path)||!hash.test(f.sha256)){errors.push('unsafe source fingerprint');continue;}const absolute=path.join(root,f.path);if(!fs.existsSync(absolute)||digest(fs.readFileSync(absolute))!==f.sha256)errors.push(`source drift ${f.path}`);}
  return errors;
}

export function loadPlan(manifestPath = path.join(root,planDir,'manifest.json'), evidencePath=path.join(root,planDir,'evidence.json')) {
  return {manifest:readJson(manifestPath), evidence:readJson(evidencePath)};
}
export function parseArgs(args){const opts={};for(let i=0;i<args.length;i++){if(['--manifest','--evidence'].includes(args[i])){if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`${args[i]} needs a path`);opts[args[i].slice(2)]=path.resolve(args[++i]);}else if(args[i]==='--check-source')opts.checkSource=true;else throw Error(`Unknown option ${args[i]}`);}return opts;}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try { const args=parseArgs(process.argv.slice(2));if(args.manifest && args.checkSource)throw Error('--manifest cannot be combined with --check-source; source verification requires the repository baseline');const {manifest:m,evidence}=loadPlan(args.manifest,args.evidence);const errors=verifyManifest(m,evidence);if(!args.manifest)errors.push(...verifyInventory(readJson(path.join(root,planDir,'source-inventory.json')),readJson(path.join(root,planDir,'requirements.json')),m,args.checkSource)); console.log(JSON.stringify({result:errors.length?'FAIL':'PASS',tasks:m.tasks.length,errors,sourceChecked:Boolean(args.checkSource)},null,2));process.exitCode=errors.length?1:0;}catch(e){console.error(e.message);process.exitCode=1;}
}
