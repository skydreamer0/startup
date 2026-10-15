// GitHub-hosted, synthetic-only built Admin/POS -> production HTTP API -> PG15.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertOwnership, assertService, assertZeroRows, databaseName, databaseUrl } from './pos-product-lookup-ci.mjs';
import { createRunScope, cleanupRunProcesses } from '../../pos-ui/e2e/category-native/owned-run.mjs';

const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const system = path.resolve(backend, '..'), root = path.resolve(system, '../..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000 }).trim();
const env = process.env;
assert.equal(env.GITHUB_ACTIONS, 'true'); assert.equal(env.RUNNER_ENVIRONMENT, 'github-hosted');
assert.match(process.version, /^v22\./); assert.equal(env.DATABASE_URL, databaseUrl);
assert.equal(env.POS_PRODUCT_LOOKUP_DATABASE_URL, databaseUrl); assert.equal(env.PACKAGE_LOOKUP_DATABASE_URL, databaseUrl);
assert.equal(env.PACKAGE_LOOKUP_ALLOW_SYNTHETIC, '1'); assert.equal(env.NODE_ENV, 'test');
assert.equal(git('rev-parse', 'HEAD'), env.SKU_QA_HEAD); assert.equal(git('status', '--porcelain'), '');
assert.match(env.GITHUB_RUN_ID ?? '', /^\d+$/); assert.match(env.GITHUB_RUN_ATTEMPT ?? '', /^\d+$/);
assert.ok(env.RUNNER_TEMP);
for (const directory of ['backend', 'pos-ui', 'admin-ui']) {
  assert.equal(git('ls-files', '--others', '--ignored', '--exclude-standard', '--', `systems/enterprise-admin/${directory}/.env*`), '');
}
const container = env.SKU_QA_CONTAINER, network = env.SKU_QA_NETWORK;
assert.match(container ?? '', /^[a-f0-9]{64}$/); assert.match(network ?? '', /^github_network_[a-f0-9]+$/);
const info = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0];
const service = assertService(info, network, container);
const net = JSON.parse(execFileSync('docker', ['network', 'inspect', network], { encoding: 'utf8' }))[0];
assert.equal(net.Driver, 'bridge'); assert.deepEqual(Object.keys(net.Containers), [container]);
const identity = { head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), workflowSha: env.GITHUB_SHA,
  event: env.GITHUB_EVENT_NAME, runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
  service, database: databaseName, node: process.version };
