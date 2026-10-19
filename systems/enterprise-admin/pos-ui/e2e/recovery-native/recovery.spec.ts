import { test, expect } from './fixtures';
import { cases, origin, prefix } from './contract.mjs';
import { recoveryBoundaryReady } from './network.mjs';
import { capture, controlGeometry, assertControlGeometry, fontProof, observeControl, writeJson } from './evidence.mjs';
import type { Page, Locator } from '@playwright/test';
async function saved(page: Page, scope: string) {
  return page.evaluate(key => { const raw = localStorage.getItem(key); return raw === null ? null : JSON.parse(raw); }, `pos-checkout-intent-v1:${scope}`);
}
async function draft(page: Page) { return page.locator('.pos-cart-panel').evaluate(panel => ({ text: (panel as HTMLElement).innerText, quantities: Array.from(panel.querySelectorAll('input[aria-label="商品數量"]')).map(input => (input as HTMLInputElement).value) })); }
for (const scenario of cases) test(scenario.title, async ({ page, guard }, info) => {
  await page.setViewportSize({ width: scenario.width, height: scenario.height });
  const scope = `${guard.fixture.tenantId}:${guard.fixture.userId}`;
  let focusIndex = 0;
  const focusedControl = async (locator: Locator, name = 'control') => {
    const label = `${name}-${++focusIndex}`; guard.stage = label;
    const result = await observeControl(() => controlGeometry(locator));
    writeJson(info.outputDir, `${label}-geometry.json`, { caseId: scenario.id, nonce: guard.fixture.nonce, ...result });
    expect(result.ok, `Native focused geometry ${label}`).toBe(true);
    return result.final;
  };
  const record = async (stage: string, selector: string, extra: Record<string, unknown> = {}) => {
    guard.stage = stage;
    await capture(page, info.outputDir, stage, { caseId: scenario.id, nonce: guard.fixture.nonce, fonts: await fontProof(page, selector), ...extra });
  };
  await page.goto(origin);
  const card = page.getByTestId(`product-card-${guard.fixture.productId}`), panel = page.getByTestId('checkout-recovery');
  await expect(card).toContainText('✓ 5 件');
  await card.click(); await expect(page.getByLabel('商品數量')).toHaveValue('1');
  await page.getByTestId('cart-checkout-button').click();
  await page.getByTestId('payment-tendered-input').fill('20');
  guard.phase = 'submit'; guard.stage = 'submit'; await page.getByTestId('payment-confirm-button').click();
  await expect(panel).toContainText(scenario.mode === 'conflict' ? '結帳意圖衝突' : '尚未確認結帳結果');
  await expect(page.getByTestId('cart-checkout-button')).toBeDisabled();
  await expect(page.getByTestId('receipt-modal')).toHaveCount(0);
  // Pending and unknown share the same visible heading. Await the actual
  // dispatch outcome AND its persisted state, never the heading alone.
  await expect.poll(async () => recoveryBoundaryReady(await saved(page, scope), guard.requests, scenario), { timeout: 20_000, intervals: [50, 100, 250, 500] }).toBe(true);
  const frozen = await saved(page, scope); expect(frozen.status).toBe(scenario.mode === 'conflict' ? 'conflict' : 'unknown');
  expect(frozen.payload.cartItems).toHaveLength(1); expect(frozen.payload.cartItems[0].quantity).toBe(1);
  guard.journey.commandId = frozen.payload.commandId;
  await page.keyboard.press('Escape'); await page.keyboard.press('F4'); await page.keyboard.press('F6');
  expect(await saved(page, scope)).toEqual(frozen);
  await record('unknown-or-conflict', '[data-testid="checkout-recovery"] strong', { commandId: frozen.payload.commandId });
  guard.phase = 'reload'; guard.stage = 'reload'; await page.reload();
  await expect(panel).toContainText(frozen.payload.commandId); await expect(page.getByTestId('cart-checkout-button')).toBeDisabled();
  expect(await saved(page, scope)).toEqual(frozen); guard.journey.restoredStatus = frozen.status;
  await record('after-refresh', '[data-testid="checkout-recovery"] strong');
  guard.phase = 'recover'; guard.stage = 'recover';
  const recover = page.getByRole('button', { name: scenario.recovery === 'retry' ? '重送同一意圖' : '查詢原訂單', exact: true });
  await recover.focus(); await page.keyboard.press('Enter');
  if (scenario.mode === 'conflict') {
    await expect(panel).toContainText('不能自動確認或建立新意圖');
    await expect(page.getByRole('button', { name: '重送同一意圖', exact: true })).toBeDisabled();
    await expect(page.getByTestId('receipt-modal')).toHaveCount(0); expect(await saved(page, scope)).toEqual(frozen);
    guard.journey.conflictFrozenAfterRealQuery = true;
    await record('conflict-remains-frozen', '[data-testid="checkout-recovery"] strong');
  } else {
    await expect(page.getByTestId('receipt-modal')).toContainText('結帳完成');
    await expect(panel).toHaveCount(0); expect(await saved(page, scope)).toBeNull();
    await record('original-order-confirmed', '[data-testid="receipt-modal"] h3');
    await page.getByTestId('receipt-next-button').click(); await expect(card).toContainText('✓ 4 件');
  }
  if (scenario.id === 'query-refund') {
    await page.setViewportSize({ width: 390, height: 844 });
    await card.click(); await expect(page.getByLabel('商品數量')).toHaveValue('1');
    const before = await draft(page); guard.journey.draftBeforeRefund = before;
    const toolbar = page.getByTitle('訂單查詢 (F7)', { exact: true });
    const openRefund = async () => {
      const reopening = guard.stage === 'refund-reopen';
      await toolbar.focus(); await page.keyboard.press('Enter');
      const lookup = page.getByRole('dialog', { name: '今日訂單', exact: true }); await expect(lookup).toBeVisible();
      const collapsed = lookup.getByRole('button', { name: /^展開訂單 / }); await expect(collapsed).toHaveCount(1);
      // The accessible name changes on expansion. Bind the same order via its
      // immutable disclosure target, and keep strict state/name assertions.
      const controls = await collapsed.getAttribute('aria-controls'); expect(controls).toBeTruthy();
      const row = lookup.locator(`button[aria-controls=${JSON.stringify(controls)}]`);
      await expect(row).toHaveCount(1); await expect(row).toHaveAttribute('aria-expanded', 'false');
      await expect(lookup.getByRole('textbox', { name: '搜尋今日訂單' })).toBeFocused();
      await page.keyboard.press('Tab'); await expect(row).toBeFocused(); const geometry = await focusedControl(row, 'lookup-row-390');
      if (!reopening) await record('lookup-keyboard-390', '[data-pos-modal="order-lookup"] h3', { geometry });
      await page.keyboard.press('Enter'); await expect(row).toHaveAttribute('aria-expanded', 'true');
      await expect(row).toHaveAccessibleName(/^收合訂單 /);
      await page.keyboard.press('Tab'); const select = lookup.getByRole('button', { name: '退款此訂單', exact: true }); await expect(select).toBeFocused(); await focusedControl(select, 'lookup-refund-390'); await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: '登記退款', exact: true })).toBeVisible(); await expect(page.getByLabel('退款原因（選填）')).toBeFocused();
    };
    await openRefund();
    const refund = page.getByRole('dialog', { name: '登記退款', exact: true });
    await expect(refund).toContainText('此操作只登記退款，不會增加庫存');
    await expect(refund).toContainText('退款金額 $20 元');
    const box = await refund.boundingBox(); expect(box).not.toBeNull(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await record('refund-open-390', '[data-pos-modal="refund"] h3', { panel: box });
    const beforeCancel = guard.requests.filter(row => row.method === 'POST').length;
    await page.keyboard.press('Escape'); await expect(refund).toHaveCount(0); await expect(toolbar).toBeFocused();
    guard.journey.cancelSubmitCount = guard.requests.filter(row => row.method === 'POST').length - beforeCancel; expect(guard.journey.cancelSubmitCount).toBe(0);
    expect(await draft(page)).toEqual(before); guard.stage = 'refund-reopen'; await openRefund();
    await page.getByLabel('退款原因（選填）').fill('合成原生退款');
    await page.setViewportSize({ width: 390, height: 480 });
    await page.keyboard.press('Shift+Tab'); const confirm = refund.getByRole('button', { name: '確認退款', exact: true }); await expect(confirm).toBeFocused();
    const geometry = await focusedControl(confirm, 'refund-short-confirm-390'); await record('refund-short-keyboard-390', '[data-pos-modal="refund"] h3', { geometry });
    await page.setViewportSize({ width: 390, height: 844 }); await focusedControl(confirm, 'refund-confirm-390');
    guard.phase = 'refund'; guard.stage = 'refund-pending'; await page.keyboard.press('Enter');
    await expect.poll(() => guard.refundReady, { timeout: 20_000 }).toBe(true);
    await expect(refund).toHaveAttribute('aria-busy', 'true');
    await expect(refund.getByRole('button', { name: '退款登記中...' })).toBeDisabled();
    await page.keyboard.press('Escape'); await page.keyboard.press('Enter');
    await page.locator('[data-pos-modal="refund"]').click({ position: { x: 2, y: 2 } });
    await expect(refund).toBeVisible(); guard.journey.pendingDismissCount = 0;
    await record('refund-pending-390', '[data-pos-modal="refund"] h3');
    guard.releaseRefund(); await expect(refund).toHaveCount(0); await expect(page.getByText('退款已登記，庫存不變', { exact: true })).toBeVisible(); await expect(toolbar).toBeFocused();
    guard.journey.draftAfterRefund = await draft(page); expect(guard.journey.draftAfterRefund).toEqual(before); guard.journey.refundViewport = 390;
    await expect(card).toContainText('✓ 4 件');
    // The visible product/card is selected for the final money-only stock receipt.
    await record('refund-complete-390', `[data-testid="product-card-${guard.fixture.productId}"]`);
  }
  guard.phase = 'complete'; guard.journey.noReplacementCommand = new Set(guard.requests.filter(row => row.payload).map(row => row.payload!.commandId)).size === 1;
  expect(guard.journey.noReplacementCommand).toBe(true);
});
