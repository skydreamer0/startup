// Run from repository root with the owned Vite/API processes already listening.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile, readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const require = createRequire(new URL('../../../pos-ui/package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const out = process.env.EVIDENCE_DIR || new URL('./screenshots/', import.meta.url).pathname;
await mkdir(out, { recursive: true });
const base = process.env.UI_URL || 'http://127.0.0.1:5179';
const api = process.env.API_URL || 'http://127.0.0.1:3049/api/v1/admin';
const report = { sha: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(), tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}']).toString().trim(), checks: [], screenshots: [], browserErrors: [] };
const contexts = [];
function pass(name, detail = {}) { report.checks.push({ name, passed: true, ...detail }); }
async function launch(width, height, zoom = 1) {
    const profile = await mkdtemp(join(tmpdir(), 'receipt-uiux-browser-'));
    await mkdir(join(profile, 'Default'));
    // Chromium's native default page-zoom preference: partition key x is the default partition.
    await writeFile(join(profile, 'Default', 'Preferences'), JSON.stringify({ partition: { default_zoom_level: { x: Math.log(zoom) / Math.log(1.2) } } }));
    const context = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, viewport: { width, height }, args: ['--no-sandbox'] });
    contexts.push(context);
    const page = context.pages()[0];
    page.on('pageerror', e => report.browserErrors.push(e.message));
    return page;
}
async function screenshot(page, name) {
    const path = join(out, name + '.png'); const cdp = await page.context().newCDPSession(page);
    const capture = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(path, Buffer.from(capture.data, 'base64')); await cdp.detach();
    report.screenshots.push({ file: name + '.png', sha256: createHash('sha256').update(await readFile(path)).digest('hex') });
}
const product = { id: 'synthetic-product', sku: 'SYNTHETIC-LONG-SKU-'.repeat(3), name: '合成藥品長品名・規格與包裝核對用，非真實商品資料'.repeat(3), costPrice: 20, retailPrice: 30, stockQuantity: 0, safetyStock: 1 };
const batches = [0, 1, 2].map(n => ({ id: 'synthetic-' + n, productId: product.id, batchNumber: n === 0 ? 'SYNTHETIC-LONG-BATCH-'.repeat(4) : 'SYNTHETIC-' + n, product: { name: product.name, sku: product.sku }, expiryDate: n === 1 ? '2020-01-01T00:00:00Z' : '2099-01-01T00:00:00Z', quantity: 12345, costPrice: '123456.78', status: ['QUARANTINE', 'RELEASED', 'BLOCKED'][n] }));
async function fixture(page, permissions = ['read:products', 'create:products', 'release:product_batches'], initial = {}) {
    const state = { posts: 0, postStatus: 403, products: [product], listStatus: 200, productStatus: 200, gate: null, readGate: null, productGate: null, batches, ...initial };
    await page.addInitScript(() => localStorage.setItem('accessToken', 'synthetic-fixture-token'));
    await page.route('**/api/v1/admin/**', async route => {
        const path = new URL(route.request().url()).pathname.split('/admin')[1];
        let data;
        let status = 200;
        if (path === '/auth/me') data = { id: 'synthetic-user', fullName: '合成驗證使用者', email: 'synthetic@example.test', roles: [], permissions };
        else if (path === '/tenants/me/plan') data = { plan: 'pro', features: [] };
        else if (path === '/inventory/products') { if (state.productGate) await state.productGate; status = state.productStatus; data = { total: state.products.length, page: 1, limit: 50, data: state.products }; }
        else if (path === '/product-batches' && route.request().method() === 'GET') { if (state.readGate) await state.readGate; status = state.listStatus; data = state.batches; }
        else if (path === '/product-batches' && route.request().method() === 'POST') { state.posts++; if (state.gate) await state.gate; status = state.postStatus; data = { id: 'synthetic-receipt' }; }
        else throw new Error('Unplanned fixture request: ' + path);
        await route.fulfill({ status, json: status < 400 ? { success: true, data } : { success: false, error: { message: 'Synthetic HTTP failure' } } });
    });
    await page.goto(base + '/inventory/batches');
    await expect(page.getByRole('button', { name: '+ 登記批次進貨' })).toBeVisible();
    return state;
}
async function fill(page, productId = product.id, lot = 'SYNTHETIC-LOT', released = true) {
    await page.getByRole('button', { name: '+ 登記批次進貨' }).click();
    await page.getByLabel('商品', { exact: true }).selectOption(productId);
    await page.getByLabel('批號', { exact: true }).fill(lot);
    await page.getByLabel('到期日', { exact: true }).fill('2099-01-01');
    await page.getByLabel('數量', { exact: true }).fill('4');
    await page.getByLabel('進貨成本', { exact: true }).fill('20');
    if (released) { await page.getByLabel('驗收狀態', { exact: true }).selectOption('RELEASED'); await page.getByLabel('初次放行原因（必填）').fill('合成收貨驗證：標籤與單據已核對。'.repeat(30)); }
}
async function geometry(page, width, height, zoom) {
    const metrics = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, scale: visualViewport.scale, docWidth: document.documentElement.scrollWidth, bodyZoom: getComputedStyle(document.body).zoom, tableOverflow: getComputedStyle(document.querySelector('.table-container')).overflowX, headSize: getComputedStyle(document.querySelector('th')).fontSize }));
    assert.equal(metrics.width, Math.round(width / zoom)); assert.equal(metrics.height, Math.round(height / zoom)); assert.equal(metrics.dpr, zoom); assert.equal(metrics.scale, 1); assert.equal(metrics.bodyZoom, '1');
    assert.ok(metrics.docWidth <= metrics.width + 1, JSON.stringify(metrics)); assert.equal(metrics.tableOverflow, 'auto'); assert.equal(metrics.headSize, '14px');
    pass(`geometry ${width}x${height} at ${zoom * 100}% native page zoom`, metrics);
}
try {
    for (const [width, height, zoom] of [[1366, 768, 1], [1024, 768, 1], [390, 844, 1], [1366, 768, 2]]) {
        const page = await launch(width, height, zoom); const state = await fixture(page);
        await expect(page.getByText(batches[0].batchNumber, { exact: true })).toBeVisible();
        await geometry(page, width, height, zoom);
        const region = page.getByRole('region', { name: '批次清單' }); await region.focus(); await page.keyboard.press('ArrowRight');
        if (width / zoom < 1200) await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
        await screenshot(page, `list-${width}-${zoom * 100}`);
        await page.getByRole('button', { name: '+ 登記批次進貨' }).click();
        await expect(page.locator('#receipt-title')).toBeFocused();
        assert.equal(await page.locator('dialog').evaluate(el => el.matches(':modal')), true);
        await page.getByRole('button', { name: '+ 登記批次進貨' }).evaluate(el => el.focus()); await expect(page.locator('#receipt-title')).toBeFocused();
        await page.keyboard.press('Tab'); await expect(page.getByLabel('商品', { exact: true })).toBeFocused();
        await page.getByRole('button', { name: '登記進貨', exact: true }).focus(); await page.keyboard.press('Tab'); await expect(page.getByLabel('商品', { exact: true })).toBeFocused();
        await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('button', { name: '登記進貨', exact: true })).toBeFocused();
        await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByRole('button', { name: '+ 登記批次進貨' })).toBeFocused();
        pass(`native modal keyboard cycle/escape/return ${width} at ${zoom * 100}%`);
        await fill(page); await page.locator('dialog').evaluate(el => { el.scrollTop = 0; }); await screenshot(page, `receipt-${width}-${zoom * 100}`);
        const sizes = await page.locator('dialog').evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, columns: getComputedStyle(el.querySelector('.receipt-form-grid')).gridTemplateColumns.split(' ').length }));
        assert.ok(sizes.scrollWidth <= sizes.width + 1); if (width / zoom < 640) assert.equal(sizes.columns, 1);
        await page.getByRole('button', { name: '登記進貨', exact: true }).scrollIntoViewIfNeeded(); await expect(page.getByRole('button', { name: '登記進貨', exact: true })).toBeInViewport();
        await screenshot(page, `receipt-end-${width}-${zoom * 100}`);
        pass(`long receipt fields/submit reachable ${width} at ${zoom * 100}%`, sizes);
        let release; state.gate = new Promise(resolve => { release = resolve; });
        await page.getByRole('button', { name: '登記進貨', exact: true }).click();
        await expect(page.getByRole('button', { name: '登記中...' })).toBeDisabled();
        await expect(page.getByRole('button', { name: '取消', exact: true })).toBeDisabled();
        await expect(page.getByRole('button', { name: '+ 登記批次進貨' })).toBeDisabled();
        await page.locator('form').evaluate(form => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
        await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(1); await expect(page.getByLabel('批號', { exact: true })).toBeDisabled();
        assert.equal(state.posts, 1); release();
        await expect(page.locator('#receipt-error')).toContainText('權限不足'); await expect(page.locator('#receipt-error')).toBeFocused(); await expect(page.getByLabel('批號', { exact: true })).toHaveValue('SYNTHETIC-LOT'); assert.equal(state.posts, 1);
        await screenshot(page, `error-${width}-${zoom * 100}`); pass(`slow repeated submission/403 retains draft ${width} at ${zoom * 100}%`, { posts: state.posts });
        await page.getByRole('button', { name: '取消', exact: true }).click();
        await page.context().close();
    }
    // Reader denial and failed/empty product reads are isolated HTTP fixtures.
    const reader = await launch(390, 844); await fixture(reader, ['read:products']); await expect(reader.getByRole('button', { name: '+ 登記批次進貨' })).toBeDisabled(); pass('reader entry permission retained'); await reader.context().close();
    const failurePage = await launch(1024, 768); const failureState = await fixture(failurePage); failureState.listStatus = 403; await failurePage.reload(); await expect(failurePage.getByRole('alert')).toContainText('權限不足'); await screenshot(failurePage, 'list-403'); failureState.listStatus = 200; await failurePage.getByRole('button', { name: '重新載入批次' }).click(); await expect(failurePage.getByRole('table')).toBeVisible(); pass('batch read 403 and explicit retry'); await failurePage.context().close();
    const loadingPage = await launch(390, 844); let finishRead; let finishProducts;
    const readGate = new Promise(resolve => { finishRead = resolve; }); const productGate = new Promise(resolve => { finishProducts = resolve; });
    const loadingState = await fixture(loadingPage, undefined, { readGate, productGate, batches: [], products: [] });
    await expect(loadingPage.getByRole('status').filter({ hasText: '正在載入批次' })).toContainText('正在載入批次'); await screenshot(loadingPage, 'list-loading');
    await loadingPage.getByRole('button', { name: '+ 登記批次進貨' }).click(); await expect(loadingPage.getByLabel('商品', { exact: true })).toBeDisabled(); await expect(loadingPage.getByRole('button', { name: '登記進貨', exact: true })).toBeDisabled();
    finishRead(); finishProducts(); loadingState.readGate = null; loadingState.productGate = null;
    await expect(loadingPage.getByText('目前沒有可收貨商品，請先建立商品資料。')).toBeVisible(); await expect(loadingPage.getByRole('button', { name: '登記進貨', exact: true })).toBeDisabled(); await screenshot(loadingPage, 'receipt-empty-products');
    await loadingPage.getByRole('button', { name: '取消', exact: true }).click(); await expect(loadingPage.getByText('目前沒有批號資料。')).toBeVisible(); await screenshot(loadingPage, 'list-empty'); pass('slow reads and empty batches/products remain distinct and cannot submit'); await loadingPage.context().close();
    // Real HTTP API against the owned PostgreSQL instance (no fixture responses).
    const login = await fetch(api + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@system.local', password: 'Admin@123!' }) }); assert.equal(login.status, 200);
    const token = (await login.json()).data.accessToken;
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const sku = 'UIUX-' + Date.now(); const created = await fetch(api + '/inventory/products', { method: 'POST', headers, body: JSON.stringify({ sku, name: '合成 UIUX 真 API 收貨測試', costPrice: 20, retailPrice: 30, safetyStock: 1 }) }); assert.equal(created.status, 201);
    const actualProduct = (await created.json()).data;
    const page = await launch(1366, 768); await page.addInitScript(t => localStorage.setItem('accessToken', t), token);
    await page.route('**/api/v1/admin/**', async route => { const response = await route.fetch({ url: route.request().url().replace(base + '/api/v1/admin', api) }); await route.fulfill({ response }); });
    await page.goto(base + '/inventory/batches'); await fill(page, actualProduct.id, sku + '-LOT', false); await page.getByRole('button', { name: '登記進貨', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0); await expect(page.getByText(sku + '-LOT', { exact: true })).toBeVisible();
    await screenshot(page, 'real-api-receipt');
    const detail = await fetch(api + '/inventory/products/' + actualProduct.id, { headers }); assert.equal(detail.status, 200); const received = (await detail.json()).data; assert.equal(received.stockQuantity, 4);
    await fill(page, actualProduct.id, sku + '-LOT', false); await page.getByRole('button', { name: '登記進貨', exact: true }).click(); await expect(page.locator('#receipt-error')).toBeVisible(); await expect(page.getByLabel('批號', { exact: true })).toHaveValue(sku + '-LOT');
    const duplicateCheck = await fetch(api + '/inventory/products/' + actualProduct.id, { headers }); assert.equal((await duplicateCheck.json()).data.stockQuantity, 4);
    pass('real API receipt and duplicate retain product stock 4', { productId: actualProduct.id, sku, lot: sku + '-LOT', stockQuantity: 4 });
    await screenshot(page, 'real-api-duplicate'); await page.context().close();
    assert.deepEqual(report.browserErrors, []);
} catch (error) { report.failure = String(error.stack || error); throw error; }
finally { await writeFile(join(out, 'browser-report.json'), JSON.stringify(report, null, 2) + '\n'); await Promise.allSettled(contexts.map(c => c.close())); }
console.log(JSON.stringify({ checks: report.checks.length, screenshots: report.screenshots.length, failure: report.failure || null }));
