import { test as base, expect, type Page, type TestInfo, type Route } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { assertCjkFonts, assertTraceCjkFonts } from './cjk.mjs';
import type { MarginAnalysis } from '@pharmasaas/types';
import type { reportsApi } from '../../../admin-ui/src/api/reports';

export const origin = 'http://127.0.0.1:4287';
export const noticeName = '目前成本估算，非歷史實際毛利';
export const productName = '合成測試商品：長中文名稱與目前成本估算檢查';
export type Slug = 'margin' | 'sales-ranking';
type Reply = { status: number; data?: unknown };
type Deferred = { promise: Promise<Reply>; resolve: (reply: Reply) => void };
export function deferred(): Deferred {
  let resolve!: Deferred['resolve'];
  const promise = new Promise<Reply>(done => { resolve = done; });
  return { promise, resolve };
}
export const margin: MarginAnalysis = {
  period: '2026-10', summary: { totalRevenue: 1500, totalCogs: 1100, totalMargin: 400, totalMarginPct: 26.67 },
  products: [{ id: 'synthetic-1', name: productName, sku: 'SYN-1', qty: 3, revenue: 1500,
    cogs: 1100, margin: 400, marginPct: 26.67, contributionPct: 100 }],
};
export const ranking: Awaited<ReturnType<typeof reportsApi.getSalesRanking>> = {
  period: '2026-10', categories: [{ category: '合成長中文分類', revenue: 2100, quantity: 9 }],
  topProducts: [
    { id: 'synthetic-1', name: productName, sku: 'SYN-1', categoryName: '合成長中文分類', quantity: 3, revenue: 1500, margin: 400, marginPct: 26.67 },
    { id: 'synthetic-2', name: '合成數量第一商品', sku: 'SYN-2', categoryName: '合成長中文分類', quantity: 6, revenue: 600, margin: -60, marginPct: -10 },
  ],
};
export const dataFor = (slug: Slug) => slug === 'margin' ? margin : ranking;
export const emptyFor = (slug: Slug) => slug === 'margin'
  ? { period: '2026-10', summary: { totalRevenue: 0, totalCogs: 0, totalMargin: 0, totalMarginPct: 0 }, products: [] }
  : { period: '2026-10', categories: [], topProducts: [] };
export const loadingFor = (slug: Slug) => slug === 'margin' ? 'Loading margin data...' : 'Loading sales ranking...';
export const notice = (page: Page) => page.getByRole('note', { name: noticeName });

type Harness = {
  reads: string[]; responses: number[]; unexpected: string[]; pageErrors: string[];
  stubbedStylesheets: string[];
  handler: (url: URL) => Reply | Promise<Reply>;
  batchHandler?: (url: URL) => Reply | Promise<Reply>;
};
export const test = base.extend<{ harness: Harness }>({
  harness: [async ({ page, context }, use, info) => {
    const state: Harness = { reads: [], responses: [], unexpected: [], pageErrors: [], stubbedStylesheets: [], handler: url => ({ status: 200,
      data: url.pathname.endsWith('/sales-ranking') ? ranking : margin }) };
    await context.addInitScript(() => {
      localStorage.setItem('accessToken', 'synthetic-ui-fixture-not-a-credential');
      localStorage.setItem('admin-ui-theme', 'light');
    });
    await page.clock.setFixedTime(new Date('2026-10-10T12:00:00Z'));
    page.on('pageerror', error => state.pageErrors.push(error.message));
    await context.routeWebSocket('**/*', socket => { state.unexpected.push('WebSocket'); socket.close(); });
    await context.route('**/*', async (route: Route) => {
      const request = route.request(), url = new URL(request.url());
      const fontStylesheets = [
        'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
        'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@500;600;700;800&display=swap',
      ];
      if (request.method() === 'GET' && request.resourceType() === 'stylesheet' && fontStylesheets.includes(request.url())) {
        state.stubbedStylesheets.push(request.url());
        await route.fulfill({ status: 200, contentType: 'text/css', body: '' }); return;
      }
      if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method())) {
        state.unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
        await route.abort('blockedbyclient'); return;
      }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
      const endpoint = url.pathname.replace('/api/v1/admin', '');
      let reply: Reply;
      if (endpoint === '/auth/me') reply = { status: 200, data: { id: 'synthetic-user', email: 'synthetic@example.invalid', fullName: '合成驗收使用者', roles: ['Admin'], permissions: ['*'] } };
      else if (endpoint === '/tenants/me/plan') reply = { status: 200, data: { plan: 'starter', features: [] } };
      else if (endpoint === '/reports/margin/trend') reply = { status: 200, data: [{ period: '2026-10', revenue: 1500, margin: 400, marginPct: 26.67 }] };
      else if (endpoint === '/reports/margin' || endpoint === '/reports/sales-ranking') {
        state.reads.push(`${endpoint}${url.search}`); reply = await state.handler(url); state.responses.push(reply.status);
      } else if (state.batchHandler && ['/inventory/products', '/product-batches', '/product-batches/synthetic-trace-batch'].includes(endpoint)) {
        state.reads.push(`${endpoint}${url.search}`); reply = await state.batchHandler(url); state.responses.push(reply.status);
      } else { state.unexpected.push(endpoint); await route.abort('blockedbyclient'); return; }
      await route.fulfill({ status: reply.status, json: reply.status === 200 ? { success: true, data: reply.data }
        : { success: false, error: { code: 'SYNTHETIC_ERROR', message: 'Synthetic test failure' } } });
    });
    await use(state);
    const evidence = { title: info.title, browser: context.browser()?.version(), viewport: page.viewportSize(),
      input: 'case-specific native browser automation', syntheticHttp: true, physicalDevice: false,
      reads: state.reads, responses: state.responses, unexpected: state.unexpected, pageErrors: state.pageErrors,
      fontScope: 'Ubuntu Noto CJK verified via actual Chrome platform glyphs; external Google font CSS stubbed, no browser font downloads', stubbedStylesheets: state.stubbedStylesheets };
    await writeFile(info.outputPath('network.json'), JSON.stringify(evidence, null, 2));
    await info.attach('network.json', { path: info.outputPath('network.json'), contentType: 'application/json' });
    expect(state.unexpected, 'No external request, API write or unexpected endpoint').toEqual([]);
    expect(state.pageErrors, 'No browser exception').toEqual([]);
  }, { auto: true }],
});
export { expect };

