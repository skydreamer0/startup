import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { root,planDir,readJson,verifyManifest,verifyInventory,validateEvidence,overlaps,digest,configuredCliEntries,verifyCliInventory } from './verify-plan.mjs';
import { schedule } from './plan.mjs';
const fresh=()=>readJson(path.join(root,planDir,'manifest.json'));
const evidence=(task,checks)=>({id:`test-${task}`,taskId:task,checkIds:checks,subject:{sha:'a'.repeat(40),tree:'b'.repeat(40),dirty:false},command:'synthetic fixture only',executor:'author',recordedAt:'2026-11-07T00:00:00Z',environment:'TEST_ONLY',scope:'scheduler test, not pharmacy acceptance',result:'PASS',exitCode:0,artifacts:[{uri:'fixture://synthetic',sha256:'c'.repeat(64)}],limitations:['Synthetic validator test only'],review:{reviewer:'reviewer',sha:'a'.repeat(40),result:'PASS'}});
function finish(t){t.status='complete';t.verification='PASS';t.owner='author';t.reviewer='reviewer';const e=evidence(t.id,t.requiredChecks.map(c=>c.id));t.completionEvidence=[e.id];t.verificationSubject={sha:e.subject.sha,tree:e.subject.tree};return e;}
const fails=(mutate,pattern)=>{const m=fresh();mutate(m);assert.match(verifyManifest(m).join('\n'),pattern);};
test('checked baseline is valid and inventory source matches',()=>{const m=fresh();assert.deepEqual(verifyManifest(m),[]);assert.deepEqual(verifyInventory(readJson(path.join(root,planDir,'source-inventory.json')),readJson(path.join(root,planDir,'requirements.json')),m,true),[]);});
test('current baseline stays active; no dependency is dispatched early',()=>{const p=schedule(fresh());assert.deepEqual(p.active,['AR-00']);assert.deepEqual(p.ready,[]);assert.equal(p.blocked.length,23);assert(p.activation.every(a=>a.status==='BLOCKED'));});
test('readiness does not mutate manifest',()=>{const m=fresh(),before=JSON.stringify(m);schedule(m);assert.equal(JSON.stringify(m),before);});
test('engineering readiness does not wait for an unrelated policy',()=>{const m=fresh();m.tasks=m.tasks.slice(0,2);const e=finish(m.tasks[0]);m.tasks[1].decisionGates=['D01'];const p=schedule(m,[e]);assert.deepEqual(p.ready,['AR-01']);assert.deepEqual(p.activation[1].decisionBlocked,['D01']);assert.equal(p.activation[1].status,'BLOCKED');});
test('integration dependency is separate from contract start',()=>{const m=fresh();m.tasks=m.tasks.slice(0,3);const e=finish(m.tasks[0]);m.tasks[1].integrationDependsOn=['AR-02'];m.tasks[1].writePaths=['isolated/contract'];m.tasks[1].exclusiveLocks=[];m.tasks[2].dependsOn=['AR-00'];const p=schedule(m,[e]);assert.deepEqual([...p.ready].sort(),['AR-01','AR-02']);assert.deepEqual(p.activation.find(t=>t.id==='AR-01').integrationBlocked,['AR-02']);});
test('scheduler caps suggestions at three and respects active slots',()=>{const m=fresh();m.tasks=m.tasks.slice(0,5);m.tasks.forEach((t,i)=>{t.dependsOn=[];t.integrationDependsOn=[];t.writePaths=[`isolated/${i}`];t.exclusiveLocks=[];});const p=schedule(m);assert.equal(p.ready.length,2);assert(p.blocked.some(t=>t.reasons.includes('WORKER_LIMIT')));});
test('scheduler reserves locks for suggested work as well as active work',()=>{const m=fresh();m.tasks=m.tasks.slice(0,3);const e=finish(m.tasks[0]);m.tasks[2].dependsOn=['AR-00'];const p=schedule(m,[e]);assert.deepEqual(p.ready,['AR-01']);assert(p.blocked[0].reasons.some(r=>r.startsWith('LOCK:')));});
test('unknown dependency rejected',()=>fails(m=>m.tasks[1].dependsOn=['AR-99'],/unknown\/self dependency/));
test('self dependency rejected',()=>fails(m=>m.tasks[1].dependsOn=['AR-01'],/unknown\/self dependency/));
test('cycles include integration edges',()=>fails(m=>m.tasks[0].integrationDependsOn=['AR-23'],/dependency cycle/));
test('duplicate IDs rejected',()=>fails(m=>m.tasks.push(structuredClone(m.tasks[0])),/duplicated/));
test('missing declared overlap lock rejected',()=>fails(m=>m.tasks[0].exclusiveLocks=[],/missing overlapping lock/));
test('unregistered shared write collision rejected',()=>fails(m=>{m.tasks[0].writePaths=['unregistered/shared'];m.tasks[1].writePaths=['unregistered/shared'];m.tasks[0].exclusiveLocks=[];m.tasks[1].exclusiveLocks=[];},/unlocked write overlap/));
test('prefix collision is segment based',()=>{assert(overlaps('a/b','a/b/c'));assert(!overlaps('a/b','a/bc'));});
test('path traversal rejected',()=>fails(m=>m.tasks[0].writePaths=['../../etc/passwd'],/unsafe path/));
test('absolute path rejected',()=>fails(m=>m.tasks[0].sourcePaths=['/tmp/test'],/unsafe path/));
test('wildcard scope must be expanded explicitly',()=>fails(m=>m.tasks[0].writePaths=['backend/**'],/unsafe path/));
test('shared core lock owner cannot vary',()=>fails(m=>m.locks.find(l=>l.id==='schema-migrations').owner='another-writer',/single integration owner/));
test('four active workers rejected',()=>fails(m=>m.tasks.slice(0,4).forEach(t=>{t.status='active';t.dependsOn=[];}),/more than three/));
test('active overlapping writer rejected',()=>fails(m=>{m.tasks[1].status='active';m.tasks[1].dependsOn=[];},/active lock conflict/));
test('active before prerequisite completion rejected',()=>fails(m=>m.tasks[1].status='active',/active before dependency/));
test('complete task without evidence rejected',()=>fails(m=>{m.tasks[0].status='complete';m.tasks[0].verification='PASS';m.tasks[0].owner='a';m.tasks[0].reviewer='b';},/missing exact reviewed PASS/));
test('author self-review is not independent acceptance',()=>{const m=fresh(),e=finish(m.tasks[0]);m.tasks[0].reviewer='author';e.review.reviewer='author';assert.match(verifyManifest(m,[e]).join('\n'),/independent|reviewed PASS/);});
test('review of another SHA does not complete a check',()=>{const m=fresh(),e=finish(m.tasks[0]);e.review.sha='d'.repeat(40);assert.match(verifyManifest(m,[e]).join('\n'),/missing exact reviewed PASS/);});
test('focused pass does not set task PASS',()=>fails(m=>m.tasks[0].verification='PASS',/completed acceptance/));
test('unapproved decision cannot activate a task',()=>fails(m=>m.tasks[8].activation='READY',/activation cannot bypass/));
test('policy approval requires a source',()=>fails(m=>m.decisions[0].status='APPROVED',/explicit approval source/));
test('missing decision and gate rejected',()=>fails(m=>{m.decisions.pop();m.activationGates.pop();},/D01-D09|missing G/));
test('unknown policy gate rejected',()=>fails(m=>m.tasks[0].decisionGates=['D99'],/unknown decision/));
test('evidence accepts its complete executed fixture',()=>assert.deepEqual(validateEvidence(evidence('AR-00',['AR-00-TOOLS'])),[]));
test('PASS requires exit zero',()=>{const e=evidence('AR-00',['x']);e.exitCode=1;assert.match(validateEvidence(e).join('\n'),/exit 0/);});
test('PASS cannot hide dirty source',()=>{const e=evidence('AR-00',['x']);e.subject.dirty=true;assert.match(validateEvidence(e).join('\n'),/clean committed source/);});
test('executed evidence requires artifact hash',()=>{const e=evidence('AR-00',['x']);e.artifacts=[{uri:'log',sha256:'bad'}];assert.match(validateEvidence(e).join('\n'),/SHA256/);});
test('short SHA is rejected',()=>{const e=evidence('AR-00',['x']);e.subject.sha='abcdef';assert.match(validateEvidence(e).join('\n'),/full source/);});
test('NOT_RUN has no pretend exit code',()=>{const e=evidence('AR-00',['x']);e.result='NOT_RUN';e.reason='not run';assert.match(validateEvidence(e).join('\n'),/cannot claim exit code/);});
test('SKIP cannot complete required acceptance',()=>{const m=fresh(),e=finish(m.tasks[0]);e.result='SKIP';e.reason='not applicable';assert.match(verifyManifest(m,[e]).join('\n'),/missing exact reviewed PASS/);});
test('missing source requirement owner is rejected',()=>{const m=fresh(),r=readJson(path.join(root,planDir,'requirements.json'));r.requirements[0].owners=[];assert.match(verifyInventory(readJson(path.join(root,planDir,'source-inventory.json')),r,m).join('\n'),/requirement incomplete/);});
test('lost requirement row is rejected',()=>{const m=fresh(),r=readJson(path.join(root,planDir,'requirements.json'));r.requirements.pop();assert.match(verifyInventory(readJson(path.join(root,planDir,'source-inventory.json')),r,m).join('\n'),/count mismatch/);});
test('unowned model is rejected',()=>{const m=fresh(),i=readJson(path.join(root,planDir,'source-inventory.json'));i.models.Product.destination=[];assert.match(verifyInventory(i,readJson(path.join(root,planDir,'requirements.json')),m).join('\n'),/unowned model/);});
test('source fingerprint drift is rejected',()=>{const m=fresh(),i=readJson(path.join(root,planDir,'source-inventory.json'));i.sourceFiles[0].sha256='0'.repeat(64);assert.match(verifyInventory(i,readJson(path.join(root,planDir,'requirements.json')),m,true).join('\n'),/source drift/);});
test('CLI refuses unknown and missing options',()=>{for(const args of [['--execute'],['--manifest']]){const r=spawnSync(process.execPath,['scripts/architecture/plan.mjs',...args],{cwd:root,encoding:'utf8'});assert.equal(r.status,1);}});
test('CLI plan and verification are deterministic read-only',()=>{const file=path.join(root,planDir,'manifest.json'),before=digest(fs.readFileSync(file));for(const script of ['plan.mjs','verify-plan.mjs']){const r=spawnSync(process.execPath,[`scripts/architecture/${script}`],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);JSON.parse(r.stdout);}assert.equal(digest(fs.readFileSync(file)),before);});

