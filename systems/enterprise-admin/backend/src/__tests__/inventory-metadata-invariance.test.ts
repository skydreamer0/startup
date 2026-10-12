import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Only the persistence boundary is replaced. Routes, JWT verification, tenant
// context, RBAC, multipart CSV parser, validation, controllers and services run.
const boundary = vi.hoisted(() => {
  const calls: { model: string; operation: string; args: unknown }[] = [];
  const handlers = new Map<string, (args: unknown) => unknown>();
  const client = new Proxy({}, {
    get(_target, model: string) {
      return new Proxy({}, {
        get(_delegate, operation: string) {
          return async (args: unknown) => {
            calls.push({ model, operation, args: structuredClone(args) });
            const handler = handlers.get(`${model}.${operation}`);
            if (!handler) throw new Error(`Unexpected persistence operation: ${model}.${operation}`);
            return handler(args);
          };
        },
      });
    },
  });
  return { calls, handlers, client };
});
vi.mock('../lib/prisma', () => ({ prisma: boundary.client, basePrisma: boundary.client }));
vi.mock('../config/env', () => ({ env: {
  JWT_ACCESS_SECRET: 'synthetic-metadata-unit-secret-not-for-deployment',
  JWT_ACCESS_EXPIRES_IN: '15m',
} }));

import inventoryRoutes from '../modules/inventory/inventory.routes';
import { setTenantContext } from '../middleware/tenant.middleware';
import { errorMiddleware } from '../middleware/error.middleware';
import { signAccessToken } from '../lib/jwt';
import { requireTenantId } from '../lib/tenant.context';

const app = express();
app.use(express.json());
app.use(setTenantContext);
app.use('/inventory', inventoryRoutes);
app.use(errorMiddleware);
const tenantId = 'metadata-unit-tenant';
const productId = 'metadata-unit-product';
function auth(permission: string) {
  return `Bearer ${signAccessToken({ userId: 'metadata-unit-user', email: 'fixture@example.invalid',
    tenantId, plan: 'pro', permissions: [permission] })}`;
}
function fixture() {
  // Representative persisted rows, NOT a claim that receipt/sale ran in this
  // no-DB test. The sibling integration suite creates them via real services.
  const at = new Date('2026-01-01T00:00:00Z');
  const product = { id: productId, tenantId, sku: 'EXISTING', name: 'Original metadata',
    costPrice: 40, retailPrice: 100, stockQuantity: 6, safetyStock: 10, updatedAt: at };
  const batches = [
    { id: 'lot-a', tenantId, productId, batchNumber: 'A', quantity: 2, status: 'RELEASED', expiryDate: new Date('2099-01-01'), costPrice: 35, receivedAt: at },
    { id: 'lot-b', tenantId, productId, batchNumber: 'B', quantity: 4, status: 'RELEASED', expiryDate: new Date('2099-02-01'), costPrice: 45, receivedAt: at },
  ];
  const movements = [
    { id: 'in-a', tenantId, productId, batchId: 'lot-a', referenceId: 'lot-a', type: 'IN', quantity: 5, costPriceAtReceipt: 35, notes: 'Receipt A', createdAt: at },
    { id: 'in-b', tenantId, productId, batchId: 'lot-b', referenceId: 'lot-b', type: 'IN', quantity: 4, costPriceAtReceipt: 45, notes: 'Receipt B', createdAt: at },
    { id: 'out', tenantId, productId, batchId: null, referenceId: 'sale', type: 'OUT', quantity: 3, costPriceAtReceipt: null, notes: 'Order fulfillment', createdAt: at },
  ];
  const allocations = [{ id: 'allocation', tenantId, productId, orderId: 'sale', orderItemId: 'item', batchId: 'lot-a', quantity: 3, expiryDateAtSale: batches[0].expiryDate, createdAt: at }];
  const audit = batches.map(batch => ({ id: `audit-${batch.id}`, tenantId, productId, batchId: batch.id,
    actorId: 'metadata-unit-user', operation: 'INITIAL_RELEASE', before: { exists: false },
    after: { status: batch.status, expiryDate: batch.expiryDate.toISOString(), costPrice: String(batch.costPrice) },
    reason: 'Synthetic receipt inspected', createdAt: at }));
  boundary.handlers.set('user.findUnique', () => {
    expect(requireTenantId()).toBe(tenantId);
    return { id: 'metadata-unit-user', email: 'fixture@example.invalid', status: 'active' };
  });
  boundary.handlers.set('product.findFirst', args => {
    expect(args).toEqual({ where: { sku: product.sku, tenantId } });
    return structuredClone(product);
  });
  boundary.handlers.set('product.update', args => {
    const { where, data } = args as { where: { id: string }; data: Partial<typeof product> };
    expect(requireTenantId()).toBe(tenantId);
    expect(where).toEqual({ id: productId });
    Object.assign(product, data);
    return structuredClone(product);
  });
  return { product, snapshot: () => structuredClone({ stockQuantity: product.stockQuantity, batches, movements, allocations, audit }) };
}
beforeEach(() => { boundary.calls.length = 0; boundary.handlers.clear(); });

describe('Inventory metadata routes: persistence-boundary regressions (no database)', () => {
  it('skips an existing CSV SKU, ignoring changed stock, cost and extra batch columns', async () => {
    const f = fixture();
    const before = { product: structuredClone(f.product), inventory: f.snapshot() };
    const csv = '商品名稱,SKU,售價,成本,庫存,batchNumber,quantity,status,expiryDate,costPrice\n'
      + 'CSV replacement,EXISTING,999,88,999,INJECTED,999,BLOCKED,2099-12-31,98\n';
    const res = await request(app).post('/inventory/products/import/csv')
      .set('Authorization', auth('create:products')).attach('file', Buffer.from(csv), 'products.csv');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 0, skipped: 1, errors: [] });
    expect({ product: f.product, inventory: f.snapshot() }).toEqual(before);
    expect(boundary.calls.map(({ model, operation }) => `${model}.${operation}`))
      .toEqual(['user.findUnique', 'product.findFirst']);
  });

  it('updates product name/cost through the real service without any inventory write', async () => {
    const f = fixture();
    const before = f.snapshot();
    const metadata = { name: 'Updated metadata', costPrice: 65 };
    const res = await request(app).put(`/inventory/products/${productId}`)
      .set('Authorization', auth('update:products')).send(metadata);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject(metadata);
    expect(f.product).toMatchObject(metadata);
    expect(f.snapshot()).toEqual(before);
    expect(boundary.calls).toEqual([
      { model: 'user', operation: 'findUnique', args: { where: { id: 'metadata-unit-user', deletedAt: null }, select: { id: true, email: true, status: true } } },
      { model: 'product', operation: 'update', args: { where: { id: productId }, data: metadata } },
    ]);
  });
});
