import { test, expect } from './fixtures';
import type { Locator } from '@playwright/test';
import { cases, origin, routePath } from './contract.mjs';
import { capture, fontProof, writeJson } from '../recovery-native/evidence.mjs';
import { readReachability, stableReachability } from '../layout-native/evidence.mjs';

for (const scenario of cases) {
  test.describe(scenario.id, () => {
    test.use({ viewport: { width: scenario.width, height: scenario.height }, isMobile: false, hasTouch: false });
    test(scenario.title, async ({ page, guard }, info) => {
      const geometry: { name: string; samples: unknown[]; final: unknown }[] = [];
      const opener = page.getByRole('button', { name: '+ 登記批次進貨', exact: true });
      const dialog = page.getByRole('dialog', { name: '登記批次進貨', exact: true });
      const selected = guard.fixture.products.filter((row: { tenantId: string }) => row.tenantId === guard.fixture.tenantA).at(-1);
      async function reachable(name: string, locator: Locator) { await locator.hover(); try { const proof = await stableReachability(() => readReachability(locator)); geometry.push({ name, ...proof }); } catch (error) { geometry.push({ name, samples: (error as { samples?: unknown[] }).samples ?? [], final: null }); throw error; } }
      async function picture(stage: string) { guard.stage = stage; const fonts = await fontProof(page, await dialog.count() ? '#receipt-title' : '.batch-list-page .page-title'); await capture(page, info.outputDir, stage, { caseId: scenario.id, nonce: guard.fixture.nonce, fonts }); guard.journey.stages.push(stage); }
      async function visit() { await page.goto(origin + routePath); await expect(page).toHaveURL(origin + routePath); await expect(page.getByRole('heading', { name: '批號效期管理', exact: true })).toBeVisible(); }
      async function open() { await expect(opener).toBeEnabled(); await reachable(`entry-${guard.stage}`, opener); await opener.click(); await expect(dialog).toBeVisible(); }
      async function selectLater() {
        const product = dialog.getByLabel('商品', { exact: true }); await expect(product).toBeEnabled();
        await expect(product.locator('option')).toHaveCount(62); await reachable(`product-${guard.stage}`, product);
        await product.click(); await page.keyboard.press('End'); await page.keyboard.press('Enter');
        await expect(product).toHaveValue(selected.id); guard.journey.selectedProduct = selected.id;
        await dialog.getByLabel('批號', { exact: true }).fill('SYNTHETIC-UNSUBMITTED');
        await expect(dialog.getByLabel('驗收狀態')).toHaveValue('QUARANTINE');
        await expect(dialog.getByRole('option', { name: '已驗收可售' })).toBeDisabled();
      }
      async function cancel() { const cancel = dialog.getByRole('button', { name: '取消', exact: true }); await reachable(`cancel-${guard.stage}`, cancel); await cancel.click(); await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused(); guard.journey.cancelFocusRestored = true; }
      let primary: unknown = null;
      try {
        await visit();
        if (['full', 'cold'].includes(scenario.kind)) {
          await expect.poll(() => [...guard.held].some(controller => !controller.signal.aborted), { timeout: 20_000 }).toBe(true);
          await open(); await expect(dialog.getByText('正在載入可收貨商品…', { exact: true })).toBeVisible();
          await expect(dialog.getByLabel('商品', { exact: true })).toBeDisabled(); await expect(dialog.getByRole('button', { name: '登記進貨', exact: true })).toBeDisabled();
          guard.journey.loadingHeld = true; await picture('loading'); guard.holdPageTwo = false; guard.releaseHold();
          await selectLater(); await picture('selected'); await cancel(); await picture('cancelled');
          if (scenario.kind === 'full') for (const mode of ['http500', 'malformed']) {
            await expect.poll(() => guard.controllers.size, { timeout: 20_000 }).toBe(0);
            guard.mode = mode; guard.stage = `${mode}-loading`; await visit(); await open();
            await expect(dialog.getByRole('alert')).toContainText('無法載入商品', { timeout: 20_000 });
            await expect(dialog.getByText('目前沒有可收貨商品，請先建立商品資料。', { exact: true })).toHaveCount(0);
            await expect(dialog.getByLabel('商品', { exact: true })).toBeDisabled();
            const batch = dialog.getByLabel('批號', { exact: true }); await batch.fill('SYNTHETIC-PRESERVED');
            await picture(mode === 'http500' ? 'read-error' : 'shape-error');
            const retry = dialog.getByRole('button', { name: '重新載入商品', exact: true }); await expect(retry).toBeEnabled();
            guard.mode = 'normal'; await reachable(`retry-${mode}`, retry); await retry.click();
            await expect(dialog.getByLabel('商品', { exact: true })).toBeEnabled({ timeout: 20_000 }); await expect(batch).toHaveValue('SYNTHETIC-PRESERVED');
            guard.journey[`${mode}DraftPreserved`] = true; await selectLater(); await picture(mode === 'http500' ? 'read-recovered' : 'shape-recovered'); await cancel();
          }
        } else if (scenario.kind === 'reader') {
          await expect(page.getByText('SYNTHETIC-ENTRY-LOT', { exact: true })).toBeVisible(); await expect(opener).toBeDisabled(); await expect(dialog).toHaveCount(0);
          guard.journey.createDisabled = true; await picture('reader');
        } else if (scenario.kind === 'denied') {
          await expect(page.getByRole('alert')).toContainText('權限不足，無法讀取批次資料', { timeout: 20_000 }); await expect(opener).toBeDisabled();
          await expect(page.getByText('目前沒有批號資料。', { exact: true })).toHaveCount(0);
          await expect.poll(() => guard.requests.filter(row => row.path.endsWith('/inventory/products') && row.status === 403).length, { timeout: 20_000 }).toBe(2);
          guard.journey.deniedNotEmpty = true; await picture('denied');
        } else {
          await open(); await expect(dialog.getByText('目前沒有可收貨商品，請先建立商品資料。', { exact: true })).toBeVisible();
          await expect(dialog.getByRole('alert')).toHaveCount(0); await expect(dialog.getByLabel('商品', { exact: true })).toBeDisabled(); await expect(dialog.getByRole('button', { name: '登記進貨', exact: true })).toBeDisabled();
          guard.journey.emptyNotError = true; await picture('empty'); await cancel();
        }
        await expect.poll(() => guard.controllers.size, { timeout: 20_000 }).toBe(0);
      } catch (error) { primary = error; throw error; } finally { try { writeJson(info.outputDir, 'batch-geometry.json', { caseId: scenario.id, nonce: guard.fixture.nonce, viewport: page.viewportSize(), controls: geometry }); } catch (error) { if (!primary) throw error; } }
    });
  });
}
