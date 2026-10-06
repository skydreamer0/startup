import { createHash } from 'node:crypto';
import { test, expect } from '@playwright/test';

// Entirely synthetic HTTP responses; no test can close a store shift or post to
// a real backend. PostgreSQL side effects are verified separately by integration.
const scope = { tenantId: 'synthetic-tenant', userId: 'synthetic-cashier' };
const product = { id: '11111111-1111-4111-8111-111111111111', name: '合成恢復測試商品', sku: 'SYNTHETIC', retailPrice: 100, stockQuantity: 5 };
const shift = { id: '22222222-2222-4222-8222-222222222222', status: 'OPEN', openedAt: '2026-10-06T00:00:00Z', staff: { id: scope.userId, fullName: '合成收銀員' } };
const original = { id: '33333333-3333-4333-8333-333333333333', orderNumber: 'SYNTHETIC-RECOVERY-1', totalAmount: '100', paymentMethod: 'CASH', items: [{ productId: product.id, quantity: 1, unitPrice: '100', finalUnitPrice: '100' }] };

for (const recovery of ['query', 'retry'] as const) {
  test(`unknown → refresh → ${recovery} → confirmed retains the original command`, async ({ page }, testInfo) => {
    const posts: Record<string, unknown>[] = [];
    let committed = false;
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.route('**/api/v1/admin/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      let data: unknown = [];
      if (path.endsWith('/pos/checkout-context')) data = scope;
      else if (path.endsWith('/pos/products')) data = [product];
      else if (path.endsWith('/pos/staff')) data = [{ id: scope.userId, fullName: '合成收銀員' }];
      else if (path.endsWith('/pos/shift/active')) data = shift;
      else if (path.endsWith('/pos/checkout')) {
        posts.push(route.request().postDataJSON());
        if (!committed) { committed = true; await route.abort('connectionreset'); return; }
        data = original;
      } else if (path.includes('/pos/checkout-commands/')) {
        data = recovery === 'query' ? { commandId: posts[0].commandId, status: 'SUCCEEDED', payloadHash: createHash('sha256').update(JSON.stringify({ version: 1, shiftId: shift.id, customerId: null, salesStaffId: scope.userId, cartItems: [{ productId: product.id, quantity: 1, discountRate: 0 }], paymentMethod: 'CASH', payments: [], orderDiscountAmount: 0, orderDiscountNote: '' })).digest('hex'), result: original }
          : { commandId: posts[0].commandId, status: 'UNKNOWN' };
      }
      await route.fulfill({ json: { success: true, data } });
    });
    await page.addInitScript(() => {
      localStorage.setItem('pos_accessToken', `header.${btoa(JSON.stringify({ userId: 'synthetic-cashier' }))}.signature`);
    });
    await page.goto('/');
    await page.getByTestId(`product-card-${product.id}`).click();
    await page.getByTestId('cart-checkout-button').click();
    await page.getByTestId('payment-tendered-input').fill('100');
    await page.getByTestId('payment-confirm-button').click();
    const panel = page.getByTestId('checkout-recovery');
    await expect(panel).toContainText('尚未確認結帳結果');
    await expect(page.getByTestId('receipt-modal')).not.toBeVisible();
    await expect(page.getByTestId('cart-checkout-button')).toBeDisabled();
    await page.keyboard.press('Escape'); await page.keyboard.press('F4'); await page.keyboard.press('F6');
    expect(posts).toHaveLength(1);
    const key = `pos-checkout-intent-v1:${scope.tenantId}:${scope.userId}`;
    const beforeRefresh = await page.evaluate((key) => localStorage.getItem(key), key);
    expect(beforeRefresh).toContain(posts[0].commandId as string);
    await page.reload();
    await expect(panel).toContainText(posts[0].commandId as string);
    await expect(page.getByTestId('cart-checkout-button')).toBeDisabled();
    await page.screenshot({ path: testInfo.outputPath('unknown-after-refresh.png'), fullPage: true });
    await page.getByRole('button', { name: '查詢原訂單', exact: true }).click();
    if (recovery === 'retry') {
      await expect(panel).toContainText('尚未確認結帳結果');
      await page.getByRole('button', { name: '重送同一意圖', exact: true }).click();
      expect(posts).toHaveLength(2); expect(posts[1]).toEqual(posts[0]);
    }
    await expect(page.getByTestId('receipt-modal')).toContainText(original.orderNumber);
    await expect(panel).not.toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
    await page.screenshot({ path: testInfo.outputPath('confirmed-original-order.png'), fullPage: true });
    expect(errors).toEqual([]);
  });
}

test('conflict survives refresh, keeps evidence, and cannot be blindly resent', async ({ page }) => {
  await page.route('**/api/v1/admin/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/pos/checkout')) { await route.fulfill({ status: 409, json: { success: false, error: { code: 'COMMAND_PAYLOAD_CONFLICT', message: 'Synthetic payload conflict' } } }); return; }
    const data = path.endsWith('/pos/checkout-context') ? scope : path.endsWith('/pos/products') ? [product]
      : path.endsWith('/pos/shift/active') ? shift : [];
    await route.fulfill({ json: { success: true, data } });
  });
  await page.addInitScript(() => { localStorage.setItem('pos_accessToken', 'synthetic-token'); });
  await page.goto('/');
  await page.getByTestId(`product-card-${product.id}`).click();
  await page.getByTestId('cart-checkout-button').click();
  await page.getByTestId('payment-tendered-input').fill('100');
  await page.getByTestId('payment-confirm-button').click();
  await expect(page.getByTestId('checkout-recovery')).toContainText('結帳意圖衝突');
  await expect(page.getByRole('button', { name: '重送同一意圖' })).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId('checkout-recovery')).toContainText('結帳意圖衝突');
  await expect(page.getByRole('button', { name: '重送同一意圖' })).toBeDisabled();
});
