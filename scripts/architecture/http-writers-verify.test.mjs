import test from 'node:test';
import assert from 'node:assert/strict';
import { reader, MAP, CONTRACT_TEST, verifyHttpWriters, sha256 } from './http-writers-verify.mjs';
import { SPEC } from './http-writers-spec.mjs';

const read = reader();
const original = JSON.parse(read(MAP));
test('source fingerprints use explicit path and sha256 records', () => {
  assert.ok(Array.isArray(SPEC.pins));
  assert.equal(SPEC.pins.length, 27);
  for (const pin of SPEC.pins) {
    assert.deepEqual(Object.keys(pin), ['path','sha256']);
    assert.equal(typeof pin.path, 'string');
    assert.match(pin.sha256, /^[0-9a-f]{64}$/);
  }
});
function rejects(name, change, pattern) {
  test(name, () => {
    const map = structuredClone(original);
    change(map);
    const result = verifyHttpWriters(map, { read });
    assert.equal(result.result, 'FAIL');
    if (pattern) assert.ok(result.errors.some(error => pattern.test(error)), JSON.stringify(result));
  });
}
test('pinned eight-endpoint map passes only source-mapping scope', () => {
  assert.deepEqual(verifyHttpWriters(original, { read }), { result:'PASS', errors:[], scope:'EIGHT_ENDPOINT_EXPLICIT_SOURCE_SITES_ONLY', runtimeAcceptance:'NOT_RUN' });
  assert.equal(original.endpoints.flatMap(row => row.explicitWriteSites).length, 16);
});
rejects('reject false full AC01 PASS', m => { m.scope.fullHttpAc01='PASS'; }, /scope/);
rejects('reject invented runtime execution', m => { m.scope.appExecution='PASS'; }, /scope/);
rejects('reject promoted business requirements claim', m => { m.scope.allBusinessRequirementsMapped=true; }, /scope/);
rejects('reject complete runtime target claim', m => { m.scope.runtimeWriteTargets='CLOSED'; }, /scope/);
rejects('reject 15 plus 1 sites promoted to exhaustive effects', m => { m.scope.writeCountMeaning='ALL_RUNTIME_EFFECTS'; }, /scope/);
rejects('reject changed source head', m => { m.subject.sourceHead='0'.repeat(40); }, /scope/);
rejects('reject missing endpoint', m => { m.endpoints.pop(); }, /membership/);
rejects('reject duplicate endpoint', m => { m.endpoints.push(structuredClone(m.endpoints[0])); }, /membership/);
rejects('reject unknown endpoint', m => { m.endpoints[0].id='unknown'; });
rejects('reject empty endpoint list', m => { m.endpoints=[]; }, /membership/);
rejects('reject unknown fields pretending approval', m => { m.accepted=true; }, /scope/);
rejects('reject unknown endpoint claim', m => { m.endpoints[0].runtimePassed=true; }, /facts/);
rejects('reject deleting all source pins', m => { m.sources=[]; }, /pin/);
rejects('reject changed pin metadata', m => { m.sources[0].sha256='0'.repeat(64); }, /pin/);
rejects('reject missing shared middleware effects', m => { m.shared=[]; }, /shared/);
rejects('reject middleware source substitution', m => { m.shared[0].source='missing.ts'; }, /shared/);
rejects('reject falsely declaring DB writers READ', m => { m.endpoints.forEach(r => { r.classification='READ'; }); }, /facts/);
rejects('reject arbitrary owner', m => { m.endpoints[0].owner='arbitrary'; }, /facts/);
rejects('reject unrelated but valid AR destination', m => { m.endpoints[0].destination=['AR-23']; }, /facts/);
rejects('reject wrong HTTP method', m => { m.endpoints[0].method='GET'; }, /facts/);
rejects('reject wrong handler identity', m => { m.endpoints[0].handler='list'; }, /facts/);
rejects('reject invented auth guarantee', m => { m.endpoints[0].authorization.runtimeVerified=true; }, /facts/);
rejects('reject all writes removed', m => { m.endpoints.forEach(r => { r.explicitWriteSites=[]; }); }, /coverage/);
rejects('reject one direct write omitted', m => { m.endpoints[0].explicitWriteSites.pop(); }, /coverage/);
rejects('reject nested permission write omitted', m => { m.endpoints[3].explicitWriteSites.pop(); }, /coverage/);
rejects('reject false transaction membership', m => { m.endpoints[0].explicitWriteSites[2].transaction='CALLBACK_TRANSACTION'; }, /coverage/);
rejects('reject optional write described as unconditional', m => { m.endpoints[0].explicitWriteSites[1].condition='always'; }, /coverage/);
rejects('reject wrong write operation', m => { m.endpoints[2].explicitWriteSites[0].operation='delete'; }, /coverage/);
rejects('reject reordered multiwrite sequence', m => { m.endpoints[1].explicitWriteSites.reverse(); }, /coverage/);
rejects('reject false atomicity boundary', m => { m.endpoints[4].boundary='ATOMIC_TRANSACTION'; }, /facts/);
rejects('reject source path substitution', m => { m.endpoints[0].route.path='missing-handler.ts'; }, /coverage/);
rejects('reject wrong source line', m => { m.endpoints[0].controller.startLine=-1; }, /coverage/);
rejects('reject changed source slice hash', m => { m.endpoints[0].service.sha256='0'.repeat(64); }, /coverage/);
rejects('reject no static test mapping', m => { delete m.endpoints[0].staticTest; });
rejects('reject nonexistent test path', m => { m.endpoints[0].staticTest.path='missing.test.ts'; }, /boundary/);
rejects('reject unrelated named test', m => { m.endpoints[0].staticTest.name='offline queue'; }, /boundary/);
rejects('reject fake test result from citation', m => { m.endpoints[0].staticTest.executionResult='PASS'; }, /boundary/);
rejects('reject fake runtime PASS', m => { m.endpoints[0].runtimeTests.status='PASS'; }, /boundary/);
rejects('reject static citation promoted to HTTP evidence', m => { m.endpoints[0].runtimeTests.citations=[m.endpoints[0].staticTest]; }, /boundary/);
rejects('reject runtime gaps silently removed', m => { m.endpoints[0].runtimeTests.requiredCases=[]; }, /boundary/);
rejects('reject missing request-controlled update gap', m => { delete m.endpoints[6].requestControlledData; }, /gap/);
rejects('reject nested targets falsely closed', m => { m.endpoints[6].requestControlledData.targetsClosed=true; }, /gap/);
rejects('reject unknown nested targets erased', m => { m.endpoints[6].requestControlledData.nestedRelationTargets='NONE'; }, /gap/);
rejects('reject request scalar fields called bounded', m => { m.endpoints[6].requestControlledData.additionalScalarAndOperationFields='SAFE_ALLOWLIST'; }, /gap/);
rejects('reject mocked forwarding promoted to Prisma acceptance', m => { m.endpoints[6].requestControlledData.prismaAcceptance='PASS'; }, /gap/);
rejects('reject mocked forwarding promoted to persisted behavior', m => { m.endpoints[6].requestControlledData.httpAndPgPersistence='PASS'; }, /gap/);
rejects('reject request payload classes erased', m => { m.endpoints[6].requestControlledData.unverifiedPayloadClasses=[]; }, /gap/);
rejects('reject create spread gap erased', m => { m.endpoints[5].requestControlledData=null; }, /gap/);
rejects('reject tenant spread mistaken for nested sanitization', m => { m.endpoints[5].requestControlledData.targetsClosed=true; }, /gap/);
rejects('reject nested payload regression requirement removed', m => { m.endpoints[6].runtimeTests.requiredCases=m.endpoints[6].runtimeTests.requiredCases.filter(c=>!c.startsWith('request-nested-')); }, /boundary/);
rejects('reject tenant reassignment regression requirement removed', m => { m.endpoints[6].runtimeTests.requiredCases=m.endpoints[6].runtimeTests.requiredCases.filter(c=>c!=='request-tenantId-reassignment'); }, /boundary/);
rejects('reject scalar operation regression requirement removed', m => { m.endpoints[6].runtimeTests.requiredCases=m.endpoints[6].runtimeTests.requiredCases.filter(c=>c!=='request-amount-operation-object'); }, /boundary/);

