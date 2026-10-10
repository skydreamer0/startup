import { test as base, expect, type Route, type Page, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { screenshot as captureScreenshot, readKeys } from '../sku-acceptance/fixtures';
import { brandRequest, assertBrandResponse } from './brand-assets.mjs';

export const origin = 'http://127.0.0.1:4288';
export const product = { id: 'synthetic-product', sku: 'SYNTHETIC', name: '合成焦點測試商品', retailPrice: 1000, stockQuantity: 20 };
const fonts = new Set([
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap',
]);
type Write = { method: string; path: string; body: unknown };
export type Fixture = {
  reads: string[]; expectedWrites: Write[]; unexpected: string[]; pageErrors: string[];
  forwardedStatic: string[]; checkoutCalls: Route[]; allowCheckout: boolean;
  verifiedBrand: ReturnType<typeof assertBrandResponse>[];
};
export const test = base.extend<{ fixture: Fixture }>({
  fixture: [async ({ page, context, browser }, use, info) => {
    const fixture: Fixture = { reads: [], expectedWrites: [], unexpected: [], pageErrors: [], forwardedStatic: [], verifiedBrand: [], checkoutCalls: [], allowCheckout: false };
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
      if (method === 'GET' && request.resourceType() === 'stylesheet' && fonts.has(url.href)) {
        await route.fulfill({ contentType: 'text/css', body: '' }); return;
      }
      if (url.origin !== origin) { fixture.unexpected.push(request.url()); await route.abort(); return; }
      if (method === 'POST' && url.pathname === '/api/v1/admin/pos/staff-login' && !url.search && !loginUsed
        && JSON.stringify(request.postDataJSON()) === JSON.stringify({ employeeCode: 'SYNTHETIC-CASHIER' })) {
        loginUsed = true; fixture.expectedWrites.push({ method, path: url.pathname, body: request.postDataJSON() });
        await route.fulfill({ json: { success: true, data: { accessToken: 'synthetic-ui-only-token' } } }); return;
      }
      if (method === 'POST' && url.pathname === '/api/v1/admin/pos/checkout' && !url.search && fixture.allowCheckout) {
        fixture.expectedWrites.push({ method, path: url.pathname, body: request.postDataJSON() });
        fixture.checkoutCalls.push(route); return; // No forwarding: the case controls the local synthetic response.
      }
      if (!['GET', 'HEAD'].includes(method)) { fixture.unexpected.push(label); await route.abort(); return; }
      const brand = brandRequest(url, method, origin);
      if (brand) {
        try {
          const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
          const receipt = assertBrandResponse(brand, { status: response.status(), contentType: response.headers()['content-type'], body: await response.body() });
          await route.fulfill({ response });
          fixture.verifiedBrand.push(receipt);
        } catch (error) {
          fixture.unexpected.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
          await route.abort();
        }
        return;
      }
      if (url.pathname.startsWith('/api/')) {
        fixture.reads.push(label);
        const data: Record<string, unknown> = {
          '/api/v1/admin/pos/products': [product], '/api/v1/admin/pos/categories': [],
          '/api/v1/admin/pos/checkout-context': { tenantId: 'synthetic-tenant', userId: 'synthetic-cashier' },
          '/api/v1/admin/pos/shift/active': { id: 'synthetic-shift', status: 'OPEN', openedAt: '2026-10-09T00:00:00Z', staff: { id: 'synthetic-cashier', fullName: '合成收銀員' } },
          '/api/v1/admin/pos/staff': [{ id: 'synthetic-cashier', fullName: '合成收銀員' }],
          '/api/v1/admin/pos/recommendations': [], '/api/v1/admin/pos/reorder-forecast': [], '/api/v1/admin/pos/orders/today': [],
        };
        if (Object.hasOwn(data, url.pathname)) { await route.fulfill({ json: { success: true, data: data[url.pathname] } }); return; }
        fixture.unexpected.push(label); await route.abort(); return;
      }
      if (['/', '/login', '/favicon.ico'].includes(url.pathname) || url.pathname.startsWith('/assets/')) {
        fixture.forwardedStatic.push(label); await route.continue(); return;
      }
      fixture.unexpected.push(label); await route.abort();
    });
    try { await use(fixture); }
    finally {
      const keyboardEvents = await readKeys(page);
      const viewport = page.viewportSize();
      if (!page.isClosed()) await screenshot(page, info, 'synthetic-browser-state.png');
      let contextClosed = false;
      context.once('close', () => { contextClosed = true; });
      await context.close();
      const evidence = { scope: 'Official Chrome with real built POS and locally fulfilled synthetic HTTP; no API/DB/hardware acceptance',
        nonce: process.env.DIALOG_UI_NONCE, test: info.title, browserVersion: browser.version(), viewport, contextClosed,
        keyboardEvents, reads: fixture.reads, expectedWrites: fixture.expectedWrites, forwardedStatic: fixture.forwardedStatic,
        verifiedBrand: fixture.verifiedBrand,
        unexpected: fixture.unexpected, pageErrors: fixture.pageErrors };
      await mkdir(dirname(info.outputPath('network-evidence.json')), { recursive: true });
      await writeFile(info.outputPath('network-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
      expect(contextClosed).toBe(true); expect(fixture.unexpected).toEqual([]); expect(fixture.pageErrors).toEqual([]);
      expect(keyboardEvents.every(event => event.trusted)).toBe(true);
      console.log('DIALOG_CASE_EVIDENCE ' + JSON.stringify(evidence));
    }
  }, { auto: true }],
});
export { expect };
export async function screenshot(page: Page, info: TestInfo, name: string) {
  await captureScreenshot(page, info, name);
  // Inspect real product/dialog text, never the synthetic screenshot badge.
  const candidates = [
    '[data-pos-modal="admin-pin"] [role="dialog"] h3',
    '[data-pos-modal="split-payment"]:not([inert]) [role="dialog"] h3',
    '#payment-title',
    '[data-testid="product-card-synthetic-product"] > span:first-of-type',
  ];
  let selector = '';
  for (const candidate of candidates) if (await page.locator(candidate).isVisible()) { selector = candidate; break; }
  expect(selector, 'A real Chinese dialog/product label must be rendered').not.toBe('');
  const target = page.locator(selector);
  const computed = await target.evaluate(node => ({ text: node.textContent, fontFamily: getComputedStyle(node).fontFamily }));
  expect(computed.text).toMatch(/[\u3400-\u9fff]/);
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('DOM.enable'); await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    expect(nodeId).toBeGreaterThan(0);
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    expect(fonts.some(font => /Noto Sans CJK/.test(font.familyName) && font.glyphCount > 0), 'Actual CJK glyphs must use the installed font').toBe(true);
    await writeFile(info.outputPath(name + '.fonts.json'), JSON.stringify({ nonce: process.env.DIALOG_UI_NONCE,
      test: info.title, screenshot: name, selector, ...computed, fonts }, null, 2) + '\n');
  } finally { await session.detach(); }
}
export async function setup(page: Page) {
  await page.goto(origin);
  await page.getByTestId('login-employee-code-input').fill('SYNTHETIC-CASHIER');
  await page.getByTestId('login-submit-button').click();
  await expect(page.getByTestId('product-search-input')).toBeEnabled();
  await page.getByTestId('product-card-synthetic-product').click();
  await expect(page.getByLabel('商品數量')).toHaveValue('1');
}
export function assertNoCheckout(fixture: Fixture) {
  expect(fixture.checkoutCalls).toHaveLength(0);
  expect(fixture.expectedWrites).toEqual([{ method: 'POST', path: '/api/v1/admin/pos/staff-login', body: { employeeCode: 'SYNTHETIC-CASHIER' } }]);
}
