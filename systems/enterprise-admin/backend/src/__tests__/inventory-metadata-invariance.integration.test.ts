import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { basePrisma } from '../lib/prisma';
import { tenantContext } from '../lib/tenant.context';
import { signAccessToken } from '../lib/jwt';
import inventoryRoutes from '../modules/inventory/inventory.routes';
import { ProductBatchService } from '../modules/product-batches/product-batches.service';
import { OrderService } from '../modules/orders/order.service';
import { setTenantContext } from '../middleware/tenant.middleware';
import { errorMiddleware } from '../middleware/error.middleware';

// Reuse the existing batch-audit suite's exact isolated DB opt-in contract.
// Append-only audit rows remain until the owned runner drops its database.
// This file neither creates a database nor runs migrations/cleanup.
const databaseUrl = process.env.BATCH_AUDIT_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '55437'
    || url.username !== 'test' || url.password || url.search || url.hash
    || url.pathname !== '/checkout_http_recovery_batch_audit_ci' || process.env.DATABASE_URL !== databaseUrl) {
    throw new Error('Metadata invariance requires the exact isolated synthetic batch-audit database');
  }
}
const app = express();
app.use(express.json());
app.use(setTenantContext);
app.use('/inventory', inventoryRoutes);
app.use(errorMiddleware);
const run = <T>(tenantId: string, work: () => T) => tenantContext.run({ tenantId, plan: 'pro' }, work);
async function fixture() {
  const tenantId = randomUUID();
  await basePrisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Synthetic metadata invariance' } });
  const user = await basePrisma.user.create({ data: { tenantId, email: `${tenantId}@metadata.test`,
    fullName: 'Synthetic metadata actor', passwordHash: 'not-a-login-hash', status: 'active' } });
  const product = await basePrisma.product.create({ data: { tenantId, sku: 'EXISTING',
    name: 'Original metadata', costPrice: 40, retailPrice: 100, stockQuantity: 0 } });
  const customer = await basePrisma.customer.create({ data: { tenantId, phone: 'METADATA-TEST' } });
  const actor = { userId: user.id, permissions: ['release:product_batches'] };
  for (const [batchNumber, quantity, costPrice, expiryDate] of [
    ['A', 5, 35, '2099-01-01T00:00:00Z'], ['B', 4, 45, '2099-02-01T00:00:00Z'],
  ] as const) {
    await run(tenantId, () => ProductBatchService.create({ productId: product.id, batchNumber,
      quantity, costPrice, expiryDate, status: 'RELEASED', reason: 'Synthetic receipt inspected' }, actor));
  }
  await run(tenantId, () => OrderService.createOrder({ customerId: customer.id,
    items: [{ productId: product.id, quantity: 3 }] }));
  const auth = (permission: string) => `Bearer ${signAccessToken({ userId: user.id, email: user.email,
    tenantId, plan: 'pro', permissions: [permission] })}`;
  return { tenantId, product, auth };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function snapshot(f: Fixture) {
  const where = { tenantId: f.tenantId };
  const orderBy = { id: 'asc' as const };
  const product = await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } });
  // All scalar fields and all tenant rows are read, not selected quantity fields
  // or only original IDs. Extra rows and unrelated lot/history edits are visible.
  return {
    product,
    inventory: {
      stockQuantity: product.stockQuantity,
      batches: await basePrisma.productBatch.findMany({ where, orderBy }),
      movements: await basePrisma.inventoryTransaction.findMany({ where, orderBy }),
      allocations: await basePrisma.saleBatchAllocation.findMany({ where, orderBy }),
      audit: await basePrisma.productBatchChange.findMany({ where, orderBy }),
    },
  };
}
function assertPostedFixture(before: Awaited<ReturnType<typeof snapshot>>) {
  expect(before.inventory.stockQuantity).toBe(6);
  expect(before.inventory.batches).toHaveLength(2);
  expect(before.inventory.batches.map(b => b.costPrice.toString()).sort()).toEqual(['35', '45']);
  expect(before.inventory.movements.filter(m => m.type === 'IN')).toHaveLength(2);
  expect(before.inventory.movements.filter(m => m.type === 'OUT')).toHaveLength(1);
  expect(before.inventory.allocations).toHaveLength(1);
  expect(before.inventory.audit).toHaveLength(2);
  expect(before.inventory.audit.every(a => a.operation === 'INITIAL_RELEASE')).toBe(true);
}

describe.skipIf(!databaseUrl)('Inventory metadata invariance after real receipt, sale and audit', () => {
  afterAll(() => basePrisma.$disconnect());
  it('skips an existing CSV SKU and preserves the complete product/batch/ledger/audit snapshot', async () => {
    const f = await fixture();
    const before = await snapshot(f);
    assertPostedFixture(before);
    const csv = '商品名稱,SKU,售價,成本,庫存,batchNumber,quantity,status,expiryDate,costPrice\n'
      + 'CSV replacement,EXISTING,999,88,999,INJECTED,999,BLOCKED,2099-12-31,98\n';
    const res = await request(app).post('/inventory/products/import/csv')
      .set('Authorization', f.auth('create:products')).attach('file', Buffer.from(csv), 'products.csv');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ created: 0, skipped: 1, errors: [] });
    expect(await snapshot(f)).toEqual(before);
  });

  it('updates product name/cost while preserving every batch, IN/OUT, allocation and audit field', async () => {
    const f = await fixture();
    const before = await snapshot(f);
    assertPostedFixture(before);
    const res = await request(app).put(`/inventory/products/${f.product.id}`)
      .set('Authorization', f.auth('update:products')).send({ name: 'Updated metadata', costPrice: 65 });
    expect(res.status).toBe(200);
    const after = await snapshot(f);
    expect(after.product.name).toBe('Updated metadata');
    expect(after.product.costPrice.toString()).toBe('65');
    expect(after.inventory).toEqual(before.inventory);
  });
});
