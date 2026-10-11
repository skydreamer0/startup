import { writeFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { test, expect, setup, screenshot, assertNoCheckout, product, origin, type Fixture } from './fixtures';
import { viewports } from './cases.mjs';

const opener = (page: Page) => page.getByRole('button', { name: '手動貼碼', exact: true });
const dialog = (page: Page) => page.getByRole('dialog', { name: '手動貼碼', exact: true });
const input = (page: Page) => dialog(page).getByRole('textbox', { name: '掃描文字', exact: true });
const inspect = (page: Page) => dialog(page).getByRole('button', { name: '檢視掃描結果', exact: true });
const close = (page: Page) => dialog(page).getByRole('button', { name: '關閉', exact: true });

declare global { interface Window { __manualStorageWrites: string[] } }
async function observeStorage(page: Page) {
  await page.evaluate(() => {
    window.__manualStorageWrites = [];
    const { setItem, removeItem, clear } = Storage.prototype;
    Storage.prototype.setItem = function (key, value) { window.__manualStorageWrites.push(`setItem:${key}`); setItem.call(this, key, value); };
    Storage.prototype.removeItem = function (key) { window.__manualStorageWrites.push(`removeItem:${key}`); removeItem.call(this, key); };
    Storage.prototype.clear = function () { window.__manualStorageWrites.push('clear'); clear.call(this); };
  });
}

async function state(page: Page) {
  return page.evaluate(() => ({
    url: location.href,
    cart: document.querySelector('.pos-cart-panel')?.textContent,
    quantities: Array.from(document.querySelectorAll<HTMLInputElement>('[aria-label="商品數量"]'), node => node.value),
    discount: document.querySelector<HTMLInputElement>('#order-discount')?.value,
    local: Object.entries(localStorage).sort(),
    session: Object.entries(sessionStorage).sort(),
    storageWrites: window.__manualStorageWrites,
  }));
}

// This is deliberately a synthetic ClipboardEvent, not OS clipboard evidence.
// Native textarea rendering still runs, exposing the CR/CRLF normalization boundary.
async function paste(target: Locator, literal: string) {
  const result = await target.evaluate((node, text) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/plain', text);
    const event = new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true });
    node.dispatchEvent(event);
    return { prevented: event.defaultPrevented, trusted: event.isTrusted };
  }, literal);
  expect(result).toEqual({ prevented: true, trusted: false });
}

async function evidence(page: Page, literal: string) {
  await expect(dialog(page).getByLabel('原始 literal', { exact: true })).toHaveText(JSON.stringify(literal));
  const result: unknown = JSON.parse((await dialog(page).getByLabel('掃描證據 JSON', { exact: true }).textContent())!);
  expect(result).toEqual({
    contractVersion: 1, source: 'manual', literal,
    bytes: { status: 'unknown' }, symbology: { status: 'unknown' }, gs1: { status: 'unknown' },
    decoder: { name: 'manual-text', version: '1' },
    evidence: { inputRoute: 'manual-text', hardwareVerified: false },
  });
  await expect(dialog(page).locator('a[href]')).toHaveCount(0);
}

function noEffects(fixture: Fixture) {
  assertNoCheckout(fixture);
  expect(fixture.reads.filter(read => read.includes('/pos/products/lookup'))).toEqual([]);
  expect(fixture.unexpected).toEqual([]);
}

async function restored(page: Page) {
  await expect(dialog(page)).toHaveCount(0);
  await expect(opener(page)).toBeFocused();
  await expect(page.locator('#root')).not.toHaveAttribute('inert');
  await expect(page.locator('#root')).not.toHaveAttribute('aria-hidden');
}

