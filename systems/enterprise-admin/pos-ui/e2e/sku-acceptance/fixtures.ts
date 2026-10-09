import { test as base, expect, type BrowserContext, type Page, type Route, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';

export type ApiHandler = (route: Route, url: URL) => Promise<boolean>;
export type KeyEvent = { key: string; at: number; trusted: boolean };
declare global {
  interface Window { __uiEvidenceKeys: KeyEvent[] }
}
export const readKeys = (page: Page) => page.evaluate(() => window.__uiEvidenceKeys);
const fontStylesheets = new Set([
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap',
]);
export type Guard = { expectedWrites: string[]; requests: string[]; writes: string[]; unexpected: string[]; pageErrors: string[]; stubbedStylesheets: string[] };
export const test = base.extend<{ guard: Guard }>({
  guard: [async ({ page, context, browser }, use, info) => {
    const guard: Guard = { expectedWrites: [], requests: [], writes: [], unexpected: [], pageErrors: [], stubbedStylesheets: [] };
    const observe = (target: Page) => target.on('pageerror', error => guard.pageErrors.push(error.message));
    context.pages().forEach(observe);
    context.on('page', observe);
    await context.addInitScript(() => {
      const events: KeyEvent[] = [];
      window.__uiEvidenceKeys = events;
      document.addEventListener('keydown', (event) => {
        events.push({ key: event.key, at: Date.now(), trusted: event.isTrusted });
      }, true);
    });
    await use(guard);
    await screenshot(page, info, 'actual-synthetic-ui.png');
    const keyboardEvents = await readKeys(page);
    // Close every page before sealing the ledger, including unload-time attempts.
    await context.close();
    const evidencePath = info.outputPath('network-evidence.json');
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, JSON.stringify({ nonce: process.env.SKU_UI_NONCE, testId: info.testId, file: basename(info.file),
      test: info.title, viewport: page.viewportSize(), browserVersion: browser.version(),
      role: 'synthetic cashier', fixture: 'UI staff login with locally fulfilled synthetic credentials; declared read-only API' ,
      keyboardEvents, ...guard }, null, 2) + '\n');
    expect(guard.writes, 'No write request may leave the synthetic UI').toEqual([]);
    expect(guard.unexpected, 'Only declared API fixtures and owned static assets are allowed').toEqual([]);
    expect(guard.pageErrors).toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function intercept(context: BrowserContext, guard: Guard, origin: string, handler: ApiHandler, login?: { employeeCode: string; accessToken: string }) {
  let loginUsed = false;
  await context.routeWebSocket('**/*', socket => {
    guard.unexpected.push(`WebSocket ${socket.url()}`); void socket.close();
  });
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const description = `${request.method()} ${url.pathname}${url.search}`;
    if (request.method() === 'GET' && request.resourceType() === 'stylesheet' && fontStylesheets.has(request.url())) {
      guard.stubbedStylesheets.push(request.url());
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' }); return;
    }
    // This sole write exception is fulfilled here; it can never reach a server.
    if (login && !loginUsed && url.origin === origin && url.pathname === '/api/v1/admin/pos/staff-login'
      && !url.search && request.method() === 'POST') {
      let body: unknown;
      try { body = request.postDataJSON(); } catch { body = null; }
      if (JSON.stringify(body) === JSON.stringify({ employeeCode: login.employeeCode })) {
        loginUsed = true;
        guard.expectedWrites.push(description);
        await route.fulfill({ json: { success: true, data: { accessToken: login.accessToken } } }); return;
      }
    }
    if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method())) {
      if (!['GET', 'HEAD'].includes(request.method())) guard.writes.push(description);
      else guard.unexpected.push(request.url());
      await route.abort('blockedbyclient'); return;
    }
    if (url.pathname.startsWith('/api/')) {
      guard.requests.push(description);
      if (await handler(route, url)) return;
      guard.unexpected.push(description); await route.abort('blockedbyclient'); return;
    }
    // No API fall-through and no arbitrary alternate app/service endpoints.
    const asset = url.pathname === '/' || url.pathname === '/login' || url.pathname === '/customer-display'
      || url.pathname.startsWith('/assets/') || url.pathname === '/favicon.ico';
    if (!asset) { guard.unexpected.push(description); await route.abort('blockedbyclient'); return; }
    await route.continue();
  });
}

export const success = (route: Route, data: unknown) => route.fulfill({ json: { success: true, data } });
export async function screenshot(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => {
    let badge = document.querySelector<HTMLDivElement>('#synthetic-qa-label');
    if (!badge) { badge = document.createElement('div'); badge.id = 'synthetic-qa-label'; document.body.append(badge); }
    badge.textContent = '合成 UI QA 資料 · 不含真實交易';
    Object.assign(badge.style, { position: 'fixed', bottom: '8px', left: '8px', zIndex: '2147483647',
      background: '#172554', color: 'white', padding: '5px 10px', borderRadius: '4px', fontSize: '12px', pointerEvents: 'none' });
  });
  await page.screenshot({ path: info.outputPath(name), fullPage: false });
}
