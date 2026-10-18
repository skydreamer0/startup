/** Existing cloud draft adapted to the owned package-native CI fixture.
 * No standalone DB/Chrome runner. Physical printing and device access are forbidden.
 * Historical upgrade/CRUD evidence belongs to the original head, not this journey.
 */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export async function runMedicineLabelJourney({ db, tenantId, browser, adminOrigin, token, system, output, nonce, expect, capture }) {
  const origin = new URL(adminOrigin);
  assert.equal(origin.protocol, 'http:'); assert.equal(origin.hostname, '127.0.0.1');
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  const python = path.join(process.env.RUNNER_TEMP, `medicine-python-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`, 'bin/python');
  assert.equal(process.env.MEDICINE_LABEL_PYTHON, python);
  const work = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP, 'medicine-disabled-'));
  const agentToken = randomBytes(32).toString('hex');
  const evidence = [], ledger = [], denied = [], errors = [];
  const fixture = { tenantId, costPrice: 1, retailPrice: 2, stockQuantity: 7,
    englishName: 'Synthetic Medicine', genericName: 'Synthetic ingredient', nhiCode: 'TEST001', licenseNumber: '合成藥證000001' };
  const products = await Promise.all([
    db.product.create({ data: { ...fixture, sku: 'MED-LABEL-138', name: 'Z 藥品標籤合成商品' } }),
    db.product.create({ data: { ...fixture, sku: 'MED-LONG-138', name: 'Z 藥品長名拒絕', englishName: 'W'.repeat(100) } }),
    db.product.create({ data: { ...fixture, sku: 'INVALID SKU', name: 'Z 藥品無效識別碼' } }),
    db.product.create({ data: { ...fixture, sku: 'abcdefghijklmnopqrstuvwx', name: 'Z 藥品密集QR拒絕' } }),
  ]);
  const snapshot = async () => ({
    products: await db.product.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    packages: await db.productPackage.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    revisions: await db.productPackageRevision.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    identifiers: await db.productPackageIdentifier.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    batches: await db.productBatch.count(), movements: await db.inventoryTransaction.count(), orders: await db.order.count(),
  });
  const before = await snapshot();
  let child, context, exitPromise, childOutput = '', failure;
  const secretFree = value => { assert.equal(String(value).includes(agentToken), false); assert.equal(String(value).includes(token), false); };
  try {
    // The production API/parser/renderer is used. A test-only device tripwire
    // fails on ANY attempt before it can enumerate or communicate with hardware.
    child = spawn(python, [path.join(system, 'backend/scripts/medicine-label-disabled-agent.py')], {
      cwd: work, env: { PATH: process.env.PATH, HOME: work, PYTHONPATH: path.join(system, 'local-print-agent/src'),
        PYTHONDONTWRITEBYTECODE: '1', MEDICINE_TEST_CI: 'github-hosted-owned-fixture', MEDICINE_TEST_TOKEN: agentToken, MEDICINE_TEST_ORIGIN: adminOrigin, MEDICINE_TEST_WORK: work,
        CATEGORY_UI_NONCE: nonce }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    exitPromise = new Promise(resolve => { child.once('exit', (code, signal) => resolve({ code, signal })); child.once('error', error => resolve({ code: null, signal: 'spawn-error', error: error.message })); });
    for (const stream of [child.stdout, child.stderr]) stream.on('data', bytes => { childOutput += bytes; if (childOutput.length > 65536) child.kill('SIGTERM'); });
    async function agent(route) {
      const response = await fetch(`http://127.0.0.1:8765${route}`, { headers: { Authorization: `Bearer ${agentToken}`, Origin: adminOrigin }, signal: AbortSignal.timeout(2000) });
      assert.equal(response.status, 200); return response.json();
    }
    let ready = false;
    for (let i = 0; i < 50; i++) {
      assert.equal(child.exitCode, null);
      try { const state = await agent('/printers'); assert.equal(state.discovery_performed, false); assert.equal(state.printers[0].printing_enabled, false); assert.equal(state.printers[0].configured, false); ready = true; break; } catch { await delay(100); }
    }
    assert.ok(ready, 'Owned print-disabled agent did not become ready');
    context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    await context.addInitScript(value => localStorage.setItem('accessToken', value), token);
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      const isAgent = url.origin === 'http://127.0.0.1:8765';
      const allowed = (url.origin === adminOrigin && req.method() === 'GET')
        || (isAgent && url.pathname === '/print' && ['POST', 'OPTIONS'].includes(req.method()));
      if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) { await route.abort(); return; }
      const entry = { method: req.method(), origin: url.origin, path: url.pathname, allowed };
      ledger.push(entry); if (!allowed) { denied.push(entry); await route.abort(); return; }
      await route.continue();
    });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
    const dialog = page.getByRole('dialog', { name: '建立藥品標籤', exact: true });
    const preview = dialog.getByAltText('本機渲染的 50 × 30 mm 橫式藥品標籤預覽');
    const previewButton = dialog.getByRole('button', { name: '取得列印預覽雜湊', exact: true });
    async function open(product) {
      await page.goto(`${adminOrigin}/inventory?page=3`);
      const opener = page.getByRole('button', { name: `建立 ${product.name} 的藥品標籤`, exact: true });
      await opener.click(); await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('本機代理權杖')).toBeFocused();
      await dialog.getByLabel('本機代理權杖').fill(agentToken);
      await dialog.getByLabel('本次實際儲位').fill('TEST-A01');
      return opener;
    }
    async function getPreview() {
      const pending = page.waitForResponse(response => response.url() === 'http://127.0.0.1:8765/print' && response.request().method() === 'POST');
      await previewButton.click(); const response = await pending;
      const body = await response.json();
      assert.equal(response.status(), 200); assert.equal(body.sent, false); assert.equal(body.status, 'dry_run');
      assert.equal(body.layout, 'medicine-landscape-v9'); assert.match(body.job_sha256, /^[a-f0-9]{64}$/);
      await expect(preview).toBeVisible(); return body;
    }
    const opener = await open(products[0]);
    await expect(dialog.getByRole('region', { name: '資料庫藥品標籤內容' })).toContainText(products[0].genericName);
    const first = await getPreview();
    const approve = dialog.getByLabel('內容及版面已核對，送印一張');
    await expect(dialog.getByRole('button', { name: '確認送印一張', exact: true })).toBeDisabled();
    await approve.check();
    await dialog.getByLabel('本次實際儲位').fill('TEST-B02');
    await expect(preview).toHaveCount(0); await expect(approve).toHaveCount(0);
    const second = await getPreview(); assert.notEqual(second.job_sha256, first.job_sha256);
    await expect(approve).not.toBeChecked();
    await expect(dialog.getByRole('button', { name: '確認送印一張', exact: true })).toBeDisabled();
    await approve.check();
    const submit = page.waitForResponse(response => response.url() === 'http://127.0.0.1:8765/print' && response.request().method() === 'POST');
    await dialog.getByRole('button', { name: '確認送印一張', exact: true }).click();
    const sent = await submit, payload = sent.request().postDataJSON();
    assert.equal(sent.status(), 403); assert.equal((await sent.json()).error, 'printing disabled at server startup');
    assert.equal(payload.send, true); assert.equal(payload.approved_sha256, second.job_sha256); assert.equal(payload.copies, 1);
    await expect(dialog.getByRole('alert')).toContainText('printing disabled');
    // Never put the synthetic token, signed JWT or request headers in evidence.
    await dialog.getByLabel('本機代理權杖').fill('');
    await capture(page, 'medicine-disabled-1366.png', { width: 1366, height: 900 });
    await page.setViewportSize({ width: 390, height: 844 });
    await capture(page, 'medicine-disabled-390.png', { width: 390, height: 844 });
    const box = await dialog.boundingBox(); assert.ok(box && box.x >= 0 && box.x + box.width <= 390);
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
    evidence.push('real preview, human-approval gate, storage invalidation, exact hash submission rejected with 403, 1366/390 focus');
    await open(products[1]);
    const rejected = page.waitForResponse(response => response.url() === 'http://127.0.0.1:8765/print' && response.request().method() === 'POST');
    await previewButton.click(); assert.equal((await rejected).status(), 400);
    await expect(dialog.getByRole('alert')).toContainText(/英文商品名過長/);
    await expect(preview).toHaveCount(0); await expect(approve).toHaveCount(0);
    await page.keyboard.press('Escape'); evidence.push('unreadably long English name rejects real preview, no truncation fallback');
    const countBefore = ledger.filter(entry => entry.origin === 'http://127.0.0.1:8765' && entry.method === 'POST').length;
    await open(products[2]); await expect(dialog.getByRole('alert')).toContainText('1–24 碼 ASCII SKU');
    await expect(previewButton).toBeDisabled(); await expect(preview).toHaveCount(0);
    await page.keyboard.press('Escape');
    assert.equal(ledger.filter(entry => entry.origin === 'http://127.0.0.1:8765' && entry.method === 'POST').length, countBefore);
    evidence.push('invalid SKU blocked by actual dialog before any agent request');
    await open(products[3]);
    const dense = page.waitForResponse(response => response.url() === 'http://127.0.0.1:8765/print' && response.request().method() === 'POST');
    await previewButton.click(); assert.equal((await dense).status(), 400);
    await expect(dialog.getByRole('alert')).toContainText('QR is too dense');
    await expect(preview).toHaveCount(0); await expect(approve).toHaveCount(0);
    await page.keyboard.press('Escape'); evidence.push('format-valid dense SKU QR rejected by real renderer before submission');
    const status = await agent('/status'); assert.equal(status.queue_depth, 0); assert.equal(status.worker_alive, false); assert.deepEqual(status.jobs, []);
    assert.deepEqual(await snapshot(), before); assert.deepEqual(denied, []); assert.deepEqual(errors, []);
    evidence.push('all product/package records and stock unchanged; no queue, worker or print receipt');
  } catch (error) { failure = error; }
  finally {
    let receipt = null;
    try {
      if (context) await context.close();
    } catch (error) { failure ??= error; }
    if (child && child.exitCode === null) child.kill('SIGTERM');
    try {
      const exit = exitPromise && await Promise.race([exitPromise, delay(5000).then(() => null)]);
      assert.ok(exit && exit.code === 0, 'Disabled agent did not close normally');
      secretFree(childOutput);
      receipt = JSON.parse(fs.readFileSync(path.join(work, 'device-tripwire.json'), 'utf8'));
      assert.equal(receipt.printingEnabled, false); assert.equal(receipt.deviceCalls, 0);
      assert.equal(receipt.workerStarted, false); assert.equal(receipt.queued, 0); assert.equal(receipt.receiptFiles, 0);
    } catch (error) { failure ??= error; }
    const report = { status: failure ? 'failed' : 'passed', evidence, ledger, denied, errors, receipt,
      failure: failure ? { name: failure.name, message: failure.message } : null,
      scope: 'Synthetic Linux built Admin → real API/PG → real disabled agent. Disposable Noto CJK alias; no Windows/deployed-Origin/BLE/paper acceptance.' };
    secretFree(JSON.stringify(report)); fs.writeFileSync(path.join(output, 'medicine-label.json'), JSON.stringify(report, null, 2));
    fs.rmSync(work, { recursive: true });
  }
  if (failure) throw failure;
  return { status: 'passed', cases: evidence.length };
}