for (const viewport of viewports) {
  test(`manual literal and no-effects at ${viewport.width}x${viewport.height}`, async ({ page, fixture }) => {
    await page.setViewportSize(viewport); await setup(page); await observeStorage(page);
    const before = await state(page);
    await opener(page).click(); await expect(input(page)).toBeFocused();
    await expect(inspect(page)).toBeDisabled();
    await expect(page.locator('#root')).toHaveAttribute('inert', '');
    await expect(page.locator('#root')).toHaveAttribute('aria-hidden', 'true');
    const bounds = await dialog(page).boundingBox(); expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    await page.keyboard.type('001aB');
    await inspect(page).focus(); await page.keyboard.press('Enter');
    await evidence(page, '001aB');
    const literals = ['  001aB  ', '\u0000A\tB\r\nC\rD\n ', ']C101000123\u001d10LOT', 'https://example.invalid/item', 'e\u0301中文', '0'];
    for (const literal of literals) {
      await paste(input(page), literal);
      await expect(dialog(page).getByLabel('原始 literal', { exact: true })).toHaveCount(0);
      await inspect(page).click(); await evidence(page, literal);
      await expect(input(page)).toHaveValue(literal.replace(/\r\n?/g, '\n'));
    }
    await screenshot(page, test.info(), 'manual-literal.png');
    await writeFile(test.info().outputPath('manual-literal-receipt.json'), JSON.stringify({
      scope: 'Actual browser component; trusted typed input; synthetic ClipboardEvent only',
      nonce: process.env.DIALOG_UI_NONCE, viewport, bounds, typed: '001aB', literals,
    }, null, 2) + '\n');
    await close(page).click(); await restored(page);
    expect(await state(page)).toEqual(before); noEffects(fixture);
    expect(page.context().pages()).toHaveLength(1);
    await opener(page).click(); await expect(input(page)).toHaveValue('');
    await expect(inspect(page)).toBeDisabled();
    await expect(dialog(page).getByLabel('原始 literal', { exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape'); await restored(page);
    expect(await state(page)).toEqual(before); noEffects(fixture);
  });
}

test('manual native keyboard focus and control activation', async ({ page, fixture }) => {
  await setup(page); await observeStorage(page); const before = await state(page);
  await opener(page).click(); await expect(input(page)).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(close(page)).toBeFocused();
  await page.keyboard.press('Tab'); await expect(input(page)).toBeFocused();
  await page.keyboard.type('001'); await page.keyboard.press('Enter');
  await expect(input(page)).toHaveValue('001\n');
  await page.keyboard.press('Tab'); await expect(inspect(page)).toBeFocused();
  await page.keyboard.press('Enter'); await evidence(page, '001\n');
  await page.keyboard.press('Tab'); await expect(close(page)).toBeFocused();
  await page.keyboard.press('Tab'); const summary = dialog(page).locator('summary');
  await expect(summary).toBeFocused(); await page.keyboard.press('Enter');
  await expect(dialog(page).locator('details')).toHaveAttribute('open', '');
  await page.keyboard.press('Tab'); await expect(input(page)).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(summary).toBeFocused();
  for (const key of ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) await page.keyboard.press(key);
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.locator('.manual-scan-overlay').click({ position: { x: 4, y: 4 } });
  await expect(input(page)).toBeFocused();
  // Native inert must reject a background focus attempt.
  await page.getByTestId('product-search-input').evaluate(node => (node as HTMLElement).focus());
  await expect(input(page)).toBeFocused();
  await screenshot(page, test.info(), 'manual-keyboard.png');
  await close(page).focus(); await page.keyboard.press('Space'); await restored(page);
  expect(await state(page)).toEqual(before); noEffects(fixture);
  await opener(page).focus(); await page.keyboard.press('Enter');
  await expect(input(page)).toBeFocused(); await close(page).focus();
  await page.keyboard.press('Enter'); await restored(page);
  expect(await state(page)).toEqual(before); noEffects(fixture);
});

test('manual repeated boundary cancels partials and resumes min3 scanner', async ({ page, fixture }) => {
  await setup(page); await observeStorage(page); const before = await state(page);
  const fixed = new Date('2026-10-11T17:00:00Z');
  await page.clock.setFixedTime(fixed); // Timers continue; Date.now cannot expire the 300ms buffer.
  const search = page.getByTestId('product-search-input');
  for (let index = 0; index < 8; index++) {
    await search.focus(); await page.keyboard.type('OL');
    await opener(page).click(); await expect(input(page)).toHaveValue('');
    await page.keyboard.type(product.sku); await page.keyboard.press('Enter');
    await expect(dialog(page).getByLabel('原始 literal', { exact: true })).toHaveCount(0);
    if (index % 2) await close(page).click(); else await page.keyboard.press('Escape');
    await restored(page);
    await search.focus();
    // Keep seven min3 probes; on the last close, do not clear a stale buffer
    // with ON + Enter before the full SKU. Missing cancellation must fail.
    if (index < 7) { await page.keyboard.type('ON'); await page.keyboard.press('Enter'); }
    await expect(search).toBeFocused(); await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await state(page)).toEqual(before); noEffects(fixture);
    expect(await page.evaluate(() => Date.now())).toBe(fixed.getTime());
  }
  const finalSearchQuery = `${await search.inputValue()}${product.sku}`;
  const productsResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return response.request().method() === 'GET' && url.origin === origin
      && url.pathname === '/api/v1/admin/pos/products' && url.searchParams.get('q') === finalSearchQuery;
  });
  await page.keyboard.type(product.sku);
  await expect(search).toHaveValue(finalSearchQuery);
  const response = await productsResponse;
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ success: true, data: [product] });
  // The exact query response and its rendered card must precede scanner Enter.
  // Pending product-query data is [], which would take the forbidden lookup path.
  await expect(page.getByTestId('product-card-synthetic-product')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('商品數量')).toHaveValue('2');
  await expect(search).toBeFocused(); await expect(search).toHaveValue('');
  await expect(page.getByRole('dialog')).toHaveCount(0); noEffects(fixture);
  await screenshot(page, test.info(), 'manual-resumed-scanner.png');
});