test('omitted mounted endpoint is rejected',()=>{const m=fresh(),i=readJson(path.join(root,planDir,'source-inventory.json'));i.routes.pop();assert.match(verifyInventory(i,readJson(path.join(root,planDir,'requirements.json')),m,true).join('\n'),/endpoint coverage mismatch/);});
test('omitted schema model is rejected',()=>{const m=fresh(),i=readJson(path.join(root,planDir,'source-inventory.json'));delete i.models.Tag;assert.match(verifyInventory(i,readJson(path.join(root,planDir,'requirements.json')),m,true).join('\n'),/model coverage mismatch/);});
test('omitted runtime source fingerprint is rejected',()=>{const m=fresh(),i=readJson(path.join(root,planDir,'source-inventory.json'));i.sourceFiles=i.sourceFiles.filter(f=>!f.path.endsWith('/app.ts'));assert.match(verifyInventory(i,readJson(path.join(root,planDir,'requirements.json')),m,true).join('\n'),/source coverage mismatch/);});

test('malformed evidence ledger rejected',()=>assert.match(verifyManifest(fresh(),{}).join('\n'),/ledger must be an array/));
test('PASS cannot hide failed or skipped subcases',()=>{for(const key of ['failed','skipped','notRun']){const e=evidence('AR-00',['x']);e.counts={passed:1,failed:0,skipped:0,notRun:0};e.counts[key]=1;assert.match(validateEvidence(e).join('\n'),/cannot conceal/);}});

