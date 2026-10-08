// Synthetic-only final-image acceptance. Starts the compiled Express app on loopback.
// Never use a production URL or the image's migration-starting default CMD.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');

const DATABASE = 'postgresql://test:test@postgres:5432/argon2_integration_ci';
const ACCESS_SECRET = 'SYNTHETIC-ONLY-argon2-integration-access-2026';
const REFRESH_SECRET = 'SYNTHETIC-ONLY-argon2-integration-refresh-2026';
const checks = [];
let db, appDb, server;

async function main() {
  assert.equal(process.argv[3], '--require-alpine');
  assert.match(process.version, /^v22\./);
  assert.equal(fs.existsSync('/etc/alpine-release'), true);
  assert.equal(process.env.ARGON2_QA_DATABASE_URL, DATABASE, 'Only the named disposable Actions database is supported');
  assert.equal(process.env.ARGON2_QA_SYNTHETIC, 'isolated-actions-service');
  for (const key of ['EXPECTED_HEAD', 'EXPECTED_TREE']) assert.match(process.env[key] || '', /^[a-f0-9]{40}$/);
  assert.match(process.env.EXPECTED_IMAGE || '', /^sha256:[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(process.cwd(), '.env')), false, 'No ambient .env is allowed');
  // Do not inherit an application connection, credentials or optional integrations.
  process.env.DATABASE_URL = DATABASE;
  process.env.JWT_ACCESS_SECRET = ACCESS_SECRET;
  process.env.JWT_REFRESH_SECRET = REFRESH_SECRET;
  process.env.JWT_ACCESS_EXPIRES_IN = '15m';
  process.env.JWT_REFRESH_EXPIRES_IN = '1h';
  process.env.NODE_ENV = 'test';
  for (const key of ['QUICKBOOKS_CLIENT_ID', 'QUICKBOOKS_CLIENT_SECRET', 'XERO_CLIENT_ID', 'XERO_CLIENT_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'LINE_CHANNEL_SECRET']) {
    assert.equal(process.env[key], undefined, `Unexpected integration setting: ${key}`);
  }
  const requireBackend = createRequire(path.join(process.cwd(), 'package.json'));
  assert.equal(requireBackend('argon2/package.json').version, '0.45.1');
  const fixture = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(fixture.synthetic, true);
  assert.equal(fixture.generator.version, '0.44.0');
  assert.equal(fixture.password, 'SYNTHETIC-ONLY-藥局-compat-62!');
  assert.deepEqual(fixture.cases.map(row => row.name), ['default', 'argon2i', 'argon2d']);
  const { PrismaClient } = requireBackend('@prisma/client');
  const jwt = requireBackend('jsonwebtoken');
  db = new PrismaClient({ datasources: { db: { url: DATABASE } } });
  const identity = await db.$queryRaw`SELECT current_database() AS name, current_user AS username, version() AS version`;
  assert.equal(identity.length, 1);
  assert.equal(identity[0].name, 'argon2_integration_ci');
  assert.equal(identity[0].username, 'test');
  assert.match(identity[0].version, /^PostgreSQL 15\./);
  const tables = await db.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
  assert.equal(tables.length, 0, 'Refuse a nonempty or previously used database; never reset it');

  // Explicit migrations only after both the connection and empty service DB checks.
  const migration = spawnSync(process.execPath, [requireBackend.resolve('prisma/build/index.js'), 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: DATABASE }, encoding: 'utf8', timeout: 120000,
  });
  process.stdout.write(migration.stdout || '');
  process.stderr.write(migration.stderr || '');
  assert.equal(migration.error, undefined, 'Isolated migration must finish');
  assert.equal(migration.signal, null);
  assert.equal(migration.status, 0, 'Isolated migrations failed');
  assert.equal(await db.tenant.count(), 0);
  assert.equal(await db.user.count(), 0);

  const password = requireBackend('./dist/lib/password.js');
  const freshHash = await password.hashPassword(fixture.password);
  const seed = await db.$transaction(async tx => {
    const tenant = await tx.tenant.create({ data: { name: 'Synthetic argon2 integration', slug: 'default', plan: 'pro' } });
    const permission = await tx.permission.create({ data: { action: 'manage', resource: 'pos' } });
    const role = await tx.role.create({ data: { tenantId: tenant.id, name: 'Synthetic cashier', rolePermissions: { create: { permissionId: permission.id } } } });
    const users = [];
    for (const row of fixture.cases) users.push(await tx.user.create({ data: {
      tenantId: tenant.id, email: `${row.name}@argon2.example.invalid`, fullName: 'Synthetic compatibility user',
      passwordHash: row.hash, userRoles: { create: { roleId: role.id } },
    } }));
    const unprivileged = await tx.user.create({ data: {
      tenantId: tenant.id, email: 'new-hash@argon2.example.invalid', fullName: 'Synthetic unprivileged user', passwordHash: freshHash,
    } });
    await tx.customer.create({ data: { tenantId: tenant.id, phone: 'WALK_IN' } });
    const product = await tx.product.create({ data: {
      tenantId: tenant.id, sku: 'SYNTHETIC-ARGON2', name: 'Synthetic stock regression', retailPrice: 100, costPrice: 40, stockQuantity: 5,
    } });
    const batch = await tx.productBatch.create({ data: {
      tenantId: tenant.id, productId: product.id, batchNumber: 'SYNTHETIC-ARGON2-LOT', quantity: 5, costPrice: 40,
      status: 'RELEASED', expiryDate: new Date('2099-01-01T00:00:00.000Z'),
    } });
    const shift = await tx.shift.create({ data: { tenantId: tenant.id, staffId: users[0].id } });
    return { tenant, users, unprivileged, product, batch, shift };
  });
  const app = requireBackend('./dist/app.js').default;
  appDb = requireBackend('./dist/lib/prisma.js').basePrisma;
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  async function request(route, { token, body, status = 200 } = {}) {
    const response = await fetch(`${origin}/api/v1/admin${route}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, status, `${route}: unexpected HTTP status`);
    assert.match(response.headers.get('content-type') || '', /application\/json/);
    const value = await response.json();
    assert.equal(value.success, status < 400, `${route}: envelope status`);
    if (status >= 400) {
      assert.equal(value.data, undefined);
      assert.equal(value.accessToken, undefined);
      assert.equal(value.refreshToken, undefined);
    }
    return value;
  }
  let cashierToken, cashierRefresh, cashierPayload;
  for (const [index, row] of fixture.cases.entries()) {
    const user = seed.users[index];
    await request('/auth/login', { body: { email: user.email, password: fixture.password + '-wrong' }, status: 401 });
    const failed = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(failed.failedLoginAttempts, 1);
    assert.equal(failed.passwordHash, row.hash);
    assert.equal(await db.auditLog.count({ where: { userId: user.id, action: 'LOGIN' } }), 0);
    const { data } = await request('/auth/login', { body: { email: user.email, password: fixture.password } });
    assert.equal(data.user.id, user.id);
    const access = jwt.verify(data.accessToken, ACCESS_SECRET, { algorithms: ['HS256'] });
    const refresh = jwt.verify(data.refreshToken, REFRESH_SECRET, { algorithms: ['HS256'] });
    assert.equal(access.userId, user.id);
    assert.equal(access.email, user.email);
    assert.equal(access.tenantId, seed.tenant.id);
    assert.ok(access.permissions.includes('manage:pos'));
    assert.equal(refresh.userId, user.id);
    assert.equal(refresh.type, 'refresh');
    assert.ok(access.exp > access.iat && refresh.exp > refresh.iat);
    assert.equal((await request('/auth/me', { token: data.accessToken })).data.id, user.id);
    const renewed = (await request('/auth/refresh', { body: { refreshToken: data.refreshToken } })).data.accessToken;
    assert.equal(jwt.verify(renewed, ACCESS_SECRET, { algorithms: ['HS256'] }).userId, user.id);
    assert.equal((await request('/auth/me', { token: renewed })).data.id, user.id);
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(stored.failedLoginAttempts, 0);
    assert.ok(stored.lastLoginAt instanceof Date);
    assert.equal(stored.passwordHash, row.hash, 'Legacy login must not silently overwrite its stored hash');
    assert.equal(await db.auditLog.count({ where: { userId: user.id, action: 'LOGIN' } }), 1);
    checks.push(`legacy-${row.name}-http-db-refresh-jwt`);
    if (index === 0) { cashierToken = renewed; cashierRefresh = data.refreshToken; cashierPayload = access; }
  }
  const fresh = (await request('/auth/login', { body: { email: seed.unprivileged.email, password: fixture.password } })).data;
  assert.equal(jwt.verify(fresh.accessToken, ACCESS_SECRET, { algorithms: ['HS256'] }).userId, seed.unprivileged.id);
  assert.equal((await request('/auth/me', { token: fresh.accessToken })).data.id, seed.unprivileged.id);
  checks.push('fresh-hash-http-login');

  const forgedAccess = jwt.sign(cashierPayload, 'SYNTHETIC-ONLY-wrong-signature-secret');
  const forgedRefresh = jwt.sign({ userId: seed.users[0].id, type: 'refresh' }, 'SYNTHETIC-ONLY-wrong-signature-secret');
  const expiredAccess = jwt.sign({ userId: seed.users[0].id, tenantId: seed.tenant.id, permissions: ['manage:pos'], exp: 1 }, ACCESS_SECRET);
  await request('/auth/me', { token: forgedAccess, status: 401 });
  await request('/auth/me', { token: expiredAccess, status: 401 });
  await request('/auth/me', { token: cashierRefresh, status: 401 });
  await request('/auth/refresh', { body: { refreshToken: forgedRefresh }, status: 401 });
  await request('/auth/refresh', { body: { refreshToken: cashierToken }, status: 401 });
  checks.push('jwt-signature-expiry-and-token-boundaries');
  assert.deepEqual((await request('/pos/checkout-context', { token: cashierToken })).data, { tenantId: seed.tenant.id, userId: seed.users[0].id });
  checks.push('protected-pos-context');
  await request('/pos/checkout-context', { token: fresh.accessToken, status: 403 });
  checks.push('rbac-rejects-unprivileged-user');

  async function stockSnapshot() {
    const tenantId = seed.tenant.id;
    const [product, batch, orders, payments, movements, allocations, commands] = await db.$transaction([
      db.product.findUniqueOrThrow({ where: { id: seed.product.id }, select: { id: true, stockQuantity: true } }),
      db.productBatch.findUniqueOrThrow({ where: { id: seed.batch.id }, select: { id: true, quantity: true } }),
      db.order.findMany({ where: { tenantId }, orderBy: { id: 'asc' }, select: { id: true, status: true, discountNote: true, totalAmount: true } }),
      db.orderPayment.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      db.inventoryTransaction.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      db.saleBatchAllocation.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
      db.checkoutCommand.findMany({ where: { tenantId }, orderBy: { id: 'asc' } }),
    ]);
    return JSON.parse(JSON.stringify({ product, batch, orders, payments, movements, allocations, commands }));
  }
  const initial = await stockSnapshot();
  assert.equal(initial.product.stockQuantity, 5); assert.equal(initial.batch.quantity, 5);
  assert.equal(initial.orders.length + initial.movements.length + initial.allocations.length + initial.commands.length, 0);
  const intent = { commandId: randomUUID(), cartItems: [{ productId: seed.product.id, quantity: 2 }], paymentMethod: 'CASH', shiftId: seed.shift.id, orderDiscountNote: 'Synthetic original note' };
  const sale = (await request('/pos/checkout', { token: cashierToken, body: intent, status: 201 })).data;
  assert.equal(sale.status, 'completed'); assert.equal(Number(sale.totalAmount), 200);
  const afterSale = await stockSnapshot();
  assert.equal(afterSale.product.stockQuantity, 3); assert.equal(afterSale.batch.quantity, 3);
  assert.equal(afterSale.orders.length, 1); assert.equal(afterSale.orders[0].id, sale.id);
  assert.equal(afterSale.payments.length, 1); assert.equal(Number(afterSale.payments[0].amount), 200);
  assert.equal(afterSale.movements.length, 1); assert.equal(afterSale.movements[0].type, 'OUT'); assert.equal(afterSale.movements[0].quantity, 2);
  assert.equal(afterSale.allocations.length, 1); assert.equal(afterSale.allocations[0].quantity, 2);
  assert.equal(afterSale.allocations[0].batchId, seed.batch.id); assert.equal(afterSale.allocations[0].orderId, sale.id);
  assert.equal(afterSale.allocations[0].movementId, afterSale.movements[0].id);
  assert.equal(afterSale.commands.length, 1); assert.equal(afterSale.commands[0].status, 'SUCCEEDED');
  const detail = (await request(`/pos/orders/${sale.id}`, { token: cashierToken })).data;
  assert.equal(detail.items[0].batchAllocations[0].batch.id, seed.batch.id);
  checks.push('checkout-deducts-product-batch-and-persists-allocation');
  assert.deepEqual((await request('/pos/checkout', { token: cashierToken, body: intent, status: 201 })).data, sale);
  assert.deepEqual(await stockSnapshot(), afterSale);
  checks.push('checkout-replay-does-not-post-twice');
  const conflict = await request('/pos/checkout', { token: cashierToken, body: { ...intent, cartItems: [{ productId: seed.product.id, quantity: 1 }] }, status: 409 });
  assert.equal(conflict.error.code, 'COMMAND_PAYLOAD_CONFLICT');
  assert.deepEqual(await stockSnapshot(), afterSale);
  checks.push('checkout-conflict-has-no-writes');
  await request('/pos/checkout', { token: cashierToken, body: { ...intent, commandId: randomUUID(), cartItems: [{ productId: seed.product.id, quantity: 99 }] }, status: 400 });
  assert.deepEqual(await stockSnapshot(), afterSale);
  checks.push('insufficient-stock-rolls-back-command');
  const refunded = (await request(`/pos/orders/${sale.id}/refund`, { token: cashierToken, body: { reason: 'Synthetic money-only refund' } })).data;
  assert.equal(refunded.status, 'refunded');
  assert.equal(refunded.discountNote, 'Synthetic original note\n[退款] Synthetic money-only refund');
  const afterRefund = await stockSnapshot();
  const expectedRefund = structuredClone(afterSale);
  expectedRefund.orders[0].status = 'refunded'; expectedRefund.orders[0].discountNote = refunded.discountNote;
  assert.deepEqual(afterRefund, expectedRefund, 'Refund must preserve product/batch stock, OUT/allocation, payment and original command result');
  assert.equal((await request(`/pos/orders/${sale.id}`, { token: cashierToken })).data.status, 'refunded');
  checks.push('money-only-refund-preserves-stock-and-allocation');
  await request(`/pos/orders/${sale.id}/refund`, { token: cashierToken, body: { reason: 'Must not replace the first reason' }, status: 400 });
  assert.deepEqual(await stockSnapshot(), afterRefund);
  checks.push('duplicate-refund-has-no-writes');
  assert.deepEqual((await request('/pos/checkout', { token: cashierToken, body: intent, status: 201 })).data, sale);
  assert.deepEqual(await stockSnapshot(), afterRefund);
  checks.push('checkout-replay-after-refund-preserves-original-result');

  return { status: 'PASS', synthetic: true, scope: 'final-image real HTTP, PostgreSQL, signed JWT, stock and money-only refund; no production account or provider transfer',
    head: process.env.EXPECTED_HEAD, tree: process.env.EXPECTED_TREE, image: process.env.EXPECTED_IMAGE,
    node: process.version, alpine: true, argon2: '0.45.1', database: identity[0], checks,
    stock: { initial: initial.product.stockQuantity, afterSale: afterSale.product.stockQuantity, afterRefund: afterRefund.product.stockQuantity },
  };
}

async function cleanup() {
  if (server) {
    await new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); });
  }
  if (appDb) await appDb.$disconnect();
  if (db) await db.$disconnect();
  // The service lifecycle removes this disposable DB. Never drop/reset a user DB.
}

(async () => {
  let result;
  try { result = await main(); } finally { await cleanup(); }
  console.log(JSON.stringify(result));
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
