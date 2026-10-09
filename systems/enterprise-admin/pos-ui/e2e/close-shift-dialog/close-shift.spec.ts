import { test as base, expect, type Route, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { screenshot, readKeys } from '../sku-acceptance/fixtures';

const origin = 'http://127.0.0.1:4281';
const product = { id: 'close-shift-product', sku: '4711234', name: '合成交班商品', retailPrice: 100, stockQuantity: 10 };
const staff = { id: 'synthetic-cashier', fullName: '合成收銀員', email: 'synthetic@example.invalid' };
const shift = { id: 'synthetic-shift', status: 'OPEN', openedAt: '2026-10-09T00:00:00Z', staff };
const closePath = '/api/v1/admin/shifts/synthetic-shift/close';
type Fixture = {
  reads: string[]; expectedWrites: { method: string; path: string; body: unknown }[];
  unexpected: string[]; pageErrors: string[]; forwardedStatic: string[]; closeCalls: Route[]; allowClose: boolean;
};
const test = base.extend<{ fixture: Fixture }>({
  fixture: [async ({ page, context, browser }, use, info) => {
    const fixture: Fixture = { reads: [], expectedWrites: [], unexpected: [], pageErrors: [], forwardedStatic: [], closeCalls: [], allowClose: false };
    const observe = (target: Page) => target.on('pageerror', error => fixture.pageErrors.push(error.message));
    context.pages().forEach(observe); context.on('page', observe);
    await context.addInitScript(() => {
      window.__uiEvidenceKeys = [];
      document.addEventListener('keydown', event => window.__uiEvidenceKeys.push({ key: event.key, at: Date.now(), trusted: event.isTrusted }), true);
    });
    await context.routeWebSocket('**/*', socket => { fixture.unexpected.push(`WebSocket ${socket.url()}`); void socket.close(); });
    let loginUsed = false;
    await context.route('**/*', async route => {
      const request = route.request(); const url = new URL(request.url()); const method = request.method();
      const label = `${method} ${url.pathname}${url.search}`;
      if (method === 'GET' && url.origin === 'https://fonts.googleapis.com' && request.resourceType() === 'stylesheet') {
        await route.fulfill({ contentType: 'text/css', body: '' }); return;
      }
      if (url.origin !== origin) { fixture.unexpected.push(request.url()); await route.abort(); return; }
      if (method === 'POST' && url.pathname === '/api/v1/admin/pos/staff-login' && !loginUsed
        && JSON.stringify(request.postDataJSON()) === JSON.stringify({ employeeCode: 'SYNTHETIC-CASHIER' })) {
        loginUsed = true; fixture.expectedWrites.push({ method, path: url.pathname, body: request.postDataJSON() });
        await route.fulfill({ json: { success: true, data: { accessToken: 'synthetic-ui-only-token' } } }); return;
      }
      if (method === 'PATCH' && url.pathname === closePath && !url.search && fixture.allowClose
        && JSON.stringify(request.postDataJSON()) === JSON.stringify({ closingCash: 1234 })) {
        fixture.expectedWrites.push({ method, path: url.pathname, body: request.postDataJSON() });
        fixture.closeCalls.push(route); return; // Only the test releases this local synthetic response.
      }
      if (!['GET', 'HEAD'].includes(method)) { fixture.unexpected.push(label); await route.abort(); return; }
      if (url.pathname.startsWith('/api/')) {
        fixture.reads.push(label);
        const data: Record<string, unknown> = {
          '/api/v1/admin/pos/products': [product], '/api/v1/admin/pos/categories': [],
          '/api/v1/admin/pos/checkout-context': { tenantId: 'synthetic-tenant', userId: staff.id },
          '/api/v1/admin/pos/shift/active': shift, '/api/v1/admin/pos/staff': [staff],
          '/api/v1/admin/pos/recommendations': [], '/api/v1/admin/pos/reorder-forecast': [],
        };
        if (Object.hasOwn(data, url.pathname)) { await route.fulfill({ json: { success: true, data: data[url.pathname] } }); return; }
        fixture.unexpected.push(label); await route.abort(); return;
      }
      if (['/', '/login', '/favicon.ico'].includes(url.pathname) || url.pathname.startsWith('/assets/')) {
        fixture.forwardedStatic.push(label); await route.continue(); return;
      }
      fixture.unexpected.push(label); await route.abort();
    });
    await use(fixture);
    await screenshot(page, info, 'synthetic-browser-state.png');
    const keyboardEvents = await readKeys(page);
    const viewport = page.viewportSize();
    let contextClosed = false;
    context.once('close', () => { contextClosed = true; });
    await context.close();
    expect(contextClosed, 'Dispose the per-case synthetic login and storage').toBe(true);
    await writeFile(info.outputPath('network-evidence.json'), JSON.stringify({
      scope: 'Real built POS UI; local fulfilled synthetic HTTP only; no API/DB/hardware acceptance',
      nonce: process.env.SKU_UI_NONCE ?? null, contextClosed, storageScope: 'ephemeral per-case browser context',
      forwardedStatic: fixture.forwardedStatic,
      test: info.title, browserVersion: browser.version(), viewport, keyboardEvents,
      reads: fixture.reads, expectedWrites: fixture.expectedWrites, unexpected: fixture.unexpected, pageErrors: fixture.pageErrors,
    }, null, 2) + '\n');
    expect(fixture.unexpected).toEqual([]); expect(fixture.pageErrors).toEqual([]);
    expect(keyboardEvents.every(event => event.trusted)).toBe(true);
  }, { auto: true }],
});
async function setup(page: Page) {
  await page.goto(origin);
  await page.getByTestId('login-employee-code-input').fill('SYNTHETIC-CASHIER');
  await page.getByTestId('login-submit-button').click();
  await page.getByTestId('product-card-close-shift-product').click();
  await expect(page.getByLabel('商品數量')).toHaveValue('1');
  const opener = page.getByRole('button', { name: '交班', exact: true });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '確認交班' });
  const cash = dialog.getByRole('spinbutton', { name: '結帳金額' });
  await expect(cash).toBeFocused(); await cash.fill('1234');
  return { opener, dialog, cash, cancel: dialog.getByRole('button', { name: '取消' }), confirm: dialog.getByRole('button', { name: '確認交班' }) };
}
for (const method of ['pointer', 'Escape', 'Enter', 'Space']) {
  test(`native ${method} cancellation preserves cash/cart and restores opener`, async ({ page, fixture }) => {
    const { opener, dialog, cash, cancel } = await setup(page);
    await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: '確認交班' })).toBeFocused();
    await page.keyboard.press('Tab'); await expect(cash).toBeFocused();
    await page.keyboard.press('Tab'); await expect(cancel).toBeFocused();
    if (method === 'pointer') await cancel.click(); else await page.keyboard.press(method);
    await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
    await expect(page.getByLabel('商品數量')).toHaveValue('1');
    await opener.click(); await expect(cash).toHaveValue('1234');
    expect(fixture.closeCalls).toHaveLength(0); expect(fixture.expectedWrites).toHaveLength(1);
    await page.keyboard.press('Escape'); await page.keyboard.press('F2');
    await expect(page.getByTestId('product-search-input')).toBeFocused();
    await page.getByTestId('cart-checkout-button').click();
    const payment = page.getByRole('dialog', { name: '確認結帳' });
    await payment.getByRole('button', { name: '取消' }).click();
    await expect(payment).toHaveCount(0); await expect(page.getByLabel('商品數量')).toHaveValue('1');
  });
}
test('native scan-like keys and F2/F8 stay inside the dialog without service side effects', async ({ page, fixture }) => {
  const { dialog, cash, cancel } = await setup(page);
  const before = fixture.reads.length;
  await page.keyboard.press('F2'); await page.keyboard.press('F8'); await page.keyboard.type('4711234'); await page.keyboard.press('Enter');
  await expect(cash).toBeFocused(); await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab'); await page.keyboard.press('F2'); await page.keyboard.press('F8'); await expect(cancel).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  expect(fixture.reads.slice(before)).toEqual([]); expect(fixture.expectedWrites).toHaveLength(1);
  await page.keyboard.press('Escape'); await expect(page.getByLabel('商品數量')).toHaveValue('1');
});
test('native confirm locks pending input, prevents duplicate/cancel, and retries only after failure', async ({ page, fixture }) => {
  fixture.allowClose = true;
  const { dialog, cash } = await setup(page);
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter');
  await expect.poll(() => fixture.closeCalls.length).toBe(1);
  await expect(dialog).toHaveAttribute('aria-busy', 'true'); await expect(dialog).toBeFocused(); await expect(cash).toBeDisabled();
  await expect(dialog.getByRole('button', { name: '取消' })).toBeDisabled();
  await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); await expect(dialog).toBeFocused();
  for (const key of ['Escape', 'Enter', 'Space', 'F2', 'F8']) await page.keyboard.press(key);
  await expect(dialog).toBeVisible(); expect(fixture.closeCalls).toHaveLength(1); await expect(cash).toHaveValue('1234');
  await screenshot(page, test.info(), 'pending-controls-locked.png');
  await fixture.closeCalls[0].fulfill({ status: 503, json: { success: false, error: { message: '合成交班失敗' } } });
  await expect(page.getByText('合成交班失敗', { exact: true })).toBeVisible();
  await expect(cash).toBeEnabled(); await expect(cash).toBeFocused(); await expect(cash).toHaveValue('1234');
  await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Space');
  await expect.poll(() => fixture.closeCalls.length).toBe(2);
  await fixture.closeCalls[1].fulfill({ json: { success: true, data: { ...shift, status: 'CLOSED' } } });
  await expect(dialog).toHaveCount(0); await expect(page.getByRole('button', { name: /開班/ })).toBeVisible();
  expect(fixture.expectedWrites.filter(write => write.path === closePath)).toEqual([
    { method: 'PATCH', path: closePath, body: { closingCash: 1234 } },
    { method: 'PATCH', path: closePath, body: { closingCash: 1234 } },
  ]);
});
test('390px viewport keeps named dialog and controls inside the visible screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { dialog, cash, cancel, confirm } = await setup(page);
  for (const target of [dialog, cash, cancel, confirm]) {
    const box = await target.boundingBox(); expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    expect(box!.y).toBeGreaterThanOrEqual(0); expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  }
  await page.keyboard.press('Escape');
});

