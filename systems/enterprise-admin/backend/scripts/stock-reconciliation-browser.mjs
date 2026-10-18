// Called only after the existing package runner proves exact-head, owned PG15,
// loopback servers and sandboxed Chrome. No new server, dependency or device.
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function bounded(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Reconciliation timeout: ${label}`)), 10000);
  })]); } finally { clearTimeout(timer); }
}
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

export async function runStockReconciliationJourney({ db, tenantId, browser, adminOrigin, token, signAccessToken, output, expect, capture }) {
  const origin = new URL(adminOrigin);
  assert.equal(origin.protocol, 'http:'); assert.equal(origin.hostname, '127.0.0.1');
  const reportPath = '/api/v1/admin/inventory/stock-reconciliation';
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
      ['RECON-QUARANTINE', 'QUARANTINE', 2, '2099-01-01'],
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
      let mode = 'hold', held = false, routeError;
      const ready = deferred(), release = deferred(), handled = deferred();
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
        if (url.pathname === reportPath && mode === 'fail500') {
          entry.syntheticTransportFailure = true;
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'SYNTHETIC_TRANSPORT_FAILURE', message: 'Controlled browser transport failure, not production server failure' } }) });
          return;
        }
        if (url.pathname === reportPath && mode === 'hold' && !held) {
          held = true;
          try {
            const response = await route.fetch({ timeout: 10000 });
            assert.equal(response.status(), 200);
            entry.authenticHeldResponse = { status: response.status(), bodyHash: hash(await response.text()) };
            ready.resolve(); await bounded(release.promise, 'release initial response');
            await route.fulfill({ response });
          } catch (error) { routeError = error; ready.resolve(); }
          finally { handled.resolve(); }
          return;
        }
        await route.continue();
      });
      const page = await context.newPage();
      page.on('response', response => {
        const url = new URL(response.url());
        if (url.origin !== adminOrigin || url.pathname !== reportPath) return;
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
        await expect(page.getByRole('alert')).toHaveCount(0);
      }
      try {
        await page.goto(`${adminOrigin}/inventory/reconciliation`);
        await bounded(ready.promise, 'initial real API response'); if (routeError) throw routeError;
        await expect(page.getByRole('status').filter({ hasText: '庫存對帳載入中' })).toBeVisible();
        await expect(table).toHaveCount(0);
        mode = 'normal'; release.resolve(); await bounded(handled.promise, 'initial response delivered'); if (routeError) throw routeError;
        await loaded();
        await expect(table.getByRole('row')).toHaveCount(51); // 50 data rows plus header.
        const next = page.getByRole('button', { name: '下一頁', exact: true });
        await next.focus(); await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/page=2$/); await expect(target).toHaveCount(0);
        await expect(table.getByRole('row')).toHaveCount(51);
        await page.getByRole('button', { name: '上一頁', exact: true }).click();
        await expect(page).toHaveURL(/page=1$/); await loaded();
        const link = target.getByRole('link', { name: `查看 ${productName} 的批次`, exact: true });
        await link.focus(); await page.keyboard.press('Enter');
        await expect(page.getByRole('heading', { name: '商品批次', exact: true })).toBeFocused();
        await expect(page.getByRole('region', { name: '商品批次清單', exact: true }).getByRole('row')).toHaveCount(4);
        await expect(page.getByText('RECON-QUARANTINE', { exact: true })).toBeVisible();
        await page.goBack(); await loaded(); await expect(page).toHaveURL(/reconciliation\?page=1$/);

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
        cases.push({ viewport, status: 'passed', loadingRealResponseHeld: true, pageSizes: [50, 50], keyboardPagination: true,
          traceBatchRows: 3, traceScope: 'heading focus, row count and quarantine text only; no full trace-table narrow-layout acceptance', backNavigation: true, injected500InitialAndStaleRecovery: true, realDeniedTokenHttp: 403, permissionSource: 'signed JWT permissions=[] fast path; not role-grant lookup',
          deniedCacheHidden: true, retryRecovered: true, geometry, nativeTouchAndSoftwareKeyboard: 'NOT_RUN' });
      } finally {
        release.resolve();
        if (held) await bounded(handled.promise, 'held response cleanup');
        const settled = await Promise.all(responseTasks);
        await context.close();
        network.push(...pendingResponses);
        assert.ok(settled.every(row => row.ok), JSON.stringify(settled.filter(row => !row.ok)));
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