export async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await notice(page).scrollIntoViewIfNeeded();
  const measurements = await notice(page).evaluate(element => {
    const bounds = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const style = getComputedStyle(element), summary = element.querySelector('summary')!;
    return { viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth,
      warning: bounds(element), warningClientWidth: element.clientWidth, warningScrollWidth: element.scrollWidth,
      summary: bounds(summary), summaryFocus: document.activeElement === summary,
      font: { family: style.fontFamily, size: style.fontSize, lineHeight: style.lineHeight, foreground: style.color, background: style.backgroundColor },
      detailsOpen: element.querySelector('details')!.open,
      textRects: [...element.querySelectorAll('strong,p,summary,li')].filter(el => el.getClientRects().length).map(el => ({ text: el.textContent, ...bounds(el) })) };
  });
  // Computed CSS alone can still render tofu. Record and require the actual
  // platform font used for each visible Traditional Chinese disclosure block.
  const session = await page.context().newCDPSession(page);
  const platformFonts = [];
  try {
    await session.send('DOM.enable'); await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    for (const selector of ['strong', 'p', 'summary', ...(measurements.detailsOpen ? ['li:nth-child(1)', 'li:nth-child(2)', 'li:nth-child(3)'] : [])]) {
      const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: `section[role="note"] ${selector}` });
      expect(nodeId).toBeGreaterThan(0);
      const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
      platformFonts.push({ selector, fonts });
    }
  } finally { await session.detach(); }
  assertCjkFonts(platformFonts, measurements.detailsOpen);
  const evidence = { ...measurements, platformFonts };
  await writeFile(info.outputPath(`${name}.json`), JSON.stringify(evidence, null, 2));
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  await info.attach(`${name}.png`, { path: info.outputPath(`${name}.png`), contentType: 'image/png' });
  await info.attach(`${name}.json`, { path: info.outputPath(`${name}.json`), contentType: 'application/json' });
  // Validate the warning itself. Whole-page overflow is retained as a separate,
  // pre-existing layout finding; this disclosure slice does not redesign reports.
  expect(measurements.warning.width).toBeGreaterThan(0);
  expect(measurements.warning.x).toBeGreaterThanOrEqual(0);
  expect(measurements.warning.right).toBeLessThanOrEqual(measurements.viewport.width + 1);
  expect(measurements.warningScrollWidth).toBeLessThanOrEqual(measurements.warningClientWidth + 1);
  for (const rect of measurements.textRects) {
    expect(rect.x).toBeGreaterThanOrEqual(measurements.warning.x - 1);
    expect(rect.right).toBeLessThanOrEqual(measurements.warning.right + 1);
  }
  return measurements;
}

// Reuse the same owned browser, network allowlist, artifact and CJK guards for
// the batch-source slice. No backend, proxy, new service or additional auth.
export async function captureTrace(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const dialog = page.getByRole('dialog');
  await dialog.locator('h2').scrollIntoViewIfNeeded();
  const geometry = await dialog.evaluate(element => {
    const bounds = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    return { subject: 'batch-trace', viewport: { width: innerWidth, height: innerHeight }, documentWidth: document.documentElement.scrollWidth,
      dialog: bounds(element), clientWidth: element.clientWidth, scrollWidth: element.scrollWidth,
      targets: [...element.querySelectorAll('button')].map(bounds),
      textRects: [...element.querySelectorAll('h2,p')].filter(el => el.getClientRects().length).map(bounds) };
  });
  const session = await page.context().newCDPSession(page);
  const platformFonts = [];
  try {
    await session.send('DOM.enable'); await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    for (const selector of ['#batch-trace-title', '#batch-trace-description', 'button']) {
      const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: `.batch-trace-dialog ${selector}` });
      expect(nodeId).toBeGreaterThan(0);
      const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
      platformFonts.push({ selector, fonts });
    }
  } finally { await session.detach(); }
  assertTraceCjkFonts(platformFonts);
  expect(geometry.dialog.x).toBeGreaterThanOrEqual(0);
  expect(geometry.dialog.right).toBeLessThanOrEqual(geometry.viewport.width + 1);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1);
  for (const target of geometry.targets) { expect(target.width).toBeGreaterThanOrEqual(44); expect(target.height).toBeGreaterThanOrEqual(44); }
  for (const text of geometry.textRects) { expect(text.x).toBeGreaterThanOrEqual(geometry.dialog.x); expect(text.right).toBeLessThanOrEqual(geometry.dialog.right); }
  await writeFile(info.outputPath(`${name}.json`), JSON.stringify({ ...geometry, platformFonts }, null, 2));
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  await info.attach(`${name}.png`, { path: info.outputPath(`${name}.png`), contentType: 'image/png' });
  await info.attach(`${name}.json`, { path: info.outputPath(`${name}.json`), contentType: 'application/json' });
}
