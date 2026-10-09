import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

const failure = vi.hoisted(() => ({ receiptTenant: '', productId: '', arrivals: 0, release: () => {}, gate: Promise.resolve() }));
vi.mock('../lib/prisma', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/prisma')>();
  return { ...actual, prisma: actual.prisma.$extends({ query: { product: {
    async findFirst({ args, query }) {
      const result = await query(args);
      if (result?.id === failure.productId) {
        if (++failure.arrivals === 2) failure.release();
        await failure.gate;
      }
      return result;
    },
  }, inventoryTransaction: {
    async create({ args, query }) {
      if (args.data.tenantId === failure.receiptTenant) throw new Error('Injected receipt movement failure');
      return query(args);
    },
  } } }) };
});
import app from '../app';
import { basePrisma } from '../lib/prisma';
import { tenantContext } from '../lib/tenant.context';
import { InventoryService } from '../modules/inventory/inventory.service';
import { ProductBatchService } from '../modules/product-batches/product-batches.service';
import { OrderService } from '../modules/orders/order.service';
import { signAccessToken } from '../lib/jwt';

const tenants: string[] = [];
let token: string;
beforeAll(async () => {
  const login = await request(app).post('/api/v1/admin/auth/login').send({ email: 'admin@system.local', password: 'Admin@123!' });
  expect(login.status).toBe(200);
  token = login.body.data.accessToken;
});
async function fixture(quantity = 0) {
  const tenantId = randomUUID();
  await basePrisma.tenant.create({ data: { id: tenantId, name: 'Receipt regression', slug: tenantId } });
  tenants.push(tenantId);
  const product = await basePrisma.product.create({ data: { tenantId, sku: 'RECEIPT', name: 'Receipt product', costPrice: 40, retailPrice: 100, stockQuantity: quantity } });
  const customer = await basePrisma.customer.create({ data: { tenantId, phone: 'RECEIPT-TEST' } });
  const staff = await basePrisma.user.create({ data: { tenantId, email: `${tenantId}@receipt.test`, fullName: 'Receipt staff', passwordHash: 'not-a-login-hash' } });
  if (quantity) await basePrisma.productBatch.create({ data: { tenantId, productId: product.id, batchNumber: 'OLD', expiryDate: new Date('2099-01-01'), quantity, costPrice: 40, status: 'RELEASED' } });
  return { tenantId, product, customer, staff };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function inTenant<T>(f: Fixture, work: () => T) { return tenantContext.run({ tenantId: f.tenantId, plan: 'pro' }, work); }
function receive(f: Fixture, quantity = 5, batchNumber = 'RECEIVED') {
  return inTenant(f, () => ProductBatchService.create({ productId: f.product.id, batchNumber, expiryDate: '2099-02-01T00:00:00Z', quantity, costPrice: 40 }));
}
afterEach(async () => {
  failure.release();
  failure.productId = '';
  failure.receiptTenant = '';
  vi.useRealTimers();
  for (const tenantId of tenants.splice(0)) {
    await basePrisma.saleBatchAllocation.deleteMany({ where: { tenantId } });
    await basePrisma.order.deleteMany({ where: { tenantId } });
    await basePrisma.inventoryTransaction.deleteMany({ where: { tenantId } });
    await basePrisma.productBatch.deleteMany({ where: { tenantId } });
    await basePrisma.product.deleteMany({ where: { tenantId } });
    await basePrisma.customer.deleteMany({ where: { tenantId } });
    await basePrisma.user.deleteMany({ where: { tenantId } });
    await basePrisma.tenant.delete({ where: { id: tenantId } });
  }
});
afterAll(() => basePrisma.$disconnect());

describe('Receipt authority and closed quantity bypasses (real PostgreSQL)', () => {
  it('posts product, quarantined lot and durable IN movement together', async () => {
    const f = await fixture();
    const batch = await receive(f);
    expect(batch).toMatchObject({ quantity: 5, status: 'QUARANTINE' });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(5);
    expect(await basePrisma.inventoryTransaction.findMany({ where: { tenantId: f.tenantId } })).toMatchObject([{ productId: f.product.id, referenceId: batch.id, type: 'IN', quantity: 5 }]);
  });
  it('rolls back all writes when the lot already exists', async () => {
    const f = await fixture();
    await receive(f);
    await expect(receive(f, 3)).rejects.toMatchObject({ statusCode: 409 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(5);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(1);
  });
  it('keeps an actual concurrent receipt and sale conserved', async () => {
    const f = await fixture(1);
    failure.productId = f.product.id;
    failure.arrivals = 0;
    failure.gate = new Promise<void>((resolve) => { failure.release = resolve; });
    await Promise.all([receive(f), inTenant(f, () => OrderService.createOrder({ customerId: f.customer.id, items: [{ productId: f.product.id, quantity: 1 }] }))]);
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(5);
    expect((await basePrisma.productBatch.aggregate({ where: { tenantId: f.tenantId }, _sum: { quantity: true } }))._sum.quantity).toBe(5);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(2);
  });
  it('rejects product quantity edits rather than restoring sold stock', async () => {
    const f = await fixture(2);
    await expect(inTenant(f, () => InventoryService.updateProduct(f.product.id, { name: 'Changed', stockQuantity: 99 }))).rejects.toMatchObject({ statusCode: 400 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(2);
  });
  it('rejects direct lot quantity edits', async () => {
    const f = await fixture();
    const batch = await receive(f);
    await expect(inTenant(f, () => ProductBatchService.update(batch.id, { quantity: 0 }))).rejects.toMatchObject({ statusCode: 400 });
    expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: batch.id } })).quantity).toBe(5);
  });
  it('rejects an unbatched positive opening balance while allowing zero-stock metadata', async () => {
    const f = await fixture();
    const input = { sku: 'NEW', name: 'New metadata', costPrice: 40, retailPrice: 100 };
    await expect(inTenant(f, () => InventoryService.createProduct({ ...input, stockQuantity: 99 }))).rejects.toMatchObject({ statusCode: 400 });
    expect((await inTenant(f, () => InventoryService.createProduct(input))).stockQuantity).toBe(0);
  });
  it('rejects overflow without creating a receipt', async () => {
    const f = await fixture(2_147_483_646);
    await expect(receive(f, 2)).rejects.toMatchObject({ statusCode: 400 });
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await basePrisma.productBatch.count({ where: { tenantId: f.tenantId, batchNumber: 'RECEIVED' } })).toBe(0);
  });
  it('cannot receive another tenant product', async () => {
    const first = await fixture();
    const other = await fixture();
    await expect(inTenant(other, () => ProductBatchService.create({ productId: first.product.id, batchNumber: 'WRONG', expiryDate: '2099-02-01T00:00:00Z', quantity: 2, costPrice: 40 }))).rejects.toMatchObject({ statusCode: 404 });
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: other.tenantId } })).toBe(0);
  });
  it('uses catalogued product permissions for real authenticated batch reads', async () => {
    const res = await request(app).get('/api/v1/admin/product-batches').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
  it('rolls back product and lot when movement persistence fails', async () => {
    const f = await fixture();
    failure.receiptTenant = f.tenantId;
    await expect(receive(f)).rejects.toThrow('Injected receipt movement failure');
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(0);
    expect(await basePrisma.productBatch.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });
  it('reads receipt provenance with a new client and rejects an unaudited cost correction', async () => {
    const f = await fixture();
    const batch = await receive(f);
    await expect(inTenant(f, () => ProductBatchService.update(batch.id, { costPrice: 50 }))).rejects.toMatchObject({ statusCode: 400 });
    const fresh = new PrismaClient();
    try {
      const movement = await fresh.inventoryTransaction.findFirstOrThrow({ where: { tenantId: f.tenantId, batchId: batch.id }, include: { receiptBatch: true } });
      expect(movement.costPriceAtReceipt?.toString()).toBe('40');
      expect(movement.receiptBatch?.costPrice.toString()).toBe('40');
      expect((await inTenant(f, () => ProductBatchService.getById(batch.id))).receiptMovements[0].id).toBe(movement.id);
    } finally { await fresh.$disconnect(); }
  });
  it('preserves receipt-linked lots and enforces tenant links and positive receipt quantities in SQL', async () => {
    const f = await fixture();
    const other = await fixture();
    const batch = await receive(f);
    await basePrisma.productBatch.update({ where: { id: batch.id }, data: { quantity: 0 } });
    await expect(inTenant(f, () => ProductBatchService.delete(batch.id))).rejects.toMatchObject({ statusCode: 400 });
    await expect(basePrisma.productBatch.delete({ where: { id: batch.id } })).rejects.toMatchObject({ code: 'P2003' });
    const movement = await basePrisma.inventoryTransaction.findFirstOrThrow({ where: { tenantId: f.tenantId } });
    await expect(basePrisma.inventoryTransaction.create({ data: { ...movement, id: randomUUID(), tenantId: other.tenantId, productId: other.product.id } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(basePrisma.inventoryTransaction.update({ where: { id: movement.id }, data: { quantity: 0 } })).rejects.toThrow();
  });
  it('does not release expiry-day stock across the Taipei midnight boundary', async () => {
    const f = await fixture();
    const input = { productId: f.product.id, batchNumber: 'EXPIRY', expiryDate: '2026-10-06T00:00:00Z', quantity: 1, costPrice: 40, status: 'RELEASED' as const };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T15:59:59Z'));
    await inTenant(f, () => ProductBatchService.create(input));
    vi.setSystemTime(new Date('2026-10-05T16:00:00Z'));
    await expect(inTenant(f, () => ProductBatchService.create({ ...input, batchNumber: 'EXPIRED' }))).rejects.toMatchObject({ statusCode: 400 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(1);
  });
  it('supports flat product metadata/receipt requests and rejects quantity edits under real auth', async () => {
    const f = await fixture();
    const access = signAccessToken({ userId: f.staff.id, email: f.staff.email, tenantId: f.tenantId, plan: 'pro', permissions: ['read:products', 'create:products', 'update:products'] });
    const auth = `Bearer ${access}`;
    const created = await request(app).post('/api/v1/admin/inventory/products').set('Authorization', auth).send({ sku: 'API', name: 'Metadata', costPrice: 40, retailPrice: 100 });
    expect(created.status).toBe(201);
    expect(created.body.data.stockQuantity).toBe(0);
    const id = created.body.data.id;
    const receipt = await request(app).post('/api/v1/admin/product-batches').set('Authorization', auth).send({ productId: id, batchNumber: 'API', expiryDate: '2099-02-01T00:00:00Z', quantity: 3, costPrice: 40 });
    expect(receipt.status).toBe(201);
    expect((await request(app).put(`/api/v1/admin/inventory/products/${id}`).set('Authorization', auth).send({ name: 'Metadata only' })).status).toBe(200);
    expect((await request(app).put(`/api/v1/admin/inventory/products/${id}`).set('Authorization', auth).send({ stockQuantity: 99 })).status).toBe(400);
    expect((await request(app).patch(`/api/v1/admin/product-batches/${receipt.body.data.id}`).set('Authorization', auth).send({ quantity: 99 })).status).toBe(400);
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id } })).stockQuantity).toBe(3);
    const readonly = signAccessToken({ userId: f.staff.id, email: f.staff.email, tenantId: f.tenantId, plan: 'pro', permissions: ['read:products'] });
    expect((await request(app).post('/api/v1/admin/product-batches').set('Authorization', `Bearer ${readonly}`).send({})).status).toBe(403);
  });
  it('imports CSV metadata at zero stock without inventing a lot', async () => {
    const f = await fixture();
    const access = signAccessToken({ userId: f.staff.id, email: f.staff.email, tenantId: f.tenantId, plan: 'pro', permissions: ['create:products'] });
    const res = await request(app).post('/api/v1/admin/inventory/products/import/csv').set('Authorization', `Bearer ${access}`).attach('file', Buffer.from('商品名稱,SKU,售價,成本,庫存\nCSV metadata,CSV,100,40,99\n'), 'products.csv');
    expect(res.status).toBe(200);
    expect(res.body.data.created).toBe(1);
    expect((await basePrisma.product.findFirstOrThrow({ where: { tenantId: f.tenantId, sku: 'CSV' } })).stockQuantity).toBe(0);
    expect(await basePrisma.productBatch.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });
});
