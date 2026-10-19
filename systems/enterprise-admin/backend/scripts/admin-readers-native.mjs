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
export const readerViewports = [{ width: 1366, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }];
export const readerStates = ['success', 'stale', 'stale-recovered', 'denied', 'failed-retry', 'recovered'];
const stateIdentity = state => ({ actor: ['denied', 'failed-retry'].includes(state) ? 'denied' : 'readerA', status: state === 'denied' ? 403 : ['stale', 'failed-retry'].includes(state) ? 500 : 200 });
const responseProof = row => ({ contextId: row.contextId, requestId: row.requestId, path: row.path, actor: row.actor, status: row.status, sha256: row.sha256 });
export async function visitReaderViewports(page, visit) {
    for (const viewport of readerViewports) {
        await page.setViewportSize(viewport);
        assert.deepEqual(page.viewportSize(), viewport);
        await visit(viewport);
    }
}
export async function preserveReaderFailure(page, capture, name, error) {
    try {
        const viewport = page.viewportSize();
        await capture(page, `${name}-${viewport.width}.png`, viewport);
    } catch { /* A diagnostic capture cannot replace the original failure. */ }
    throw error;
}
const subjects = [
    { id: 'cashflow', heading: 'Cash Flow Statement（估算）', route: '/reports/cashflow', paths: ['/reports/cashflow', '/reports/cashflow/trend'], label: '現金流報表', text: '300,055', focus: 'Refresh' },
    { id: 'margin', heading: 'Gross Margin Analysis（目前成本估算）', route: '/reports/margin', paths: ['/reports/margin', '/reports/margin/trend'], label: '毛利報表', text: '合成讀取商品甲', focus: 'Refresh' },
    { id: 'sales', heading: 'Product Sales Ranking', route: '/reports/sales-ranking', paths: ['/reports/sales-ranking'], label: '銷售排行', text: '合成讀取商品甲', focus: 'Refresh' },
    { id: 'analytics', heading: 'Inventory Analytics', route: '/inventory/analytics', paths: ['/analytics/product-abc', '/analytics/supplier-ranking'], label: '商品分析', text: '合成讀取商品甲', focus: '🏢 Supplier Ranking' },
    { id: 'suppliers', heading: 'Suppliers Management', route: '/suppliers', paths: ['/inventory/suppliers'], label: '供應商清單', text: '合成甲聯絡', focus: 'Add Supplier' },
];
export async function navigateReader({ page, subject, adminOrigin, expect, period = readerPeriod, unavailable = false }) {
    const link = page.locator(`a[href="${subject.route}"]`);
    if (await link.count()) await link.click();
    else await page.goto(adminOrigin + subject.route);
    // A completed click/URL change can precede React replacing the previous page.
    await expect(page).toHaveURL(adminOrigin + subject.route);
    const root = page.locator('.admin-reader-page').filter({
        has: unavailable ? page.getByRole('alert', { name: `${subject.label}讀取狀態`, exact: true })
            : page.getByRole('heading', { level: 1, name: subject.heading, exact: true }),
    });
    await expect(root).toBeVisible({ timeout: readerResponseTimeoutMs });
    if (!unavailable && subject.id !== 'suppliers' && period !== null) {
        const month = root.locator('input[type="month"]');
        await expect(month).toBeVisible();
        await month.fill(period);
        await expect(month).toHaveValue(period);
    }
    return { route: subject.route, heading: unavailable ? null : subject.heading, period: unavailable || subject.id === 'suppliers' ? null : period };
}
export function readerRequestActor(authorization, tokens) {
    if (authorization === undefined || authorization === '') return 'unauthenticated';
    // These are generated fixture tokens already in this process. Never return
    // or serialize the header/token, only the matched fixture actor key.
    return Object.entries(tokens).find(([, token]) => typeof token === 'string' && token.length > 0 && authorization === `Bearer ${token}`)?.[0] ?? 'unrecognized';
}
export const readerResponseTimeoutMs = 25000;
export function readerOutcomeResponse(rows, { contextId, endpoint, period = readerPeriod, actor = 'readerA', status = 200, afterRequestId = 0 }) {
    return rows.findLast(row => {
        const url = new URL(row.path, 'http://127.0.0.1');
        return row.contextId === contextId && row.actor === actor && row.status === status && !row.cancelledBody
            && Number.isSafeInteger(row.requestId) && row.requestId > afterRequestId && /^[a-f0-9]{64}$/.test(row.sha256 ?? '')
            && url.pathname === '/api/v1/admin' + endpoint
            && (endpoint === '/inventory/suppliers' || url.searchParams.get(endpoint.endsWith('/trend') ? 'to' : 'period') === period);
    });
}
export async function waitForReaderOutcome({ expect, responses, ...scope }) {
    let response;
    await expect.poll(() => { response = readerOutcomeResponse(responses, scope); return Boolean(response); }, { timeout: readerResponseTimeoutMs }).toBe(true);
    return response;
}
export function readerNavigationResponse(rows, { contextId, subject, period = readerPeriod }) {
    // Valid same-context cache provenance, explicitly not a fresh-response claim.
    return readerOutcomeResponse(rows, { contextId, endpoint: subject.paths[0], period });
}
export function createReaderPacer({ check, now = () => performance.now(), wait = pause }) {
    let nextAnalytics = 0, pacing = Promise.resolve();
    return cancelled => {
        const next = pacing.then(async () => {
            check();
            if (cancelled()) return { admitted: false, at: now() };
            await wait(Math.max(0, nextAnalytics - now())); check();
            if (cancelled()) return { admitted: false, at: now() };
            nextAnalytics = now() + 2150;
            return { admitted: true, at: now() };
        });
        pacing = next.catch(() => {}); return next;
    };
}
export function createReaderBudget(now = () => performance.now()) {
    const started = now();
    let apiRequests = 0, analyticsRequests = 0;
    function check() { assert.ok(now() - started < 300000, 'Reader whole-flow deadline exceeded'); }
    return { check, request(endpoint) { check(); apiRequests++; assert.ok(apiRequests <= 320, 'Reader API request ceiling exceeded'); if (endpoint.startsWith('/analytics/')) {
            analyticsRequests++;
            assert.ok(analyticsRequests <= 120, 'Reader analytics request ceiling exceeded');
        } }, receipt() { return { elapsedMs: now() - started, deadlineMs: 300000, apiRequests, maxApiRequests: 320, analyticsRequests, maxAnalyticsRequests: 120 }; } };
}
export function assertReaderFocusClearance(geometry) {
    const ring = Number.parseFloat(geometry.outline) + Math.max(0, Number.parseFloat(geometry.outlineOffset));
    assert.ok(Number.isFinite(ring) && ring >= 6);
    assert.ok(geometry.x - ring >= geometry.region.x && geometry.x + geometry.width + ring <= geometry.region.right);
    assert.ok(geometry.y - ring >= 0 && geometry.y + geometry.height + ring <= geometry.viewportHeight);
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
    assert.equal(result.responseTimeoutMs, readerResponseTimeoutMs);
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
    assert.equal(result.coverage, 'one shared lifecycle; three independent five-reader cold entries');
    assert.equal(new Set(result.cases.map(row => row.contextId)).size, 1);
    assert.deepEqual(result.coldEntries.map(row => row.width), [1366, 1024, 390]);
    assert.equal(new Set(result.coldEntries.map(row => row.contextId)).size, 3);
    for (const cold of result.coldEntries) {
        assert.ok(cold.contextId > 0 && cold.contextId !== result.cases[0].contextId);
        assert.equal(cold.authenticated, true);
        assert.equal(cold.authResponse.contextId, cold.contextId);
        assert.equal(cold.authResponse.actor, 'readerA');
        assert.equal(cold.authResponse.status, 200);
        assert.equal(cold.authResponse.path, '/api/v1/admin/auth/me');
        assert.match(cold.authResponse.sha256, /^[a-f0-9]{64}$/);
        assert.deepEqual(cold.readers.map(row => row.id), subjects.map(row => row.id));
        for (const reader of cold.readers) {
            const subject = subjects.find(row => row.id === reader.id);
            assert.equal(reader.navigation.route, subject.route);
            assert.equal(reader.navigation.heading, subject.heading);
            assert.ok(readerNavigationResponse([reader.navigation.response], { contextId: cold.contextId, subject }));
        }
    }
    for (const row of result.cases) {
        assert.ok(Number.isSafeInteger(row.contextId) && row.contextId > 0);
        assert.deepEqual(row.readers.map(reader => reader.id), subjects.map(s => s.id));
        for (const reader of row.readers) {
            const subject = subjects.find(s => s.id === reader.id);
            assert.equal(reader.navigation.route, subject.route);
            assert.equal(reader.navigation.heading, subject.heading);
            assert.equal(reader.navigation.period, subject.id === 'suppliers' ? null : readerPeriod);
            assert.ok(readerNavigationResponse([reader.navigation.response], { contextId: row.contextId, subject }));
            assert.deepEqual(Object.keys(reader.states), readerStates);
            let previousId = 0;
            for (const state of readerStates) {
                const proof = reader.states[state];
                assert.equal(proof.width, row.width); assert.equal(proof.verified, true);
                assert.ok(readerOutcomeResponse([proof.response], { contextId: row.contextId, endpoint: subject.paths[0], ...stateIdentity(state), afterRequestId: previousId }));
                previousId = proof.response.requestId;
                assert.equal(proof.response.requestId, result.cases[0].readers.find(row => row.id === reader.id).states[state].response.requestId);
            }
            for (const key of ['actualEntry', 'authorizedData', 'stale500Retained', 'real403Hidden', 'failedRetryStillHidden', 'recovered', 'keyboardGeometry'])
                assert.equal(reader[key], true, `${reader.id}:${key}`);
        }
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
    assert.deepEqual(result.emptyCases.map(row => row.id), subjects.map(row => row.id));
    for (const row of result.emptyCases) {
        const subject = subjects.find(subject => subject.id === row.id);
        for (const [state, status] of [['initial-error', 500], ['empty', 200]]) {
            assert.deepEqual(row.views[state].map(view => view.width), [1366, 1024, 390]);
            for (const view of row.views[state]) {
                assert.equal(view.verified, true);
                assert.ok(readerOutcomeResponse([view.response], { contextId: row.contextId, endpoint: subject.paths[0], period: row.period, actor: 'readerEmpty', status }));
            }
        }
    }
    assert.deepEqual(result.tableScroll.map(row => row.subject).sort(), ['analytics', 'margin', 'sales', 'supplier-ranking', 'suppliers']);
    for (const row of result.tableScroll) assertReaderTableScroll(row.before, row.after);
}
export async function runAdminReadersNative({ db, browser, adminOrigin, signAccessToken, output, nonce, expect, capture }) {
    const origin = new URL(adminOrigin);
    assert.equal(origin.protocol, 'http:');
    assert.equal(origin.hostname, '127.0.0.1');
    const f = buildReaderFixture(nonce), contexts = [], network = [], forbidden = [], responses = [], pending = [], cases = [], httpStatuses = {}, initialErrorRecovered = [], authorizedEmpty = [], holds = [], tableScroll = [], coldEntries = [], emptyCases = [];
    const expected = Object.fromEntries(['readerA', 'readerB', 'readerEmpty'].map(actor => [actor, readerExpected(f, actor)])), tokens = {};
    let stage = 'fixture', failure = null, failureDetail = null, before, after, fixtureCleaned = false, databaseGrantLookup = false, lateScopeSuppressed = false, pgNegativeControls;
    const budget = createReaderBudget();
    let expired = false, nextRequestId = 0;
    const deadline = setTimeout(() => { expired = true; for (const context of contexts)
        void context.close().catch(() => { }); }, 300000);
    const pace = createReaderPacer({ check: () => budget.check() });
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
        const contextId = contexts.length, dispatched = new WeakMap();
        await context.addInitScript(value => localStorage.setItem('accessToken', value), tokens[actor]);
        const control = { mode: 'normal', paths: [] };
        await context.route('**/*', async (route) => {
            const req = route.request(), url = new URL(req.url());
            if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) {
                await route.abort();
                return;
            }
            const entry = { contextId, requestId: ++nextRequestId, actor: readerRequestActor(req.headers().authorization, tokens), width: req.frame().page?.().viewportSize?.()?.width ?? viewport.width, method: req.method(), path: url.pathname + url.search, allowed: url.origin === adminOrigin && req.method() === 'GET' };
            dispatched.set(req, entry);
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
                if (endpoint.startsWith('/analytics/')) {
                    entry.analyticsQueuedAt = performance.now();
                    const admission = await pace(() => Boolean(req.failure()) || req.frame().isDetached());
                    if (!admission.admitted) {
                        entry.cancelledBeforeDispatch = true; entry.analyticsCancelledAt = admission.at;
                        await route.abort().catch(() => {}); return;
                    }
                    entry.analyticsAdmittedAt = admission.at;
                }
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
            const request = dispatched.get(response.request());
            const actorAtResponse = request?.actor;
            const task = (async () => {
                let bytes;
                try {
                    bytes = await response.body();
                }
                catch (error) {
                    if (response.request().failure()) {
                        responses.push({ contextId, requestId: request?.requestId, width: request?.width ?? viewport.width, path: url.pathname + url.search, status: response.status(), cancelledBody: true });
                        return;
                    }
                    throw error;
                }
                const body = JSON.parse(bytes.toString());
                const endpoint = url.pathname.replace(/^\/api\/v1\/admin/, '');
                if (response.status() === 200 && readerEndpoints.includes(endpoint) && (endpoint === '/inventory/suppliers' || url.searchParams.get('period') === readerPeriod || url.searchParams.get('to') === readerPeriod))
                    assertReaderResponse(endpoint, body.data, expected[actorAtResponse], { sort: url.searchParams.get('sort') ?? 'revenue', limit: Number(url.searchParams.get('limit') ?? 20) });
                responses.push({ contextId, requestId: request?.requestId, width: request?.width ?? viewport.width, actor: actorAtResponse, path: url.pathname + url.search, status: response.status(), sha256: hash(bytes.toString()), body });
            })();
            pending.push(task.then(() => true, () => false));
        });
        return { context, page, control, contextId };
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
            geometry = await settleTraceFocusGeometry(() => target.evaluate(el => { const b = el.getBoundingClientRect(), style = getComputedStyle(el), sidebar = document.querySelector('.sidebar')?.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return { x: b.x, y: b.y, width: b.width, height: b.height, region: { x: Math.max(0, sidebar?.right ?? 0), right: innerWidth }, viewport: innerWidth, pageWidth: document.documentElement.scrollWidth, scrollLeft: scrollX, outline: style.outlineWidth, outlineOffset: style.outlineOffset, color: style.outlineColor, focused: document.activeElement === el, centerHit: !!hit && (hit === el || el.contains(hit)), viewportHeight: innerHeight }; }), row => samples.push(row));
            assertReaderFocusClearance(geometry);
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
        for (const sort of ['revenue', 'quantity']) {
            const value = await probe.page.evaluate(async ({ url, token }) => { const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } }); return { status: response.status, body: await response.json() }; }, { url: adminOrigin + '/api/v1/admin' + query('/reports/sales-ranking', sort), token: tokens.readerA });
            assert.equal(value.status, 200);
            assertReaderResponse('/reports/sales-ranking', value.body.data, expected.readerA, { sort });
        }
        await probe.context.close();
        {
            const viewport = readerViewports[0];
            const { context, page, control, contextId } = await contextFor(viewport);
            const sharedCases = readerViewports.map(view => ({ width: view.width, contextId, readers: [] }));
            async function navigate(subject) { return navigateReader({ page, subject, adminOrigin, expect }); }
            const outcome = (subject, status, actor, afterRequestId, endpoint = subject.paths[0]) => waitForReaderOutcome({ expect, responses, contextId, endpoint, actor, status, afterRequestId });
            async function loaded(subject) { await expect(page.getByText(subject.text, { exact: subject.id !== 'cashflow' }).first()).toBeVisible({ timeout: readerResponseTimeoutMs }); await expect(page.locator('body')).not.toContainText('FOREIGN_READER_'); if(['cashflow','margin','sales'].includes(subject.id))await expect(page.getByRole('note')).toContainText(subject.id==='cashflow'?'非實際現金流':'非歷史實際毛利'); }
            async function refresh(subject, token = tokens.readerA) { if (subject.id === 'analytics' || subject.id === 'suppliers') {
                await page.evaluate(value => localStorage.setItem('accessToken', value), tokens.readerA);
                await navigateReader({ page, subject: subjects[0], adminOrigin, expect, period: null });
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
                    const stateViews = Object.fromEntries(readerViewports.map(view => [view.width, {}]));
                    const visualState = async (name, target, verify, proof) => visitReaderViewports(page, async view => {
                        assert.ok(readerOutcomeResponse([proof], { contextId, endpoint: subject.paths[0], ...stateIdentity(name) }));
                        stage = `${subject.id} ${name} visual ${view.width}`;
                        budget.check(); await verify();
                        const geometry = await keyboardCapture(page, subject.id, view.width, target(), name);
                        stateViews[view.width][name] = { width: view.width, verified: true, response: responseProof(proof), geometry };
                    });
                    stage = `${subject.id} actual entry shared lifecycle`;
                    control.paths = subject.paths;
                    control.mode = 'normal';
                    const navigation = await navigate(subject);
                    await loaded(subject);
                    await expect.poll(() => Boolean(readerNavigationResponse(responses, { contextId, subject })), { timeout: 25000 }).toBe(true);
                    const response = readerNavigationResponse(responses, { contextId, subject });
                    navigation.response = { contextId, requestId: response.requestId, path: response.path, status: response.status, actor: response.actor, sha256: response.sha256 };
                    write(`admin-readers-${subject.id}-navigation-shared.json`, navigation);
                    if (subject.id === 'analytics') {
                        await page.getByRole('button', { name: '🏢 Supplier Ranking', exact: true }).click();
                        await expect(page.getByText('合成同名供應商', { exact: true })).toBeVisible({ timeout: readerResponseTimeoutMs });
                        await expect(page.getByRole('row').filter({ hasText: '合成同名供應商' })).toContainText('—');
                        await visitReaderViewports(page, async view => {
                            await expect(page.getByText('合成同名供應商', { exact: true })).toBeVisible({ timeout: readerResponseTimeoutMs });
                            await keyboardCapture(page, 'supplier-ranking', view.width, page.getByRole('button', { name: '📦 ABC Product Analysis', exact: true }), 'success');
                            if (view.width === 390) await tableKeyboard(page, 'supplier-ranking');
                        });
                        await page.getByRole('button', { name: '📦 ABC Product Analysis', exact: true }).click();
                    }
                    const successTarget = () => page.getByRole('button', { name: subject.focus, exact: true });
                    await visualState('success', successTarget, () => loaded(subject), response);
                    if (subject.id !== 'cashflow') await tableKeyboard(page, subject.id);
                    stage = `${subject.id} stale transport shared lifecycle`;
                    control.mode = 'fail500';
                    const staleBefore = nextRequestId;
                    await refresh(subject);
                    const staleResponse = await outcome(subject, 500, 'readerA', staleBefore);
                    await expect(page.getByText('可能已過期', { exact: false }).first()).toBeVisible({ timeout: readerResponseTimeoutMs });
                    await loaded(subject);
                    const retry = () => page.getByRole('button', { name: `重試${subject.label}`, exact: true });
                    await visualState('stale', retry, async () => { await loaded(subject); await expect(page.getByText('可能已過期', { exact: false }).first()).toBeVisible({ timeout: readerResponseTimeoutMs }); }, staleResponse);
                    control.mode = 'normal';
                    const staleRecoveryBefore = nextRequestId;
                    await retry().click();
                    const staleRecoveryResponse = await outcome(subject, 200, 'readerA', staleRecoveryBefore);
                    await expect(retry()).toHaveCount(0);
                    await loaded(subject);
                    await visualState('stale-recovered', successTarget, () => loaded(subject), staleRecoveryResponse);
                    stage = `${subject.id} real denied role shared lifecycle`;
                    const deniedBefore = nextRequestId;
                    await refresh(subject, tokens.denied);
                    const deniedResponse = await outcome(subject, 403, 'denied', deniedBefore);
                    await expect(retry()).toBeVisible({ timeout: readerResponseTimeoutMs });
                    await expect(page.getByText('存取被拒絕', { exact: false }).first()).toBeVisible({ timeout: readerResponseTimeoutMs });
                    await expect(page.getByText(subject.text, { exact: subject.id !== 'cashflow' })).toHaveCount(0);
                    const hidden = async () => { await expect(page.getByText('存取被拒絕', { exact: false }).first()).toBeVisible({ timeout: readerResponseTimeoutMs }); await expect(page.getByText(subject.text, { exact: subject.id !== 'cashflow' })).toHaveCount(0); };
                    await visualState('denied', retry, hidden, deniedResponse);
                    control.mode = 'fail500';
                    const failedBefore = nextRequestId;
                    await retry().click();
                    const failedResponse = await outcome(subject, 500, 'denied', failedBefore);
                    await expect(retry()).toBeEnabled({ timeout: readerResponseTimeoutMs });
                    await expect(page.getByText(subject.text, { exact: subject.id !== 'cashflow' })).toHaveCount(0);
                    await visualState('failed-retry', retry, hidden, failedResponse);
                    stage = `${subject.id} authorized recovery shared lifecycle`;
                    control.mode = 'normal';
                    await page.evaluate(value => localStorage.setItem('accessToken', value), tokens.readerA);
                    const recoveryBefore = nextRequestId;
                    await retry().click();
                    const recoveryResponse = await outcome(subject, 200, 'readerA', recoveryBefore);
                    await loaded(subject);
                    await expect(retry()).toHaveCount(0);
                    // A report's main retry must not silently recover its denied trend query.
                    if (subject.id === 'cashflow' || subject.id === 'margin') {
                        const trend = page.getByRole('button', { name: '重試趨勢', exact: true });
                        await expect(trend).toBeVisible({ timeout: readerResponseTimeoutMs });
                        await expect(page.locator('.recharts-wrapper')).toHaveCount(0);
                        const trendBefore = nextRequestId;
                        await trend.click();
                        await outcome(subject, 200, 'readerA', trendBefore, subject.paths[1]);
                        await expect(trend).toHaveCount(0);
                    }
                    if (subject.id === 'analytics') {
                        await page.getByRole('button', { name: '🏢 Supplier Ranking', exact: true }).click();
                        const ranking = page.getByRole('button', { name: '重試供應商排行', exact: true });
                        await expect(ranking).toBeVisible({ timeout: readerResponseTimeoutMs });
                        await expect(page.getByText('合成同名供應商', { exact: true })).toHaveCount(0);
                        await visitReaderViewports(page, async view => { await expect(page.getByText('合成同名供應商', { exact: true })).toHaveCount(0); await keyboardCapture(page, 'supplier-ranking', view.width, ranking, 'denied'); });
                        const rankingBefore = nextRequestId;
                        await ranking.click();
                        await outcome(subject, 200, 'readerA', rankingBefore, subject.paths[1]);
                        await expect(page.getByText('合成同名供應商', { exact: true })).toBeVisible({ timeout: readerResponseTimeoutMs });
                        await visitReaderViewports(page, async view => { await expect(page.getByText('合成同名供應商', { exact: true })).toBeVisible({ timeout: readerResponseTimeoutMs }); await keyboardCapture(page, 'supplier-ranking', view.width, page.getByRole('button', { name: '📦 ABC Product Analysis', exact: true }), 'recovered'); });
                        await page.getByRole('button', { name: '📦 ABC Product Analysis', exact: true }).click();
                    }
                    await visualState('recovered', successTarget, () => loaded(subject), recoveryResponse);
                    if (subject.id === 'margin') {
                        stage = 'actual delayed old-period response 390';
                        const hold = { ready: deferred(), release: deferred(), done: deferred(), started: false };
                        holds.push(hold); control.hold = hold;
                        await page.getByRole('button', { name: 'Refresh', exact: true }).click();
                        await boundedReaderWait(hold.ready.promise); assert.equal(hold.failed, undefined); assert.match(hold.bodySha256, /^[a-f0-9]{64}$/);
                        const currentMonth = page.locator('.admin-reader-page').filter({ has: page.getByRole('heading', { level: 1, name: subject.heading, exact: true }) }).locator('input[type="month"]');
                        await currentMonth.fill('2025-12');
                        await expect(currentMonth).toHaveValue('2025-12');
                        await expect(page.locator('.stat-value').first()).toContainText('$0');
                        await expect(page.getByText(subject.text, { exact: true })).toHaveCount(0);
                        await expect.poll(() => Boolean(hold.request.failure()), { timeout: 5000 }).toBe(true);
                        hold.release.resolve(); await boundedReaderWait(hold.done.promise); assert.equal(hold.failed, undefined);
                        await expect(page.getByText(subject.text, { exact: true })).toHaveCount(0);
                        write('admin-readers-late-scope.json', { oldPeriod: readerPeriod, currentPeriod: '2025-12', actualBodySha256: hold.bodySha256, actualBody: hold.body, browserAborted: true, oldDataSuppressed: true, cancelledFulfill: !!hold.cancelledFulfill });
                        lateScopeSuppressed = true; control.hold = null;
                    }
                    for (const row of sharedCases) row.readers.push({ id: subject.id, navigation, states: stateViews[row.width], actualEntry: true, authorizedData: true, stale500Retained: true, real403Hidden: true, failedRetryStillHidden: true, recovered: true, keyboardGeometry: true, geometry: stateViews[row.width].success.geometry });
                }
                cases.push(...sharedCases);
            }
            catch (error) {
                await preserveReaderFailure(page, capture, 'admin-readers-failed', error);
            }
            finally {
                await context.close();
            }
        }
        // Independent cold contexts preserve navigation/auth/first-read evidence at
        // every size; they do not repeat the shared role/error lifecycle above.
        for (const viewport of readerViewports) {
            stage = `independent cold entry ${viewport.width}`;
            const { context, page, contextId } = await contextFor(viewport), readers = [];
            try {
                for (const subject of subjects) {
                    stage = `${subject.id} independent cold entry ${viewport.width}`;
                    const navigation = await navigateReader({ page, subject, adminOrigin, expect });
                    await expect(page.getByText(subject.text, { exact: subject.id !== 'cashflow' }).first()).toBeVisible({ timeout: readerResponseTimeoutMs });
                    await expect(page.locator('body')).not.toContainText('FOREIGN_READER_');
                    const response = await waitForReaderOutcome({ expect, responses, contextId, endpoint: subject.paths[0] });
                    navigation.response = { contextId, requestId: response.requestId, path: response.path, status: response.status, actor: response.actor, sha256: response.sha256 };
                    readers.push({ id: subject.id, navigation });
                }
                await expect.poll(() => responses.some(row => row.contextId === contextId && row.path === '/api/v1/admin/auth/me' && row.actor === 'readerA' && row.status === 200 && /^[a-f0-9]{64}$/.test(row.sha256 ?? '')), { timeout: readerResponseTimeoutMs }).toBe(true);
                const authResponse = responses.find(row => row.contextId === contextId && row.path === '/api/v1/admin/auth/me' && row.actor === 'readerA' && row.status === 200 && row.sha256);
                coldEntries.push({ width: viewport.width, contextId, authenticated: true, authResponse: responseProof(authResponse), readers });
            } catch (error) { await preserveReaderFailure(page, capture, 'admin-readers-cold-failed', error); }
            finally { await context.close(); }
        }
        for (const subject of subjects) {
            stage = `${subject.id} initial error and empty`;
            const viewport = { width: 390, height: 844 };
            const { context, page, control, contextId } = await contextFor(viewport, 'readerEmpty');
            const defaultPeriod = await page.evaluate(() => new Date().toISOString().substring(0, 7));
            const emptyCase = { id: subject.id, contextId, period: defaultPeriod, views: { 'initial-error': [], empty: [] } };
            const outcome = (status, afterRequestId, endpoint = subject.paths[0]) => waitForReaderOutcome({ expect, responses, contextId, endpoint, period: defaultPeriod, actor: 'readerEmpty', status, afterRequestId });
            control.paths = subject.paths;
            control.mode = 'fail500';
            try {
                const initialBefore = nextRequestId;
                await navigateReader({ page, subject, adminOrigin, expect, unavailable: true });
                const initialResponse = await outcome(500, initialBefore);
                const retry = page.getByRole('button', { name: `重試${subject.label}`, exact: true });
                await expect(retry).toBeVisible({ timeout: readerResponseTimeoutMs });
                await expect(page.getByText('資料尚不可用', { exact: false }).first()).toBeVisible();
                await expect(page.getByText(subject.text, { exact: subject.id !== 'cashflow' })).toHaveCount(0);
                await visitReaderViewports(page, async view => {
                    stage = `${subject.id} initial error visual ${view.width}`;
                    await expect(page.getByText('資料尚不可用', { exact: false }).first()).toBeVisible({ timeout: readerResponseTimeoutMs });
                    await expect(page.getByText(subject.text, { exact: subject.id !== 'cashflow' })).toHaveCount(0);
                    const geometry = await keyboardCapture(page, subject.id, view.width, retry, 'initial-error');
                    emptyCase.views['initial-error'].push({ width: view.width, verified: true, response: responseProof(initialResponse), geometry });
                });
                control.mode = 'normal';
                const recoveryBefore = nextRequestId;
                await retry.click();
                const emptyResponse = await outcome(200, recoveryBefore);
                await expect(retry).toHaveCount(0);
                await expect(page.locator('body')).not.toContainText('合成讀取商品');
                await expect(page.locator('body')).not.toContainText('合成甲聯絡');
                if (subject.id === 'cashflow')
                    await expect(page.locator('body')).toContainText('300,000');
                if (subject.id === 'cashflow' || subject.id === 'margin') {
                    const trend = page.getByRole('button', { name: '重試趨勢', exact: true });
                    await expect(trend).toBeVisible({ timeout: readerResponseTimeoutMs });
                    const trendBefore = nextRequestId;
                    await trend.click();
                    await outcome(200, trendBefore, subject.paths[1]);
                    await expect(trend).toHaveCount(0);
                }
                if (subject.id === 'analytics') {
                    await page.getByRole('button', { name: '🏢 Supplier Ranking', exact: true }).click();
                    const ranking = page.getByRole('button', { name: '重試供應商排行', exact: true });
                    await expect(ranking).toBeVisible({ timeout: readerResponseTimeoutMs });
                    const rankingBefore = nextRequestId;
                    await ranking.click();
                    await outcome(200, rankingBefore, subject.paths[1]);
                    await expect(ranking).toHaveCount(0);
                    await page.getByRole('button', { name: '📦 ABC Product Analysis', exact: true }).click();
                }
                if (subject.id === 'sales') await expect(page.getByText('No sales data for this period.', { exact: true })).toBeVisible();
                if (subject.id === 'suppliers') await expect(page.getByText('No suppliers found', { exact: true })).toBeVisible();
                if (subject.id === 'analytics') await expect(page.getByText('No product data for this period.', { exact: true })).toBeVisible();
                if (subject.id === 'margin') await expect(page.locator('.stat-value').first()).toContainText('$0');
                initialErrorRecovered.push(subject.id);
                authorizedEmpty.push(subject.id);
                await visitReaderViewports(page, async view => {
                    stage = `${subject.id} empty visual ${view.width}`;
                    await expect(page.locator('body')).not.toContainText('合成讀取商品');
                    await expect(page.locator('body')).not.toContainText('合成甲聯絡');
                    const geometry = await keyboardCapture(page, subject.id, view.width, page.getByRole('button', { name: subject.focus, exact: true }), 'empty');
                    emptyCase.views.empty.push({ width: view.width, verified: true, response: responseProof(emptyResponse), geometry });
                });
                emptyCases.push(emptyCase);
            }
            catch (error) { await preserveReaderFailure(page, capture, `admin-readers-${subject.id}-empty-failed`, error); }
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
    const result = { nonce, status: failure ? 'failed' : 'passed', failure, failureDetail, coverage: 'one shared lifecycle; three independent five-reader cold entries', cases, coldEntries, emptyCases, httpStatuses, initialErrorRecovered, authorizedEmpty, tableScroll, pgNegativeControls, databaseGrantLookup, lateScopeSuppressed, fixtureCleaned, network, forbidden, readOnlySnapshotEqual: !!before && !!after && isDeepStrictEqual(before, after), beforeSha256: before ? hash(before) : null, afterSha256: after ? hash(after) : null, rawSnapshotTables: before ? Object.keys(before).length : 0, scope: 'Built five Admin reader entries -> actual GET/JWT/persisted role permissions -> owned synthetic PG. Current estimates only. No login UI, physical equipment, native zoom or financial-policy approval.', analyticsPacingMs: 2150, responseTimeoutMs: readerResponseTimeoutMs, budget: budget.receipt() };
    if (!failure) {
        try { assertReadersNativeAcceptance(result); }
        catch (error) { result.status = 'failed'; result.failure = 'Reader acceptance contract failed'; result.failureDetail = safeTraceFailure(error); }
    }
    write('admin-readers-responses.json', responses);
    write('admin-readers-native.json', result);
    assertReadersNativeAcceptance(result);
    return result;
}