const existing = path.join(env.RUNNER_TEMP, `sku-qa-${identity.runId}-${identity.attempt}`);
assertOwnership(JSON.parse(fs.readFileSync(path.join(existing, 'ownership.json'), 'utf8')), identity);
assert.equal(JSON.parse(fs.readFileSync(path.join(existing, 'tests.json'), 'utf8')).status, 'passed');
const output = path.join(env.RUNNER_TEMP, `package-native-${identity.runId}-${identity.attempt}`);
fs.mkdirSync(output, { recursive: false });
const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const nonce = randomUUID(), scope = await createRunScope(nonce);
const requireBackend = createRequire(path.join(backend, 'package.json'));
const requirePos = createRequire(path.join(system, 'pos-ui/package.json'));
const { PrismaClient } = requireBackend('@prisma/client');
const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
const { chromium, expect } = requirePos('@playwright/test');
const express = requireBackend('express');
const cases = [], networkLedger = [], forbidden = [], apiLedger = [];
const servers = [], contexts = [];
let browser, failure = null, cleanup, fixtureOwned = false;
const syntheticTenant = randomUUID();
async function counts() {
  const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
  return Object.fromEntries(await Promise.all(tables.map(async ({ tablename }) => {
    assert.match(tablename, /^[a-z_]+$/);
    return [tablename, Number((await db.$queryRawUnsafe(`SELECT count(*)::int AS n FROM "${tablename}"`))[0].n)];
  })));
}
async function business() {
  return { products: await db.product.findMany({ select: { id: true, stockQuantity: true, costPrice: true, retailPrice: true }, orderBy: { id: 'asc' } }),
    batches: await db.productBatch.count(), orders: await db.order.count(), payments: await db.orderPayment.count(), movements: await db.inventoryTransaction.count() };
}
try {
  const before = await counts(); assertZeroRows(before); write('before-counts.json', before);
  const dbIdentity = await db.$queryRaw`SELECT current_database() AS name, current_user AS username, version() AS version`;
  assert.equal(dbIdentity[0].name, databaseName); assert.equal(dbIdentity[0].username, 'test'); assert.match(dbIdentity[0].version, /^PostgreSQL 15\./);
  write('database-identity.json', dbIdentity);
  fixtureOwned = true;
  for (const name of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    assert.equal(env[name], 'package-browser-synthetic-key-never-real-credentials');
  }
  const realApp = requireBackend('./dist/app.js').default;
  const { signAccessToken } = requireBackend('./dist/lib/jwt.js');
  await db.tenant.create({ data: { id: syntheticTenant, slug: syntheticTenant, name: '合成包裝瀏覽器租戶', plan: 'pro' } });
  const user = await db.user.create({ data: { tenantId: syntheticTenant, email: `${syntheticTenant}@package.example.test`, fullName: '合成覆核收銀員', passwordHash: 'not-a-login-hash' } });
  const permissions = ['read:products', 'update:products', 'read:suppliers', 'manage:pos'];
  const role = await db.role.create({ data: { tenantId: syntheticTenant, name: 'Synthetic package reviewer' } });
  for (const permission of permissions) {
    const [action, resource] = permission.split(':');
    const created = await db.permission.create({ data: { action, resource, description: 'Synthetic package acceptance only' } });
    await db.rolePermission.create({ data: { roleId: role.id, permissionId: created.id } });
  }
  await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  await db.shift.create({ data: { tenantId: syntheticTenant, staffId: user.id, openingCash: 0 } });
  const product = await db.product.create({ data: { tenantId: syntheticTenant, sku: '000PKG', name: 'Z 合成商品規格', costPrice: 1, retailPrice: 2, stockQuantity: 300 } });
  await db.product.createMany({ data: Array.from({ length: 110 }, (_, index) => ({ tenantId: syntheticTenant, sku: `FUZZY-${index}`, name: `A 合成清單商品 ${index}`, costPrice: 1, retailPrice: 2 })) });
  const baseline = await business();
  const token = signAccessToken({ userId: user.id, email: user.email, tenantId: syntheticTenant, plan: 'pro', permissions });
  async function serve(directory) {
    const app = express();
    app.use((req, res, next) => {
      if (!req.path.startsWith('/api/')) return next();
      const started = Date.now();
      res.on('finish', () => apiLedger.push({ method: req.method, path: req.originalUrl, status: res.statusCode, elapsedMs: Date.now() - started }));
      return realApp(req, res, next);
    });
    app.use(express.static(directory)); app.get('/{*rest}', (_req, res) => res.sendFile(path.join(directory, 'index.html')));
    const server = app.listen(0, '127.0.0.1'); servers.push(server);
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    return `http://127.0.0.1:${server.address().port}`;
  }
  const adminOrigin = await serve(path.join(system, 'admin-ui/dist'));
  const posOrigin = await serve(path.join(system, 'pos-ui/dist'));
  browser = await chromium.launch({ channel: 'chrome', headless: true, chromiumSandbox: true,
    env: { PATH: env.PATH, HOME: env.HOME, TMPDIR: env.TMPDIR, CATEGORY_UI_NONCE: nonce } });
  for (const viewport of [{ width: 1366, height: 900 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }); contexts.push(context);
    await context.addInitScript(tokenValue => { localStorage.setItem('accessToken', tokenValue); localStorage.setItem('pos_accessToken', tokenValue); }, token);
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      const local = [adminOrigin, posOrigin].includes(url.origin);
      const api = url.pathname.startsWith('/api/');
      const mutation = req.method() === 'POST' && (/^\/api\/v1\/admin\/inventory\/products\/[^/]+\/packages(?:\/[^/]+\/(?:revisions|retire))?$/.test(url.pathname)
        || url.pathname === '/api/v1/admin/pos/packages/resolve');
      const allowed = local && (req.method() === 'GET' || (api && mutation));
      const entry = { viewport: viewport.width, method: req.method(), path: url.pathname + url.search, allowed, api };
      networkLedger.push(entry);
      // Bundled apps still contain historical external font stylesheets. No
      // network is allowed to those sources; installed Noto CJK supplies glyphs.
      if (!local && ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)) { await route.abort(); return; }
      if (!allowed) { forbidden.push(entry); await route.abort(); return; }
      await route.continue();
    });
    const admin = await context.newPage();
    const pos = await context.newPage();
    const prefix = `合成包裝 ${viewport.width}`, code = `00Case-${viewport.width} `;
    await admin.goto(`${adminOrigin}/inventory?page=3`);
    await admin.getByRole('button', { name: `維護 ${product.name} 的包裝對照`, exact: true }).click();
    const maintenance = admin.getByRole('dialog', { name: '商品／包裝對照', exact: true });
    await expect(maintenance.getByRole('heading', { name: new RegExp(product.name) })).toBeVisible();
    async function create(label, units) {
      await maintenance.getByRole('button', { name: '新增獨立包裝', exact: true }).click();
      await maintenance.getByLabel('包裝名稱', { exact: true }).fill(label);
      await maintenance.getByLabel('規格／劑型／內容量（供辨識差異）', { exact: true }).fill('合成規格／測試劑型／內容量；長中文核對文字'.repeat(3));
      const unit = maintenance.getByLabel('商品既有庫存計量單位', { exact: true });
      if (await unit.isEditable()) await unit.fill('合成庫存單位');
      await maintenance.getByLabel('權威資料來源／文件版本', { exact: true }).fill('合成覆核文件 v1');
      await maintenance.getByLabel('人工覆核原因', { exact: true }).fill('合成資料人工覆核');
      await maintenance.getByLabel('每包裝對應的庫存數量（未知請留空）', { exact: true }).fill(units === null ? '' : String(units));
      await maintenance.getByRole('textbox', { name: '識別碼 1', exact: true }).fill(code);
      await maintenance.getByRole('button', { name: '確認覆核並儲存新 revision', exact: true }).click();
      await expect(maintenance.getByText('已儲存。請核對更新後的包裝歷史。', { exact: true })).toBeVisible();
      await expect(maintenance.getByRole('button', { name: '新增獨立包裝', exact: true })).toBeEnabled();
    }
    await create(`${prefix} 盒`, 3); await create(`${prefix} 瓶`, 6); await create(`${prefix} 未知`, null);
    await admin.screenshot({ path: path.join(output, `admin-form-${viewport.width}.png`), fullPage: true });
    await maintenance.evaluate(node => node.scrollTo({ top: 0 }));
    const adminGeometry = await maintenance.boundingBox();
    assert.ok(adminGeometry && adminGeometry.x >= 15 && adminGeometry.y >= 15
      && adminGeometry.x + adminGeometry.width <= viewport.width - 15
      && adminGeometry.y + adminGeometry.height <= viewport.height - 15);
    assert.equal(await maintenance.evaluate(node => node.scrollWidth <= node.clientWidth), true);
    await expect(maintenance.getByRole('button', { name: '關閉包裝維護', exact: true })).toBeInViewport();
    await admin.screenshot({ path: path.join(output, `admin-${viewport.width}.png`), fullPage: true });
    await pos.goto(posOrigin);
    await expect(pos.getByTestId('product-search-input')).toBeEnabled();
    const open = pos.getByRole('button', { name: '包裝查找', exact: true });
    await open.click();
    const lookup = pos.getByRole('dialog', { name: '商品／包裝查找', exact: true });
    await lookup.getByRole('textbox', { name: '原始識別碼', exact: true }).fill(code);
    await lookup.getByRole('button', { name: '查找完全相符包裝', exact: true }).click();
    await expect(lookup.getByText('找到 3 個包裝；請核對後人工確認。', { exact: true })).toBeVisible();
    await expect(pos.locator('.pos-cart-panel').getByText('點擊商品加入購物車', { exact: true })).toBeVisible();
    const unknown = lookup.getByRole('button').filter({ hasText: `${prefix} 未知` }); await expect(unknown).toBeDisabled();
    const chosen = lookup.getByRole('button').filter({ hasText: `${prefix} 盒` });
    const geometry = await chosen.boundingBox(); assert.ok(geometry && geometry.width >= 44 && geometry.height >= 44);
    await pos.screenshot({ path: path.join(output, `candidates-${viewport.width}.png`), fullPage: true });
    await chosen.focus(); await pos.keyboard.press('Enter');
    await expect(lookup.getByText(`已加入 1 個 ${prefix} 盒：3 合成庫存單位。`, { exact: true })).toBeVisible();
    await expect(pos.locator('.pos-cart-panel').getByText('共 3 件商品', { exact: true })).toBeVisible();
    await lookup.getByRole('button', { name: '查找完全相符包裝', exact: true }).click();
    await expect(lookup.getByText('找到 3 個包裝；請核對後人工確認。', { exact: true })).toBeVisible();
    // Change the authority through the real maintenance UI after the POS result.
    await maintenance.getByRole('button', { name: '重新載入歷史', exact: true }).click();
    await expect(maintenance.getByRole('button', { name: '新增獨立包裝', exact: true })).toBeEnabled();
    await maintenance.getByLabel('停用原因（停用前必填）', { exact: true }).fill('合成 stale revision 驗收');
    // Selecting the current version acknowledges the refreshed history and
    // unlocks its retirement action while keeping the existing record visible.
    const historyRow = maintenance.locator('details').filter({ hasText: `${prefix} 盒 · revision 1` });
    await historyRow.getByRole('button', { name: '以 revision 1 建立新版本', exact: true }).click();
    await historyRow.getByRole('button', { name: '停用此 revision', exact: true }).click();
    await expect(historyRow.getByText(/停用：/)).toBeVisible();
    await lookup.getByRole('button').filter({ hasText: `${prefix} 盒` }).click();
    await expect(lookup.getByText('包裝對照已變更或失效，請重新查找。', { exact: true })).toBeVisible();
    await expect(pos.locator('.pos-cart-panel').getByText('共 3 件商品', { exact: true })).toBeVisible();
    await lookup.getByRole('button', { name: '關閉包裝查找', exact: true }).click(); await expect(open).toBeFocused();
    const manualOpen = pos.getByRole('button', { name: '手動貼碼', exact: true });
    await manualOpen.click();
    const manual = pos.getByRole('dialog', { name: '手動貼碼', exact: true });
    await manual.getByRole('textbox', { name: '掃描文字', exact: true }).fill(code);
    await manual.getByRole('button', { name: '檢視掃描結果', exact: true }).click();
    await manual.getByRole('button', { name: '使用這段原碼查找商品／包裝', exact: true }).click();
    await expect(lookup.getByRole('textbox', { name: '原始識別碼', exact: true })).toHaveValue(code);
    await lookup.getByRole('button', { name: '查找完全相符包裝', exact: true }).click();
    await expect(lookup.getByText('找到 2 個包裝；請核對後人工確認。', { exact: true })).toBeVisible();
    await expect(pos.locator('.pos-cart-panel').getByText('共 3 件商品', { exact: true })).toBeVisible();
    await lookup.getByRole('button', { name: '關閉包裝查找', exact: true }).click();
    await expect(manualOpen).toBeFocused();
    assert.deepEqual(await business(), baseline);
    cases.push({ viewport, status: 'passed', manualConfirmation: true, unknownConversionBlocked: true, ambiguity: 3,
      confirmedBaseQuantity: 3, staleRevisionRejected: true, manualHandoff: true, handoffFocusRestored: true, backendBusinessUnchanged: true, geometry, adminGeometry });
    await context.close();
  }
  assert.equal(forbidden.length, 0); assert.equal(cases.length, 3);
  assert.equal(apiLedger.some(row => row.path.startsWith('/api/v1/admin/inventory/products/') && row.method === 'POST' && row.status === 201), true);
  assert.equal(apiLedger.filter(row => row.path === '/api/v1/admin/pos/packages/resolve' && row.status === 409).length, 3);
} catch (error) { failure = { name: error.name, message: error.message, stack: error.stack }; }
finally {
  for (const context of contexts) await context.close().catch(() => {});
  if (browser) await browser.close();
  for (const server of servers) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  cleanup = await cleanupRunProcesses(scope); write('process-cleanup.json', cleanup);
  try {
    if (!fixtureOwned) throw new Error('Fixture ownership was not established; refusing all row cleanup');
    await db.$executeRawUnsafe('TRUNCATE TABLE product_package_identifiers, product_package_revisions, product_packages');
    await db.product.deleteMany({ where: { tenantId: syntheticTenant } });
    await db.shift.deleteMany({ where: { tenantId: syntheticTenant } });
    await db.rolePermission.deleteMany({ where: { role: { tenantId: syntheticTenant } } });
    await db.userRole.deleteMany({ where: { user: { tenantId: syntheticTenant } } });
    await db.role.deleteMany({ where: { tenantId: syntheticTenant } });
    await db.user.deleteMany({ where: { tenantId: syntheticTenant } });
    await db.tenant.deleteMany({ where: { id: syntheticTenant } });
    // The guard proved an empty owned fixture before creating these permissions.
    await db.permission.deleteMany();
    const after = await counts(); assertZeroRows(after); write('after-counts.json', after);
  } finally { await db.$disconnect(); }
}
assert.equal(cleanup.quiescent, true); assert.equal(git('status', '--porcelain'), ''); assert.equal(git('rev-parse', 'HEAD'), identity.head);
const sourceFiles = git('ls-files', '-z', '--', 'systems/enterprise-admin/backend', 'systems/enterprise-admin/admin-ui', 'systems/enterprise-admin/pos-ui', 'systems/enterprise-admin/packages', '.github/workflows/ci.yml').split('\0').filter(Boolean);
write('source.json', { ...identity, nonce, scope: 'Built Admin/POS → real production HTTP API → owned synthetic PostgreSQL15; fixture-issued JWT, login UI/hardware not tested' });
write('source-hashes.json', Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])));
write('network.json', { networkLedger, forbidden, apiLedger });
write('report.json', { status: failure ? 'failed' : 'passed', cases, failure, cleanup });
if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `evidence_dir=${output}\n`);
if (failure) throw new Error(failure.message);
console.log(`Package native browser acceptance passed: ${cases.length} viewport flows, no implicit adds, stale revision rejected, zero business rows and owned processes quiescent`);