test('integration lock prerequisites cannot deadlock AR09 and AR13/14',()=>{const m=fresh();const proofs=m.tasks.slice(0,9).map(finish);const p=schedule(m,proofs);assert(p.ready.includes('AR-13'));assert(!p.ready.includes('AR-09'));assert(p.blocked.find(t=>t.id==='AR-09').reasons.some(r=>r.startsWith('INTEGRATION_LOCK_PREREQUISITE:')));m.tasks[9].status='active';assert.match(verifyManifest(m,proofs).join('\n'),/hold locks while waiting/);});
test('evidence from seven different heads cannot assemble one completed task',()=>{const m=fresh(),t=m.tasks[0];finish(t);const proofs=t.requiredChecks.map((c,i)=>{const e=evidence(t.id,[c.id]);e.id=`proof-${i}`;e.subject.sha=String(i+1).repeat(40);e.review.sha=e.subject.sha;return e;});t.completionEvidence=proofs.map(e=>e.id);assert.match(verifyManifest(m,proofs).join('\n'),/missing exact reviewed PASS/);});
test('one different tree cannot join otherwise matching subject evidence',()=>{const m=fresh(),e=finish(m.tasks[0]);e.subject.tree='d'.repeat(40);assert.match(verifyManifest(m,[e]).join('\n'),/missing exact reviewed PASS/);});
test('rewritten requirement text with original hash is rejected',()=>{const m=fresh(),r=readJson(path.join(root,planDir,'requirements.json'));r.requirements[0].text='COMPLETELY REPLACED WITHOUT CHANGING HASH';assert.match(verifyInventory(readJson(path.join(root,planDir,'source-inventory.json')),r,m,true).join('\n'),/source requirement mismatch/);});
test('rewritten requirement text with recomputed hash is rejected',()=>{const m=fresh(),r=readJson(path.join(root,planDir,'requirements.json'));r.requirements[0].text='Changed';r.requirements[0].sourceTextSha256=digest('- [ ] Changed');assert.match(verifyInventory(readJson(path.join(root,planDir,'source-inventory.json')),r,m,true).join('\n'),/source requirement mismatch/);});
test('deleting all #29 requirements and matching count is rejected',()=>{const m=fresh(),r=readJson(path.join(root,planDir,'requirements.json'));r.requirements=r.requirements.filter(r=>r.issue!==29);delete r.counts['29'];assert.match(verifyInventory(readJson(path.join(root,planDir,'source-inventory.json')),r,m,true).join('\n'),/source requirement set mismatch|source requirement mismatch/);});
test('alternative manifest cannot claim sourceChecked without source verification',()=>{const r=spawnSync(process.execPath,['scripts/architecture/verify-plan.mjs','--manifest',path.join(root,planDir,'manifest.json'),'--check-source'],{cwd:root,encoding:'utf8'});assert.equal(r.status,1);assert.match(r.stderr,/cannot be combined/);assert(!r.stdout.includes('sourceChecked'));});
test('G gate cannot become PASS from a status toggle',()=>fails(m=>m.activationGates[1].status='PASS',/PASS requires|missing exact scoped reviewed PASS/));
test('G gate evidence is scoped and bound to one source',()=>{const m=fresh(),g=m.activationGates[1],e=evidence('AR-23',[g.requiredChecks[0].id]);g.status='PASS';g.scope='synthetic-scope';g.reviewer='reviewer';g.verificationSubject={sha:e.subject.sha,tree:e.subject.tree};g.completionEvidence=[e.id];e.gateIds=[g.id];e.scope=g.scope;assert.deepEqual(verifyManifest(m,[e]),[]);e.scope='another-scope';assert.match(verifyManifest(m,[e]).join('\n'),/missing exact scoped reviewed PASS/);});

