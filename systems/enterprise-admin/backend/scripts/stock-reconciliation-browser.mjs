// Called only after the existing package runner proves exact-head, owned PG15,
// loopback servers and sandboxed Chrome. No new server, dependency or device.
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createTraceRequestHold } from './admin-trace-native.mjs';

const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');


// Reuse the exact-request hold already exercised by the trace journey. A real
// aborted StrictMode probe cannot stand in for, release, or replay its live replacement.
export function assertReconciliationHold(rows) {
  assert.ok(Array.isArray(rows) && rows.length > 0);
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  assert.ok(rows.some(row => row.ready && row.settled && row.fulfilled && !row.aborted), 'A live initial read must actually be delivered');
  for (const row of rows) {
    assert.ok(Number.isSafeInteger(row.id) && row.id > 0);
    assert.equal(row.ready, true); assert.equal(row.settled, true);
    assert.equal(row.fulfilled, !row.aborted, 'Never replay a browser-aborted read');
  }
}
export async function finishReconciliationContext({ hold, page, context, settleResponses, write, primaryError }) {
  let cleanupError;
  hold.release();
  try { await hold.settle(); } catch (error) { cleanupError = error; }
  try { await settleResponses(); } catch (error) { cleanupError ??= error; }
  try { write(hold.receipt()); } catch (error) { cleanupError ??= error; }
  page.off('requestfailed', hold.aborted);
  try { await context.close(); } catch (error) { cleanupError ??= error; }
  if (!primaryError && cleanupError) throw cleanupError;
}

// Synthetic fixture geometry only; not a maximum-height guarantee for arbitrary product names.
export function assertReconciliationGeometry(value) {
  assert.ok(value.tableWidth >= 1040, 'Reconciliation columns must retain readable width');
  assert.equal(value.cellWidths.length, 6, 'All six report columns must remain present');
  assert.ok(value.cellWidths.every(width => width >= 100), 'Report columns must not collapse');
  assert.ok(value.firstRowHeight <= 180, 'Synthetic reconciliation row must remain compact');
  assert.ok(value.cellFontSizes.every(size => size >= 14), 'Do not shrink report text to fit');
}

