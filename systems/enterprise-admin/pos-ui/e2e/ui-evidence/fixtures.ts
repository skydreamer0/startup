import { test as base, expect, type Page, type Route, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

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
export type Guard = { requests: string[]; writes: string[]; unexpected: string[]; pageErrors: string[]; stubbedStylesheets: string[] };
export const test = base.extend<{ guard: Guard }>({
  guard: [async ({ page }, use, info) => {
    const guard: Guard = { requests: [], writes: [], unexpected: [], pageErrors: [], stubbedStylesheets: [] };
    page.on('pageerror', (error) => guard.pageErrors.push(error.message));
    await page.addInitScript(() => {
      const events: KeyEvent[] = [];
      window.__uiEvidenceKeys = events;
      document.addEventListener('keydown', (event) => {
        events.push({ key: event.key, at: Date.now(), trusted: event.isTrusted });
      }, true);
    });
    await use(guard);
    const evidencePath = info.outputPath('network-evidence.json');
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, JSON.stringify({ test: info.title, viewport: page.viewportSize(),
      keyboardEvents: await readKeys(page), ...guard }, null, 2) + '\n');
    expect(guard.writes, 'No write request may leave the synthetic UI').toEqual([]);
    expect(guard.unexpected, 'Only declared API fixtures and owned static assets are allowed').toEqual([]);
    expect(guard.pageErrors).toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function intercept(page: Page, guard: Guard, origin: string, handler: ApiHandler) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const description = `${request.method()} ${url.pathname}${url.search}`;
    if (request.method() === 'GET' && request.resourceType() === 'stylesheet' && fontStylesheets.has(request.url())) {
      guard.stubbedStylesheets.push(request.url());
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' }); return;
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
  await page.screenshot({ path: info.outputPath(name), fullPage: true });
}
