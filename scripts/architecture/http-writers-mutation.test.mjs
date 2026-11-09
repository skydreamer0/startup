import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ROOT, MAP, reader, verifyHttpWriters } from './http-writers-verify.mjs';

const read = reader();
const original = JSON.parse(read(MAP));
const source = read('scripts/architecture/http-writers-verify.mjs');
const cases = [
  ['identity', "map.scope.fullHttpAc01='PASS';"],
  ['pins', 'map.sources=[];'],
  ['shared', 'map.shared=[];'],
  ['membership', 'map.endpoints.pop();'],
  ['facts', "map.endpoints[0].classification='READ';"],
  ['chain', 'map.endpoints[3].explicitWriteSites.pop();'],
  ['dataflow', 'map.endpoints[6].requestControlledData.targetsClosed=true;'],
  ['tests', "map.endpoints[0].runtimeTests.status='PASS';"],
];
for (const [guard, change] of cases) {
  test(`removing ${guard} guard makes its isolated rejection test fail`, () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'http-writer-mutation-'));
    try {
      const lines = source.split('\n');
      const matches = lines.filter(line => line.includes(`/* guard:${guard} */`));
      assert.equal(matches.length, 1);
      const mutated = source.replace(matches[0], `    // Removed ${guard} guard for mutation only.`);
      fs.writeFileSync(path.join(temporary, 'http-writers-verify.mjs'), mutated);
      fs.writeFileSync(path.join(temporary, 'http-writers-spec.mjs'), read('scripts/architecture/http-writers-spec.mjs'));
      const witness = `
        import assert from 'node:assert/strict';
        import fs from 'node:fs';
        import {reader, verifyHttpWriters} from VERIFIER;
        const read=reader(${JSON.stringify(ROOT)});
        const map=JSON.parse(read(${JSON.stringify(MAP)}));
        ${change}
        const result=verifyHttpWriters(map,{read});
        assert.equal(result.result,'FAIL',JSON.stringify(result));
      `;
      const run = file => spawnSync(process.execPath, ['--input-type=module','-e',witness.replace('VERIFIER', JSON.stringify(pathToFileURL(file).href))], { encoding:'utf8', timeout:10000 });
      const baseline = run(path.join(ROOT, 'scripts/architecture/http-writers-verify.mjs'));
      assert.equal(baseline.status, 0, baseline.stderr);
      const mutant = run(path.join(temporary, 'http-writers-verify.mjs'));
      assert.equal(mutant.status, 1, mutant.stderr);
      assert.match(mutant.stderr, /AssertionError/);
      assert.match(mutant.stderr, /PASS/);
      assert.match(mutant.stderr, /FAIL/);
    } finally { fs.rmSync(temporary, { recursive:true, force:true }); }
  });
}
test('actual-byte fingerprint clause has an independent witness', async () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'http-writer-byte-mutation-'));
  try {
    const clause = 'SPEC.pins.every(({ path: file, sha256: hash }) => sha256(read(file)) === hash)';
    assert.equal(source.split(clause).length, 2);
    fs.writeFileSync(path.join(temporary, 'http-writers-verify.mjs'), source.replace(clause, 'true'));
    fs.writeFileSync(path.join(temporary, 'http-writers-spec.mjs'), read('scripts/architecture/http-writers-spec.mjs'));
    const file = 'systems/enterprise-admin/backend/src/lib/password.ts';
    const changedRead = p => read(p) + (p===file ? '\n// drift witness\n' : '');
    assert.equal(verifyHttpWriters(original, {read:changedRead}).result, 'FAIL');
    const mutant = await import(pathToFileURL(path.join(temporary, 'http-writers-verify.mjs')).href);
    assert.equal(mutant.verifyHttpWriters(original, {read:changedRead}).result, 'PASS', 'Fingerprint-removal mutant must expose the regression witness');
    assert.throws(() => assert.equal(mutant.verifyHttpWriters(original,{read:changedRead}).result,'FAIL'), {name:'AssertionError'});
  } finally { fs.rmSync(temporary, { recursive:true, force:true }); }
});
