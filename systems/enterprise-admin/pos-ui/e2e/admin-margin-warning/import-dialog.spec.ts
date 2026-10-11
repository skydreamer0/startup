import { test, expect, origin, deferred } from './fixtures';
import { files, digest } from './import-contract.mjs';
import { writeFile } from 'node:fs/promises';
import type { Page, TestInfo } from '@playwright/test';
import type { ImportPreview } from '../../../admin-ui/src/api/excel';

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Import Products from Excel', exact: true });
const opener = (page: Page) => page.getByRole('button', { name: 'Import Products', exact: true });
const input = (page: Page) => dialog(page).getByLabel('Excel File (.xlsx)');
const button = (page: Page, name: string) => dialog(page).getByRole('button', { name, exact: true });
const summary = { created: 1, updated: 0, errors: [], warnings: [] };
const preview = (letter = 'a'): ImportPreview => ({ ...summary, previewToken: `synthetic-token-${letter}`,
  fileHash: `synthetic-hash-${letter}`, normalizedRevision: 'synthetic-v1', expiresAt: 1791648900000,
  warnings: ['合成預覽：只更新商品資料，不變更實體庫存。'] });

async function ready(page: Page, history = false) {
  if (history) {
    await page.goto(`${origin}/suppliers`);
    await page.getByRole('link', { name: '📦 Inventory', exact: true }).click();
  } else await page.goto(`${origin}/inventory`);
  await expect(page.getByText('No products found', { exact: true })).toBeVisible();
  await opener(page).click();
  await expect(dialog(page)).toHaveAttribute('aria-modal', 'true');
  await expect(input(page)).toBeFocused();
}
async function choose(page: Page, index = 0) {
  const selected = page.waitForEvent('filechooser');
  await input(page).press('Enter');
  await (await selected).setFiles(files[index]);
  await expect(input(page)).toHaveValue(new RegExp(`${files[index].name.replace('.', '\\.')}$`));
}
async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const geometry = await dialog(page).evaluate(element => {
    const r = element.getBoundingClientRect();
    const overlay = element.parentElement!;
    const backdrop = overlay.getBoundingClientRect();
    return { subject: 'import-dialog', viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth, dialog: { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom },
      overlay: { x: backdrop.x, y: backdrop.y, right: backdrop.right, bottom: backdrop.bottom },
      backdropHit: document.elementFromPoint(2, 2) === overlay,
      viewportBounded: r.y >= 0 && r.bottom <= innerHeight,
      clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
      focusInside: element === document.activeElement || element.contains(document.activeElement),
      focused: document.activeElement?.getAttribute('id') || document.activeElement?.textContent,
      busy: element.getAttribute('aria-busy') };
  });
  expect(geometry.dialog.x).toBeGreaterThanOrEqual(0);
  expect(geometry.dialog.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  expect(geometry.overlay).toEqual({ x: 0, y: 0, right: geometry.viewport.width, bottom: geometry.viewport.height });
  expect(geometry.backdropHit).toBe(true);
  expect(geometry.viewportBounded).toBe(true);
  expect(geometry.focusInside).toBe(true);
  await writeFile(info.outputPath(`${name}.json`), JSON.stringify(geometry, null, 2));
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  for (const extension of ['png', 'json']) await info.attach(`${name}.${extension}`, {
    path: info.outputPath(`${name}.${extension}`), contentType: extension === 'png' ? 'image/png' : 'application/json' });
}

