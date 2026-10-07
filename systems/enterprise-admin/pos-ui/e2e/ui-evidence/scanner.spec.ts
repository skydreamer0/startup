import type { Page, Route } from '@playwright/test';
import { test, expect, intercept, success, screenshot, readKeys, type Guard } from './fixtures';

const origin = 'http://127.0.0.1:4274';
const product = (sku: string, id = sku) => ({ id, sku, name: `合成商品 ${sku}`, retailPrice: 100, stockQuantity: 10 });
type Product = ReturnType<typeof product>;
type Result = Product[] | 'error';

async function setup(page: Page, guard: Guard, results: Record<string, Result> = {}, initial: Product[] = []) {
  const held = new Map<string, Route[]>();
  const waiting = new Set<string>();
  await intercept(page, guard, origin, async (route, url) => {
    const path = url.pathname;
    if (path === '/api/v1/admin/pos/products') {
      const q = url.searchParams.get('q') ?? '';
      if (waiting.has(q)) { held.set(q, [...(held.get(q) ?? []), route]); return true; }
      const result = q ? results[q] ?? [] : initial;
      if (result === 'error') await route.fulfill({ status: 500, json: { success: false, error: { message: 'Synthetic lookup failure' } } });
      else await success(route, result);
      return true;
    }
    if (path === '/api/v1/admin/pos/checkout-context') {
      await success(route, { tenantId: 'synthetic-tenant', userId: 'synthetic-cashier' }); return true;
    }
    if (path === '/api/v1/admin/pos/shift/active') {
      await success(route, { id: 'synthetic-shift', status: 'OPEN', openedAt: '2026-10-07T00:00:00Z', staff: { id: 'synthetic-cashier', fullName: '合成收銀員' } }); return true;
    }
    if (path === '/api/v1/admin/pos/staff') {
      await success(route, [{ id: 'synthetic-cashier', fullName: '合成收銀員' }]); return true;
    }
    if (['/api/v1/admin/pos/recommendations', '/api/v1/admin/pos/reorder-forecast'].includes(path)) {
      await success(route, []); return true;
    }
    return false;
  });
  await page.addInitScript(() => localStorage.setItem('pos_accessToken', 'synthetic-ui-qa-token'));
  await page.goto(origin);
  await expect(page.getByTestId('product-search-input')).toBeEnabled();
  await expect(page.locator('.pos-cart-panel')).toBeVisible();
  return {
    hold(code: string) { waiting.add(code); },
    count(code: string) { return held.get(code)?.length ?? 0; },
    async release(code: string, rows: Product[]) {
      waiting.delete(code);
      const routes = held.get(code) ?? [];
      held.delete(code);
      expect(routes.length, `Held browser requests for ${code}`).toBeGreaterThan(0);
      // Register each browser response barrier before fulfilling the held route.
      const received = routes.map(async (route) => {
        const response = await route.request().response();
        expect(response, `Browser received ${code}`).not.toBeNull();
        expect(await response!.finished()).toBeNull();
        expect(response!.status()).toBe(200);
      });
      await Promise.all([...received, ...routes.map((route) => success(route, rows))]);
    },
  };
}

async function scan(page: Page, code: string) {
  const input = page.getByTestId('product-search-input');
  await input.focus();
  const start = (await readKeys(page)).length;
  // Real browser keydown/input/change sequences, not fill() or a document-only dispatch.
  await page.keyboard.type(code);
  await page.keyboard.press('Enter');
  const keys = (await readKeys(page)).slice(start);
  expect(keys.map((event) => event.key)).toEqual([...code, 'Enter']);
  expect(keys.every((event) => event.trusted), 'Scanner uses native trusted keyboard events').toBe(true);
  for (let index = 1; index < keys.length; index++) {
    expect(keys[index].at - keys[index - 1].at,
      'Test driver must stay within the existing 300ms scanner decoder window').toBeLessThanOrEqual(300);
  }
}

