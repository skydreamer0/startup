import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { nativeDeadlineMs, requestLimit, requestSpacingMs } from './contract.mjs';
const source = relative => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
test('actual config keeps finite native budget, one serial worker, sandbox and no implicit artifact writer', () => {
  const config = source('../recovery-native.config.mts');
  assert.match(config, new RegExp(`globalTimeout: ${nativeDeadlineMs.toLocaleString('en-US').replaceAll(',', '_')}`));
  for (const text of ['workers: 1', 'retries: 0', 'forbidOnly: true', 'timeout: 90_000', 'chromiumSandbox: true', "screenshot: 'off'", "trace: 'off'", "video: 'off'", 'reuseExistingServer: false']) assert.ok(config.includes(text));
  assert.equal(requestLimit, 180); assert.equal(requestSpacingMs, 550);
  assert.ok((requestLimit - 1) * requestSpacingMs < nativeDeadlineMs);
  assert.ok(!config.includes("from './recovery-native/contract.mjs'"), 'Do not reintroduce config/test ESM loader cross-mode import');
});
test('actual parent drains before snapshot and deletion, then attempts private-file removal and immutable reports', () => {
  const parent = source('../../../backend/scripts/pos-recovery-browser-fixture.ts');
  const final = parent.slice(parent.indexOf('await finalizeFixture({'));
  let previous = -1;
  for (const stage of ['owned-http-drain','after-snapshot','exact-fixture-cleanup','database-disconnect','private-bootstrap-removal','api-ledger-write','database-receipt-write','signal-disposal']) {
    const next = final.indexOf(`'${stage}':`); assert.ok(next > previous); previous = next;
  }
  assert.match(final, /assert\.equal\(httpDrainedBeforeSnapshot, true, 'No post-run snapshot/);
  assert.match(final, /assert\.equal\(httpDrainedBeforeSnapshot, true, 'Never delete fixtures/);
  assert.match(parent, /flag: 'wx', mode: 0o600/);
  assert.match(parent, /const fixture = fixtures\[key\], method = req.method, pathname = req.path, requestPath = req.originalUrl/);
  assert.ok(parent.indexOf('requestPath = req.originalUrl') < parent.indexOf('outer.use(app)'));
});
test('actual workflow preserves selected SKU execution and captures only quiescent new evidence', () => {
  const yaml = source('../../../../../.github/workflows/ci.yml');
  const worker = yaml.slice(yaml.indexOf('  pos-sku-acceptance:'), yaml.indexOf('  batch-audit:'));
  assert.match(worker, /needs: plan\n    if: \$\{\{ needs.plan.outputs.pos == 'true' \}\}/);
  assert.match(worker, /timeout-minutes: 20/);
  assert.match(worker, /id: recovery_native\n        timeout-minutes: 5/);
  assert.match(worker, /node --test pos-ui\/e2e\/recovery-native\/\*\.test\.mjs\n          node pos-ui\/e2e\/recovery-native\/run\.mjs/);
  assert.match(worker, /always\(\) && steps\.recovery_native\.outputs\.evidence_dir != ''/);
  assert.match(worker, /path: \$\{\{ steps\.recovery_native\.outputs\.evidence_dir \}\}/);
  assert.ok(worker.indexOf('id: stock_native') < worker.indexOf('id: recovery_native'));
  assert.ok(worker.indexOf('id: recovery_native') < worker.indexOf('id: package_native'));
  assert.ok(!worker.includes('continue-on-error:'));
});
test('actual runner verifies full report, exact source and raw evidence before acceptance and publishes after cleanup', () => {
  const runner = source('./run.mjs');
  for (const guard of ['assertSource();','assertReport(read(\'report.json\'))','assertEvidence(database, ledgers, api)','assert.equal(receipt.nonce, nonce)','stagesByCase[scenario.id]','validatePng(bytes, receipt)','cleanupRunProcesses(scope)','fs.rmSync(path.join(output, \'.bootstrap.json\'), { force: true })']) assert.ok(runner.includes(guard));
  assert.ok(runner.indexOf("write('accepted.json', accepted)") > runner.indexOf("write('run-cleanup.json', cleanup)"));
  assert.ok(runner.indexOf('publishEvidence(state, output') > runner.indexOf("write('completion.json'"));
});

test('actual collection cannot prewrite native report and context teardown cancels before close',()=>{
 const runner=source('./run.mjs');assert.match(runner,/\['collection', app, \[[^\n]*'--list', '--reporter=list'\]\]/);
 const fixture=source('./fixtures.ts');assert.ok(fixture.includes('endRecovery(state);'));assert.ok(fixture.indexOf('endRecovery(state);')<fixture.indexOf('await context.close()'));
});
test('actual native initial boundary awaits exact dispatch plus persisted terminal state before frozen reads',()=>{
 const spec=source('./recovery.spec.ts');
 const wait="await expect.poll(async () => recoveryBoundaryReady(await saved(page, scope), guard.requests, scenario), { timeout: 20_000, intervals: [50, 100, 250, 500] }).toBe(true);";
 assert.ok(spec.includes(wait));assert.ok(spec.indexOf(wait)<spec.indexOf('const frozen = await saved(page, scope)'));
 assert.ok(spec.includes("expect(frozen.status).toBe(scenario.mode === 'conflict' ? 'conflict' : 'unknown')"));
});

test('native lookup binds one immutable disclosure target while preserving collapsed, expanded and keyboard gates',()=>{
 const spec=source('./recovery.spec.ts');
 for(const text of ["const collapsed = lookup.getByRole('button', { name: /^展開訂單 / })","const controls = await collapsed.getAttribute('aria-controls'); expect(controls).toBeTruthy()",'const row = lookup.locator(`button[aria-controls=${JSON.stringify(controls)}]`)','await expect(row).toHaveCount(1)',"await expect(row).toHaveAttribute('aria-expanded', 'false')","await expect(row).toHaveAttribute('aria-expanded', 'true')","await expect(row).toHaveAccessibleName(/^收合訂單 /)","await page.keyboard.press('Tab'); await expect(row).toBeFocused()","await page.keyboard.press('Tab'); const select = lookup.getByRole('button', { name: '退款此訂單', exact: true }); await expect(select).toBeFocused()"]){assert.ok(spec.includes(text),text);}
 assert.ok(!spec.includes("const row = lookup.getByRole('button', { name: /^展開訂單 / })"));
});