test('changed unparsed password dependency bytes are rejected', () => {
  const file='systems/enterprise-admin/backend/src/lib/password.ts';
  assert.equal(verifyHttpWriters(original, {read: p => read(p)+(p===file?'\n// changed\n':'')}).result, 'FAIL');
});
test('changed source and repinned JSON still require reviewed SPEC update', () => {
  const file='systems/enterprise-admin/backend/src/lib/password.ts';
  const changed=read(file)+'\n// changed\n';
  const map=structuredClone(original);map.sources.find(s=>s.path===file).sha256=sha256(changed);
  assert.equal(verifyHttpWriters(map,{read:p=>p===file?changed:read(p)}).result,'FAIL');
});
test('missing source is FAIL not an unhandled exception or PASS', () => {
  assert.equal(verifyHttpWriters(original,{read:p=>{if(p.endsWith('password.ts'))throw new Error('ENOENT');return read(p);}}).result,'FAIL');
});
test('deleted test declaration is rejected even if file remains', () => {
  assert.equal(verifyHttpWriters(original,{read:p=>p===CONTRACT_TEST?read(p).replace("test('USERS-CREATE: source mapping contract',","test('renamed',"):read(p)}).result,'FAIL');
});
test('changed assertion bytes are detected without claiming behavior proof', () => {
  assert.equal(verifyHttpWriters(original,{read:p=>p===CONTRACT_TEST?read(p).replace("assert.equal(actual.explicitWriteSites[1].condition, 'roleIds has nonzero length');",'assert.ok(true);'):read(p)}).result,'FAIL');
});
test('all malformed input shapes fail closed', () => {
  for (const input of [null,[],{},true,{endpoints:null},{...original,endpoints:[null]}]) assert.equal(verifyHttpWriters(input,{read}).result,'FAIL');
});
