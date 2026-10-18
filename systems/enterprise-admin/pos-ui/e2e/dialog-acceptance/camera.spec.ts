import { writeFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { test, expect, setup, screenshot, assertNoCheckout, product, origin } from './fixtures';
import { viewports, cameraLiteral } from './cases.mjs';

declare global {
  interface Window {
    __cameraQA: { calls: MediaStreamConstraints[]; streams: MediaStream[]; deny: boolean; delay: boolean; release: (() => void) | null };
  }
}
async function observeMedia(page: Page) {
  await page.addInitScript(() => {
    const qa = window.__cameraQA = { calls: [] as MediaStreamConstraints[], streams: [] as MediaStream[], deny: false, delay: false, release: null as (() => void) | null };
    const acquire = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      qa.calls.push(constraints ?? {});
      if (qa.deny) throw new DOMException('Synthetic denial, not an OS permission test', 'NotAllowedError');
      const stream = await acquire(constraints);
      qa.streams.push(stream);
      if (qa.delay) await new Promise<void>(resolve => { qa.release = resolve; });
      return stream;
    };
  });
}
const opener = (page: Page) => page.getByRole('button', { name: '相機掃碼', exact: true });
const dialog = (page: Page) => page.getByRole('dialog', { name: '相機掃碼', exact: true });
const start = (page: Page) => dialog(page).getByRole('button', { name: '啟用相機／重新拍攝', exact: true });
const capture = (page: Page) => dialog(page).getByRole('button', { name: '拍攝並在本機辨識', exact: true });

