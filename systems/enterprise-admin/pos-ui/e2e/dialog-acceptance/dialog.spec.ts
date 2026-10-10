import { test, expect, setup, screenshot, assertNoCheckout } from './fixtures';
import { viewports } from './cases.mjs';
import type { Locator, Page } from '@playwright/test';
const splitOpener = (page: Page) => page.getByRole('button', { name: '拆單', exact: true });
const splitDialog = (page: Page) => page.getByRole('dialog', { name: '拆單付款' });
async function assertInside(dialog: Locator) { await expect.poll(() => dialog.evaluate(node => node.contains(document.activeElement))).toBe(true); }
async function assertCart(page: Page) {
  await expect(page.getByLabel('商品數量')).toHaveValue('1');
  await expect(page.getByRole('button', { name: /掛單.*1/ })).toHaveCount(0);
}
for (const viewport of viewports) {
  test(`split keyboard and cancel at ${viewport.width}x${viewport.height}`, async ({ page, fixture }) => {
    await page.setViewportSize(viewport); await setup(page); const opener = splitOpener(page); await opener.click();
    const dialog = splitDialog(page); const amount = dialog.getByRole('spinbutton', { name: '第 1 筆付款金額' });
    await expect(amount).toBeFocused();
    const box = await dialog.boundingBox(); expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width); expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('combobox')).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: '確認付款' })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(dialog.getByRole('combobox')).toBeFocused();
    for (const key of ['F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8']) await page.keyboard.press(key);
    await expect(page.getByRole('dialog')).toHaveCount(1); await screenshot(page, test.info(), 'split-open.png');
    await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused(); await assertCart(page);
    await opener.click(); await dialog.getByRole('button', { name: '取消' }).click();
    await expect(opener).toBeFocused(); await assertCart(page); assertNoCheckout(fixture);
  });
}
for (const action of ['remove second row', 'add fourth row', 'backdrop and title']) {
  test(`native ${action} retains split focus and F4 ownership`, async ({ page, fixture }) => {
    await setup(page); await splitOpener(page).click(); const dialog = splitDialog(page);
    const add = dialog.getByRole('button', { name: '+ 加入第二付款方式' });
    if (action === 'remove second row') {
      await add.click(); await dialog.getByRole('button', { name: '移除第 2 筆付款方式' }).click();
      await expect(dialog.getByRole('spinbutton', { name: '第 1 筆付款金額' })).toBeFocused();
    } else if (action === 'add fourth row') {
      for (let i = 0; i < 3; i++) await add.click();
      await expect(add).toHaveCount(0); await expect(dialog.getByRole('spinbutton', { name: '第 4 筆付款金額' })).toBeFocused();
    } else {
      await page.locator('[data-pos-modal="split-payment"]').click({ position: { x: 8, y: 8 } });
      await assertInside(dialog); await page.keyboard.press('F4'); await expect(dialog).toBeVisible();
      await dialog.getByRole('heading', { name: '拆單付款' }).click();
    }
    await assertInside(dialog); await page.keyboard.press('F4'); await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape'); await assertCart(page); assertNoCheckout(fixture);
  });
}
for (const width of [1366, 390]) {
  test(`nested PIN cancellation restores split at ${width}px`, async ({ page, fixture }) => {
    await page.setViewportSize({ width, height: 768 }); await setup(page); await page.locator('#order-discount').fill('500');
    await splitOpener(page).click(); const split = splitDialog(page); await split.getByRole('button', { name: '確認付款' }).click();
    const pin = page.getByRole('dialog', { name: '管理員授權' }); const one = pin.getByRole('button', { name: '1', exact: true });
    await expect(one).toBeFocused(); await expect(page.locator('[data-pos-modal="split-payment"]')).toHaveAttribute('inert', '');
    await page.keyboard.press('Shift+Tab'); await expect(pin.getByRole('button', { name: '取消' })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(one).toBeFocused(); await page.keyboard.press('Enter');
    for (const key of ['F2', 'F4', 'F7']) await page.keyboard.press(key);
    await expect(pin).toBeVisible(); await screenshot(page, test.info(), 'nested-pin-open.png');
    await page.keyboard.press('Escape'); await expect(pin).toHaveCount(0);
    await expect(split.getByRole('button', { name: '確認付款' })).toBeFocused();
    await page.keyboard.press('Escape'); await expect(splitOpener(page)).toBeFocused();
    await expect(page.locator('#order-discount')).toHaveValue('500'); await assertCart(page); assertNoCheckout(fixture);
  });
}
for (const key of ['pointer', 'Escape', 'Enter', 'Space']) {
  test(`ordinary payment ${key} cancellation has zero checkout`, async ({ page, fixture }) => {
    await setup(page); const opener = page.getByTestId('cart-checkout-button'); await opener.click();
    const dialog = page.getByRole('dialog', { name: '確認結帳' }); const cancel = dialog.getByRole('button', { name: '取消' });
    if (key === 'pointer') await cancel.click(); else { await cancel.focus(); await page.keyboard.press(key); }
    await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused(); await assertCart(page); assertNoCheckout(fixture);
  });
}
test('ordinary payment native Enter selects CARD and submits exactly once', async ({ page, fixture }) => {
  await setup(page); fixture.allowCheckout = true; await page.getByTestId('cart-checkout-button').click();
  const dialog = page.getByRole('dialog', { name: '確認結帳' });
  await dialog.getByRole('button', { name: '信用卡', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(dialog.getByTestId('payment-tendered-input')).toHaveCount(0);
  await dialog.getByRole('button', { name: '確認付款' }).focus(); await page.keyboard.press('Enter');
  await expect.poll(() => fixture.checkoutCalls.length).toBe(1);
  await page.keyboard.press('Enter'); await page.keyboard.press('F4'); expect(fixture.checkoutCalls).toHaveLength(1);
  const write = fixture.expectedWrites[1]; expect(write.path).toBe('/api/v1/admin/pos/checkout');
  expect(write.body).toEqual({ commandId: expect.any(String), cartItems: [{ productId: 'synthetic-product', quantity: 1, discountRate: 0 }], paymentMethod: 'CARD', orderDiscountAmount: 0, shiftId: 'synthetic-shift', salesStaffId: 'synthetic-cashier' });
  await fixture.checkoutCalls[0].fulfill({ status: 503, json: { success: false, error: { message: '合成回應，保留原意圖' } } });
  await expect(page.getByText('合成回應，保留原意圖', { exact: true })).toBeVisible(); await assertCart(page);
});
test('split native confirmation preserves payload and pending keyboard ownership', async ({ page, fixture }) => {
  await setup(page); fixture.allowCheckout = true; await splitOpener(page).click(); const dialog = splitDialog(page);
  await dialog.getByRole('spinbutton', { name: '第 1 筆付款金額' }).fill('750');
  await dialog.getByRole('button', { name: '+ 加入第二付款方式' }).click();
  await expect(dialog.getByRole('spinbutton', { name: '第 2 筆付款金額' })).toHaveValue('250');
  await dialog.getByRole('button', { name: '確認付款' }).focus(); await page.keyboard.press('Enter');
  await expect.poll(() => fixture.checkoutCalls.length).toBe(1);
  // The real page closes payment overlays once the immutable intent becomes pending.
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('checkout-recovery')).toBeVisible();
  await expect(page.getByTestId('checkout-recovery').getByRole('button', { name: '重送同一意圖' })).toBeDisabled();
  for (const key of ['Tab', 'Shift+Tab', 'F4', 'Escape', 'Enter', 'Space']) await page.keyboard.press(key);
  await expect(page.getByTestId('checkout-recovery')).toBeVisible(); expect(fixture.checkoutCalls).toHaveLength(1);
  expect(fixture.expectedWrites[1].body).toEqual({ commandId: expect.any(String), cartItems: [{ productId: 'synthetic-product', quantity: 1, discountRate: 0 }], paymentMethod: 'CASH', payments: [{ method: 'CASH', amount: 750 }, { method: 'CARD', amount: 250 }], orderDiscountAmount: 0, shiftId: 'synthetic-shift', salesStaffId: 'synthetic-cashier' });
  await screenshot(page, test.info(), 'split-pending.png');
  await fixture.checkoutCalls[0].fulfill({ status: 503, json: { success: false, error: { message: '合成拆單回應，保留原意圖' } } });
  await expect(page.getByText('合成拆單回應，保留原意圖', { exact: true })).toBeVisible(); await assertCart(page);
});
