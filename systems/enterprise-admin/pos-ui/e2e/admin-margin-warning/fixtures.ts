import { test as base, expect, type Page, type TestInfo, type Route, type Locator } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { importRequestAllowed, readImportRequest } from './import-contract.mjs';
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
  readerId?: string;
  readerHandler?: (url: URL) => Reply | Promise<Reply>;
  authWrites: string[];
  readerResponses: {endpoint:string;status:number;sequence:number}[];
  consoleErrors: string[];
  reads: string[]; responses: number[]; unexpected: string[]; pageErrors: string[];
  stubbedStylesheets: string[];
  imports: Awaited<ReturnType<typeof readImportRequest>>[];
  importHandler?: (entry: Awaited<ReturnType<typeof readImportRequest>>) => Reply | Promise<Reply>;
  importProductsHandler?: () => Reply;
  handler: (url: URL) => Reply | Promise<Reply>;
  batchHandler?: (url: URL) => Reply | Promise<Reply>;
};
export const test = base.extend<{ harness: Harness }>({
  harness: [async ({ page, context }, use, info) => {
    const state: Harness = { readerResponses: [], consoleErrors: [], authWrites: [], reads: [], responses: [], unexpected: [], pageErrors: [], stubbedStylesheets: [], imports: [], handler: url => ({ status: 200,
      data: url.pathname.endsWith('/sales-ranking') ? ranking : margin }) };
    await context.addInitScript(() => {
      localStorage.setItem('accessToken', 'synthetic-ui-fixture-not-a-credential');
      localStorage.setItem('admin-ui-theme', 'light');
    });
    await page.clock.setFixedTime(new Date('2026-10-10T12:00:00Z'));
    page.on('console', message => { if (message.type() === 'error') state.consoleErrors.push(message.text()); });
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
      // Reader cases opt in to bounded synthetic auth only; never a live API write.
      if (state.readerHandler && url.origin === origin && request.method() === 'POST'
        && ['/api/v1/admin/auth/login','/api/v1/admin/auth/logout','/api/v1/admin/auth/refresh'].includes(url.pathname)) {
        state.authWrites.push(url.pathname);
        await route.fulfill({status:200,json:{success:true,data:{accessToken:'synthetic-reader-token',refreshToken:'synthetic-reader-refresh'}}}); return;
      }
      // Opt-in only for import cases; exact loopback POSTs are fulfilled here,
      // never continued to a server. The original read-only cases stay read-only.
      if (state.importHandler && importRequestAllowed(request.method(), request.url(), origin)) {
        const entry = await readImportRequest(request.url(), request.headers()['content-type'], request.postDataBuffer());
        state.imports.push(entry);
        const reply = await state.importHandler(entry);
        state.responses.push(reply.status);
        await route.fulfill({ status: reply.status, json: reply.status === 200 ? { success: true, data: reply.data }
          : { success: false, error: { code: 'SYNTHETIC_ERROR', message: 'Synthetic import failure' } } });
        return;
      }
      if (url.origin !== origin || !['GET', 'HEAD'].includes(request.method())) {
        state.unexpected.push(`${request.method()} ${url.origin}${url.pathname}`);
        await route.abort('blockedbyclient'); return;
      }
      if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
      const endpoint = url.pathname.replace('/api/v1/admin', '');
      let reply: Reply;
      if (endpoint === '/auth/me') reply = { status: 200, data: { id: state.readerId ?? 'synthetic-user', email: 'synthetic@example.invalid', fullName: '合成驗收使用者', roles: ['Admin'], permissions: ['*'] } };
      else if (endpoint === '/tenants/me/plan') reply = { status: 200, data: { plan: state.readerHandler ? 'pro' : 'starter', features: [] } };
      else if (state.readerHandler && ['/inventory/suppliers','/analytics/product-abc','/analytics/supplier-ranking'].includes(endpoint)) {
        state.reads.push(`${endpoint}${url.search}`); const sequence=state.reads.length; reply = await state.readerHandler(url); state.responses.push(reply.status); state.readerResponses.push({endpoint,status:reply.status,sequence});
      }
      else if (state.readerHandler && (endpoint.startsWith('/dashboard/') || endpoint === '/crm/metrics' || ['/analytics/kpis','/analytics/trends','/analytics/bonus-gate','/analytics/heatmap','/analytics/reorder-forecast'].includes(endpoint))) {
        // Dashboard is only the auth redirect transit; no business values are fabricated.
        reply = {status:500};
      }
      else if (state.importHandler && ['/inventory/products', '/inventory/suppliers'].includes(endpoint)) {
        state.reads.push(`${endpoint}${url.search}`);
        reply = endpoint === '/inventory/products' && state.importProductsHandler
          ? state.importProductsHandler()
          : { status: 200, data: endpoint.endsWith('/suppliers') ? [] : { total: 0, page: 1, limit: 50, data: [] } };
      }
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
      readerResponses: state.readerResponses, consoleErrors: state.consoleErrors, consoleErrorScope: 'Recorded separately; intentional synthetic HTTP failures may produce console resource errors', authWrites: state.authWrites, imports: state.imports, importScope: 'exact loopback synthetic POST fulfillment only; no backend writes',
      reads: state.reads, responses: state.responses, unexpected: state.unexpected, pageErrors: state.pageErrors,
      fontScope: state.readerHandler ? 'Reader PNGs require independent visual/CJK review; no CDP glyph attestation for this slice' : state.importHandler ? 'Import screenshots need independent CJK/visual review; no glyph attestation for this slice' : 'Ubuntu Noto CJK verified via actual Chrome platform glyphs; external Google font CSS stubbed, no browser font downloads', stubbedStylesheets: state.stubbedStylesheets };
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
export async function captureTrace(page: Page, info: TestInfo, name: string, captureTarget?: Locator) {
  await page.evaluate(() => document.fonts.ready);
  const dialog = page.getByRole('dialog');
  await (captureTarget ?? dialog.locator('h2')).scrollIntoViewIfNeeded();
  if (captureTarget) await expect(captureTarget).toBeInViewport({ ratio: 1 });
  const capturedTarget = captureTarget ? { text: await captureTarget.innerText(), bounds: await captureTarget.boundingBox() } : null;
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
  await writeFile(info.outputPath(`${name}.json`), JSON.stringify({ ...geometry, platformFonts, capturedTarget }, null, 2));
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  await info.attach(`${name}.png`, { path: info.outputPath(`${name}.png`), contentType: 'image/png' });
  await info.attach(`${name}.json`, { path: info.outputPath(`${name}.json`), contentType: 'application/json' });
}

