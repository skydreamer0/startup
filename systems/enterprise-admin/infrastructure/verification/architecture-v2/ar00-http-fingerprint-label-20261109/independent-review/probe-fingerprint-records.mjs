// Independent, offline regression witnesses. Never print source fingerprint values.
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = path.resolve(process.argv[2] || '.');
const sourcePath = path.join(root, 'scripts/architecture/http-writers-verify.mjs');
const specPath = path.join(root, 'scripts/architecture/http-writers-spec.mjs');
const { SPEC } = await import(pathToFileURL(specPath));
const { reader, expectedMap, verifyHttpWriters, MAP } = await import(pathToFileURL(sourcePath));
const read = reader(root);
assert.equal(SPEC.pins.length, 27);
assert.equal(new Set(SPEC.pins.map(p => p.path)).size, 27);
const originalPins = JSON.stringify(SPEC.pins);
const first = expectedMap(read), second = expectedMap(read);
assert.ok(first.sources !== SPEC.pins, 'source array is unexpectedly shared');
assert.ok(first.sources !== second.sources, 'returned arrays are unexpectedly shared');
for (let i = 0; i < 27; i++) {
  assert.ok(first.sources[i] !== SPEC.pins[i], 'record is unexpectedly shared with specification');
  assert.ok(first.sources[i] !== second.sources[i], 'returned records are unexpectedly shared');
  assert.ok(isDeepStrictEqual(first.sources[i], SPEC.pins[i]), 'record differs from specification');
}
first.sources[0].path = 'synthetic-mutated-path';
first.sources[0].sha256 = 'synthetic-mutated-fingerprint';
first.sources.push({path:'synthetic-added-path',sha256:'synthetic-added-fingerprint'});
assert.ok(JSON.stringify(SPEC.pins) === originalPins, 'specification pins changed');
assert.ok(isDeepStrictEqual(second.sources, SPEC.pins), 'second result changed');
const map = JSON.parse(read(MAP));
assert.equal(verifyHttpWriters(map,{read}).result,'PASS');
const target = 'systems/enterprise-admin/backend/src/lib/password.ts';
const changedRead = file => read(file) + (file===target ? '\n// independent synthetic byte drift\n' : '');
const unchanged = verifyHttpWriters(map,{read:changedRead});
assert.equal(unchanged.result,'FAIL');
const source=fs.readFileSync(sourcePath,'utf8');
const clause='SPEC.pins.every(({ path: file, sha256: hash }) => sha256(read(file)) === hash)';
assert.equal(source.split(clause).length,2);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'independent-fingerprint-witness-'));
let mutantResult;
try {
  fs.writeFileSync(path.join(temp,'http-writers-verify.mjs'),source.replace(clause,'true'));
  fs.copyFileSync(specPath,path.join(temp,'http-writers-spec.mjs'));
  const mutant=await import(pathToFileURL(path.join(temp,'http-writers-verify.mjs')));
  mutantResult=mutant.verifyHttpWriters(map,{read:changedRead});
  assert.equal(mutantResult.result,'PASS');
  assert.throws(()=>assert.equal(mutantResult.result,'FAIL'),{name:'AssertionError'});
} finally { fs.rmSync(temp,{recursive:true,force:true}); }
assert.ok(JSON.stringify(SPEC.pins) === originalPins, 'specification pins changed');
assert.equal(verifyHttpWriters(map,{read}).result,'PASS');
console.log(JSON.stringify({status:'PASS',recordCount:27,uniquePaths:27,detachedArray:true,allDetachedRecords:true,mutatingReturnedRecordsLeavesPinsUnchanged:true,baselinePass:true,actualByteDriftRejected:true,removedByteGuardAllowsDrift:true,rejectionWitnessKillsMutant:true,finalBaselinePass:true,sourceFingerprints:'NOT_RECORDED',applicationExecution:'NOT_RUN',externalScannerOutcome:'NOT_VERIFIED'},null,2));
