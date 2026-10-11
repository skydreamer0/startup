import { writeFileSync } from 'node:fs';
import { test, expect, capture, cartSnapshot } from './fixtures';
import { widths, expectedCases, origin } from './contract.mjs';
import { assertCartControlsVisible } from '../visible-controls';

for (const [index, width] of widths.entries()) {
  test(expectedCases[index], async ({ page, guard }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(origin);
    const card = page.getByTestId(`product-card-${guard.bootstrap.productId}`);
    const alert = page.getByRole('alert');
    const retry = page.getByRole('button', { name: '重新整理庫存', exact: true });
    await expect(card).toContainText('✓ 5 件');
    await card.click(); await expect(page.getByLabel('商品數量')).toHaveValue('1');
    await page.getByTestId('cart-checkout-button').click();
    await page.getByTestId('payment-tendered-input').fill('20');
    guard.phase = 'checkout-failure';
    await page.getByTestId('payment-confirm-button').click();
    await expect(page.getByTestId('receipt-modal')).toContainText('結帳完成');
    await page.getByTestId('receipt-next-button').click();
    await expect(alert).toContainText('顯示資訊可能已過期', { timeout: 20_000 });
    await expect(card).toContainText('✓ 5 件'); // Preserved cached value is explicitly stale.
    await expect(page.getByLabel('商品數量')).toHaveCount(0); // Only the confirmed sold cart clears.
    // A new draft must survive the product retry and later refund.
    await card.click(); await expect(page.getByLabel('商品數量')).toHaveValue('1');
    const draft = await cartSnapshot(page);
    await expect(page.getByLabel('Product recommendations').getByRole('button')).toHaveCount(1);
    const visibility = [{ stage: 'checkout-stale', controls: await assertCartControlsVisible(page) }];
    expect(visibility[0].controls[0].recommendationHeight).toBeGreaterThan(44);
    await capture(page, info, 'checkout-stale');
    guard.phase = 'checkout-recovery';
    await retry.focus(); await expect(retry).toBeFocused(); await page.keyboard.press('Enter');
    await expect(alert).toHaveCount(0); await expect(card).toContainText('✓ 4 件');
    expect(await cartSnapshot(page)).toEqual(draft);
    visibility.push({ stage: 'checkout-recovered', controls: await assertCartControlsVisible(page) });
    await capture(page, info, 'checkout-recovered');
    // Preserve the 900px captures while also checking the shorter #31 desktop gate.
    await page.setViewportSize({ width, height: 768 });
    visibility.push({ stage: 'checkout-recovered-768', controls: await assertCartControlsVisible(page) });
    await page.getByTestId('cart-checkout-button').click();
    await expect(page.getByTestId('payment-confirm-button')).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect(await cartSnapshot(page)).toEqual(draft);
    await page.getByTitle('拆單付款', { exact: true }).click();
    await expect(page.getByRole('dialog', { name: '拆單付款' })).toBeVisible();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    expect(await cartSnapshot(page)).toEqual(draft);
    await page.setViewportSize({ width, height: 900 });
    await page.getByTitle('訂單查詢 (F7)', { exact: true }).click();
    await expect(page.getByText('已完成', { exact: true })).toBeVisible();
    // Existing lookup expansion has a pointer-only row; record this boundary honestly.
    await page.getByText('已完成', { exact: true }).click();
    await page.getByRole('button', { name: '退款此訂單', exact: true }).click();
    await page.getByLabel('退款原因（選填）').fill('合成驗收退款');
    guard.phase = 'refund-failure';
    await page.getByRole('button', { name: '確認退款', exact: true }).click();
    await expect(page.getByText('退款已登記，庫存不變', { exact: true })).toBeVisible();
    await expect(alert).toContainText('顯示資訊可能已過期', { timeout: 20_000 });
    await expect(card).toContainText('✓ 4 件'); expect(await cartSnapshot(page)).toEqual(draft);
    visibility.push({ stage: 'refund-stale', controls: await assertCartControlsVisible(page) });
    await capture(page, info, 'refund-stale');
    guard.phase = 'refund-recovery';
    await retry.click();
    await expect(alert).toHaveCount(0); await expect(card).toContainText('✓ 4 件');
    expect(await cartSnapshot(page)).toEqual(draft);
    visibility.push({ stage: 'refund-recovered', controls: await assertCartControlsVisible(page) });
    await capture(page, info, 'refund-recovered');
    writeFileSync(info.outputPath('journey.json'), JSON.stringify({ test: info.title, nonce: process.env.CATEGORY_UI_NONCE,
      width, draftBeforeRetry: draft, draftAfterRefund: await cartSnapshot(page), stock: [5, 4, 4],
      staleSeenAfterCheckout: true, staleSeenAfterRefund: true, retryInputs: ['keyboard Enter', 'pointer'],
      receiptConfirmed: true, refundConfirmed: true }, null, 2) + '\n');
    await page.getByRole('button', { name: '清空購物車 (F5)', exact: true }).click();
    await expect(page.getByRole('button', { name: '再按一次確認清空', exact: true })).toBeVisible();
    await expect(page.getByLabel('商品數量')).toHaveValue('1');
    writeFileSync(info.outputPath('visible-controls.json'), JSON.stringify({ test: info.title, width, visibility,
      paymentAndSplitCancelled: true, firstClearClickRetainedDraft: true }, null, 2) + '\n');
  });
}