async function settleRender(page: Page) {
  // Drain response microtasks and a rendered frame before a negative assertion.
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

test('two focused scans keep both intents when replies arrive in reverse order', async ({ page, guard }, info) => {
  const api = await setup(page, guard);
  api.hold('ONE'); api.hold('TWO');
  await scan(page, 'ONE');
  await expect.poll(() => api.count('ONE')).toBeGreaterThanOrEqual(1);
  await scan(page, 'TWO');
  await expect.poll(() => api.count('TWO')).toBeGreaterThanOrEqual(1);
  await api.release('TWO', [product('TWO')]);
  await expect(page.locator('.pos-cart-panel').getByText('合成商品 TWO', { exact: true })).toBeVisible();
  await api.release('ONE', [product('ONE')]);
  const cart = page.locator('.pos-cart-panel');
  await expect(cart.getByText('合成商品 ONE', { exact: true })).toBeVisible();
  await expect(cart.getByLabel('商品數量')).toHaveCount(2);
  await expect(cart.getByLabel('商品數量').nth(0)).toHaveValue('1');
  await expect(cart.getByLabel('商品數量').nth(1)).toHaveValue('1');
  await expect(page.getByTestId('payment-confirm-button')).not.toBeVisible();
  await screenshot(page, info, 'scanner-two-intents.png');
});

test('two scans of the same SKU increase its quantity to two', async ({ page, guard }, info) => {
  const api = await setup(page, guard);
  api.hold('ONE');
  await scan(page, 'ONE');
  await scan(page, 'ONE');
  await expect.poll(() => api.count('ONE')).toBeGreaterThanOrEqual(2);
  await api.release('ONE', [product('ONE')]);
  await expect(page.locator('.pos-cart-panel').getByLabel('商品數量')).toHaveValue('2');
  await expect(page.locator('.pos-cart-panel').getByLabel('商品數量')).toHaveCount(1);
  await expect(page.getByTestId('payment-confirm-button')).not.toBeVisible();
  await screenshot(page, info, 'scanner-same-sku-two.png');
});

for (const [code, result, message] of [
  ['123', [product('A123B')], '沒有唯一完全相符商品'],
  ['AMB', [product('AMB', 'first'), product('AMB', 'second')], '請手動選擇'],
  ['ERR', 'error', '查詢商品失敗'],
] as const) {
  test(`${code} cannot add a fuzzy, ambiguous or failed result`, async ({ page, guard }, info) => {
    await setup(page, guard, { [code]: result === 'error' ? result : [...result] });
    await scan(page, code);
    await expect(page.getByText(message, { exact: false })).toBeVisible();
    await expect(page.locator('.pos-cart-panel').getByLabel('商品數量')).toHaveCount(0);
    await expect(page.getByTestId('cart-checkout-button')).toBeDisabled();
    await screenshot(page, info, `scanner-refused-${code}.png`);
  });
}

test('manual search edit permanently cancels a delayed scan', async ({ page, guard }, info) => {
  const api = await setup(page, guard);
  api.hold('LATE');
  await scan(page, 'LATE');
  await expect.poll(() => api.count('LATE')).toBeGreaterThanOrEqual(1);
  await page.getByTestId('product-search-input').fill('manual search');
  await api.release('LATE', [product('LATE')]);
  await settleRender(page);
  await expect(page.getByTestId('product-search-input')).toHaveValue('manual search');
  await expect(page.locator('.pos-cart-panel').getByLabel('商品數量')).toHaveCount(0);
  await expect(page.getByText('已加入 合成商品 LATE', { exact: true })).not.toBeVisible();
  await screenshot(page, info, 'scanner-manual-cancels-late.png');
});

test('confirmed cart clear cancels a delayed scan without any transaction', async ({ page, guard }, info) => {
  const api = await setup(page, guard, {}, [product('SAFE')]);
  await page.getByTestId('product-card-SAFE').click();
  api.hold('LATE');
  await scan(page, 'LATE');
  await expect.poll(() => api.count('LATE')).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: '清空購物車 (F5)', exact: true }).click();
  await page.getByRole('button', { name: '再按一次確認清空', exact: true }).click();
  await api.release('LATE', [product('LATE')]);
  await settleRender(page);
  await expect(page.locator('.pos-cart-panel').getByLabel('商品數量')).toHaveCount(0);
  await expect(page.getByTestId('cart-checkout-button')).toBeDisabled();
  await screenshot(page, info, 'scanner-clear-cancels-late.png');
});