for (const key of ['F4', 'Enter', 'Escape']) {
  test(`backdrop click retains native ${key} ownership`, async ({ page, fixture }) => {
    const { dialog, cash, opener } = await setup(page);
    await page.locator('[data-pos-modal="close-shift"]').click({ position: { x: 8, y: 8 } });
    await expect(cash).toBeFocused();
    await page.keyboard.press(key);
    if (key === 'Escape') { await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused(); }
    else {
      await expect(dialog).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(1);
      await page.keyboard.press('Escape');
    }
    await expect(page.getByLabel('商品數量')).toHaveValue('1');
    await expect(page.getByRole('button', { name: /掛單.*1/ })).toHaveCount(0);
    expect(fixture.expectedWrites).toHaveLength(1); expect(fixture.closeCalls).toHaveLength(0);
  });
}
test('pending backdrop click cannot hold the cart or cancel the native close request', async ({ page, fixture }) => {
  fixture.allowClose = true;
  const { dialog, cash, confirm } = await setup(page);
  await confirm.click(); await expect.poll(() => fixture.closeCalls.length).toBe(1);
  await page.locator('[data-pos-modal="close-shift"]').click({ position: { x: 8, y: 8 } });
  await expect(dialog).toBeFocused();
  for (const key of ['F4', 'Enter', 'Escape']) await page.keyboard.press(key);
  await expect(dialog).toBeVisible(); await expect(cash).toHaveValue('1234');
  expect(fixture.closeCalls).toHaveLength(1);
  await fixture.closeCalls[0].fulfill({ status: 503, json: { success: false, error: { message: '合成遮罩測試失敗回應' } } });
  await expect(cash).toBeEnabled(); await page.keyboard.press('Escape');
  await expect(page.getByLabel('商品數量')).toHaveValue('1');
  expect(fixture.expectedWrites.filter(write => write.path === closePath)).toEqual([
    { method: 'PATCH', path: closePath, body: { closingCash: 1234 } },
  ]);
});