function cliErrors(change, checkSource = true) {
  const inventory = readJson(path.join(root, planDir, 'source-inventory.json'));
  change(inventory);
  return verifyInventory(inventory, readJson(path.join(root, planDir, 'requirements.json')), fresh(), checkSource).join('\n');
}

test('source-checked inventory cannot omit all non-HTTP entries', () => {
  assert.match(cliErrors(i => { i.cli = []; }), /CLI.*coverage mismatch/);
});

test('source-checked inventory cannot omit a backend package command', () => {
  assert.match(cliErrors(i => { i.cli = i.cli.filter(c => c.entry !== 'db:reset'); }), /CLI.*coverage mismatch/);
});

test('source-checked inventory cannot substitute an administrative command', () => {
  assert.match(cliErrors(i => { i.cli.find(c => c.entry === 'db:reset').command = 'echo safe'; }), /CLI.*coverage mismatch/);
});

test('CLI ownership and AR destinations are required even without source checking', () => {
  for (const change of [c => { c.owner = ''; }, c => { c.destination = []; }, c => { c.destination = ['AR-99']; }]) {
    assert.match(cliErrors(i => change(i.cli[0]), false), /invalid CLI/);
  }
});

test('duplicate CLI entries cannot conceal a missing entry', () => {
  assert.match(cliErrors(i => { i.cli.push({ ...i.cli[0] }); }), /duplicate CLI/);
});