async function mediaReceipt(page: Page) {
  return page.evaluate(() => ({
    calls: window.__cameraQA.calls,
    tracks: window.__cameraQA.streams.flatMap(stream => stream.getTracks().map(track => ({
      kind: track.kind, label: track.label, readyState: track.readyState, settings: track.getSettings(),
    }))),
  }));
}
async function captureFrame(page: Page) {
  await start(page).click();
  await expect(capture(page)).toBeEnabled();
  await expect.poll(() => dialog(page).locator('video').evaluate(video => (video as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  await capture(page).click();
  await expect(dialog(page).getByRole('radio')).toHaveCount(1);
  await expect.poll(async () => (await mediaReceipt(page)).tracks.every(track => track.readyState === 'ended')).toBe(true);
}
async function pixels(page: Page, control: Locator, name: string) {
  await control.focus();
  await expect(control).toBeFocused(); await expect(control).toBeVisible();
  const geometry = await control.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const points = [[rect.x + rect.width / 2, rect.y + rect.height / 2],
      [rect.x + 2, rect.y + rect.height / 2], [rect.right - 2, rect.y + rect.height / 2],
      [rect.x + rect.width / 2, rect.y + 2], [rect.x + rect.width / 2, rect.bottom - 2]];
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
      viewportWidth: innerWidth, viewportHeight: innerHeight, scrollX,
      documentWidth: document.documentElement.scrollWidth,
      hits: points.map(([x, y]) => { const hit = document.elementFromPoint(x, y); return { x, y, owned: !!hit && (hit === node || node.contains(hit)), hit: hit?.tagName }; }) };
  });
  await writeFile(test.info().outputPath(name + '.geometry.json'), JSON.stringify({ nonce: process.env.DIALOG_UI_NONCE, test: test.info().title, name, geometry }, null, 2));
  expect(geometry.scrollX).toBe(0); expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.x).toBeGreaterThanOrEqual(0); expect(geometry.y).toBeGreaterThanOrEqual(0);
  expect(geometry.x + geometry.width).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.y + geometry.height).toBeLessThanOrEqual(geometry.viewportHeight);
  expect(geometry.width).toBeGreaterThanOrEqual(44); expect(geometry.height).toBeGreaterThanOrEqual(44);
  expect(geometry.hits.every(point => point.owned)).toBe(true);
  await screenshot(page, test.info(), name + '.png');
}
for (const viewport of viewports) {
  test(`camera local decode and explicit package handoff at ${viewport.width}x${viewport.height}`, async ({ page, context, fixture }) => {
    await page.setViewportSize(viewport);
    await context.grantPermissions(['camera'], { origin });
    await observeMedia(page);
    const wasm: { status: number; mime: string }[] = [];
    page.on('response', response => {
      if (response.url().endsWith('.wasm')) wasm.push({ status: response.status(), mime: response.headers()['content-type'] ?? '' });
    });
    const candidate = { packageId: 'synthetic-camera-package', revisionId: 'synthetic-camera-revision', revision: 1,
      label: '合成盒裝', contents: '每盒 2 顆', source: 'synthetic camera fixture',
      unitsPerPackage: 2, stockUnitLabel: '顆', validFrom: '2026-10-18T00:00:00Z', validUntil: null, product };
    let lookups = 0, resolves = 0;
    await context.route('**/api/v1/admin/pos/packages/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const expected = { identifier: { namespace: 'MANUFACTURER', value: cameraLiteral }, packageId: candidate.packageId, revision: 1 };
      if (url.origin === origin && request.method() === 'GET' && url.pathname === '/api/v1/admin/pos/packages/lookup'
        && url.searchParams.get('namespace') === 'MANUFACTURER' && url.searchParams.get('value') === cameraLiteral
        && [...url.searchParams].length === 2) {
        lookups++; fixture.reads.push('GET ' + url.pathname + url.search);
        await route.fulfill({ json: { success: true, data: [candidate] } }); return;
      }
      if (url.origin === origin && request.method() === 'POST' && url.pathname === '/api/v1/admin/pos/packages/resolve'
        && !url.search && JSON.stringify(request.postDataJSON()) === JSON.stringify(expected)) {
        resolves++; fixture.expectedWrites.push({ method: 'POST', path: url.pathname, body: request.postDataJSON() });
        await route.fulfill({ json: { success: true, data: candidate } }); return;
      }
      fixture.unexpected.push(request.method() + ' ' + url.href); await route.abort();
    });
    await setup(page);
    await opener(page).click();
    expect((await mediaReceipt(page)).calls).toHaveLength(0);
    await expect(start(page)).toBeFocused();
    await start(page).click(); await expect(capture(page)).toBeEnabled();
    await expect.poll(() => dialog(page).locator('video').evaluate(video => (video as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
    await pixels(page, capture(page), 'camera-live');
    await capture(page).click();
    await expect(dialog(page).getByRole('radio')).toHaveCount(1);
    expect(wasm.some(response => response.status === 200 && response.mime.includes('application/wasm'))).toBe(true);
    // Warm local decode only: no claim about cold offline asset installation.
    await context.setOffline(true);
    await captureFrame(page);
    await context.setOffline(false);
    const confirm = dialog(page).getByRole('button', { name: '確認這段辨識文字', exact: true });
    const handoff = dialog(page).getByRole('button', { name: '使用這段原碼查找商品／包裝', exact: true });
    await expect(confirm).toBeDisabled(); await expect(handoff).toBeDisabled();
    expect(lookups).toBe(0); expect(resolves).toBe(0);
    await dialog(page).getByRole('radio').check();
    await dialog(page).locator('summary').click();
    const evidence = JSON.parse(await dialog(page).getByLabel('圖片掃描證據 JSON').innerText());
    expect(evidence.scan.literal).toBe(cameraLiteral);
    expect(evidence.scan.source).toBe('camera'); expect(evidence.scan.evidence).toEqual({ inputRoute: 'camera-frame', hardwareVerified: false });
    expect(evidence.scan.bytes.status).toBe('observed'); expect(evidence.scan.bytes.value).toEqual([...Buffer.from(cameraLiteral)]);
    expect(evidence.scan.decoder.version).toBe('3.1.2'); expect(evidence.scan.gs1.status).toBe('unknown');
    await expect(handoff).toBeDisabled(); await confirm.click();
    await expect(page.getByLabel('商品數量')).toHaveValue('1');
    expect(lookups).toBe(0); assertNoCheckout(fixture);
    await pixels(page, handoff, 'camera-confirmed');
    for (const key of ['F2', 'F4', 'F7', 'F8']) await page.keyboard.press(key);
    await expect(dialog(page)).toHaveCount(1);
    await handoff.click();
    const lookup = page.getByRole('dialog', { name: '商品／包裝查找', exact: true });
    await expect(dialog(page)).toHaveCount(0);
    await expect(lookup.getByRole('textbox', { name: '原始識別碼', exact: true })).toHaveValue(cameraLiteral);
    expect(lookups).toBe(0); expect(resolves).toBe(0);
    await lookup.getByRole('button', { name: '查找完全相符包裝', exact: true }).click();
    const choose = lookup.getByRole('button', { name: /確認加入 1 個包裝 = 2 顆/ });
    await expect(choose).toBeEnabled(); expect(lookups).toBe(1); expect(resolves).toBe(0);
    await expect(page.getByLabel('商品數量')).toHaveValue('1');
    await pixels(page, choose, 'camera-package-choice');
    await choose.click(); await expect(page.getByLabel('商品數量')).toHaveValue('3');
    expect(resolves).toBe(1); expect(fixture.checkoutCalls).toHaveLength(0);
    await lookup.getByRole('button', { name: '關閉包裝查找', exact: true }).click();
    await expect(opener(page)).toBeFocused();
    const media = await mediaReceipt(page);
    expect(media.calls).toHaveLength(2); expect(media.calls.every(call => call.audio === false)).toBe(true);
    expect(media.tracks).toHaveLength(2); expect(media.tracks.every(track => track.kind === 'video' && track.readyState === 'ended')).toBe(true);
    await opener(page).click(); await expect(dialog(page).getByRole('radio')).toHaveCount(0);
    await page.keyboard.press('Escape'); await expect(opener(page)).toBeFocused();
    await writeFile(test.info().outputPath('camera-evidence.json'), JSON.stringify({ nonce: process.env.DIALOG_UI_NONCE, test: test.info().title,
      scope: 'Official Chrome fake Y4M video + real video/canvas/pinned local WASM + synthetic package HTTP; no physical camera or OS prompt acceptance',
      media, wasm, warmOffline: true, lookups, resolves, evidence }, null, 2));
  });
}

test('camera denied retry and stale permission cleanup', async ({ page, context, fixture }) => {
  await context.grantPermissions(['camera'], { origin }); await observeMedia(page); await setup(page);
  await page.evaluate(() => { window.__cameraQA.deny = true; });
  await opener(page).click(); await start(page).click();
  await expect(dialog(page).getByRole('alert')).toContainText('尚未允許');
  await pixels(page, start(page), 'camera-denied');
  await page.evaluate(() => { window.__cameraQA.deny = false; window.__cameraQA.delay = true; });
  await start(page).click();
  await expect.poll(() => page.evaluate(() => window.__cameraQA.release !== null)).toBe(true);
  await page.keyboard.press('Escape'); await expect(opener(page)).toBeFocused();
  await page.evaluate(() => { window.__cameraQA.release?.(); });
  await expect.poll(async () => (await mediaReceipt(page)).tracks.every(track => track.readyState === 'ended')).toBe(true);
  await opener(page).click(); await expect(dialog(page).getByRole('radio')).toHaveCount(0);
  await page.evaluate(() => { window.__cameraQA.delay = false; });
  await start(page).click(); await expect(capture(page)).toBeEnabled();
  await page.keyboard.press('Escape');
  const media = await mediaReceipt(page);
  expect(media.calls).toHaveLength(3); expect(media.tracks).toHaveLength(2);
  expect(media.tracks.every(track => track.readyState === 'ended')).toBe(true);
  await expect(page.getByLabel('商品數量')).toHaveValue('1'); assertNoCheckout(fixture);
  await writeFile(test.info().outputPath('camera-evidence.json'), JSON.stringify({ nonce: process.env.DIALOG_UI_NONCE, test: test.info().title,
    scope: 'Synthetic denial and delayed native fake-device stream; no OS permission acceptance', media, lookups: 0, resolves: 0 }, null, 2));
});