for (const width of [1440, 390]) test.describe(`import keyboard ${width}`, () => {
  test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });
  test(`import ${width}: keyboard and idle dismissal`, async ({ page, harness }, info) => {
    harness.importHandler = () => { throw new Error('Idle dismissal must not request import'); };
    await ready(page);
    await capture(page, info, 'import-open');
    await page.keyboard.press('Shift+Tab'); await expect(button(page, 'Cancel')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(input(page)).toBeFocused();
    await page.keyboard.press('Tab'); await expect(button(page, 'Cancel')).toBeFocused();
    await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0); await expect(opener(page)).toBeFocused();
    await page.keyboard.press('Enter'); await choose(page);
    await page.keyboard.press('Shift+Tab'); await expect(button(page, 'Preview')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(input(page)).toBeFocused();
    await button(page, 'Cancel').click(); await expect(dialog(page)).toHaveCount(0); await expect(opener(page)).toBeFocused();
    await page.keyboard.press('Enter'); await expect(input(page)).toHaveValue('');
    await page.mouse.click(2, 2); await expect(dialog(page)).toHaveCount(0); await expect(opener(page)).toBeFocused();
    expect(harness.imports).toEqual([]);
  });
});

test.describe('import requests', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('import 1440: preview pending recovery', async ({ page, harness }, info) => {
    const held = deferred(); const alerts: string[] = [];
    page.on('dialog', async message => { alerts.push(message.message()); await message.accept(); });
    harness.importHandler = () => held.promise;
    await ready(page); await choose(page);
    await button(page, 'Preview').press('Enter'); await page.keyboard.press('Enter');
    await expect.poll(() => harness.imports.length).toBe(1);
    await expect(dialog(page)).toBeFocused(); await expect(dialog(page)).toHaveAttribute('aria-busy', 'true');
    await expect(input(page)).toBeDisabled(); await expect(button(page, 'Cancel')).toBeDisabled();
    for (const key of ['Tab', 'Shift+Tab', 'Escape']) { await page.keyboard.press(key); await expect(dialog(page)).toBeFocused(); }
    await page.mouse.click(2, 2); await expect(dialog(page)).toBeFocused();
    await expect(dialog(page)).toHaveAttribute('aria-busy', 'true');
    await capture(page, info, 'preview-pending');
    held.resolve({ status: 500 });
    await expect(input(page)).toBeEnabled(); await expect(input(page)).toBeFocused();
    expect(alerts).toEqual(['Synthetic import failure']); expect(harness.imports).toHaveLength(1);
    await capture(page, info, 'preview-recovered');
    await button(page, 'Cancel').click(); await expect(dialog(page)).toHaveCount(0); await expect(opener(page)).toBeFocused();
  });

  test('import 1440: confirm pending pairing', async ({ page, harness }, info) => {
    const held = deferred();
    harness.importHandler = entry => entry.endpoint === 'confirm' ? held.promise
      : { status: 200, data: preview(entry.fileName === files[0].name ? 'a' : 'b') };
    await ready(page); await choose(page);
    await button(page, 'Preview').click(); await expect(button(page, 'Confirm Import')).toBeEnabled();
    await choose(page, 1); await expect(button(page, 'Confirm Import')).toHaveCount(0);
    await button(page, 'Preview').click(); await expect(button(page, 'Confirm Import')).toBeEnabled();
    await button(page, 'Confirm Import').press('Enter'); await page.keyboard.press('Enter');
    await expect.poll(() => harness.imports.length).toBe(3);
    await expect(input(page)).toBeDisabled(); await expect(button(page, 'Cancel')).toBeDisabled();
    for (const key of ['Escape', 'Tab', 'Shift+Tab']) { await page.keyboard.press(key); await expect(dialog(page)).toBeFocused(); }
    await page.mouse.click(2, 2); await expect(dialog(page)).toBeFocused();
    await expect(dialog(page)).toHaveAttribute('aria-busy', 'true');
    await capture(page, info, 'confirm-pending');
    expect(harness.imports).toEqual([
      { endpoint: 'preview', fileName: files[0].name, fileSha256: digest(files[0].buffer), token: null },
      { endpoint: 'preview', fileName: files[1].name, fileSha256: digest(files[1].buffer), token: null },
      { endpoint: 'confirm', fileName: files[1].name, fileSha256: digest(files[1].buffer), token: 'synthetic-token-b' },
    ]);
    const before = harness.reads.length;
    held.resolve({ status: 200, data: summary });
    await expect(button(page, 'Close')).toBeFocused(); await expect(dialog(page)).toContainText('Import Complete');
    await expect.poll(() => harness.reads.length).toBe(before + 1);
    await capture(page, info, 'import-complete');
    await page.keyboard.press('Tab'); await expect(button(page, 'Close')).toBeFocused();
    await page.keyboard.press('Enter'); await expect(dialog(page)).toHaveCount(0); await expect(opener(page)).toBeFocused();
  });

  test('import 1440: confirmation failure reset', async ({ page, harness }, info) => {
    const alerts: string[] = [];
    page.on('dialog', async message => { alerts.push(message.message()); await message.accept(); });
    harness.importHandler = entry => entry.endpoint === 'preview' ? { status: 200, data: preview() } : { status: 409 };
    await ready(page); await choose(page); await button(page, 'Preview').click();
    await button(page, 'Confirm Import').click();
    await expect(button(page, 'Preview')).toBeEnabled(); await expect(input(page)).toBeFocused();
    await expect(button(page, 'Confirm Import')).toHaveCount(0); expect(alerts).toEqual(['Synthetic import failure']);
    expect(harness.imports.map(entry => entry.endpoint)).toEqual(['preview', 'confirm']);
    await capture(page, info, 'confirmation-error');
  });

  for (const phase of ['preview', 'confirm']) for (const outcome of ['success', 'error']) {
    test(`import 1440: late ${phase} ${outcome}`, async ({ page, harness }, info) => {
      const held = deferred(); const alerts: string[] = [];
      let committed = false;
      harness.importProductsHandler = () => ({ status: 200, data: {
        total: committed ? 1 : 0, page: 1, limit: 50,
        data: committed ? [{ id: 'synthetic-imported-product', sku: 'SYNTHETIC-IMPORTED',
          name: '合成匯入後商品', costPrice: '10', retailPrice: '20', stockQuantity: 0, safetyStock: 1 }] : [],
      } });
      page.on('dialog', async message => { alerts.push(message.message()); await message.accept(); });
      harness.importHandler = entry => entry.endpoint === phase ? held.promise : { status: 200, data: preview() };
      await ready(page, true); await choose(page); await button(page, 'Preview').click();
      if (phase === 'confirm') await button(page, 'Confirm Import').click();
      await expect(dialog(page)).toHaveAttribute('aria-busy', 'true');
      await expect.poll(() => harness.imports.length).toBe(phase === 'preview' ? 1 : 2);
      // Browser history causes an actual React route unmount without a page reload.
      await page.goBack(); await expect(page).toHaveURL(`${origin}/suppliers`); await expect(dialog(page)).toHaveCount(0);
      await page.goForward(); await expect(page).toHaveURL(`${origin}/inventory`);
      await expect(page.getByText('No products found', { exact: true })).toBeVisible();
      await opener(page).click(); await expect(input(page)).toBeFocused();
      const reads = harness.reads.length, responses = harness.responses.length;
      const returned = page.waitForResponse(response => response.url().endsWith(`/excel/import/products/${phase}`));
      committed = phase === 'confirm' && outcome === 'success';
      held.resolve({ status: outcome === 'success' ? 200 : 500, data: phase === 'preview' ? preview() : summary });
      await (await returned).finished();
      await expect.poll(() => harness.responses.length).toBe(responses + 1);
      // Wait through the browser's React Query notification/render turns.
      await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 100)));
      await expect(input(page)).toHaveValue(''); await expect(input(page)).toBeFocused();
      await expect(button(page, 'Preview')).toBeDisabled(); await expect(button(page, 'Confirm Import')).toHaveCount(0);
      await expect(dialog(page)).not.toContainText('Import Complete');
      expect(alerts).toEqual([]);
      await expect.poll(() => harness.reads.length).toBe(reads + (committed ? 1 : 0));
      if (committed) await expect(page.getByRole('row').filter({ hasText: 'SYNTHETIC-IMPORTED' })).toHaveCount(1);
      else await expect(page.getByText('No products found', { exact: true })).toBeVisible();
      await capture(page, info, 'late-response-ignored');
    });
  }
});