test('non-HTTP entry fingerprints cannot be removed from the frozen inventory', () => {
  for (const file of ['backend/package.json', 'backend/Dockerfile', 'backend/prisma/seed.ts']) {
    assert.match(cliErrors(i => { i.sourceFiles = i.sourceFiles.filter(f => !f.path.endsWith(file)); }), /CLI.*fingerprint/);
  }
});

test('Prisma seed hook is distinct from the npm seed script and cannot be omitted', () => {
  assert.match(cliErrors(i => { i.cli = i.cli.filter(c => c.kind !== 'prisma-seed'); }), /CLI.*coverage mismatch/);
});

test('Docker startup argv cannot be omitted or replaced by a descriptive approximation', () => {
  assert.match(cliErrors(i => { i.cli = i.cli.filter(c => c.entry !== 'CMD'); }), /CLI.*coverage mismatch/);
  assert.match(cliErrors(i => { i.cli.find(c => c.entry === 'CMD').command = 'prisma migrate deploy && node dist/server.js'; }), /CLI.*coverage mismatch/);
});

const packagePath = 'systems/enterprise-admin/backend/package.json';
const dockerPath = 'systems/enterprise-admin/backend/Dockerfile';
const cliFixture = () => readJson(path.join(root, planDir, 'source-inventory.json'));
const cliTaskIds = () => new Set(fresh().tasks.map(t => t.id));
const packageFixture = () => readJson(path.join(root, packagePath));
const dockerFixture = () => fs.readFileSync(path.join(root, dockerPath), 'utf8');
const declaredCli = (pkg = packageFixture(), docker = dockerFixture()) => configuredCliEntries(JSON.stringify(pkg), docker);

test('frozen source has 13 scripts, one separate Prisma hook and literal Docker argv', () => {
  const actual = declaredCli();
  assert.equal(actual.filter(c => c.kind === 'package-script').length, 13);
  assert.equal(actual.filter(c => c.kind === 'prisma-seed').length, 1);
  assert.deepEqual(actual.filter(c => c.kind === 'docker-command'), [{
    path: dockerPath, kind: 'docker-command', entry: 'CMD',
    command: JSON.stringify(['sh', '-c', './node_modules/.bin/prisma migrate deploy && node dist/server.js']),
  }]);
  assert.deepEqual(verifyCliInventory(cliFixture(), cliTaskIds(), actual), []);
});

test('new, removed and changed source scripts require an inventory update', () => {
  for (const change of [p => { p.scripts['admin:writer'] = 'echo unreviewed'; }, p => { delete p.scripts['db:reset']; }, p => { p.scripts['db:reset'] = 'echo changed'; }]) {
    const pkg = packageFixture(); change(pkg);
    assert.match(verifyCliInventory(cliFixture(), cliTaskIds(), declaredCli(pkg)).join('\n'), /CLI.*coverage mismatch/);
  }
});

test('new inventory declarations without source cannot pass', () => {
  assert.match(cliErrors(i => { i.cli.push({ ...i.cli[0], entry: 'admin:invented', command: 'echo extra' }); }), /CLI.*coverage mismatch/);
});

test('Prisma hook source changes cannot borrow npm seed coverage', () => {
  for (const change of [p => { delete p.prisma.seed; }, p => { p.prisma.seed = 'echo changed'; }]) {
    const pkg = packageFixture(); change(pkg);
    assert.match(verifyCliInventory(cliFixture(), cliTaskIds(), declaredCli(pkg)).join('\n'), /CLI.*coverage mismatch/);
  }
});

test('command strings are inert data, including shell metacharacters', () => {
  const pkg = packageFixture();
  pkg.scripts['test:inert'] = '$(never-execute-this) ; exit 99';
  assert.equal(declaredCli(pkg).find(c => c.entry === 'test:inert').command, pkg.scripts['test:inert']);
});

test('malformed package script and seed declarations fail closed', () => {
  for (const pkg of [null, {}, { scripts: [] }, { scripts: { seed: null } }, { scripts: { '': 'echo invalid' } }, { scripts: {}, prisma: [] }, { scripts: {}, prisma: { seed: [] } }, { scripts: {}, prisma: { seed: ' ' } }]) {
    assert.throws(() => declaredCli(pkg), /CLI/);
  }
});

