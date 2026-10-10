import { test as base, expect, type Page, type TestInfo, type Request } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { allowedRequest, origin } from './contract.mjs';
import { assertFonts } from '../category-native/contract.mjs';
export type Product = { id: string; sku: string; name: string; categoryId: string; stockQuantity: number };
export type Bootstrap = { tenantId: string; userId: string; shiftId: string; productId: string; batchId: string; accessToken: string; nonce: string };
type RequestRow = { id: string; method: string; path: string };
type ResponseRow = RequestRow & { status: number; sha256: string };
export type Guard = { requests: RequestRow[]; responses: ResponseRow[]; unexpected: string[]; pageErrors: string[]; bootstrap: Bootstrap; phase: string };
const fonts = new Set([
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap',
]);
declare global { interface Window { __categoryKeys: { key: string; trusted: boolean }[] } }
export const test = base.extend<{ guard: Guard }>({
  guard: [async ({ page, context, browser }, use, info) => {
    const bootstrap: Bootstrap = JSON.parse(readFileSync(join(process.env.STOCK_UI_OUTPUT!, '.bootstrap.json'), 'utf8'))[Number(info.title.match(/(\d+)px$/)![1])];
    expect(bootstrap.nonce).toBe(process.env.CATEGORY_UI_NONCE);
    const guard: Guard = { bootstrap, requests: [], responses: [], unexpected: [], pageErrors: [], phase: 'initial' };
    const ids = new WeakMap<Request, RequestRow>(); const pending: Promise<void>[] = [];
    const observe = (page: Page) => page.on('pageerror', error => guard.pageErrors.push(error.message));
    context.pages().forEach(observe); context.on('page', observe);
    await context.addInitScript(({ token }) => {
      localStorage.setItem('pos_accessToken', token);
      window.__categoryKeys = [];
      document.addEventListener('keydown', event => window.__categoryKeys.push({ key: event.key, trusted: event.isTrusted }), true);
    }, { token: bootstrap.accessToken });
    await context.routeWebSocket('**/*', socket => { guard.unexpected.push(`WebSocket ${socket.url()}`); void socket.close(); });
    context.on('response', response => {
      const request = response.request(); const row = ids.get(request); if (!row) return;
      pending.push((async () => {
        try { guard.responses.push({ ...row, status: response.status(), sha256: createHash('sha256').update(await response.body()).digest('hex') }); }
        catch (error) { guard.unexpected.push(`response body unavailable: ${row.path}: ${String(error)}`); }
      })());
    });
    await context.route('**/*', async route => {
      const request = route.request(); const url = new URL(request.url()); const method = request.method();
      if (method === 'GET' && request.resourceType() === 'stylesheet' && fonts.has(url.href)) {
        await route.fulfill({ contentType: 'text/css', body: '' }); return; // Only external CSS, never API.
      }
      const label = `${method} ${url.pathname}${url.search}`;
      if (url.origin !== origin || !['GET', 'HEAD', 'POST'].includes(method)) { guard.unexpected.push(label); await route.abort(); return; }
      if (url.pathname.startsWith('/api/')) {
        if (!allowedRequest(method, url.pathname)) { guard.unexpected.push(label); await route.abort(); return; }
        const row = { id: `${bootstrap.nonce}:${randomUUID()}`, method, path: url.pathname + url.search };
        ids.set(request, row); guard.requests.push(row);
        await route.continue({ headers: { ...request.headers(), 'x-stock-qa-request': row.id, 'x-stock-qa-width': info.title.match(/(\d+)px$/)![1], 'x-stock-qa-phase': guard.phase } }); return;
      }
      if (['GET', 'HEAD'].includes(method) && (['/', '/login', '/favicon.ico'].includes(url.pathname) || url.pathname.startsWith('/assets/'))) { await route.continue(); return; }
      guard.unexpected.push(label); await route.abort();
    });
    try { await use(guard); }
    finally {
      const keys = page.isClosed() ? [] : await page.evaluate(() => window.__categoryKeys);
      await Promise.all(pending);
      let contextClosed = false; context.once('close', () => { contextClosed = true; });
      await context.close(); await Promise.all(pending);
      mkdirSync(info.outputDir, { recursive: true });
      writeFileSync(info.outputPath('network.json'), JSON.stringify({ test: info.title, nonce: bootstrap.nonce,
        viewport: page.viewportSize(), browserVersion: browser.version(), contextClosed, keys,
        requests: guard.requests, responses: guard.responses, unexpected: guard.unexpected, pageErrors: guard.pageErrors }, null, 2) + '\n');
      expect(contextClosed).toBe(true); expect(guard.unexpected).toEqual([]); expect(guard.pageErrors).toEqual([]);
    }
  }, { auto: true }],
});
export { expect };
export const cartSnapshot = (page: Page) => page.locator('.pos-cart-panel').evaluate(panel => ({
  text: (panel as HTMLElement).innerText,
  inputs: Array.from(panel.querySelectorAll('input')).map(input => ({ label: input.getAttribute('aria-label'), id: input.id, value: input.value })),
}));
export async function capture(page: Page, info: TestInfo, stage: string) {
  await page.evaluate(() => document.fonts.ready);
  const alert = page.getByRole('alert');
  const card = page.locator('[data-testid^="product-card-"]').first();
  const target = await alert.count() ? alert : card;
  const session = await page.context().newCDPSession(page);
  let fonts;
  try {
    await session.send('DOM.enable'); await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const selector = await alert.count() ? '[role="alert"]' : '[data-testid^="product-card-"]';
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    ({ fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId })); assertFonts(fonts);
  } finally { await session.detach(); }
  await target.scrollIntoViewIfNeeded();
  const geometry = await target.evaluate(node => {
    const r = node.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  await page.screenshot({ path: info.outputPath(`${stage}.png`), fullPage: false });
  writeFileSync(info.outputPath(`${stage}.json`), JSON.stringify({ test: info.title, nonce: process.env.CATEGORY_UI_NONCE,
    stage, fonts, geometry, text: await target.innerText(), stock: await card.innerText(), cart: await cartSnapshot(page) }, null, 2) + '\n');
}
