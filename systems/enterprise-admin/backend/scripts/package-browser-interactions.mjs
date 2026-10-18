// Supplemental flows called only inside package-browser-acceptance.mjs, after
// its unchanged GitHub-hosted / isolated PostgreSQL ownership guards pass.
// No mocks of the application, API response contents, decoder, or database.
import assert from 'node:assert/strict';
import fs from 'node:fs';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function bounded(promise, description) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${description}`)), 15000);
    })]);
  } finally { clearTimeout(timer); }
}
async function painted(page) {
  await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
}

export async function runPackageBrowserInteractions({ admin, pos, context, adminOrigin, posOrigin,
  maintenance, product, code, prefix, viewport, expect, requirePos, capture, networkLedger }) {
  assert.equal(viewport.width, 390, 'Run the supplemental flows once, at the narrow viewport');
  const results = { viewport, physicalSoftKeyboard: 'NOT_RUN', responseDelay: 'real HTTP response held by Playwright; browser abort is allowed' };
  const cart = pos.locator('.pos-cart-panel');
  const cartBefore = await cart.innerText();
  const lookup = pos.getByRole('dialog', { name: '商品／包裝查找', exact: true });
  const open = pos.getByRole('button', { name: '包裝查找', exact: true });

  // Existing locked ZXing writer produces only an in-memory synthetic image.
  // The built UI's bundled reader decodes it; this is not independent barcode
  // standards conformance or physical camera/scanner acceptance.
  const writer = requirePos('zxing-wasm/writer');
  assert.equal(writer.ZXING_WASM_VERSION, '3.1.2');
  await writer.prepareZXingModule({ overrides: {
    wasmBinary: fs.readFileSync(requirePos.resolve('zxing-wasm/writer/zxing_writer.wasm')),
  }, fireImmediately: true });
  const generated = await writer.writeBarcode(code, { format: 'QRCode', scale: 4, addQuietZones: true });
  assert.equal(generated.error, ''); assert.ok(generated.image);
  const imageOpen = pos.getByRole('button', { name: '圖片掃碼', exact: true });
  await imageOpen.click();
  const image = pos.getByRole('dialog', { name: '圖片掃碼', exact: true });
  await image.getByLabel('選擇條碼或 QR Code 圖片', { exact: true }).setInputFiles({
    name: 'synthetic-package-handoff.png', mimeType: 'image/png',
    buffer: Buffer.from(await generated.image.arrayBuffer()),
  });
  await expect(image.getByRole('radio')).toHaveCount(1);
  const handoff = image.getByRole('button', { name: '使用這段原碼查找商品／包裝', exact: true });
  await expect(handoff).toBeDisabled();
  await image.getByRole('radio').check();
  await expect(handoff).toBeDisabled();
  await image.getByRole('button', { name: '確認這段辨識文字', exact: true }).click();
  await handoff.click();
  await expect(image).toHaveCount(0);
  await expect(lookup.getByLabel('原始識別碼', { exact: true })).toHaveValue(code);
  await lookup.getByText('本次輸入來源與原始證據', { exact: true }).click();
  const scan = JSON.parse(await lookup.locator('details pre').innerText());
  assert.equal(scan.literal, code);
  assert.equal(scan.decoder.version, '3.1.2');
  assert.equal(await cart.innerText(), cartBefore, 'Image confirmation/handoff must not add to cart');
  await lookup.getByRole('button', { name: '查找完全相符包裝', exact: true }).click();
  await expect(lookup.getByText('找到 2 個包裝；請核對後人工確認。', { exact: true })).toBeVisible();
  assert.equal(await cart.innerText(), cartBefore);
  await capture(pos, 'image-handoff-390.png', viewport);
  await pos.keyboard.press('Escape');
  await expect(lookup).toHaveCount(0);
  await expect(imageOpen).toBeFocused();
  results.imageHandoff = { status: 'passed', exactLiteral: true, explicitSelectionAndConfirmation: true, focusRestored: true, implicitCartMutation: false };

  // Hold an authentic successful resolve response, edit A→B→A, perform a new
  // lookup, and then release the obsolete response. No fabricated response data.
  // Axios cancellation may prevent delivery; both paths must leave the cart alone.
  await open.click();
  const literal = lookup.getByLabel('原始識別碼', { exact: true });
  await literal.fill(code);
  await lookup.getByRole('button', { name: '查找完全相符包裝', exact: true }).click();
  await expect(lookup.getByText('找到 2 個包裝；請核對後人工確認。', { exact: true })).toBeVisible();
  const ready = deferred(), release = deferred(), handled = deferred();
  let claimed = false, delayedStatus, delayedError = null;
  const resolvePattern = '**/api/v1/admin/pos/packages/resolve';
  const delayHandler = async route => {
    const request = route.request(), url = new URL(request.url());
    if (claimed) { await route.continue(); return; }
    claimed = true;
    try {
      assert.equal(url.origin, posOrigin); assert.equal(request.method(), 'POST');
      assert.equal(request.postDataJSON().identifier.value, code);
      networkLedger.push({ viewport: viewport.width, method: request.method(), path: url.pathname + url.search,
        allowed: true, api: true, delayedAuthenticResponse: true });
      const response = await route.fetch({ timeout: 10000 });
      delayedStatus = response.status();
      assert.equal(delayedStatus, 200, 'The obsolete resolve must really succeed on the server');
      ready.resolve();
      await release.promise;
      try { await route.fulfill({ response }); }
      catch (error) {
        // Suppression is allowed only when the browser has actually cancelled
        // this exact old request, not for arbitrary protocol/runner errors.
        if (request.failure()?.errorText !== 'net::ERR_ABORTED') throw error;
      }
    } catch (error) { delayedError = error; ready.resolve(); }
    finally { handled.resolve(); }
  };
  await pos.route(resolvePattern, delayHandler);
  let flowError;
  try {
    await lookup.getByRole('button').filter({ hasText: `${prefix} 瓶` }).click();
    await bounded(ready.promise, 'authentic delayed resolve');
    if (delayedError) throw delayedError;
    await literal.fill(`${code}B`); await literal.fill(code);
    await lookup.getByRole('button', { name: '查找完全相符包裝', exact: true }).click();
    await expect(lookup.getByText('找到 2 個包裝；請核對後人工確認。', { exact: true })).toBeVisible();
    release.resolve(); await bounded(handled.promise, 'release obsolete resolve');
    if (delayedError) throw delayedError;
    await painted(pos);
    assert.equal(await cart.innerText(), cartBefore, 'Obsolete resolve after A→B→A must never add');
    await expect(lookup.getByText('找到 2 個包裝；請核對後人工確認。', { exact: true })).toBeVisible();
    await capture(pos, 'resolve-aba-390.png', viewport);
    results.resolveAba = { status: 'passed', realServerStatus: delayedStatus, oldResponseAdds: 0 };
  } catch (error) {
    flowError = error;
    throw error;
  } finally {
    release.resolve();
    let cleanupError;
    try {
      if (claimed) await bounded(handled.promise, 'delayed handler cleanup');
    } catch (error) { cleanupError = error; }
    finally {
      try { await pos.unroute(resolvePattern, delayHandler); }
      catch (error) { cleanupError ??= error; }
    }
    if (cleanupError) {
      if (flowError) console.error('Supplemental ABA cleanup also failed:', cleanupError.message);
      else throw cleanupError;
    }
  }

  // Actual keyboard events on Chromium at 390px, not a jsdom event mock.
  // Do not label this as physical iOS/Android software-keyboard acceptance.
  const controls = lookup.locator('textarea:not(:disabled), select:not(:disabled), button:not(:disabled), summary');
  await controls.last().focus(); await pos.keyboard.press('Tab');
  await expect(controls.first()).toBeFocused();
  await pos.keyboard.press('Shift+Tab'); await expect(controls.last()).toBeFocused();
  const seen = new Set();
  const controlCount = await controls.count();
  for (let index = 0; index < controlCount + 1; index++) {
    await pos.keyboard.press('Tab');
    assert.equal(await lookup.evaluate(node => node.contains(document.activeElement)), true);
    seen.add(await lookup.evaluate(node => Array.from(node.querySelectorAll('textarea:not(:disabled), select:not(:disabled), button:not(:disabled), summary')).indexOf(document.activeElement)));
  }
  assert.equal(seen.size, controlCount, 'Every enabled lookup control must be keyboard reachable');
  await literal.focus();
  const keyboardLookup = pos.waitForResponse(response => response.request().method() === 'GET'
    && new URL(response.url()).pathname === '/api/v1/admin/pos/packages/lookup');
  await pos.keyboard.press('Enter');
  assert.equal((await keyboardLookup).status(), 200);
  await expect(lookup.getByText('找到 2 個包裝；請核對後人工確認。', { exact: true })).toBeVisible();
  await pos.keyboard.press('Escape'); await expect(lookup).toHaveCount(0); await expect(open).toBeFocused();
  assert.equal(await cart.innerText(), cartBefore);
  results.narrowKeyboard = { status: 'passed', tabCycle: true, reverseTab: true, enterLookup: true, escapeFocusReturn: true, physicalSoftKeyboard: 'NOT_RUN' };

  // Two real Admin pages observe the same active revision. Page B retires it;
  // page A retains its old draft and must receive a real HTTP 409 (not a stub).
  await maintenance.getByRole('button', { name: '重新載入歷史', exact: true }).click();
  const oldRow = maintenance.locator('details').filter({ hasText: `${prefix} 瓶 · revision 1` });
  await oldRow.getByRole('button', { name: '以 revision 1 建立新版本', exact: true }).click();
  const draftLabel = `${prefix} 保留草稿`;
  await maintenance.getByLabel('包裝名稱', { exact: true }).fill(draftLabel);
  await maintenance.getByLabel('人工覆核原因', { exact: true }).fill('合成雙頁退役競態覆核');
  const other = await context.newPage();
  try {
    await other.goto(`${adminOrigin}/inventory?page=3`);
    await other.getByRole('button', { name: `維護 ${product.name} 的包裝對照`, exact: true }).click();
    const otherDialog = other.getByRole('dialog', { name: '商品／包裝對照', exact: true });
    const retireRow = otherDialog.locator('details').filter({ hasText: `${prefix} 瓶 · revision 1` });
    await retireRow.getByRole('button', { name: '以 revision 1 建立新版本', exact: true }).click();
    await otherDialog.getByLabel('停用原因（停用前必填）', { exact: true }).fill('合成另一畫面退役');
    await retireRow.getByRole('button', { name: '停用此 revision', exact: true }).click();
    await expect(retireRow.getByText(/停用：/)).toBeVisible();
    const submit = maintenance.getByRole('button', { name: '確認覆核並儲存新 revision', exact: true });
    const failure = admin.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/revisions'));
    await submit.click();
    const rejected = await failure;
    assert.equal(rejected.status(), 409); assert.equal(rejected.request().postDataJSON().expectedRetired, false);
    await expect(maintenance.getByRole('status')).toContainText('草稿已保留');
    await expect(maintenance.getByLabel('包裝名稱', { exact: true })).toHaveValue(draftLabel);
    await expect(submit).toBeDisabled();
    await maintenance.getByRole('button', { name: '重新載入歷史', exact: true }).click();
    await expect(oldRow.locator('summary')).toContainText('已停用');
    await expect(maintenance.getByLabel('包裝名稱', { exact: true })).toHaveValue(draftLabel);
    await expect(submit).toBeDisabled();
    await capture(admin, 'admin-conflict-draft-390.png', viewport);
    await oldRow.getByRole('button', { name: '以 revision 1 建立新版本', exact: true }).click();
    // Explicitly selecting history copies historical fields. The preserved edit
    // is deliberately re-entered; do not claim automatic merging of the draft.
    await maintenance.getByLabel('包裝名稱', { exact: true }).fill(draftLabel);
    await maintenance.getByLabel('人工覆核原因', { exact: true }).fill('重新核對已退役版本並明確建立replacement');
    const success = admin.waitForResponse(response => response.request().method() === 'POST'
      && new URL(response.url()).pathname.endsWith('/revisions'));
    await submit.click(); const accepted = await success;
    assert.ok(accepted.status() >= 200 && accepted.status() < 300);
    assert.equal(accepted.request().postDataJSON().expectedRetired, true);
    assert.equal(accepted.request().postDataJSON().expectedRevision, 1);
    await expect(maintenance.getByText('已儲存。請核對更新後的包裝歷史。', { exact: true })).toBeVisible();
    await expect(maintenance.locator('summary').filter({ hasText: `${draftLabel} · revision 2` })).toBeVisible();
    await capture(admin, 'admin-explicit-replacement-390.png', viewport);
    results.retirementConflict = { status: 'passed', rejectedHttp: 409, draftPreservedThroughRefresh: true,
      refreshAloneResubmits: false, explicitReplacement: true, replacementRevision: 2 };
  } finally { await other.close(); }
  return results;
}
