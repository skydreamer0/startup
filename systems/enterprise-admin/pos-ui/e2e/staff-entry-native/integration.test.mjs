import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { requestLimit, requestSpacingMs, nativeDeadlineMs, rawTables } from './contract.mjs';
const source = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
test('actual runner retains exact source/owned service and publishes only after all acceptance and cleanup',()=>{
 const runner=source('./run.mjs');for(const guard of ['assertSource();','assertOwnership(','assertService(','assertReport(read(\'report.json\'))','assertEvidence(database, ledgers, api)','assert.equal(receipt.nonce, nonce)','validateExactViewportPng(bytes, receipt.viewport)','cleanupRunProcesses(scope)'])assert.ok(runner.includes(guard),guard);
 assert.ok(runner.indexOf("write('accepted.json', accepted)")>runner.indexOf("write('run-cleanup.json', cleanup)"));assert.ok(runner.indexOf('publishEvidence(state, output')>runner.indexOf("write('completion.json'"));
 assert.match(runner,/\['collection', app, \[[^\n]*'--list', '--reporter=list'\]\]/);
});
test('actual parent uses the tested mounted guard and drains before snapshot and exact deletion',()=>{
 const parent=source('../../../backend/scripts/pos-staff-entry-browser-fixture.ts');assert.ok(parent.includes('outer.use(createGuard('));assert.ok(parent.indexOf('outer.use(createGuard(')<parent.indexOf('outer.use(app)'));
 const final=parent.slice(parent.indexOf('await finalizeFixture({'));let last=-1;for(const stage of ['owned-http-drain','after-snapshot','exact-fixture-cleanup','database-disconnect','private-bootstrap-removal','api-ledger-write','database-receipt-write','signal-disposal']){const at=final.indexOf(`'${stage}':`);assert.ok(at>last);last=at;}
 assert.match(final,/'after-snapshot': async \(\) => \{ assert.equal\(httpDrainedBeforeSnapshot, true\)/);assert.match(final,/'exact-fixture-cleanup': async \(\) => \{\s+assert.equal\(httpDrainedBeforeSnapshot, true\)/);
 assert.ok(!parent.includes('signAccessToken'));assert.ok(!parent.includes('req.originalUrl'));assert.ok(!parent.includes('console.error(error)'));assert.match(parent,/flag: 'wx', mode: 0o600/);
});
test('actual driver keeps cold contexts and real login, bounded hold, full navigation and readonly reload',()=>{
 const spec=source('./entry.spec.ts'),fixture=source('./fixtures.ts');
 for(const text of ['await page.goto(origin)','await input.press(\'Enter\')','await page.keyboard.press(\'Tab\')','await page.keyboard.press(\'Enter\')','await expect.poll(() => guard.activeReady)','guard.releaseActive()','await page.reload()','reloadTokenUnchanged'])assert.ok(spec.includes(text),text);
 assert.ok(!fixture.includes("localStorage.setItem"));assert.ok(!fixture.includes('storageState'));assert.ok(fixture.indexOf('endEntry(state);')<fixture.indexOf('await context.close()'));assert.ok(fixture.indexOf('await capture(page')<fixture.indexOf('await context.close()'));
});
test('actual native config and workflow add a bounded step without changing selected checks or job cap',()=>{
 const config=source('../staff-entry-native.config.mts'),yaml=source('../../../../../.github/workflows/ci.yml');
 for(const text of ['workers: 1','retries: 0','forbidOnly: true','globalTimeout: 120_000','chromiumSandbox: true',"trace: 'off'","video: 'off'",'reuseExistingServer: false'])assert.ok(config.includes(text));
 assert.equal(requestLimit,120);assert.equal(requestSpacingMs,550);assert.equal(nativeDeadlineMs,120000);assert.ok((requestLimit-1)*requestSpacingMs<nativeDeadlineMs);
 const worker=yaml.slice(yaml.indexOf('  pos-sku-acceptance:'),yaml.indexOf('  batch-audit:'));
 assert.match(worker,/needs: plan\n    if: \$\{\{ needs.plan.outputs.pos == 'true' \}\}/);assert.match(worker,/timeout-minutes: 20/);assert.match(worker,/id: staff_entry_native\n        timeout-minutes: 3/);
 assert.ok(worker.includes('always() && steps.staff_entry_native.outputs.evidence_dir'));assert.ok(!worker.includes('continue-on-error:'));assert.ok(!worker.includes('include-hidden-files: true'));
});
test('raw table inventory matches all actual Prisma schema maps',()=>{
 const schema=source('../../../backend/prisma/schema.prisma');assert.deepEqual([...schema.matchAll(/@@map\("([a-z_]+)"\)/g)].map(x=>x[1]).sort(),rawTables);
});