test('final-stage Docker startup preserves argv and supports an explicit ENTRYPOINT', () => {
  const docker = 'FROM node:22 AS builder\nCMD ["ignored-builder"]\nFROM node:22\n entrypoint ["sh", "-c"]\nCMD ["echo final", ""]\n';
  assert.deepEqual(declaredCli(packageFixture(), docker).filter(c => c.kind === 'docker-command').map(c => [c.entry, c.command]), [
    ['ENTRYPOINT', '["sh","-c"]'], ['CMD', '["echo final",""]'],
  ]);
});

test('added Docker ENTRYPOINT and changed CMD argv fail inventory comparison', () => {
  for (const docker of [dockerFixture() + '\nENTRYPOINT ["wrapper"]\n', dockerFixture().replace('"sh", "-c"', '"sh", "-e", "-c"')]) {
    assert.match(verifyCliInventory(cliFixture(), cliTaskIds(), declaredCli(packageFixture(), docker)).join('\n'), /CLI.*coverage mismatch/);
  }
});

test('Docker JSON whitespace does not change argv identity', () => {
  const docker = dockerFixture().replace('["sh", "-c", ', '[ "sh" , "-c" , ');
  assert.deepEqual(declaredCli(packageFixture(), docker), declaredCli());
});

test('unsupported or ambiguous Docker startup syntax fails closed', () => {
  for (const docker of [
    'FROM node:22\nCMD echo shell', 'FROM node:22\nCMD []', 'FROM node:22\nCMD [1]',
    'FROM node:22\nCMD [""]', 'FROM node:22\nCMD ["x",]', 'CMD ["x"]',
    'FROM node:22\nCMD ["x"]\nCMD ["y"]', 'FROM node:22',
    'FROM node:22 AS builder\nCMD ["x"]\nFROM builder\nCMD ["y"]',
    'FROM node:22\nCMD ["x"]\nFROM 0\nCMD ["y"]',
    'FROM $BASE\nCMD ["x"]', 'FROM --platform=linux/amd64 node:22\nCMD ["x"]',
    '# escape=`\nFROM node:22\nCMD ["x"]', 'FROM node:22\nRUN <<EOF\nCMD ["x"]\nEOF',
    'FROM node:22\nCMD ["x", ' + String.fromCharCode(92) + '\n"y"]',
  ]) assert.throws(() => declaredCli(packageFixture(), docker), /CLI Docker/);
});

test('CLI metadata rejects malformed arrays, paths, kinds and ownership', () => {
  for (const change of [
    i => { i.cli = null; }, i => { i.cli = [null]; },
    i => { i.cli[0].path = '../outside'; }, i => { i.cli[0].kind = 'unknown'; },
    i => { i.cli[0].entry = ' '; }, i => { i.cli[0].effect = ' '; },
    i => { i.cli[0].command = 42; }, i => { i.cli[0].destination = 'AR-20'; },
    i => { i.cli[0].owner = 42; }, i => { i.cli[0].destination = ['AR-99']; },
  ]) assert.match(cliErrors(change, false), /invalid CLI/);
});

test('configured declarations cannot be relabelled curated or moved to another path', () => {
  for (const change of [c => { c.kind = 'curated'; }, c => { c.path = 'other/package.json'; }]) {
    assert.match(cliErrors(i => change(i.cli[0])), /invalid CLI|CLI.*coverage mismatch/);
  }
});

test('CLI source fingerprints must be valid and unique', () => {
  for (const change of [
    i => { i.sourceFiles.find(f => f.path === packagePath).sha256 = 'bad'; },
    i => { i.sourceFiles.push({ ...i.sourceFiles.find(f => f.path === dockerPath) }); },
  ]) assert.match(cliErrors(change, false), /CLI.*fingerprint/);
});

test('curated Python entries retain metadata and source-fingerprint checks', () => {
  assert.match(cliErrors(i => { i.cli.find(c => c.kind === 'curated').owner = ''; }, false), /invalid CLI/);
  assert.match(cliErrors(i => { const p = i.cli.find(c => c.kind === 'curated').path; i.sourceFiles = i.sourceFiles.filter(f => f.path !== p); }), /CLI.*fingerprint/);
});
