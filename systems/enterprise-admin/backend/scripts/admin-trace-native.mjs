// Existing exact-head package runner owns PG/browser/API. This journey only reads
// through the real application; fixture setup/teardown use newly generated IDs.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
async function bounded(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Trace wait failed: ${label}`)), 10000); })]); }
  finally { clearTimeout(timer); }
}
export function assertTraceNativeAcceptance(result) {
  assert.equal(result.status, 'passed'); assert.equal(result.readOnlySnapshotEqual, true);
  assert.equal(result.fixtureCleaned, true); assert.equal(result.forbidden.length, 0);
  assert.deepEqual(result.cases.map(row => row.viewport.width), [1366, 1024, 390]);
  for (const row of result.cases) {
    assert.equal(row.status, 'passed'); assert.equal(row.totalAllocations, 132); assert.equal(row.shownAllocations, 100);
    for (const key of ['exactOrderedRows', 'nullAndNumberedOrders', 'receiptLinked', 'keyboardQuantityRevealed', 'keyboardTraceOpened', 'focusRestored', 'lateScopeSuppressed', 'backForwardReload', 'paginationPreserved']) assert.equal(row[key], true, key);
  }
  assert.deepEqual(result.realStatuses, { unauthenticated: 401, deniedRole: 403, foreignBatch: 404, missingBatch: 404, crossTenantTrace: 404 });
  assert.equal(result.injectedTransport500Recovered, true);
  assert.equal(result.databaseGrantLookup, true);
  assert.match(result.beforeSha256, /^[a-f0-9]{64}$/); assert.equal(result.beforeSha256, result.afterSha256);
  assert.equal(result.rawSnapshotTables >= 33, true);
}
export async function cleanupTraceFixture(db, ids, tenantId) {
  assert.match(tenantId, /^[a-f0-9-]{36}$/);
  for (const key of ['a','b','foreignProduct','foreignTenant','reader','denied','readerRole','deniedRole','foreignReader','foreignReaderRole','customer']) assert.match(ids[key], /^[a-f0-9-]{36}$/);
      await db.saleBatchAllocation.deleteMany({ where: { tenantId, productId: ids.a } });
      await db.orderItem.deleteMany({ where: { productId: ids.a, order: { tenantId, customerId: ids.customer } } });
      await db.order.deleteMany({ where: { tenantId, customerId: ids.customer } });
      await db.inventoryTransaction.deleteMany({ where: { tenantId, productId: { in: [ids.a, ids.b] } } });
      await db.productBatch.deleteMany({ where: { productId: { in: [ids.a, ids.b, ids.foreignProduct] }, tenantId: { in: [tenantId, ids.foreignTenant] } } });
      await db.product.deleteMany({ where: { id: { in: [ids.a, ids.b, ids.foreignProduct] }, tenantId: { in: [tenantId, ids.foreignTenant] } } });
      await db.customer.deleteMany({ where: { id: ids.customer, tenantId } });
      await db.rolePermission.deleteMany({ where: { roleId: { in: [ids.readerRole, ids.deniedRole, ids.foreignReaderRole] } } });
      await db.userRole.deleteMany({ where: { userId: { in: [ids.reader, ids.denied, ids.foreignReader] } } });
      await db.role.deleteMany({ where: { id: { in: [ids.readerRole, ids.deniedRole, ids.foreignReaderRole] }, tenantId: { in: [tenantId, ids.foreignTenant] } } });
      await db.user.deleteMany({ where: { id: { in: [ids.reader, ids.denied, ids.foreignReader] }, tenantId: { in: [tenantId, ids.foreignTenant] } } });
      await db.tenant.deleteMany({ where: { id: ids.foreignTenant } });
      const remaining = { products: await db.product.count({ where: { id: { in: [ids.a, ids.b, ids.foreignProduct] } } }), users: await db.user.count({ where: { id: { in: [ids.reader, ids.denied, ids.foreignReader] } } }), foreignTenant: await db.tenant.count({ where: { id: ids.foreignTenant } }), allocations: await db.saleBatchAllocation.count({ where: { tenantId, productId: ids.a } }), orders: await db.order.count({ where: { tenantId, customerId: ids.customer } }) };
      assert.ok(Object.values(remaining).every(count => count === 0));
      return remaining;
}
export async function runAdminTraceNative({ db, tenantId, browser, adminOrigin, signAccessToken, output, nonce, expect, capture }) {
  const origin = new URL(adminOrigin); assert.equal(origin.protocol, 'http:'); assert.equal(origin.hostname, '127.0.0.1');
  assert.match(nonce, /^[a-f0-9-]{36}$/);
  const ids = Object.fromEntries(['a', 'b', 'negative', 'zero', 'batchA', 'batchB', 'foreignTenant', 'foreignProduct', 'foreignBatch', 'reader', 'readerRole', 'denied', 'deniedRole', 'foreignReader', 'foreignReaderRole', 'customer', 'receipt'].map(key => [key, randomUUID()]));
  const names = { a: '0 合成來源商品 A', b: '0 合成來源商品 B' };
  const listPath = '/api/v1/admin/product-batches';
  const tracePath = `${listPath}/${ids.batchA}`;
  const cases = [], network = [], forbidden = [], responses = [], settled = [];
  const contexts = [], releases = [], tokens = {};
  let stage = 'fixture setup';
  let failure = null, before, after, fixtureCleaned = false, started = false, injectedTransport500Recovered = false;
  const realStatuses = {}; let expectedRows, expectedReceipt;
  const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  async function snapshot() {
    const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename`;
    const result = {};
    for (const { tablename } of tables) {
      assert.match(tablename, /^[a-z_]+$/);
      result[tablename] = (await db.$queryRawUnsafe(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) AS rows FROM public."${tablename}" t`))[0].rows;
    }
    return result;
  }
  try {
    started = true;
    await db.tenant.create({ data: { id: ids.foreignTenant, slug: ids.foreignTenant, name: '合成隔離追溯租戶', plan: 'pro' } });
    await db.product.createMany({ data: [
      { id: ids.a, tenantId, sku: 'TRACE-NATIVE-A', name: names.a, stockQuantity: 130, costPrice: 1, retailPrice: 2 },
      { id: ids.b, tenantId, sku: 'TRACE-NATIVE-B', name: names.b, stockQuantity: 4, costPrice: 1, retailPrice: 2 },
      { id: ids.foreignProduct, tenantId: ids.foreignTenant, sku: 'TRACE-FOREIGN', name: '不可洩漏的合成外租戶商品', stockQuantity: 1, costPrice: 1, retailPrice: 2 },
    ] });
    await db.productBatch.createMany({ data: [
      { id: ids.batchA, tenantId, productId: ids.a, batchNumber: 'TRACE-NATIVE-A', quantity: 132, status: 'QUARANTINE', expiryDate: new Date('2099-01-01'), costPrice: 1 },
      { id: ids.negative, tenantId, productId: ids.a, batchNumber: 'TRACE-NEGATIVE', quantity: -2, status: 'BLOCKED', expiryDate: new Date('2099-01-02'), costPrice: 1 },
      { id: ids.zero, tenantId, productId: ids.a, batchNumber: 'TRACE-ZERO', quantity: 0, status: 'RELEASED', expiryDate: new Date('2099-01-03'), costPrice: 1 },
      { id: ids.batchB, tenantId, productId: ids.b, batchNumber: 'TRACE-NATIVE-B', quantity: 4, status: 'QUARANTINE', expiryDate: new Date('2099-01-04'), costPrice: 1 },
      { id: ids.foreignBatch, tenantId: ids.foreignTenant, productId: ids.foreignProduct, batchNumber: 'TRACE-FOREIGN', quantity: 1, status: 'QUARANTINE', expiryDate: new Date('2099-01-05'), costPrice: 1 },
    ] });
    await db.customer.create({ data: { id: ids.customer, tenantId, name: '合成追溯顧客' } });
    const stamp = Date.parse('2026-01-01T16:00:00Z');
    const rows = Array.from({ length: 132 }, (_, index) => ({ orderId: randomUUID(), itemId: randomUUID(), movementId: randomUUID(), id: randomUUID(), index, createdAt: new Date(stamp + (index === 131 ? 132 : Math.floor(index / 2)) * 1000) }));
    await db.order.createMany({ data: rows.map(row => ({ id: row.orderId, tenantId, customerId: ids.customer, orderNumber: row.index === 131 ? null : `TRACE-${nonce}-${row.index}`, status: 'completed', paymentStatus: 'paid', totalAmount: 2, createdAt: row.createdAt })) });
    await db.orderItem.createMany({ data: rows.map(row => ({ id: row.itemId, orderId: row.orderId, productId: ids.a, quantity: 1, unitPrice: 2 })) });
    await db.inventoryTransaction.createMany({ data: [{ id: ids.receipt, tenantId, productId: ids.a, batchId: ids.batchA, type: 'IN', quantity: 264, createdAt: new Date(stamp - 1000) }, ...rows.map(row => ({ id: row.movementId, tenantId, productId: ids.a, type: 'OUT', quantity: 1, referenceId: row.orderId, createdAt: row.createdAt }))] });
    await db.saleBatchAllocation.createMany({ data: rows.map(row => ({ id: row.id, tenantId, orderId: row.orderId, orderItemId: row.itemId, productId: ids.a, batchId: ids.batchA, movementId: row.movementId, quantity: 1, expiryDateAtSale: new Date('2099-01-01'), createdAt: row.createdAt })) });
    for (const [userKey, roleKey, grants, userTenant] of [['reader', 'readerRole', ['products', 'suppliers'], tenantId], ['denied', 'deniedRole', [], tenantId], ['foreignReader', 'foreignReaderRole', ['products', 'suppliers'], ids.foreignTenant]]) {
      await db.user.create({ data: { id: ids[userKey], tenantId: userTenant, email: `${ids[userKey]}@trace.example.test`, fullName: '合成唯讀追溯人員', passwordHash: 'synthetic-non-login-placeholder' } });
      await db.role.create({ data: { id: ids[roleKey], tenantId: userTenant, name: `Synthetic trace ${userKey}` } });
      await db.userRole.create({ data: { userId: ids[userKey], roleId: ids[roleKey] } });
      for (const resource of grants) {
        const permission = await db.permission.findFirst({ where: { action: 'read', resource } }); assert.ok(permission);
        await db.rolePermission.create({ data: { roleId: ids[roleKey], permissionId: permission.id } });
      }
      // Deliberately omit embedded permissions: unchanged middleware must read
      // the persisted synthetic role grants. No login UI/credential claim.
      tokens[userKey] = signAccessToken({ userId: ids[userKey], email: `${ids[userKey]}@trace.example.test`, tenantId: userTenant, plan: 'pro' });
    }
    expectedRows = await db.saleBatchAllocation.findMany({ where: { tenantId, batchId: ids.batchA }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100, include: { order: { select: { id: true, orderNumber: true } } } });
    expectedReceipt = await db.inventoryTransaction.findUnique({ where: { id: ids.receipt } });
    assert.equal(expectedRows.length, 100); assert.equal(expectedRows[0].order.orderNumber, null);
    stage = 'initial full snapshot';
    before = await snapshot(); write('admin-trace-before.json', before);
    for (const viewport of [{ width: 1366, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport }); contexts.push(context);
      await context.addInitScript(value => localStorage.setItem('accessToken', value), tokens.reader);
      let mode = 'normal', held = false, heldError;
      const ready = deferred(), release = deferred(), handled = deferred(); releases.push(release);
      await context.route('**/*', async route => {
        const req = route.request(), url = new URL(req.url());
        if (['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) { await route.abort(); return; }
        const entry = { viewport: viewport.width, method: req.method(), path: url.pathname + url.search, allowed: url.origin === adminOrigin && req.method() === 'GET' };
        network.push(entry); if (!entry.allowed) { forbidden.push(entry); await route.abort(); return; }
        if (url.pathname === tracePath && mode === 'fail500') {
          entry.syntheticTransport500 = true;
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'SYNTHETIC_TRACE_TRANSPORT_500' } }) }); return;
        }
        if (url.pathname === tracePath && mode === 'hold' && !held) {
          held = true;
          try {
            const response = await route.fetch({ timeout: 10000 }); assert.equal(response.status(), 200);
            entry.heldBodySha256 = hash(await response.text()); ready.resolve();
            await bounded(release.promise, 'old scope release');
            // The browser aborted this old-scope read; route completion may
            // legitimately reject, but only after the explicit cancellation.
            try { await route.fulfill({ response }); } catch { entry.cancelledFulfill = true; }
          } catch { heldError = new Error('Authentic held trace response failed'); ready.resolve(); }
          finally { handled.resolve(); }
          return;
        }
        await route.continue();
      });
      const page = await context.newPage();
      page.on('response', response => {
        const url = new URL(response.url()); if (url.origin !== adminOrigin || !url.pathname.startsWith('/api/')) return;
        const task = (async () => {
          const bytes = await response.body(), body = JSON.parse(bytes.toString());
          if (url.pathname === tracePath && response.status() === 200) {
            assert.equal(body.data.id, ids.batchA); assert.equal(body.data.tenantId, tenantId);
            assert.equal(body.data._count.saleAllocations, 132);
            assert.deepEqual(body.data.saleAllocations.map(row => row.id), expectedRows.map(row => row.id));
            assert.deepEqual(body.data.receiptMovements.map(row => row.id), [expectedReceipt.id]);
            for (let i = 0; i < 100; i++) {
              assert.equal(body.data.saleAllocations[i].createdAt, expectedRows[i].createdAt.toISOString());
              assert.equal(body.data.saleAllocations[i].quantity, expectedRows[i].quantity);
            }
          }
          responses.push({ viewport: viewport.width, path: url.pathname + url.search, status: response.status(), sha256: hash(bytes.toString()), body });
        })();
        settled.push(task.then(() => true, () => false));
      });
      const table = page.getByRole('region', { name: '商品批次清單', exact: true });
      const opener = () => table.getByRole('button', { name: '查看批次 TRACE-NATIVE-A 的來源與售出分攤', exact: true });
      const dialog = () => page.getByRole('dialog');
      async function aLoaded() { await expect(opener()).toBeEnabled(); await expect(page).toHaveURL(new RegExp(`productId=${ids.a}`)); }
      async function traced() {
        await expect(dialog()).toContainText('顯示 100 / 132 筆分攤');
        await expect(dialog()).toContainText('僅顯示最近 100 筆');
        const sales = dialog().getByRole('region', { name: '已連結售出分攤', exact: true });
        const lines = await sales.locator('li').allTextContents(); assert.equal(lines.length, 100);
        for (let i = 0; i < lines.length; i++) {
          assert.ok(lines[i].includes(expectedRows[i].orderId)); assert.ok(lines[i].includes(expectedRows[i].orderItemId)); assert.ok(lines[i].includes(expectedRows[i].movementId)); assert.ok(lines[i].includes('本批實扣數量 1'));
          const dates = await page.evaluate(({ created, expiry }) => ({ stamp: new Date(created).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }), expiry: new Date(expiry).toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei' }) }), { created: expectedRows[i].createdAt.toISOString(), expiry: expectedRows[i].expiryDateAtSale.toISOString() });
          assert.ok(lines[i].includes(dates.stamp)); assert.ok(lines[i].includes(`出庫時效期 ${dates.expiry}`));
        }
        await expect(dialog()).toContainText(`未編號（${expectedRows[0].orderId}）`);
        await expect(dialog()).toContainText(expectedRows[1].order.orderNumber);
        await expect(dialog()).toContainText(`進貨紀錄：${ids.receipt}`); await expect(dialog()).toContainText('實收數量 264');
        await expect(dialog()).not.toContainText('TRACE-FOREIGN');
      }
      try {
        stage = `catalog and pagination ${viewport.width}`;
        await page.goto(`${adminOrigin}/inventory?page=1`);
        await expect(page.getByRole('button', { name: `查看 ${names.a} 的批次`, exact: true })).toBeEnabled();
        await page.getByRole('button', { name: 'Next page', exact: true }).click(); await expect(page).toHaveURL(/page=2/);
        await expect(page.getByText(/Page 2 of/)).toBeVisible();
        await expect(page.getByRole('button', { name: `查看 ${names.a} 的批次`, exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Previous page', exact: true }).click();
        await expect(page).toHaveURL(/page=1/);
        await expect(page.getByRole('button', { name: `查看 ${names.a} 的批次`, exact: true })).toBeEnabled();
        await page.getByRole('combobox', { name: 'Inventory filter', exact: true }).selectOption('true');
        await expect(page.getByRole('button', { name: `查看 ${names.b} 的批次`, exact: true })).toBeEnabled();
        await expect(page.getByRole('button', { name: `查看 ${names.a} 的批次`, exact: true })).toHaveCount(0);
        await page.getByRole('combobox', { name: 'Inventory filter', exact: true }).selectOption('');
        stage = `product scoped keyboard geometry ${viewport.width}`;
        await page.getByRole('button', { name: `查看 ${names.a} 的批次`, exact: true }).click(); await aLoaded();
        await expect(table.getByRole('row')).toHaveCount(4);
        await table.focus(); await expect(table).toBeFocused();
        const quantities = table.getByRole('row').filter({ hasText: 'TRACE-NEGATIVE' }).getByRole('cell').nth(3);
        await expect(quantities).toContainText('-2');
        const quantityVisible = async () => { const q = await quantities.boundingBox(), region = await table.boundingBox(); return !!q && !!region && q.x >= region.x - 1 && q.x + q.width <= region.x + region.width + 1; };
        // Actual key presses expose this non-interactive right-hand cell; no
        // DOM scrollLeft assignment, CSS zoom or force click substitutes.
        for (let key = 0; key < 40 && !await quantityVisible(); key++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(30); }
        assert.equal(await quantityVisible(), true, 'Signed quantity must be visible after native keyboard scroll');
        await capture(page, `admin-trace-batch-quantity-${viewport.width}.png`, viewport);
        await page.keyboard.press('Tab'); await expect(opener()).toBeFocused();
        const geometry = await opener().evaluate(el => { const r = el.getBoundingClientRect(), region = el.closest('[role=region]').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, region: { x: region.x, right: region.right }, pageWidth: document.documentElement.scrollWidth, viewport: innerWidth, color: getComputedStyle(el).outlineColor, outline: getComputedStyle(el).outlineWidth }; });
        assert.ok(geometry.x >= geometry.region.x - 1 && geometry.x + geometry.width <= geometry.region.right + 1);
        assert.ok(Number.parseFloat(geometry.outline) >= 3); assert.notEqual(geometry.color, 'rgba(0, 0, 0, 0)');
        assert.ok(geometry.width >= 44 && geometry.height >= 44); assert.ok(geometry.pageWidth <= geometry.viewport);
        await capture(page, `admin-trace-batch-right-${viewport.width}.png`, viewport);
        stage = `trace API and DB rows ${viewport.width}`;
        await page.keyboard.press('Enter'); await traced();
        await expect(dialog().getByRole('heading', { level: 2 })).toBeFocused();
        await capture(page, `admin-trace-source-${viewport.width}.png`, viewport);
        await page.keyboard.press('Shift+Tab'); await expect(dialog().getByRole('button', { name: '重新載入來源' })).toBeFocused();
        await page.keyboard.press('Tab'); await expect(dialog().getByRole('button', { name: '關閉來源明細' })).toBeFocused();
        await page.keyboard.press('Escape'); await expect(dialog()).toHaveCount(0); await expect(opener()).toBeFocused();
        await page.goBack(); await expect(page).toHaveURL(/page=1$/);
        await page.goForward(); await aLoaded(); await page.reload(); await aLoaded();
        stage = `cancel and late scope ${viewport.width}`;
        mode = 'hold'; await opener().click(); await bounded(ready.promise, 'authentic old-scope body'); if (heldError) throw heldError;
        await expect(dialog().getByRole('status')).toContainText('正在載入');
        const aborted = page.waitForEvent('requestfailed', req => new URL(req.url()).pathname === tracePath);
        await page.keyboard.press('Escape'); assert.match((await bounded(aborted, 'aborted request')).failure().errorText, /ABORTED/);
        await page.getByRole('button', { name: '返回商品清單', exact: true }).click();
        await page.getByRole('button', { name: `查看 ${names.b} 的批次`, exact: true }).click();
        await table.getByRole('button', { name: '查看批次 TRACE-NATIVE-B 的來源與售出分攤' }).click();
        await expect(dialog()).toContainText('顯示 0 / 0 筆分攤');
        mode = 'normal'; release.resolve(); await bounded(handled.promise, 'old scope settled'); if (heldError) throw heldError;
        await expect(dialog()).not.toContainText(ids.receipt); await expect(dialog()).not.toContainText('顯示 100 / 132');
        await page.keyboard.press('Escape');
        if (viewport.width === 390) {
          stage = 'HTTP error and role boundary 390';
          await page.getByRole('button', { name: '返回商品清單', exact: true }).click();
          await page.getByRole('button', { name: `查看 ${names.a} 的批次`, exact: true }).click(); await opener().click(); await traced();
          mode = 'fail500'; await dialog().getByRole('button', { name: '重新載入來源' }).click();
          await expect(dialog().getByRole('alert')).toContainText('讀取失敗不代表沒有歷史紀錄'); await expect(dialog()).not.toContainText(ids.receipt);
          mode = 'normal'; await dialog().getByRole('button', { name: '重新載入來源' }).click(); await traced(); injectedTransport500Recovered = true;
          await page.evaluate(value => localStorage.setItem('accessToken', value), tokens.denied);
          const denied = page.waitForResponse(r => new URL(r.url()).pathname === tracePath && r.status() === 403);
          await dialog().getByRole('button', { name: '重新載入來源' }).click(); realStatuses.deniedRole = (await denied).status();
          await expect(dialog().getByRole('alert')).toContainText('權限不足'); await expect(dialog()).not.toContainText(ids.receipt);
          await capture(page, 'admin-trace-denied-390.png', viewport);
          await page.evaluate(value => localStorage.setItem('accessToken', value), tokens.reader);
          await dialog().getByRole('button', { name: '重新載入來源' }).click(); await traced();
          await page.evaluate(value => localStorage.setItem('accessToken', value), tokens.foreignReader);
          const foreignDenied = page.waitForResponse(r => new URL(r.url()).pathname === tracePath && r.status() === 404);
          await dialog().getByRole('button', { name: '重新載入來源' }).click(); realStatuses.crossTenantTrace = (await foreignDenied).status();
          await expect(dialog().getByRole('alert')).toContainText('找不到此批次或無法存取'); await expect(dialog()).not.toContainText(ids.receipt);
          await capture(page, 'admin-trace-cross-tenant-390.png', viewport);
          await page.evaluate(value => localStorage.setItem('accessToken', value), tokens.reader);
          await dialog().getByRole('button', { name: '重新載入來源' }).click(); await traced();
          const negatives = await page.evaluate(async ({ origin, foreign, tenant, missing }) => {
            const foreignResponse = await fetch(`${origin}/api/v1/admin/product-batches/${foreign}`, { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } });
            const missingResponse = await fetch(`${origin}/api/v1/admin/product-batches/${missing}`, { headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` } });
            const unauthenticated = await fetch(`${origin}/api/v1/admin/product-batches/${foreign}`, { headers: { 'x-tenant-id': tenant } });
            return { foreignBatch: foreignResponse.status, unauthenticated: unauthenticated.status, missingBatch: missingResponse.status, missingBody: await missingResponse.json(), foreignBody: await foreignResponse.json(), unauthenticatedBody: await unauthenticated.json() };
          }, { origin: adminOrigin, foreign: ids.foreignBatch, tenant: tenantId, missing: randomUUID() });
          assert.equal(negatives.foreignBatch, 404); assert.equal(negatives.unauthenticated, 401); assert.equal(negatives.missingBatch, 404);
          realStatuses.foreignBatch = negatives.foreignBatch; realStatuses.unauthenticated = negatives.unauthenticated; realStatuses.missingBatch = negatives.missingBatch;
          write('admin-trace-negative-http.json', negatives);
        }
        cases.push({ viewport, status: 'passed', totalAllocations: 132, shownAllocations: 100, exactOrderedRows: true, nullAndNumberedOrders: true, receiptLinked: true, keyboardQuantityRevealed: true, keyboardTraceOpened: true, focusRestored: true, lateScopeSuppressed: true, backForwardReload: true, paginationPreserved: true, geometry });
      } finally { release.resolve(); if (held) await bounded(handled.promise, 'held cleanup'); await context.close(); }
    }
    assert.ok((await Promise.all(settled)).every(Boolean), 'API evidence body capture failed');
    after = await snapshot(); write('admin-trace-after.json', after);
    assert.equal(isDeepStrictEqual(before, after), true, 'Read-only trace changed persisted tables');
  } catch { failure = `Admin trace native acceptance failed at ${stage}`; }
  finally {
    releases.forEach(item => item.resolve());
    for (const context of contexts) await context.close().catch(() => {});
    if (started) {
      try {
        const remaining = await cleanupTraceFixture(db, ids, tenantId);
        write('admin-trace-fixture-cleanup.json', { status: 'passed', remaining }); fixtureCleaned = true;
      } catch {
        failure = 'Admin trace fixture cleanup failed'; fixtureCleaned = false;
        write('admin-trace-fixture-cleanup.json', { status: 'failed' });
      }
    }
  }
  const result = { nonce, status: failure ? 'failed' : 'passed', failure, cases, network, forbidden, realStatuses, databaseGrantLookup: true, injectedTransport500Recovered,
    readOnlySnapshotEqual: !!before && !!after && isDeepStrictEqual(before, after), beforeSha256: before ? hash(before) : null, afterSha256: after ? hash(after) : null, rawSnapshotTables: before ? Object.keys(before).length : 0, fixtureCleaned,
    scope: 'Built Admin actual entry -> unchanged real GET/JWT/DB-role middleware -> owned synthetic PG; no login UI, physical devices, native zoom or writes accepted' };
  write('admin-trace-responses.json', responses); write('admin-trace-native.json', result);
  assertTraceNativeAcceptance(result); return result;
}