export async function runStockReconciliationJourney({ db, tenantId, browser, adminOrigin, token, signAccessToken, output, expect, capture }) {
  const origin = new URL(adminOrigin);
  assert.equal(origin.protocol, 'http:'); assert.equal(origin.hostname, '127.0.0.1');
  const reportPath = '/api/v1/admin/inventory/stock-reconciliation';
  const batchesPath = '/api/v1/admin/product-batches';
  const productId = randomUUID(), deniedUserId = randomUUID(), deniedRoleId = randomUUID();
  const productName = '0 合成庫存對帳商品', productSku = 'RECON-BROWSER-ONLY';
  const cases = [], network = [], forbidden = [], responseTasks = [];
  let failure, before, after, deniedToken, fixtureCleaned = false;
  async function snapshot() {
    const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
    const result = {};
    for (const { tablename } of tables) {
      assert.match(tablename, /^[a-z_]+$/);
      // Table names are engine-listed, validated identifiers, never user input.
      result[tablename] = (await db.$queryRawUnsafe(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb) AS rows FROM public."${tablename}" t`))[0].rows;
    }
    return result;
  }
  try {
    await db.product.create({ data: { id: productId, tenantId, sku: productSku, name: productName, costPrice: 1, retailPrice: 2, stockQuantity: 9 } });
    for (const [batchNumber, status, quantity, expiryDate] of [
      ['RECON-FUTURE', 'RELEASED', 1, '2099-01-01'],
      ['RECON-EXPIRED', 'RELEASED', 1, '2000-01-01'],
      ['RECON-QUARANTINE', 'QUARANTINE', 4, '2099-01-01'],
      // Pre-existing inconsistent ledger fixture, not a receipt/write command.
      ['RECON-NEGATIVE', 'BLOCKED', -2, '2099-01-01'],
      ['RECON-ZERO', 'RELEASED', 0, '2099-01-01'],
    ]) await db.productBatch.create({ data: { productId, tenantId, batchNumber, status, quantity, expiryDate: new Date(expiryDate), costPrice: 1 } });
    await db.inventoryTransaction.create({ data: { tenantId, productId, type: 'IN', quantity: 9, notes: 'Synthetic untraced receipt for readonly acceptance' } });
    // Persisted synthetic actor/role with no grants. The JWT permissions=[]
    // fast path enforces this HTTP denial; this is not a role-grant lookup test.
    await db.user.create({ data: { id: deniedUserId, tenantId, email: `${deniedUserId}@reconciliation.example.test`, fullName: '合成無讀取權限人員', passwordHash: 'not-a-login-hash' } });
    await db.role.create({ data: { id: deniedRoleId, tenantId, name: 'Synthetic reconciliation denied role' } });
    await db.userRole.create({ data: { userId: deniedUserId, roleId: deniedRoleId } });
    const deniedPermissions = await db.rolePermission.findMany({ where: { roleId: deniedRoleId } });
    assert.equal(deniedPermissions.length, 0);
    deniedToken = signAccessToken({ userId: deniedUserId, email: `${deniedUserId}@reconciliation.example.test`, tenantId, plan: 'pro', permissions: [] });
    before = await snapshot();
    const productRows = before.products.filter(row => row.tenant_id === tenantId);
    assert.ok(productRows.length > 100, 'Reuse existing multi-page fixture');
    for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport });
      let mode = 'hold', journeyError;
      const hold = createTraceRequestHold({ origin: adminOrigin, pathname: reportPath });
      const pendingResponses = [];
      await context.addInitScript(value => localStorage.setItem('accessToken', value), token);
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        const local = url.origin === adminOrigin;
        if (!local && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) { await route.abort(); return; }
        const allowed = local && request.method() === 'GET';
        const entry = { viewport: viewport.width, method: request.method(), path: url.pathname + url.search, allowed };
        network.push(entry);
        if (!allowed) { forbidden.push(entry); await route.abort(); return; }
        if ((url.pathname === reportPath && mode === 'fail500') || (url.pathname === batchesPath && mode === 'failBatch500')) {
          entry.syntheticTransportFailure = true;
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'SYNTHETIC_TRANSPORT_FAILURE', message: 'Controlled browser transport failure, not production server failure' } }) });
          return;
        }
        if (mode === 'hold' && hold.matches(request)) { await hold.capture(route, entry); return; }
        await route.continue();
      });
      const page = await context.newPage();
      page.on('requestfailed', hold.aborted);
      page.on('response', response => {
        const url = new URL(response.url());
        if (url.origin !== adminOrigin || ![reportPath, batchesPath].includes(url.pathname)) return;
        const task = (async () => {
          const body = await response.text();
          pendingResponses.push({ viewport: viewport.width, path: url.pathname + url.search, status: response.status(), bodyHash: hash(body), injected: body.includes('SYNTHETIC_TRANSPORT_FAILURE') });
        })();
        // Observe rejection immediately; rethrow on the explicit settlement gate.
        responseTasks.push(task.then(() => ({ ok: true }), error => ({ ok: false, message: error.message })));
      });
      const table = page.getByRole('region', { name: '庫存對帳表', exact: true });
      const target = table.getByRole('row').filter({ hasText: productSku });
      async function loaded() {
        await expect(target).toBeVisible();
        await expect(target.getByRole('cell').nth(1)).toHaveText('9');
        await expect(target.getByRole('cell').nth(2)).toHaveText('4');
        await expect(target).toContainText('需核對：5');
        await expect(target).toContainText('可出庫候選 1');
        await expect(target).toContainText('保留量／可承諾量：未知');
        await expect(target).toContainText('1 筆進貨未能追溯批次');
        await expect(target).toContainText('1 個批次為負數，需核對');
        await expect(page.getByRole('alert')).toHaveCount(0);
      }
      try {
        await page.goto(`${adminOrigin}/inventory/reconciliation`);
        await expect.poll(() => { hold.assertHealthy(); return hold.activeRequests().size; }, { timeout: 10000 }).toBeGreaterThan(0);
        await expect(page.getByRole('status').filter({ hasText: '庫存對帳載入中' })).toBeVisible();
        await expect(table).toHaveCount(0);
        mode = 'normal'; hold.release(); await hold.settle(); assertReconciliationHold(hold.receipt());
        await loaded();
        await expect(table.getByRole('row')).toHaveCount(51); // 50 data rows plus header.
        const next = page.getByRole('button', { name: '下一頁', exact: true });
        await next.focus(); await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/page=2$/); await expect(target).toHaveCount(0);
        await expect(table.getByRole('row')).toHaveCount(51);
        await page.getByRole('button', { name: '上一頁', exact: true }).click();
        await expect(page).toHaveURL(/page=1$/); await loaded();
        const readableGeometry = await target.evaluate(row => ({
          tableWidth: row.closest('table').getBoundingClientRect().width,
          cellWidths: [...row.cells].map(cell => cell.getBoundingClientRect().width),
          firstRowHeight: row.getBoundingClientRect().height,
          cellFontSizes: [...row.cells].map(cell => parseFloat(getComputedStyle(cell).fontSize)),
        }));
        assertReconciliationGeometry(readableGeometry);
        const link = target.getByRole('link', { name: `查看 ${productName} 的批次`, exact: true });
        let keyboardHorizontalScroll = null;
        if (viewport.width === 390) {
          await table.focus(); await expect(table).toBeFocused();
          const beforeScroll = await table.evaluate(element => element.scrollLeft);
          await page.keyboard.press('ArrowRight');
          await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBeGreaterThan(beforeScroll);
          const afterArrow = await table.evaluate(element => element.scrollLeft);
          await page.keyboard.press('Tab'); await expect(link).toBeFocused();
          await expect.poll(async () => {
            const region = await table.boundingBox(); const box = await link.boundingBox();
            return !!region && !!box && box.x >= region.x - 1 && box.x + box.width <= region.x + region.width + 1;
          }).toBe(true);
          keyboardHorizontalScroll = { beforeScroll, afterArrow, traceLinkRevealedByTab: true };
          await capture(page, 'reconciliation-keyboard-trace-390.png', viewport);
        } else { await link.focus(); }
        await page.keyboard.press('Enter');
        await expect(page.getByRole('heading', { name: '商品批次', exact: true })).toBeFocused();
        const batchTable = page.getByRole('region', { name: '商品批次清單', exact: true });
        async function traced() {
          await expect(batchTable.getByRole('row')).toHaveCount(6);
          const negative = batchTable.getByRole('row').filter({ hasText: 'RECON-NEGATIVE' });
          await expect(negative.getByRole('cell').nth(3)).toContainText('-2');
          await expect(negative).toContainText('負數帳量，需核對');
          await expect(batchTable.getByRole('row').filter({ hasText: 'RECON-ZERO' }).getByRole('cell').nth(3)).toHaveText('0');
          await expect(page.getByRole('alert')).toContainText('1 個批次帳量為負數');
          await expect(page).toHaveURL(new RegExp(`productId=${productId}$`));
        }
        await traced();
        await capture(page, `reconciliation-negative-batch-${viewport.width}.png`, viewport);
        mode = 'failBatch500'; await page.reload();
        await expect(page.getByRole('alert')).toContainText('讀取失敗不代表沒有批次');
        await expect(batchTable).toHaveCount(0);
        mode = 'normal'; await page.getByRole('button', { name: '重新載入商品批次', exact: true }).click();
        await traced();
        await expect(page.getByText('RECON-QUARANTINE', { exact: true })).toBeVisible();
        await page.goBack(); await loaded(); await expect(page).toHaveURL(/reconciliation\?page=1$/);
        await page.goForward(); await traced();
        await page.reload(); await traced();
        await page.goBack(); await loaded();

        mode = 'fail500';
        await page.getByRole('button', { name: '更新本頁對帳', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText('可能已過期');
        await expect(target).toBeVisible();
        await capture(page, `reconciliation-stale-${viewport.width}.png`, viewport);
        mode = 'normal'; await page.getByRole('button', { name: '重試庫存對帳', exact: true }).click(); await loaded();
        mode = 'fail500'; await page.reload();
        await expect(page.getByRole('alert')).toContainText('資料尚不可用'); await expect(table).toHaveCount(0);
        mode = 'normal'; await page.getByRole('button', { name: '重試庫存對帳', exact: true }).click(); await loaded();

        // Switch only browser-held synthetic access token. The signed-in UI
        // cache stays populated so real server denial must hide retained rows.
        // The denied actor/role already existed before the no-write snapshot.
        await page.evaluate(value => localStorage.setItem('accessToken', value), deniedToken);
        const deniedResponse = page.waitForResponse(response => new URL(response.url()).pathname === reportPath && response.status() === 403);
        await page.getByRole('button', { name: '更新本頁對帳', exact: true }).click();
        assert.equal((await deniedResponse).status(), 403);
        await expect(page.getByRole('alert')).toContainText('存取被拒絕'); await expect(table).toHaveCount(0);
        await capture(page, `reconciliation-denied-${viewport.width}.png`, viewport);
        await page.evaluate(value => localStorage.setItem('accessToken', value), token);
        await page.getByRole('button', { name: '重試庫存對帳', exact: true }).click(); await loaded();
        await table.focus(); await expect(table).toBeFocused();
        const geometry = await table.boundingBox();
        assert.ok(geometry && geometry.x >= 0 && geometry.x + geometry.width <= viewport.width + 1, 'Table scroll region must remain within viewport');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No whole-page horizontal overflow');
        await capture(page, `reconciliation-ready-${viewport.width}.png`, viewport);
        cases.push({ viewport, status: 'passed', loadingRealResponseHeld: true, initialHeldRequests: hold.receipt(), pageSizes: [50, 50], keyboardPagination: true,
          traceBatchRows: 5, signedBatchQuantity: -2, zeroBatchQuantity: 0, negativeWarning: true, batch500Recovery: true, forwardAndReloadTrace: true, traceScope: 'heading focus, signed/zero quantities, warning and quarantine; no full trace-table narrow-layout acceptance', backNavigation: true, injected500InitialAndStaleRecovery: true, realDeniedTokenHttp: 403, permissionSource: 'signed JWT permissions=[] fast path; not role-grant lookup',
          deniedCacheHidden: true, retryRecovered: true, geometry, readableGeometry, keyboardHorizontalScroll, nativeTouchAndSoftwareKeyboard: 'NOT_RUN' });
      } catch (error) {
        journeyError = error;
        // Capture before close; diagnostics may never replace the original failure.
        try { await capture(page, `reconciliation-failed-${viewport.width}.png`, viewport); }
        catch { network.push({ viewport: viewport.width, diagnosticCaptureFailed: true }); }
        throw error;
      } finally {
        await finishReconciliationContext({ hold, page, context, primaryError: journeyError,
          settleResponses: async () => {
            const settled = await Promise.all(responseTasks);
            network.push(...pendingResponses);
            assert.ok(settled.every(row => row.ok), 'Reconciliation response body did not settle');
          },
          write: requests => fs.writeFileSync(path.join(output, `reconciliation-held-${viewport.width}.json`), JSON.stringify({ requests }) + '\n', { flag: 'wx' }),
        });
      }
    }
    const responses = await Promise.all(responseTasks);
    assert.ok(responses.every(row => row.ok), JSON.stringify(responses.filter(row => !row.ok)));
    after = await snapshot(); assert.equal(isDeepStrictEqual(after, before), true, 'Persisted business snapshot changed during read-only browser actions');
    assert.equal(forbidden.length, 0); assert.equal(cases.length, 2);
  } catch (error) { failure = error; }
  finally {
    // Exact generated fixture identities only; no updates to existing products,
    // packages, permissions or main runner fixtures.
    await db.inventoryTransaction.deleteMany({ where: { tenantId, productId } });
    await db.productBatch.deleteMany({ where: { tenantId, productId } });
    await db.product.deleteMany({ where: { tenantId, id: productId } });
    await db.userRole.deleteMany({ where: { userId: deniedUserId, roleId: deniedRoleId } });
    await db.role.deleteMany({ where: { tenantId, id: deniedRoleId } });
    await db.user.deleteMany({ where: { tenantId, id: deniedUserId } });
    fixtureCleaned = true;
    // Never serialize tokens, request headers, browser storage, traces or HTML.
    const evidence = JSON.stringify({ status: failure ? 'failed' : 'passed', cases, network, forbidden,
      beforeHash: before ? hash(before) : null, afterHash: after ? hash(after) : null,
      tables: before ? Object.keys(before) : [], rowsUnchanged: !!before && !!after && hash(before) === hash(after),
      failure: failure ? { name: failure.name, message: failure.message } : null });
    for (const secret of [token, deniedToken].filter(Boolean)) assert.equal(evidence.includes(secret), false);
    fs.writeFileSync(path.join(output, 'stock-reconciliation.json'), evidence + '\n', { flag: 'wx' });
    fs.writeFileSync(path.join(output, 'stock-reconciliation-cleanup.json'), JSON.stringify({ fixtureCleaned, status: failure ? 'failed' : 'passed', cases,
      failure: failure ? { name: failure.name, message: failure.message } : null }) + '\n', { flag: 'wx' });
  }
  if (failure) throw failure;
  return { status: 'passed', cases: cases.length, rowsUnchanged: true, fixtureCleaned };
}
