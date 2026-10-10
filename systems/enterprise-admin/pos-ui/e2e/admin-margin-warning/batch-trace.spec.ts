import { test, expect, origin, deferred, captureTrace } from './fixtures';
import type { Page } from '@playwright/test';

const batch = { id: 'synthetic-trace-batch', tenantId: 'synthetic-tenant', productId: 'synthetic-product',
  batchNumber: '合成來源追溯批次-LONG-ID-1234567890-ABCDEFGHIJ-1234567890', quantity: 4, status: 'QUARANTINE',
  expiryDate: '2026-10-20T00:00:00Z', receivedAt: '2026-10-01T00:00:00Z', costPrice: '20',
  product: { name: '合成藥品長中文名稱用於核對來源明細在窄版是否可以正常換行閱讀', sku: 'SYNTHETIC-TRACE-ONLY' } };
function detail(count = 1, marker = '合成訂單', nullOrderNumber = false) {
  return { ...batch,
    receiptMovements: [{ id: 'synthetic-receipt-1234567890-ABCDEFGHIJ-1234567890-ABCDEFGHIJ', tenantId: batch.tenantId,
      batchId: batch.id, type: 'IN', quantity: 7, createdAt: '2026-09-30T16:00:00Z' }],
    saleAllocations: Array.from({ length: Math.min(count, 100) }, (_, index) => ({ id: `allocation-${index}`, tenantId: batch.tenantId,
      batchId: batch.id, orderId: `order-${index}`, orderItemId: `synthetic-order-line-${index}-1234567890-ABCDEFGHIJ-1234567890`,
      movementId: `synthetic-movement-${index}-1234567890-ABCDEFGHIJ-1234567890`, quantity: 3,
      createdAt: '2026-10-01T16:00:00Z', expiryDateAtSale: '2026-10-20T00:00:00Z', order: { id: `order-${index}`, orderNumber: nullOrderNumber && index === 0 ? null : `${marker}-${index}` } })),
    _count: { saleAllocations: count } };
}
function nonDetail(url: URL) {
  if (url.pathname.endsWith('/inventory/products')) return { status: 200, data: { total: 0, page: 1, limit: 50, data: [] } };
  if (url.pathname.endsWith('/product-batches')) return { status: 200, data: [batch] };
  return null;
}
const opener = (page: Page) => page.getByRole('button', { name: '來源／售出分攤', exact: true });
const dialog = (page: Page) => page.getByRole('dialog');
const refresh = (page: Page) => dialog(page).getByRole('button', { name: '重新載入來源', exact: true });
const close = (page: Page) => dialog(page).getByRole('button', { name: '關閉來源明細', exact: true });
const filter = (page: Page) => page.getByRole('button', { name: '到期／30天內需處理', exact: true });
async function ready(page: Page) {
  await page.goto(`${origin}/inventory/batches`);
  await expect(opener(page)).toBeEnabled();
  await filter(page).click();
  await expect(opener(page)).toBeEnabled();
}

