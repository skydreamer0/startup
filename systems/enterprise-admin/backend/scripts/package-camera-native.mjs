// Called only after the existing package harness establishes exclusive empty PG ownership.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { cameraY4m } from '../../pos-ui/e2e/dialog-acceptance/camera-fixture.mjs';

export const nativeCameraLiteral = '00Case-390 ';
export async function prepareNativeCamera(output, requirePos) {
  const writer = requirePos('zxing-wasm/writer');
  assert.equal(writer.ZXING_WASM_VERSION, '3.1.2');
  await writer.prepareZXingModule({ overrides: { wasmBinary: fs.readFileSync(requirePos.resolve('zxing-wasm/writer/zxing_writer.wasm')) }, fireImmediately: true });
  const generated = await writer.writeBarcode(nativeCameraLiteral, { format: 'QRCode' });
  assert.equal(generated.error, '');
  const bytes = cameraY4m(generated.symbol), file = path.join(output, 'camera-native.y4m');
  fs.writeFileSync(file, bytes, { flag: 'wx' });
  return { file, sha256: createHash('sha256').update(bytes).digest('hex'), literal: nativeCameraLiteral, physicalCamera: false };
}
export function assertNativeCameraReceipt(receipt) {
  assert.equal(receipt.literal, nativeCameraLiteral);
  assert.equal(receipt.lookupStatus, 200); assert.equal(receipt.resolveStatus, 200);
  assert.equal(receipt.lookupCount, 1); assert.equal(receipt.resolveCount, 1);
  assert.equal(receipt.beforeQuantity, 3); assert.equal(receipt.afterQuantity, 9);
  assert.equal(receipt.revision, 2); assert.equal(receipt.unitsPerPackage, 6);
  assert.equal(receipt.databaseMatched, true); assert.equal(receipt.preConfirmationRequests, 0);
  assert.equal(receipt.businessUnchanged, true); assert.equal(receipt.tracks.length, 2);
  assert.ok(receipt.tracks.every(track => track.kind === 'video' && track.state === 'ended'));
  assert.equal(receipt.mediaCalls, 3); assert.equal(receipt.audioRequested, false);
  assert.equal(receipt.cancelPreserved, true); assert.equal(receipt.denialPreserved, true);
  assert.equal(receipt.consumedChoiceRemoved, true);
  assert.equal(receipt.repeatedActivations, 2);
  assert.equal(receipt.requestStarts.filter(entry => entry.method === 'GET').length, 1);
  assert.equal(receipt.requestStarts.filter(entry => entry.method === 'POST').length, 1);
  assert.deepEqual(receipt.phaseBoundaries.map(entry => entry.phase), ['open', 'permission-denial', 'stream-cancel', 'capture', 'confirmation', 'handoff']);
  assert.ok(receipt.phaseBoundaries.every(entry => entry.initiated === 0));
  assert.match(receipt.lookupSha256, /^[a-f0-9]{64}$/); assert.match(receipt.resolveSha256, /^[a-f0-9]{64}$/);
}
export async function runNativeCamera({ pos, context, posOrigin, viewport, expect, capture, db, tenantId, business, output, nonce, apiLedger, networkLedger }) {
  assert.equal(viewport.width, 390);
  const baseline = await business(), apiStart = apiLedger.length;
  const cart = pos.locator('.pos-cart-panel'), cartBefore = await cart.innerText();
  const open = pos.getByRole('button', { name: '相機掃碼', exact: true });
  const modal = pos.getByRole('dialog', { name: '相機掃碼', exact: true });
  const enable = modal.getByRole('button', { name: '啟用相機／重新拍攝', exact: true });
  const snap = modal.getByRole('button', { name: '拍攝並在本機辨識', exact: true });
  await context.grantPermissions(['camera'], { origin: posOrigin });
  // Observe real fake-device streams; inject only one labelled permission rejection.
  await pos.evaluate(() => {
    const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const qa = window.__nativeCamera = { calls: [], streams: [], deny: false };
    navigator.mediaDevices.getUserMedia = async constraints => {
      qa.calls.push(constraints);
      if (qa.deny) throw new DOMException('Synthetic permission rejection', 'NotAllowedError');
      const stream = await acquire(constraints); qa.streams.push(stream); return stream;
    };
  });
  const media = () => pos.evaluate(() => ({ mediaCalls: window.__nativeCamera.calls.length,
    audioRequested: window.__nativeCamera.calls.some(call => call.audio !== false),
    tracks: window.__nativeCamera.streams.flatMap(stream => stream.getTracks().map(track => ({ kind: track.kind, state: track.readyState }))) }));
  const packageRequests = () => apiLedger.slice(apiStart).filter(row => /\/pos\/packages\//.test(row.path));
  const starts = [], phases = [];
  let phase = 'open';
  const observe = request => {
    const url = new URL(request.url());
    if (url.origin === posOrigin && url.pathname.startsWith('/api/v1/admin/pos/packages/')) {
      starts.push({ phase, method: request.method(), path: url.pathname + url.search });
    }
  };
  pos.on('request', observe);
  function boundary(next) {
    phases.push({ phase, initiated: starts.length });
    assert.equal(starts.length, 0, `Unexpected package request initiated during ${phase}`);
    phase = next;
  }
  try {
  await open.click(); assert.equal((await media()).mediaCalls, 0);
  await pos.keyboard.press('Escape'); await expect(open).toBeFocused();
  assert.equal(await cart.innerText(), cartBefore);
  boundary('permission-denial');
  await open.click(); await pos.evaluate(() => { window.__nativeCamera.deny = true; });
  await enable.click(); await expect(modal.getByRole('alert')).toBeVisible();
  assert.equal(await cart.innerText(), cartBefore); assert.equal(packageRequests().length, 0);
  boundary('stream-cancel');
  await pos.evaluate(() => { window.__nativeCamera.deny = false; });
  await enable.click(); await expect(snap).toBeEnabled();
  await pos.keyboard.press('Escape'); await expect(open).toBeFocused();
  await expect.poll(async () => (await media()).tracks.every(track => track.state === 'ended')).toBe(true);
  assert.equal(await cart.innerText(), cartBefore);
  boundary('capture');
  await open.click(); await enable.click(); await expect(snap).toBeEnabled();
  await expect.poll(() => modal.locator('video').evaluate(video => video.videoWidth)).toBeGreaterThan(0);
  await snap.click(); await expect(modal.getByRole('radio')).toHaveCount(1);
  await expect.poll(async () => (await media()).tracks.every(track => track.state === 'ended')).toBe(true);
  const confirm = modal.getByRole('button', { name: '確認這段辨識文字', exact: true });
  const handoff = modal.getByRole('button', { name: '使用這段原碼查找商品／包裝', exact: true });
  await expect(confirm).toBeDisabled(); await expect(handoff).toBeDisabled();
  await modal.getByRole('radio').check(); await expect(handoff).toBeDisabled();
  boundary('confirmation');
  await confirm.click(); assert.equal(packageRequests().length, 0); assert.equal(await cart.innerText(), cartBefore);
  boundary('handoff');
  await handoff.click();
  const lookup = pos.getByRole('dialog', { name: '商品／包裝查找', exact: true });
  await expect(lookup.getByLabel('原始識別碼', { exact: true })).toHaveValue(nativeCameraLiteral);
  await lookup.getByText('本次輸入來源與原始證據', { exact: true }).click();
  const scan = JSON.parse(await lookup.locator('details pre').innerText());
  assert.equal(scan.source, 'camera'); assert.equal(scan.literal, nativeCameraLiteral);
  assert.equal(scan.evidence.hardwareVerified, false); assert.equal(scan.decoder.version, '3.1.2');
  assert.equal(scan.bytes.status, 'observed'); assert.deepEqual(scan.bytes.value, [...Buffer.from(nativeCameraLiteral)]);
  assert.equal(packageRequests().length, 0);
  boundary('lookup');
  const preConfirmationRequests = starts.length;
  const lookupResponse = pos.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/admin/pos/packages/lookup');
  await lookup.getByRole('button', { name: '查找完全相符包裝', exact: true }).click();
  const found = await lookupResponse, lookupBytes = await found.body(); assert.equal(found.status(), 200);
  const rows = JSON.parse(lookupBytes).data;
  const row = rows.find(item => item.label === '合成包裝 390 保留草稿');
  assert.ok(row); assert.equal(row.revision, 2); assert.equal(row.unitsPerPackage, 6);
  assert.equal(new URL(found.url()).searchParams.get('value'), nativeCameraLiteral);
  assert.equal(new URL(found.url()).searchParams.get('namespace'), 'MANUFACTURER');
  const stored = await db.productPackageRevision.findUnique({ where: { id: row.revisionId }, include: { identifiers: true } });
  assert.ok(stored); assert.equal(stored.tenantId, tenantId); assert.equal(stored.packageId, row.packageId);
  assert.equal(stored.revision, row.revision); assert.equal(stored.unitsPerPackage, row.unitsPerPackage); assert.equal(stored.retiredAt, null);
  const storedPackage = await db.productPackage.findUnique({ where: { id: stored.packageId } });
  assert.ok(storedPackage); assert.equal(storedPackage.tenantId, tenantId);
  assert.equal(storedPackage.productId, row.product.id);
  assert.ok(stored.identifiers.some(item => item.namespace === 'MANUFACTURER' && item.value === nativeCameraLiteral));
  await expect(lookup.getByRole('button').filter({ hasText: '合成包裝 390 未知' })).toBeDisabled();
  assert.equal(await cart.innerText(), cartBefore);
  const chosen = lookup.getByRole('button').filter({ hasText: row.label });
  await chosen.focus(); await expect(chosen).toBeFocused();
  const geometry = await chosen.evaluate(node => { const r = node.getBoundingClientRect(); const points = [[r.x+r.width/2,r.y+r.height/2],[r.x+2,r.y+r.height/2],[r.right-2,r.y+r.height/2],[r.x+r.width/2,r.y+2],[r.x+r.width/2,r.bottom-2]]; return { x:r.x,y:r.y,width:r.width,height:r.height,viewportWidth:innerWidth,viewportHeight:innerHeight,scrollX,documentWidth:document.documentElement.scrollWidth,hits:points.map(([x,y])=>{const hit=document.elementFromPoint(x,y);return{x,y,owned:!!hit&&(hit===node||node.contains(hit)),hit:hit?.tagName};}) }; });
  fs.writeFileSync(path.join(output,'camera-native.geometry.json'),JSON.stringify({nonce,geometry},null,2));
  assert.equal(geometry.scrollX,0); assert.ok(geometry.documentWidth<=geometry.viewportWidth);
  assert.ok(geometry.x>=0&&geometry.y>=0&&geometry.x+geometry.width<=geometry.viewportWidth&&geometry.y+geometry.height<=geometry.viewportHeight);
  assert.ok(geometry.width>=44&&geometry.height>=44&&geometry.hits.every(point=>point.owned));
  await capture(pos,'camera-native-package-390.png',viewport);
  phase = 'resolve';
  let release, ready, handled, responseError, claimed = false;
  const released = new Promise(done => { release = done; });
  const readyPromise = new Promise(done => { ready = done; });
  const handledPromise = new Promise(done => { handled = done; });
  const pattern = '**/api/v1/admin/pos/packages/resolve';
  const expectedRequest = { identifier: { namespace: 'MANUFACTURER', value: nativeCameraLiteral }, packageId: stored.packageId, revision: stored.revision };
  const hold = async route => {
    if (claimed) { responseError = new Error('Duplicate resolve initiated'); await route.abort(); return; }
    claimed = true;
    try {
      const request = route.request();
      assert.equal(new URL(request.url()).origin, posOrigin); assert.equal(request.method(), 'POST');
      assert.deepEqual(request.postDataJSON(), expectedRequest);
      networkLedger.push({ viewport: viewport.width, method: 'POST', path: '/api/v1/admin/pos/packages/resolve', allowed: true, api: true, delayedAuthenticResponse: true });
      const response = await route.fetch({ timeout: 10000 });
      assert.equal(response.status(), 200);
      ready(); await released; await route.fulfill({ response });
    } catch (error) { responseError = error; ready(); }
    finally { handled(); }
  };
  const bounded = async (promise, label) => {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(label)), 15000); })]); }
    finally { clearTimeout(timer); }
  };
  await pos.route(pattern, hold);
  let resolved, resolveBytes;
  try {
    await chosen.click();
    await bounded(readyPromise, 'Authentic resolve did not arrive');
    if (responseError) throw responseError;
    await expect(chosen).toBeDisabled();
    // Actual repeated pointer activation at the same visible control while its
    // authentic server response is held. No force click or DOM event injection.
    await pos.mouse.click(geometry.x + geometry.width / 2, geometry.y + geometry.height / 2);
    await pos.mouse.click(geometry.x + geometry.width / 2, geometry.y + geometry.height / 2);
    await pos.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
    assert.equal(starts.filter(entry => entry.method === 'POST').length, 1);
    assert.equal(await cart.innerText(), cartBefore);
    const resolveResponse = pos.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/admin/pos/packages/resolve');
    release(); await bounded(handledPromise, 'Authentic resolve release did not finish');
    if (responseError) throw responseError;
    resolved = await resolveResponse; resolveBytes = await resolved.body();
  } finally {
    release();
    try { if (claimed) await bounded(handledPromise, 'Resolve handler cleanup did not finish'); }
    finally { await pos.unroute(pattern, hold); }
  }
  assert.equal(resolved.status(), 200);
  assert.deepEqual(resolved.request().postDataJSON(), expectedRequest);
  const resolvedData = JSON.parse(resolveBytes).data;
  assert.equal(resolvedData.revisionId, stored.id);
  assert.equal(resolvedData.packageId, stored.packageId);
  assert.equal(resolvedData.revision, stored.revision);
  assert.equal(resolvedData.unitsPerPackage, stored.unitsPerPackage);
  assert.equal(resolvedData.product.id, storedPackage.productId);
  await expect(cart.getByText('共 9 件商品',{exact:true})).toBeVisible();
  await expect(chosen).toHaveCount(0); // Consumed selection cannot be clicked twice.
  await lookup.getByRole('button',{name:'關閉包裝查找',exact:true}).click(); await expect(open).toBeFocused();
  const afterBusiness = await business();
  assert.deepEqual(afterBusiness,baseline);
  fs.writeFileSync(path.join(output,'camera-native-business.json'), JSON.stringify({ nonce, before: baseline, after: afterBusiness }, null, 2));
  fs.writeFileSync(path.join(output,'camera-native-database.json'), JSON.stringify({ nonce, revision: stored, package: storedPackage }, null, 2));
  const requests=packageRequests();
  const receipt={nonce,literal:nativeCameraLiteral,lookupStatus:found.status(),resolveStatus:resolved.status(),lookupCount:requests.filter(x=>x.method==='GET').length,resolveCount:requests.filter(x=>x.method==='POST').length,
    beforeQuantity:3,afterQuantity:9,revision:stored.revision,unitsPerPackage:stored.unitsPerPackage,databaseMatched:true,preConfirmationRequests,repeatedActivations:2,businessUnchanged:true,cancelPreserved:true,denialPreserved:true,consumedChoiceRemoved:true,
    ...await media(),lookupSha256:createHash('sha256').update(lookupBytes).digest('hex'),resolveSha256:createHash('sha256').update(resolveBytes).digest('hex'),scan,requests,requestStarts:starts,phaseBoundaries:phases,resolveRequest:expectedRequest,
    scope:'Synthetic fake-device Chrome -> canvas/WASM -> real package API/JWT/RBAC -> owned PG. No physical permission prompt, login UI, checkout, stock posting or hardware acceptance.'};
  fs.writeFileSync(path.join(output,'camera-native-lookup.json'),lookupBytes); fs.writeFileSync(path.join(output,'camera-native-resolve.json'),resolveBytes);
  fs.writeFileSync(path.join(output,'camera-native.json'),JSON.stringify(receipt,null,2)); assertNativeCameraReceipt(receipt); return receipt;
  } finally { pos.off('request', observe); }
}
