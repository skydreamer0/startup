import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { checkoutHttpHarness } from './helpers/checkout-http-harness';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}

for (const recovery of ['query', 'retry'] as const) {
  test(`lost committed response → real HTTP API restart → refresh → ${recovery} confirms original order`, async ({ page }, info) => {
    const harness = await checkoutHttpHarness(recovery, (name) => info.outputPath(name));
    const { fixture } = harness;
    const posts: Record<string, unknown>[] = [];
    const browserErrors: string[] = [];
    page.on('pageerror', (error) => browserErrors.push(error.message));
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/pos/checkout')) posts.push(request.postDataJSON());
    });
    try {
    const before = await harness.snapshot();
    expect(before.orders).toHaveLength(0); expect(before.commands).toHaveLength(0);
    expect(before.payments).toHaveLength(0); expect(before.movements).toHaveLength(0); expect(before.allocations).toHaveLength(0);
      let original: { success: boolean; data: { id: string; orderNumber: string } } | undefined;
      // Forward exactly one real POST and discard its successful response. All
      // other requests, including lookup, use the real HTTP API without mocks.
      await page.route('**/api/v1/admin/pos/checkout', async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        original = await response.json();
        await route.abort('connectionreset');
      }, { times: 1 });
      await page.goto(harness.uiOrigin + '/login');
      await page.getByTestId('login-employee-code-input').fill(fixture.employeeCode);
      await page.getByTestId('login-submit-button').click();
      await page.getByTestId(`product-card-${fixture.productId}`).click();
      await page.getByTestId(`product-card-${fixture.productId}`).click();
      await page.getByTestId('cart-checkout-button').click();
      await page.getByTestId('payment-tendered-input').fill('200');
      await page.getByTestId('payment-confirm-button').click();
      const panel = page.getByTestId('checkout-recovery');
      await expect(panel).toContainText('尚未確認結帳結果');
      await expect(panel).toContainText('查詢或重送同一意圖');
      await expect(page.getByTestId('receipt-modal')).not.toBeVisible();
      expect(original?.success).toBe(true); expect(posts).toHaveLength(1);
      const key = `pos-checkout-intent-v1:${fixture.tenantId}:${fixture.staffId}`;
      const saved = await page.evaluate((key) => localStorage.getItem(key), key);
      const intent = JSON.parse(saved!);
      expect(intent.status).toBe('unknown'); expect(intent.payload).toEqual(posts[0]);
      expect(intent.draft.items).toHaveLength(1); expect(intent.draft.items[0].quantity).toBe(2);
      const committed = await harness.snapshot();
      expect(committed.commands[0].result).toEqual(original!.data);
      await harness.restartApi();
      const restarted = await harness.snapshot();
      expect(restarted).toEqual(committed);
      await page.reload();
      await expect(panel).toContainText(posts[0].commandId as string);
      await expect(page.getByTestId('cart-checkout-button')).toBeDisabled();
      expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBe(saved);
      await page.screenshot({ path: info.outputPath('unknown-after-api-restart-and-refresh.png'), fullPage: true });
      const response = page.waitForResponse((response) => recovery === 'query'
        ? response.url().includes(`/pos/checkout-commands/${posts[0].commandId}`)
        : new URL(response.url()).pathname.endsWith('/pos/checkout') && response.request().method() === 'POST');
      await page.getByRole('button', { name: recovery === 'query' ? '查詢原訂單' : '重送同一意圖', exact: true }).click();
      const recovered = await (await response).json();
      if (recovery === 'query') {
        expect(recovered.data).toMatchObject({ status: 'SUCCEEDED', commandId: posts[0].commandId, payloadHash: committed.commands[0].payloadHash });
        expect(recovered.data.result).toEqual(original!.data);
      } else {
        expect(recovered).toEqual(original);
        expect(posts[1]).toEqual(posts[0]);
      }
      await expect(page.getByTestId('receipt-modal')).toContainText(original!.data.orderNumber);
      await expect(panel).not.toBeVisible();
      expect(await page.evaluate((key) => localStorage.getItem(key), key)).toBeNull();
      expect(posts).toHaveLength(recovery === 'query' ? 1 : 2); expect(browserErrors).toEqual([]);
      const final = await harness.snapshot();
      expect(final).toEqual(committed);
      expect(final.orders).toHaveLength(1); expect(final.orders[0]).toMatchObject({ id: original!.data.id, orderNumber: original!.data.orderNumber });
      expect(final.payments).toHaveLength(1); expect(final.payments[0]).toMatchObject({ orderId: original!.data.id, method: 'CASH', amount: '200' });
      expect(final.movements).toHaveLength(1); expect(final.movements[0]).toMatchObject({ referenceId: original!.data.id, productId: fixture.productId, type: 'OUT', quantity: 2 });
      expect(final.allocations).toHaveLength(1); expect(final.allocations[0]).toMatchObject({ orderId: original!.data.id, productId: fixture.productId, batchId: fixture.batchId, quantity: 2, movementId: final.movements[0].id, orderItemId: final.orders[0].items[0].id });
      expect(final.commands).toHaveLength(1); expect(final.commands[0]).toMatchObject({ kind: 'POS_CHECKOUT', status: 'SUCCEEDED', commandId: posts[0].commandId, orderId: original!.data.id });
      expect(final.product.stockQuantity).toBe(3); expect(final.batch.quantity).toBe(3);
      expect(final.orders[0].items).toHaveLength(1);
      const conservation = {
        productDebit: before.product.stockQuantity - final.product.stockQuantity,
        lotDebit: before.batch.quantity - final.batch.quantity,
        sold: final.orders[0].items.reduce((sum, item) => sum + item.quantity, 0),
        movementOut: final.movements.reduce((sum, row) => sum + row.quantity, 0),
        allocated: final.allocations.reduce((sum, row) => sum + row.quantity, 0),
      };
      expect(Object.values(conservation)).toEqual([2, 2, 2, 2, 2]);
      await page.screenshot({ path: info.outputPath('confirmed-original-order.png'), fullPage: true });
      await writeFile(info.outputPath('recovery-evidence.json'), JSON.stringify({ scenario: recovery, fixture, posts, original, recovered, intent, before, committed, restarted, final, conservation,
        originalResultSha256: createHash('sha256').update(canonical(original!.data)).digest('hex'), browserErrors }, null, 2));
      console.log(JSON.stringify({ scenario: recovery, database: harness.databaseName, commandId: posts[0].commandId, orderId: original!.data.id, orderNumber: original!.data.orderNumber,
        posts: posts.length, orders: final.orders.length, payments: final.payments.length, movements: final.movements.length, allocations: final.allocations.length, commands: final.commands.length, conservation }));
    } finally { await harness.close(); }
  });
}
