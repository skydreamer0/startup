// Called only after the parent exact-head GitHub/owned-PG/Chrome guards pass.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { buildReaderFixture, seedReaderFixture, cleanupReaderFixture, readerPeriod } from './admin-readers-fixture.mjs';
import { readerEndpoints, readerExpected, assertReaderResponse } from './admin-readers-oracle.mjs';
import { safeTraceFailure, settleTraceFocusGeometry } from './admin-trace-native.mjs';
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function boundedReaderWait(promise) {
    let timer;
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Reader held response wait expired')), 10000); })]); }
    finally { clearTimeout(timer); }
}
const subjects = [
    { id: 'cashflow', route: '/reports/cashflow', paths: ['/reports/cashflow', '/reports/cashflow/trend'], label: '現金流報表', text: '300,055', focus: 'Refresh' },
    { id: 'margin', route: '/reports/margin', paths: ['/reports/margin', '/reports/margin/trend'], label: '毛利報表', text: '合成讀取商品甲', focus: 'Refresh' },
    { id: 'sales', route: '/reports/sales-ranking', paths: ['/reports/sales-ranking'], label: '銷售排行', text: '合成讀取商品甲', focus: 'Refresh' },
    { id: 'analytics', route: '/inventory/analytics', paths: ['/analytics/product-abc', '/analytics/supplier-ranking'], label: '商品分析', text: '合成讀取商品甲', focus: '🏢 Supplier Ranking' },
    { id: 'suppliers', route: '/suppliers', paths: ['/inventory/suppliers'], label: '供應商清單', text: '合成甲聯絡', focus: 'Add Supplier' },
];
export function createReaderBudget(now = () => performance.now()) {
    const started = now();
    let apiRequests = 0, analyticsRequests = 0;
    function check() { assert.ok(now() - started < 300000, 'Reader whole-flow deadline exceeded'); }
    return { check, request(endpoint) { check(); apiRequests++; assert.ok(apiRequests <= 320, 'Reader API request ceiling exceeded'); if (endpoint.startsWith('/analytics/')) {
            analyticsRequests++;
            assert.ok(analyticsRequests <= 120, 'Reader analytics request ceiling exceeded');
        } }, receipt() { return { elapsedMs: now() - started, deadlineMs: 300000, apiRequests, maxApiRequests: 320, analyticsRequests, maxAnalyticsRequests: 120 }; } };
}
export function assertReaderTableScroll(before, after) {
    assert.equal(before.focused, true); assert.equal(after.focused, true);
    assert.ok(before.clientWidth > 0 && before.scrollWidth > before.clientWidth);
    assert.equal(after.clientWidth, before.clientWidth); assert.equal(after.scrollWidth, before.scrollWidth);
    assert.ok(after.scrollLeft > before.scrollLeft && after.scrollLeft <= after.scrollWidth - after.clientWidth + 1);
    assert.equal(after.pageX, before.pageX); assert.ok(Math.abs(after.pageY - before.pageY) <= 1);
    assert.ok(after.pageWidth <= after.viewport + 1);
}
export function assertReadersNativeAcceptance(result) {
    assert.equal(result.status, 'passed');
    assert.equal(result.fixtureCleaned, true);
    assert.equal(result.databaseGrantLookup, true);
    assert.equal(result.lateScopeSuppressed, true);
    assert.equal(result.readOnlySnapshotEqual, true);
    assert.equal(result.rawSnapshotTables >= 33, true);
    assert.equal(result.forbidden.length, 0);
    assert.ok(result.budget.elapsedMs < result.budget.deadlineMs);
    assert.equal(result.budget.deadlineMs, 300000);
    assert.ok(result.budget.apiRequests <= 320 && result.budget.analyticsRequests <= 120);
    assert.match(result.beforeSha256, /^[a-f0-9]{64}$/);
    assert.equal(result.beforeSha256, result.afterSha256);
    assert.deepEqual(result.cases.map(row => row.width), [1366, 1024, 390]);
    for (const row of result.cases) {
        assert.deepEqual(row.readers.map(reader => reader.id), subjects.map(s => s.id));
        for (const reader of row.readers)
            for (const key of ['actualEntry', 'authorizedData', 'stale500Retained', 'real403Hidden', 'failedRetryStillHidden', 'recovered', 'keyboardGeometry'])
                assert.equal(reader[key], true, `${reader.id}:${key}`);
    }
    assert.equal(result.pgNegativeControls.oldOrderItemRevenue, 17844);
    assert.equal(result.pgNegativeControls.scopedRevenue, 67);
    assert.equal(result.pgNegativeControls.oldSupplierDenominator, 17844);
    assert.equal(result.pgNegativeControls.scopedSupplierDenominator, 62);
    for (const endpoint of readerEndpoints) {
        assert.deepEqual(result.httpStatuses[endpoint], { readerA: 200, readerB: 200, readerEmpty: 200, unauthenticated: 401, denied: 403, inactive: 401, crossTenantHeader: 401 });
    }
    assert.deepEqual(result.initialErrorRecovered, subjects.map(s => s.id));
    assert.deepEqual(result.authorizedEmpty, subjects.map(s => s.id));
    assert.deepEqual(result.tableScroll.map(row => row.subject).sort(), ['analytics', 'margin', 'sales', 'supplier-ranking', 'suppliers']);
    for (const row of result.tableScroll) assertReaderTableScroll(row.before, row.after);
}
export async function runAdminReadersNative({ db, browser, adminOrigin, signAccessToken, output, nonce, expect, capture }) {
    const origin = new URL(adminOrigin);
    assert.equal(origin.protocol, 'http:');
    assert.equal(origin.hostname, '127.0.0.1');
    const f = buildReaderFixture(nonce), contexts = [], network = [], forbidden = [], responses = [], pending = [], cases = [], httpStatuses = {}, initialErrorRecovered = [], authorizedEmpty = [], holds = [], tableScroll = [];
    const expected = Object.fromEntries(['readerA', 'readerB', 'readerEmpty'].map(actor => [actor, readerExpected(f, actor)])), tokens = {};
    let stage = 'fixture', failure = null, failureDetail = null, before, after, fixtureCleaned = false, databaseGrantLookup = false, lateScopeSuppressed = false, pgNegativeControls;
    const budget = createReaderBudget();
    let expired = false;
    const deadline = setTimeout(() => { expired = true; for (const context of contexts)
        void context.close().catch(() => { }); }, 300000);
    let nextAnalytics = 0;
    let pacing = Promise.resolve();
    const pace = () => { const next = pacing.then(async () => { budget.check(); await pause(Math.max(0, nextAnalytics - performance.now())); budget.check(); nextAnalytics = performance.now() + 2150; }); pacing = next.catch(() => { }); return next; };
    const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
    async function snapshot() { const tables = await db.$queryRaw `SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename`; const result = {}; for (const { tablename } of tables) {
        assert.match(tablename, /^[a-z_]+$/);
        result[tablename] = (await db.$queryRawUnsafe(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) AS rows FROM public."${tablename}" t`))[0].rows;
    } return result; }
    const query = (endpoint, sort = 'revenue') => endpoint === '/inventory/suppliers' ? endpoint : `${endpoint}?${endpoint.endsWith('/trend') ? 'to' : 'period'}=${readerPeriod}${endpoint === '/reports/sales-ranking' ? `&sort=${sort}&limit=20` : ''}`;
    async function contextFor(viewport, actor = 'readerA') {
        budget.check();
        const context = await browser.newContext({ viewport });
        contexts.push(context);
        await context.addInitScript(value => localStorage.setItem('accessToken', value), tokens[actor]);
        const control = { mode: 'normal', paths: [], actor };
        await context.route('**/*', async (route) => {
            const req = route.request(), url = new URL(req.url());
            if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) {
                await route.abort();
                return;
            }
            const entry = { width: viewport.width, method: req.method(), path: url.pathname + url.search, allowed: url.origin === adminOrigin && req.method() === 'GET' };
            network.push(entry);
            if (!entry.allowed) {
                forbidden.push(entry);
                await route.abort();
                return;
            }
            const endpoint = url.pathname.replace(/^\/api\/v1\/admin/, '');
            try {
                if (url.pathname.startsWith('/api/'))
                    budget.request(endpoint);
                if (endpoint.startsWith('/analytics/'))
                    await pace();
            }
            catch {
                entry.guardRejected = true;
                forbidden.push(entry);
                await route.abort().catch(() => { });
                return;
            }
            if (control.hold && endpoint === '/reports/margin' && url.searchParams.get('period') === readerPeriod && !control.hold.started) {
                const hold = control.hold; hold.started = true; hold.request = req;
                try {
                    const response = await route.fetch({ timeout: 10000 }); assert.equal(response.status(), 200);
                    const text = await response.text(); assertReaderResponse(endpoint, JSON.parse(text).data, expected.readerA);
                    hold.bodySha256 = hash(text); hold.body = JSON.parse(text); hold.ready.resolve();
                    let timer;
                    try { await Promise.race([hold.release.promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Reader held response deadline')), 10000); })]); }
                    finally { clearTimeout(timer); }
                    try { await route.fulfill({ response }); } catch { hold.cancelledFulfill = true; }
                } catch { hold.failed = true; hold.ready.resolve(); }
                finally { hold.done.resolve(); }
                return;
            }
            if (control.mode === 'fail500' && control.paths.includes(endpoint)) {
                entry.syntheticTransport500 = true;
                await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'SYNTHETIC_READER_TRANSPORT_500' } }) });
                return;
            }
            try {
                await route.continue();
            }
            catch (error) {
                if (req.failure() || req.frame().isDetached())
                    entry.cancelledBeforeDispatch = true;
                else {
                    entry.dispatchFailed = true;
                    forbidden.push(entry);
                    await route.abort().catch(() => { });
                }
            }
        });
        const page = await context.newPage();
        page.setDefaultTimeout(25000);
        page.on('response', response => {
            const url = new URL(response.url());
            if (url.origin !== adminOrigin || !url.pathname.startsWith('/api/'))
                return;
            const actorAtResponse = control.actor;
            const task = (async () => {
                let bytes;
                try {
                    bytes = await response.body();
                }
                catch (error) {
                    if (response.request().failure()) {
                        responses.push({ width: viewport.width, path: url.pathname + url.search, status: response.status(), cancelledBody: true });
                        return;
                    }
                    throw error;
                }
                const body = JSON.parse(bytes.toString());
                const endpoint = url.pathname.replace(/^\/api\/v1\/admin/, '');
                if (response.status() === 200 && readerEndpoints.includes(endpoint) && (endpoint === '/inventory/suppliers' || url.searchParams.get('period') === readerPeriod || url.searchParams.get('to') === readerPeriod))
                    assertReaderResponse(endpoint, body.data, expected[actorAtResponse], { sort: url.searchParams.get('sort') ?? 'revenue', limit: Number(url.searchParams.get('limit') ?? 20) });
                responses.push({ width: viewport.width, actor: actorAtResponse, path: url.pathname + url.search, status: response.status(), sha256: hash(bytes.toString()), body });
            })();
            pending.push(task.then(() => true, () => false));
        });
        return { context, page, control };
    }
    async function keyboardCapture(page, subject, width, target, name) {
        for (let i = 0; i < 100; i++) {
            await page.keyboard.press('Tab');
            if (await target.evaluate(el => document.activeElement === el))
                break;
        }
        const samples = [];
        let geometry;
        try {
            geometry = await settleTraceFocusGeometry(() => target.evaluate(el => { const b = el.getBoundingClientRect(), style = getComputedStyle(el), sidebar = document.querySelector('.sidebar')?.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return { x: b.x, y: b.y, width: b.width, height: b.height, region: { x: Math.max(0, sidebar?.right ?? 0), right: innerWidth }, viewport: innerWidth, pageWidth: document.documentElement.scrollWidth, scrollLeft: scrollX, outline: style.outlineWidth, color: style.outlineColor, focused: document.activeElement === el, centerHit: !!hit && (hit === el || el.contains(hit)), viewportHeight: innerHeight }; }), row => samples.push(row));
            assert.ok(geometry.y >= 0 && geometry.y + geometry.height <= geometry.viewportHeight + 1);
        }
        finally {
            write(`admin-readers-${subject}-${name}-${width}-geometry.json`, { samples, geometry: geometry ?? null });
            await capture(page, `admin-readers-${subject}-${name}-${width}.png`, { width, height: width === 1366 ? 900 : width === 1024 ? 768 : 844 });
        }
        return geometry;
    }
    async function tableKeyboard(page, subject) {
        const region = page.locator('.reader-table-scroll');
        await expect(region).toHaveCount(1);
        await keyboardCapture(page, subject, 390, region, 'table-focus');
        const sample = () => region.evaluate(el => ({ scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
            pageX: scrollX, pageY: scrollY, focused: document.activeElement === el, viewport: innerWidth, pageWidth: document.documentElement.scrollWidth }));
        const before = await sample();
        await page.keyboard.press('ArrowRight');
        await expect.poll(async () => (await sample()).scrollLeft, { timeout: 3200 }).toBeGreaterThan(before.scrollLeft);
        const after = await sample();
        assertReaderTableScroll(before, after);
        tableScroll.push({ subject, before, after });
        write(`admin-readers-${subject}-table-scroll-390.json`, { before, after });
        await capture(page, `admin-readers-${subject}-table-scroll-390.png`, { width: 390, height: 844 });
    }
    try {
        await seedReaderFixture(db, f, value => { budget.check(); stage = value; });
        for (const actor of f.actors)
            tokens[actor.key] = signAccessToken({ userId: actor.userId, email: `${actor.userId}@reader.example.test`, tenantId: actor.tenantId, plan: 'pro' });
        for (const actor of ['readerA', 'readerB', 'readerEmpty'])
            expected[actor].supplierOrder = (await db.supplier.findMany({ where: { tenantId: expected[actor].tenantId }, orderBy: { name: 'asc' }, select: { id: true } })).map(row => row.id);
        stage = 'actual PG sentinel negative controls';
        const start = new Date('2026-01-01T00:00:00Z'), end = new Date('2026-01-31T23:59:59.999Z');
        // The old relation predicate, limited to this fixture's owned order IDs so
        // unrelated parent journeys cannot affect the controlled counterexample.
        const unscoped = await db.orderItem.findMany({ where: { order: { id: { in: f.order.map(row => row.id) }, status: 'completed', createdAt: { gte: start, lte: end } } }, include: { product: true } });
        const scoped = await db.orderItem.findMany({ where: { order: { tenantId: f.ids.tenantA, status: 'completed', createdAt: { gte: start, lte: end } }, product: { tenantId: f.ids.tenantA } }, include: { product: true } });
        const sum = rows => rows.reduce((total, row) => total + row.quantity * Number(row.unitPrice), 0);
        const raw = await db.$queryRaw `SELECT p.supplier_id AS id,SUM(oi.quantity*oi.unit_price) AS revenue FROM order_items oi JOIN products p ON p.id=oi.product_id JOIN orders o ON o.id=oi.order_id WHERE o.id IN (${f.ids.orderA},${f.ids.orderA2},${f.ids.orderB}) AND o.status='completed' AND o.created_at>=${start} AND o.created_at<=${end} GROUP BY p.supplier_id`;
        pgNegativeControls = { oldOrderItemRevenue: sum(unscoped), scopedRevenue: sum(scoped), oldSupplierDenominator: raw.reduce((total, row) => total + Number(row.revenue), 0), scopedSupplierDenominator: expected.readerA.ranking.reduce((total, row) => total + row.totalRevenue, 0), sameSkuTenantRows: await db.product.count({ where: { sku: 'READER-SAME-SKU', tenantId: { in: [f.ids.tenantA, f.ids.tenantB] } } }), legacyMixedOrderItemPresent: unscoped.some(row => row.id === f.ids.itemForeign) };
        assert.deepEqual([pgNegativeControls.oldOrderItemRevenue, pgNegativeControls.scopedRevenue, pgNegativeControls.oldSupplierDenominator, pgNegativeControls.scopedSupplierDenominator, pgNegativeControls.sameSkuTenantRows, pgNegativeControls.legacyMixedOrderItemPresent], [17844, 67, 17844, 62, 2, true]);
        write('admin-readers-pg-negative.json', pgNegativeControls);
        write('admin-readers-fixture-oracle.json', { nonce, ids: f.ids, expected });
        stage = 'full before snapshot';
        before = await snapshot();
        write('admin-readers-before.json', before);
        stage = 'real HTTP tenant and persisted role probes';
        const probe = await contextFor({ width: 1366, height: 900 });
        await probe.page.goto(adminOrigin + '/suppliers');
        await expect(probe.page.getByText('合成甲聯絡', { exact: true })).toBeVisible();
        for (const endpoint of readerEndpoints) {
            httpStatuses[endpoint] = {};
            for (const actor of ['readerA', 'readerB', 'readerEmpty', 'unauthenticated', 'denied', 'inactive', 'crossTenantHeader']) {
                const token = actor === 'unauthenticated' ? null : tokens[actor === 'crossTenantHeader' ? 'readerB' : actor];
                probe.control.actor = actor in expected ? actor : 'readerA';
                const result = await probe.page.evaluate(async ({ url, token, tenant }) => { const headers = {}; if (token)
                    headers.Authorization = `Bearer ${token}`; if (tenant)
                    headers['x-tenant-id'] = tenant; const response = await fetch(url, { headers }); return { status: response.status, body: await response.json() }; }, { url: adminOrigin + '/api/v1/admin' + query(endpoint), token, tenant: ['unauthenticated', 'crossTenantHeader'].includes(actor) ? f.ids.tenantA : null });
                const status = actor in expected ? 200 : actor === 'denied' ? 403 : 401;
                assert.equal(result.status, status);
                httpStatuses[endpoint][actor] = result.status;
                if (status === 200) {
                    assertReaderResponse(endpoint, result.body.data, expected[actor]);
                    databaseGrantLookup = true;
                }
            }
        }
        probe.control.actor = 'readerA';
        for (const sort of ['revenue', 'quantity']) {
            const value = await probe.page.evaluate(async ({ url, token }) => { const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); return { status: response.status, body: await response.json() }; }, { url: adminOrigin + '/api/v1/admin' + query('/reports/sales-ranking', sort), token: tokens.readerA });
            assert.equal(value.status, 200);
            assertReaderResponse('/reports/sales-ranking', value.body.data, expected.readerA, { sort });
        }
        await probe.context.close();
        for (const viewport of [{ width: 1366, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
            const { context, page, control } = await contextFor(viewport), readers = [];
            async function navigate(subject) { const link = page.locator(`a[href="${subject.route}"]`); if (await link.count())
                await link.click();
            else
                await page.goto(adminOrigin + subject.route); if (subject.id !== 'suppliers') {
                const month = page.locator('input[type="month"]');
                await expect(month).toBeVisible();
                await month.fill(readerPeriod);
            } }
            async function loaded(subject) { await expect(page.getByText(subject.text, { exact: subject.id !== 'cashflow' }).first()).toBeVisible(); await expect(page.locator('body')).not.toContainText('FOREIGN_READER_'); if(['cashflow','margin','sales'].includes(subject.id))await expect(page.getByRole('note')).toContainText(subject.id==='cashflow'?'非實際現金流':'非歷史實際毛利'); }
            async function refresh(subject, token = tokens.readerA) { if (subject.id === 'analytics' || subject.id === 'suppliers') {
                await page.evaluate(value => localStorage.setItem('accessToken', value), tokens.readerA);
                await page.locator('a[href="/reports/cashflow"]').click();
                await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeVisible();
                await page.evaluate(value => localStorage.setItem('accessToken', value), token);
                await page.getByRole('button', { name: 'Refresh', exact: true }).click();
                await navigate(subject);
            }
            else {
                await page.evaluate(value => localStorage.setItem('accessToken', value), token);
                await page.getByRole('button', { name: 'Refresh', exact: true }).click();
            } }
            try {
                for (const subject of subjects) {
                    stage = `${subject.id} actual entry ${viewport.width}`;
                    control.paths = subject.paths;
                    control.mode = 'normal';
                    await navigate(subject);
                    await loaded(subject);
                    if (subject.id === 'analytics') {
                        await page.getByRole('button', { name: '🏢 Supplier Ranking', exact: true }).click();
                        await expect(page.getByText('合成同名供應商', { exact: true })).toBeVisible();
                        await expect(page.getByRole('row').filter({ hasText: '合成同名供應商' })).toContainText('—');
                        await keyboardCapture(page, 'supplier-ranking', viewport.width, page.getByRole('button', { name: '📦 ABC Product Analysis', exact: true }), 'success');
                        if (viewport.width === 390) await tableKeyboard(page, 'supplier-ranking');
                        await page.getByRole('button', { name: '📦 ABC Product Analysis', exact: true }).click();
                    }
                    const geometry = await keyboardCapture(page, subject.id, viewport.width, page.getByRole('button', { name: subject.focus, exact: true }), 'success');
                    if (viewport.width === 390 && subject.id !== 'cashflow') await tableKeyboard(page, subject.id);
                    stage = `${subject.id} stale transport ${viewport.width}`;
                    control.mode = 'fail500';
                    await refresh(subject);
                    await expect(page.getByText('可能已過期', { exact: false }).first()).toBeVisible();
                    await loaded(subject);
                    control.mode = 'normal';
                    const retry = () => page.getByRole('button', { name: `重試${subject.label}`, exact: true });
                    await retry().click();
                    await expect(retry()).toHaveCount(0);
                    await loaded(subject);
                    stage = `${subject.id} real denied role ${viewport.width}`;
                    const countStatus = status => responses.filter(row => row.width === viewport.width && row.status === status && (row.path === '/api/v1/admin' + subject.paths[0] || row.path.startsWith('/api/v1/admin' + subject.paths[0] + '?'))).length;
                    const deniedBefore = countStatus(403);
                    await refresh(subject, tokens.denied);
                    await expect.poll(() => countStatus(403), { timeout: 25000 }).toBeGreaterThan(deniedBefore);
                    await expect(retry()).toBeVisible();
                    await expect(page.getByText('存取被拒絕', { exact: false }).first()).toBeVisible();
                    await expect(page.getByText(subject.text, { exact: subject.id !== 'cashflow' })).toHaveCount(0);
                    if (viewport.width === 390)
                        await keyboardCapture(page, subject.id, viewport.width, retry(), 'denied');
                    control.mode = 'fail500';
                    const failedBefore = countStatus(500);
                    await retry().click();
                    await expect.poll(() => countStatus(500), { timeout: 25000 }).toBeGreaterThan(failedBefore);
                    await expect(retry()).toBeEnabled();
                    await expect(page.getByText(subject.text, { exact: subject.id !== 'cashflow' })).toHaveCount(0);
                    stage = `${subject.id} authorized recovery ${viewport.width}`;
                    control.mode = 'normal';
                    await page.evaluate(value => localStorage.setItem('accessToken', value), tokens.readerA);
                    await retry().click();
                    await loaded(subject);
                    await expect(retry()).toHaveCount(0);
                    // A report's main retry must not silently recover its denied trend query.
                    if (subject.id === 'cashflow' || subject.id === 'margin') {
                        const trend = page.getByRole('button', { name: '重試趨勢', exact: true });
                        await expect(trend).toBeVisible();
                        await expect(page.locator('.recharts-wrapper')).toHaveCount(0);
                        await trend.click();
                        await expect(trend).toHaveCount(0);
                    }
                    if (subject.id === 'analytics') {
                        await page.getByRole('button', { name: '🏢 Supplier Ranking', exact: true }).click();
                        const ranking = page.getByRole('button', { name: '重試供應商排行', exact: true });
                        await expect(ranking).toBeVisible();
                        await expect(page.getByText('合成同名供應商', { exact: true })).toHaveCount(0);
                        if (viewport.width === 390) await keyboardCapture(page, 'supplier-ranking', 390, ranking, 'denied');
                        await ranking.click();
                        await expect(page.getByText('合成同名供應商', { exact: true })).toBeVisible();
                        if (viewport.width === 390) await keyboardCapture(page, 'supplier-ranking', 390, page.getByRole('button', { name: '📦 ABC Product Analysis', exact: true }), 'recovered');
                        await page.getByRole('button', { name: '📦 ABC Product Analysis', exact: true }).click();
                    }
                    if (viewport.width === 390)
                        await keyboardCapture(page, subject.id, viewport.width, page.getByRole('button', { name: subject.focus, exact: true }), 'recovered');
                    if (subject.id === 'margin' && viewport.width === 390) {
                        stage = 'actual delayed old-period response 390';
                        const hold = { ready: deferred(), release: deferred(), done: deferred(), started: false };
                        holds.push(hold); control.hold = hold;
                        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
                        await boundedReaderWait(hold.ready.promise); assert.equal(hold.failed, undefined); assert.match(hold.bodySha256, /^[a-f0-9]{64}$/);
                        await page.locator('input[type="month"]').fill('2025-12');
                        await expect(page.locator('.stat-value').first()).toContainText('$0');
                        await expect(page.getByText(subject.text, { exact: true })).toHaveCount(0);
                        await expect.poll(() => Boolean(hold.request.failure()), { timeout: 5000 }).toBe(true);
                        hold.release.resolve(); await boundedReaderWait(hold.done.promise); assert.equal(hold.failed, undefined);
                        await expect(page.getByText(subject.text, { exact: true })).toHaveCount(0);
                        write('admin-readers-late-scope.json', { oldPeriod: readerPeriod, currentPeriod: '2025-12', actualBodySha256: hold.bodySha256, actualBody: hold.body, browserAborted: true, oldDataSuppressed: true, cancelledFulfill: !!hold.cancelledFulfill });
                        lateScopeSuppressed = true; control.hold = null;
                    }
                    readers.push({ id: subject.id, actualEntry: true, authorizedData: true, stale500Retained: true, real403Hidden: true, failedRetryStillHidden: true, recovered: true, keyboardGeometry: true, geometry });
                }
                cases.push({ width: viewport.width, readers });
            }
            catch (error) {
                await capture(page, `admin-readers-failed-${viewport.width}.png`, viewport);
                throw error;
            }
            finally {
                await context.close();
            }
        }
        for (const subject of subjects) {
            stage = `${subject.id} initial error and empty`;
            const viewport = { width: 390, height: 844 };
            const { context, page, control } = await contextFor(viewport, 'readerEmpty');
            control.paths = subject.paths;
            control.mode = 'fail500';
            try {
                await page.goto(adminOrigin + subject.route);
                const retry = page.getByRole('button', { name: `重試${subject.label}`, exact: true });
                await expect(retry).toBeVisible();
                await expect(page.getByText('資料尚不可用', { exact: false }).first()).toBeVisible();
                await expect(page.getByText(subject.text, { exact: subject.id !== 'cashflow' })).toHaveCount(0);
                control.mode = 'normal';
                await retry.click();
                await expect(retry).toHaveCount(0);
                await expect(page.locator('body')).not.toContainText('合成讀取商品');
                await expect(page.locator('body')).not.toContainText('合成甲聯絡');
                if (subject.id === 'cashflow')
                    await expect(page.locator('body')).toContainText('300,000');
                if (subject.id === 'cashflow' || subject.id === 'margin') {
                    const trend = page.getByRole('button', { name: '重試趨勢', exact: true });
                    await expect(trend).toBeVisible();
                    await trend.click();
                    await expect(trend).toHaveCount(0);
                }
                if (subject.id === 'analytics') {
                    await page.getByRole('button', { name: '🏢 Supplier Ranking', exact: true }).click();
                    const ranking = page.getByRole('button', { name: '重試供應商排行', exact: true });
                    await expect(ranking).toBeVisible();
                    await ranking.click();
                    await expect(ranking).toHaveCount(0);
                    await page.getByRole('button', { name: '📦 ABC Product Analysis', exact: true }).click();
                }
                if (subject.id === 'sales') await expect(page.getByText('No sales data for this period.', { exact: true })).toBeVisible();
                if (subject.id === 'suppliers') await expect(page.getByText('No suppliers found', { exact: true })).toBeVisible();
                if (subject.id === 'analytics') await expect(page.getByText('No product data for this period.', { exact: true })).toBeVisible();
                if (subject.id === 'margin') await expect(page.locator('.stat-value').first()).toContainText('$0');
                initialErrorRecovered.push(subject.id);
                authorizedEmpty.push(subject.id);
                await keyboardCapture(page, subject.id, 390, page.getByRole('button', { name: subject.focus, exact: true }), 'empty');
            }
            finally {
                await context.close();
            }
        }
        assert.ok((await Promise.all(pending)).every(Boolean), 'Reader response oracle/capture failed');
    }
    catch (error) {
        failure = `Reader native acceptance failed at ${stage}`;
        failureDetail = safeTraceFailure(error);
    }
    finally {
        holds.forEach(hold => hold.release.resolve());
        clearTimeout(deadline);
        if (expired)
            failure = 'Reader whole-flow deadline exceeded';
        for (const context of contexts)
            await context.close().catch(() => { });
        if (before) {
            try {
                after = await snapshot();
                write('admin-readers-after.json', after);
                assert.ok(isDeepStrictEqual(before, after));
            }
            catch (error) {
                failure ??= 'Reader read-only snapshot failed';
                failureDetail ??= safeTraceFailure(error);
            }
        }
        if (f.ownershipProven) {
            try {
                const remaining = await cleanupReaderFixture(db, f);
                fixtureCleaned = true;
                write('admin-readers-cleanup.json', { status: 'passed', remaining });
            }
            catch (error) {
                failure = 'Reader fixture cleanup failed';
                failureDetail = safeTraceFailure(error);
                write('admin-readers-cleanup.json', { status: 'failed' });
            }
        }
        else
            write('admin-readers-cleanup.json', { status: 'not-required', reason: 'no absent-ID ownership acquired' });
    }
    const result = { nonce, status: failure ? 'failed' : 'passed', failure, failureDetail, cases, httpStatuses, initialErrorRecovered, authorizedEmpty, tableScroll, pgNegativeControls, databaseGrantLookup, lateScopeSuppressed, fixtureCleaned, network, forbidden, readOnlySnapshotEqual: !!before && !!after && isDeepStrictEqual(before, after), beforeSha256: before ? hash(before) : null, afterSha256: after ? hash(after) : null, rawSnapshotTables: before ? Object.keys(before).length : 0, scope: 'Built five Admin reader entries -> actual GET/JWT/persisted role permissions -> owned synthetic PG. Current estimates only. No login UI, physical equipment, native zoom or financial-policy approval.', analyticsPacingMs: 2150, budget: budget.receipt() };
    if (!failure) {
        try { assertReadersNativeAcceptance(result); }
        catch (error) { result.status = 'failed'; result.failure = 'Reader acceptance contract failed'; result.failureDetail = safeTraceFailure(error); }
    }
    write('admin-readers-responses.json', responses);
    write('admin-readers-native.json', result);
    assertReadersNativeAcceptance(result);
    return result;
}
