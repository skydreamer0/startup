import { test as base, expect, type Page, type TestInfo, type Request } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { allowedRead, assertFonts, origin, emptyCase } from './contract.mjs';
import { brandRequest, assertBrandResponse } from '../dialog-acceptance/brand-assets.mjs';
export type Product = { id: string; sku: string; name: string; categoryId: string; stockQuantity: number };
export type Bootstrap = { tenantId: string; userId: string; shiftId: string; categories: { id: string; name: string }[]; products: Product[]; accessToken: string; nonce: string; empty: { tenantId: string; userId: string; shiftId: string; categories: { id: string; name: string }[]; products: Product[]; accessToken: string } };
type RequestRow = { id: string; method: string; path: string };
type ResponseRow = RequestRow & { status: number; sha256: string };
export type Guard = { requests: RequestRow[]; responses: ResponseRow[]; unexpected: string[]; pageErrors: string[]; bootstrap: Bootstrap; phase: string; verifiedBrand: ReturnType<typeof assertBrandResponse>[] };
const fonts = new Set([
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap',
]);
declare global { interface Window { __categoryKeys: { key: string; trusted: boolean }[] } }
export const test = base.extend<{ guard: Guard }>({
  guard: [async ({ page, context, browser }, use, info) => {
    const allBootstrap: Bootstrap = JSON.parse(readFileSync(join(process.env.CATEGORY_UI_OUTPUT!, '.bootstrap.json'), 'utf8'));
    const bootstrap = info.title === emptyCase ? { ...allBootstrap, ...allBootstrap.empty } : allBootstrap;
    expect(bootstrap.nonce).toBe(process.env.CATEGORY_UI_NONCE);
    const guard: Guard = { bootstrap, requests: [], responses: [], unexpected: [], pageErrors: [], phase: 'initial', verifiedBrand: [] };
    const ids = new WeakMap<Request, RequestRow>(); const pending: Promise<void>[] = [];
    const observe = (page: Page) => page.on('pageerror', error => guard.pageErrors.push(error.message));
    context.pages().forEach(observe); context.on('page', observe);
    await context.addInitScript(({ token, appOrigin }) => {
      if (location.origin === appOrigin) localStorage.setItem('pos_accessToken', token);
      window.__categoryKeys = [];
      document.addEventListener('keydown', event => window.__categoryKeys.push({ key: event.key, trusted: event.isTrusted }), true);
    }, { token: bootstrap.accessToken, appOrigin: origin });
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
      if (url.origin !== origin || !['GET', 'HEAD'].includes(method)) { guard.unexpected.push(label); await route.abort(); return; }
      if (url.pathname.startsWith('/api/')) {
        if (!allowedRead(method, url.pathname)) { guard.unexpected.push(label); await route.abort(); return; }
        const row = { id: `${bootstrap.nonce}:${randomUUID()}`, method, path: url.pathname + url.search };
        ids.set(request, row); guard.requests.push(row);
        await route.continue({ headers: { ...request.headers(), 'x-category-qa-request': row.id, 'x-category-qa-case': info.title, 'x-category-qa-phase': guard.phase } }); return;
      }
      const brand = brandRequest(url, method, origin);
      if (brand) {
        try {
          const response = await route.fetch({ maxRedirects: 0, maxRetries: 0 });
          const receipt = assertBrandResponse(brand, { status: response.status(), contentType: response.headers()['content-type'], body: await response.body() });
          await route.fulfill({ response }); guard.verifiedBrand.push(receipt);
        } catch (error) {
          guard.unexpected.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); await route.abort();
        }
        return;
      }
      if (['/', '/login', '/favicon.ico'].includes(url.pathname) || url.pathname.startsWith('/assets/')) { await route.continue(); return; }
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
        requests: guard.requests, responses: guard.responses, verifiedBrand: guard.verifiedBrand, unexpected: guard.unexpected, pageErrors: guard.pageErrors }, null, 2) + '\n');
      expect(contextClosed).toBe(true); expect(guard.unexpected).toEqual([]); expect(guard.pageErrors).toEqual([]);
    }
  }, { auto: true }],
});
export { expect };
export const cartSnapshot = (page: Page) => page.locator('.pos-cart-panel').evaluate(panel => ({
  text: (panel as HTMLElement).innerText,
  inputs: Array.from(panel.querySelectorAll('input')).map(input => ({ label: input.getAttribute('aria-label'), id: input.id, value: input.value })),
}));
export async function capture(page: Page, info: TestInfo, stage: string, baseline: unknown, categories: Bootstrap['categories']) {
  await expect(page.getByRole('navigation', { name: '商品分類' }).getByRole('button')).toHaveCount(categories.length + 1);
  expect(await cartSnapshot(page)).toEqual(baseline);
  await expect(page.locator('[data-pos-modal]')).toHaveCount(0);
  await page.evaluate(() => document.fonts.ready);
  const session = await page.context().newCDPSession(page);
  const glyphs = [];
  try {
    await session.send('DOM.enable'); await session.send('CSS.enable'); const { root } = await session.send('DOM.getDocument');
    for (let index = 1; index <= categories.length + 1; index++) {
      const selector = `nav[aria-label="商品分類"] button:nth-of-type(${index})`;
      const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector });
      const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId }); assertFonts(fonts);
      const measured = await page.locator(selector).evaluate(node => {
        const r = node.getBoundingClientRect(); const css = getComputedStyle(node);
        return { text: node.textContent, x: r.x, y: r.y, width: r.width, height: r.height,
          fontFamily: css.fontFamily, outlineStyle: css.outlineStyle, outlineWidth: css.outlineWidth,
          focused: document.activeElement === node, pressed: node.getAttribute('aria-pressed') };
      });
      glyphs.push({ selector, ...measured, fonts });
    }
  } finally { await session.detach(); }
  mkdirSync(info.outputDir, { recursive: true });
  await page.screenshot({ path: info.outputPath(`${stage}.png`), fullPage: false });
  const geometry = await page.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight },
    scrollX, scrollY, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight,
    navScrollLeft: document.querySelector('nav[aria-label="商品分類"]')!.scrollLeft }));
  writeFileSync(info.outputPath(`${stage}.json`), JSON.stringify({ test: info.title, nonce: process.env.CATEGORY_UI_NONCE, stage,
    geometry, glyphs, cart: await cartSnapshot(page), cartUnchanged: true, checkoutModalAbsent: true }, null, 2) + '\n');
}
export async function assertReachable(page: Page, button: ReturnType<Page['getByRole']>) {
  const result = await button.evaluate(node => {
    const r = node.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { width: r.width, height: r.height, centerInViewport: x >= 0 && x < innerWidth && y >= 0 && y < innerHeight,
      hit: node === hit || !!hit && node.contains(hit), focused: document.activeElement === node };
  });
  expect(result.width).toBeGreaterThanOrEqual(44); expect(result.height).toBeGreaterThanOrEqual(44);
  expect(result.centerInViewport).toBe(true); expect(result.hit).toBe(true);
  return result;
}
