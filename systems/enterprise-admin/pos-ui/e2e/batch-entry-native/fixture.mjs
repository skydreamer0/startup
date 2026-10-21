import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { observeResponse } from '../staff-entry-native/fixture.mjs';
export { drainHttp, finalizeFixture } from '../recovery-native/fixture.mjs';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export const models = ['tenant', 'user', 'role', 'permission', 'product', 'productBatch', 'inventoryTransaction'];
export const endpoints = ['/api/v1/admin/auth/me', '/api/v1/admin/tenants/me/plan', '/api/v1/admin/product-batches', '/api/v1/admin/inventory/products'];
export function buildFixture(nonce) {
  assert.match(nonce, uuid);
  const ids = Object.fromEntries(['tenantA', 'tenantB', 'tenantEmpty', 'receiverA', 'readerA', 'deniedA', 'receiverEmpty', 'readPermission', 'createPermission'].map(key => [key, randomUUID()]));
  const tenant = ['tenantA', 'tenantB', 'tenantEmpty'].map(key => ({ id: ids[key], slug: ids[key], name: `Synthetic batch entry ${key}`, plan: 'pro' }));
  const actors = [
    { key: 'receiverA', tenantId: ids.tenantA, grants: ['read:products', 'create:products'] },
    { key: 'readerA', tenantId: ids.tenantA, grants: ['read:products'] },
    { key: 'deniedA', tenantId: ids.tenantA, grants: [] },
    { key: 'receiverEmpty', tenantId: ids.tenantEmpty, grants: ['read:products', 'create:products'] },
  ].map(actor => ({ ...actor, userId: ids[actor.key], roleId: randomUUID() }));
  const user = actors.map(actor => ({ id: actor.userId, tenantId: actor.tenantId, email: `${actor.userId}@batch-entry.example.test`, fullName: `合成批次 ${actor.key}`, passwordHash: 'not-a-login-hash', status: 'active' }));
  const role = actors.map(actor => ({ id: actor.roleId, tenantId: actor.tenantId, name: `Synthetic ${actor.key}` }));
  const permission = [{ id: ids.readPermission, action: 'read', resource: 'products' }, { id: ids.createPermission, action: 'create', resource: 'products' }];
  const product = Array.from({ length: 61 }, (_, index) => ({ id: randomUUID(), tenantId: ids.tenantA, sku: `BATCH-${String(index + 1).padStart(3, '0')}`, name: `合成批次商品 ${String(index + 1).padStart(3, '0')}`, stockQuantity: index === 0 ? 5 : 0, safetyStock: 1, costPrice: 10, retailPrice: 20 }));
  // Same visible name/SKU in another tenant: identity checks cannot rely on labels.
  product.push({ ...product[0], id: randomUUID(), tenantId: ids.tenantB, costPrice: 999, retailPrice: 1999 });
  const productBatch = [product[0], product[61]].map((p, index) => ({ id: randomUUID(), tenantId: p.tenantId, productId: p.id, batchNumber: index === 0 ? 'SYNTHETIC-ENTRY-LOT' : 'FOREIGN-ENTRY-LOT', quantity: 5, costPrice: p.costPrice, expiryDate: new Date('2099-01-01T00:00:00Z'), status: 'QUARANTINE' }));
  const inventoryTransaction = productBatch.map(batch => ({ id: randomUUID(), tenantId: batch.tenantId, productId: batch.productId, batchId: batch.id, type: 'IN', quantity: 5, costPriceAtReceipt: batch.costPrice, notes: 'Synthetic immutable receipt' }));
  const f = { nonce, ids, actors, tenant, user, role, permission, product, productBatch, inventoryTransaction, ownershipProven: false };
  assertFixture(f); return f;
}
export function assertFixture(f) {
  assert.match(f.nonce, uuid);
  const allIds = models.flatMap(model => f[model].map(row => row.id)); allIds.forEach(id => assert.match(id, uuid));
  assert.equal(new Set(allIds).size, allIds.length);
  assert.deepEqual(models.map(model => f[model].length), [3, 4, 4, 2, 62, 2, 2]);
  const tenants = new Set(f.tenant.map(row => row.id));
  for (const model of ['user', 'role', 'product', 'productBatch', 'inventoryTransaction']) for (const row of f[model]) assert.ok(tenants.has(row.tenantId));
  assert.deepEqual(f.permission.map(p => `${p.action}:${p.resource}`).sort(), ['create:products', 'read:products']);
  for (const actor of f.actors) {
    assert.equal(f.ids[actor.key], actor.userId); assert.equal(f.user.find(u => u.id === actor.userId)?.tenantId, actor.tenantId);
    assert.equal(f.role.find(r => r.id === actor.roleId)?.tenantId, actor.tenantId);
    assert.deepEqual(actor.grants, actor.key === 'deniedA' ? [] : actor.key === 'readerA' ? ['read:products'] : ['read:products', 'create:products']);
  }
  assert.equal(f.product.filter(p => p.tenantId === f.ids.tenantA).length, 61);
  assert.equal(f.product.filter(p => p.tenantId === f.ids.tenantB).length, 1);
  for (const batch of f.productBatch) {
    const product = f.product.find(p => p.id === batch.productId); assert.ok(product); assert.equal(product.tenantId, batch.tenantId);
    assert.equal(batch.quantity, 5); assert.equal(product.stockQuantity, 5); assert.equal(batch.status, 'QUARANTINE');
    assert.equal(Number(batch.costPrice), product.costPrice); assert.ok(product.costPrice >= 0);
    const receipts = f.inventoryTransaction.filter(row => row.batchId === batch.id); assert.equal(receipts.length, 1);
    const receipt = receipts[0]; assert.equal(receipt.tenantId, batch.tenantId); assert.equal(receipt.productId, product.id);
    assert.equal(receipt.type, 'IN'); assert.equal(receipt.quantity, 5); assert.equal(receipt.costPriceAtReceipt, batch.costPrice);
  }
  return true;
}
export async function seedFixture(db, f, stage = (_part) => {}) {
  assertFixture(f); assert.equal(f.ownershipProven, false);
  for (const model of models) { stage(`absence-${model}`); assert.equal(await db[model].count({ where: { id: { in: f[model].map(row => row.id) } } }), 0); }
  f.ownershipProven = true;
  for (const model of models) { stage(model); await db[model].createMany({ data: f[model] }); }
  for (const actor of f.actors) {
    for (const grant of actor.grants) {
      const permission = f.permission.find(p => `${p.action}:${p.resource}` === grant); assert.ok(permission);
      stage(`role-permission-${actor.key}-${grant}`); await db.rolePermission.create({ data: { roleId: actor.roleId, permissionId: permission.id } });
    }
    stage(`user-role-${actor.key}`); await db.userRole.create({ data: { userId: actor.userId, roleId: actor.roleId } });
  }
  return f;
}
export async function cleanupFixture(db, f, httpDrained) {
  assert.equal(httpDrained, true, 'Never remove rows while an owned HTTP handler can run');
  assertFixture(f); assert.equal(f.ownershipProven, true);
  const roleIds = f.role.map(row => row.id), userIds = f.user.map(row => row.id);
  await db.rolePermission.deleteMany({ where: { roleId: { in: roleIds } } });
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
  for (const model of ['inventoryTransaction', 'productBatch', 'product', 'role', 'permission', 'user', 'tenant']) await db[model].deleteMany({ where: { id: { in: f[model].map(row => row.id) } } });
  for (const model of models) assert.equal(await db[model].count({ where: { id: { in: f[model].map(row => row.id) } } }), 0);
}
export function requestIdentity(method, pathname, query) {
  if (method !== 'GET' || !endpoints.includes(pathname)) return null;
  const keys = Object.keys(query);
  if (pathname.endsWith('/inventory/products')) {
    if (keys.length !== 1 || keys[0] !== 'page' || !['1', '2'].includes(query.page)) return null;
    return { path: pathname, page: Number(query.page) };
  }
  return keys.length === 0 ? { path: pathname, page: null } : null;
}
export function createGuard({ f, nonce, verifyAccessToken, tokens, cases, pending, requests, rejected, onError, limit = 64 }) {
  const seen = new Set();
  return (req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();
    const identity = requestIdentity(req.method, req.path, req.query);
    const id = req.get('x-batch-entry-request') ?? '', caseId = req.get('x-batch-entry-case') ?? '';
    const reject = () => { rejected.push('Request outside owned read-only batch-entry scope'); res.status(405).json({ success: false }); };
    try {
      assert.ok(identity); assert.ok(cases.some(row => row.id === caseId)); assert.ok(id.startsWith(`${nonce}:`));
      assert.equal(seen.has(id), false); assert.ok(seen.size < limit); assert.equal(req.get('x-tenant-id'), undefined);
      const authorization = req.get('authorization') ?? '';
      const actor = f.actors.find(row => authorization === `Bearer ${tokens[row.key]}`); assert.ok(actor);
      assert.equal(cases.find(row => row.id === caseId).actor, actor.key);
      const token = verifyAccessToken(tokens[actor.key]); assert.equal(token.userId, actor.userId); assert.equal(token.tenantId, actor.tenantId);
      seen.add(id);
      observeResponse({ res, identity: { id, caseId, method: 'GET', ...identity, actor: actor.key, userId: actor.userId, tenantId: actor.tenantId }, pending, record: row => requests.push(row), onError });
    } catch { reject(); return; }
    next();
  };
}