test.describe('batch trace desktop', () => {
  test.use({ viewport: { width: 1366, height: 768 } });
  test('batch-trace 1366: source lifecycle', async ({ page, harness }, info) => {
    const old = deferred(); let detailReads = 0;
    harness.batchHandler = url => nonDetail(url) ?? (++detailReads === 1 ? old.promise : { status: 200, data: detail(132, '合成訂單', true) });
    await ready(page); await opener(page).click();
    await expect(dialog(page).getByRole('status')).toHaveText('正在載入批次來源…');
    await captureTrace(page, info, 'source-loading');
    const cancelledRead = page.waitForEvent('requestfailed', request => new URL(request.url()).pathname.endsWith(`/product-batches/${batch.id}`));
    await close(page).click(); await expect(dialog(page)).toHaveCount(0);
    expect((await cancelledRead).failure()?.errorText).toContain('ERR_ABORTED');
    await expect(opener(page)).toBeFocused(); await expect(filter(page)).toHaveAttribute('aria-pressed', 'true');
    await opener(page).click();
    await expect(dialog(page)).toContainText('顯示 100 / 132 筆分攤');
    await expect(dialog(page)).toContainText('僅顯示最近 100 筆');
    expect(detailReads).toBe(2);
    const responses = harness.responses.length;
    old.resolve({ status: 200, data: detail(1, 'STALE-RESPONSE-MUST-NOT-APPEAR') });
    await expect.poll(() => harness.responses.length).toBe(responses + 1);
    await expect(dialog(page)).not.toContainText('STALE-RESPONSE-MUST-NOT-APPEAR');
    await expect(dialog(page)).toContainText('顯示 100 / 132 筆分攤');
    await expect(dialog(page)).toContainText('訂單 未編號（order-0）');
    await expect(dialog(page)).toContainText('訂單 合成訂單-1');
    await expect(dialog(page)).toContainText('進貨紀錄：synthetic-receipt-1234567890-ABCDEFGHIJ-1234567890-ABCDEFGHIJ');
    await expect(dialog(page).getByRole('alert')).toHaveCount(0);
    await captureTrace(page, info, 'source-linked');
    // Initial title focus and a real key cycle, without DOM focus/click shortcuts.
    await expect(dialog(page).getByRole('heading', { level: 2 })).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(refresh(page)).toBeFocused();
    await page.keyboard.press('Tab'); await expect(close(page)).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(refresh(page)).toBeFocused();
    await page.keyboard.press('Escape'); await expect(dialog(page)).toHaveCount(0);
    await expect(opener(page)).toBeFocused(); await expect(filter(page)).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('batch trace narrow', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('batch-trace 390: source errors', async ({ page, harness }, info) => {
    let status = 200; let empty = false; let nullOrderNumber = false;
    harness.batchHandler = url => nonDetail(url) ?? { status, data: empty ? { ...detail(0), receiptMovements: [] } : detail(nullOrderNumber ? 2 : 1, '合成訂單', nullOrderNumber) };
    await ready(page); await opener(page).click();
    await expect(dialog(page)).toContainText('訂單 合成訂單-0');
    await captureTrace(page, info, 'source-long');
    nullOrderNumber = true; await refresh(page).click();
    await expect(dialog(page)).toContainText('訂單 未編號（order-0）');
    await expect(dialog(page)).toContainText('訂單 合成訂單-1');
    await expect(dialog(page)).not.toContainText('訂單 合成訂單-0');
    await expect(dialog(page)).toContainText('進貨紀錄：synthetic-receipt-1234567890-ABCDEFGHIJ-1234567890-ABCDEFGHIJ');
    await expect(dialog(page).getByRole('alert')).toHaveCount(0);
    await expect(dialog(page)).toContainText('顯示 2 / 2 筆分攤');
    await captureTrace(page, info, 'source-null-order', dialog(page).getByText('訂單 未編號（order-0）・本批實扣數量 3', { exact: true }));
    nullOrderNumber = false; await refresh(page).click();
    await expect(dialog(page)).toContainText('訂單 合成訂單-0');
    await expect(dialog(page)).toContainText('顯示 1 / 1 筆分攤');
    await expect(dialog(page)).not.toContainText('訂單 未編號');
    await expect(dialog(page)).not.toContainText('訂單 合成訂單-1');
    for (const code of [403, 404, 500]) {
      status = code; await refresh(page).click();
      await expect(dialog(page).getByRole('alert')).toContainText(code === 403 ? '權限不足' : code === 404 ? '找不到此批次' : '無法載入批次來源');
      await expect(dialog(page)).not.toContainText('訂單 合成訂單-0');
      await expect(dialog(page)).not.toContainText('訂單 未編號');
      await expect(dialog(page)).not.toContainText('訂單 合成訂單-1');
      await expect(dialog(page)).not.toContainText('目前沒有已連結');
      await captureTrace(page, info, `source-${code}`);
    }
    status = 200; empty = true; await refresh(page).click();
    await expect(dialog(page)).toContainText('歷史來源未能追溯，不代表從未進貨');
    await expect(dialog(page)).toContainText('舊單可能未能追溯，不代表從未售出');
    await captureTrace(page, info, 'source-empty');
    await close(page).click(); await expect(dialog(page)).toHaveCount(0);
    await expect(opener(page)).toBeFocused(); await expect(filter(page)).toHaveAttribute('aria-pressed', 'true');
    // The visible backdrop margin remains a normal pointer cancellation target.
    await opener(page).click(); await expect(dialog(page)).toBeVisible();
    await page.mouse.click(2, 2); await expect(dialog(page)).toHaveCount(0);
    await expect(opener(page)).toBeFocused();
  });
});
