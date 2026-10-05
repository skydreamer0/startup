import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

// Synchronize actual PostgreSQL reads so both callers observe the last unit
// before either can debit it. No query results or writes are mocked.
const race = vi.hoisted(() => ({
  productId: '',
  arrivals: 0,
  release: () => {},
  gate: Promise.resolve(),
  batchProductId: '',
  beforeBatchDebit: () => Promise.resolve(),
}));

vi.mock('../lib/prisma', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/prisma')>();
  async function rendezvous(productId: string | undefined) {
    if (productId !== race.productId) return;
    if (++race.arrivals === 2) race.release();
    await race.gate;
  }
  return {
    ...actual,
    prisma: actual.prisma.$extends({
      query: {
        product: {
          async findFirst({ args, query }) {
            const result = await query(args);
            await rendezvous(result?.id);
            return result;
          },
          async findUnique({ args, query }) {
            const result = await query(args);
            await rendezvous(result?.id);
            return result;
          },
        },
        productBatch: {
          async findMany({ args, query }) {
            const result = await query(args);
            if (result.some((batch) => batch.productId === race.batchProductId)) await race.beforeBatchDebit();
            return result;
          },
        },
      },
    }),
  };
});

import { basePrisma } from '../lib/prisma';
import { tenantContext } from '../lib/tenant.context';
import { CheckoutService } from '../modules/pos/checkout.service';
import { OrderService } from '../modules/orders/order.service';

const tenants: string[] = [];

async function fixture(quantity: number) {
  const tenantId = randomUUID();
  await basePrisma.tenant.create({ data: { id: tenantId, name: 'Stock regression', slug: tenantId } });
  tenants.push(tenantId);
  const staff = await basePrisma.user.create({ data: {
    tenantId, email: `${tenantId}@stock.test`, fullName: 'Test cashier', passwordHash: 'not-a-login-hash',
  } });
  const customer = await basePrisma.customer.create({ data: { tenantId, phone: 'WALK_IN' } });
  const shift = await basePrisma.shift.create({ data: { tenantId, staffId: staff.id } });
  const product = await basePrisma.product.create({ data: {
    tenantId, sku: 'TEST', name: 'Test product', retailPrice: 100, costPrice: 40, stockQuantity: quantity,
  } });
  const batch = await basePrisma.productBatch.create({ data: {
    tenantId, productId: product.id, batchNumber: 'LOT-1', expiryDate: new Date('2099-01-01'),
    quantity, costPrice: 40,
  } });
  return { tenantId, customer, shift, product, batch };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function inTenant<T>(f: Fixture, callback: () => Promise<T>) {
  return tenantContext.run({ tenantId: f.tenantId, plan: 'pro' }, callback);
}

function checkout(f: Fixture, quantities = [1]) {
  return inTenant(f, () => CheckoutService.checkout({
    shiftId: f.shift.id, paymentMethod: 'CASH', orderDiscountAmount: 0,
    cartItems: quantities.map((quantity) => ({ productId: f.product.id, quantity, discountRate: 0 })),
  }));
}

function order(f: Fixture, quantities = [1]) {
  return inTenant(f, () => OrderService.createOrder({
    customerId: f.customer.id,
    items: quantities.map((quantity) => ({ productId: f.product.id, quantity })),
  }));
}

afterEach(async () => {
  race.release();
  race.productId = '';
  race.batchProductId = '';
  race.beforeBatchDebit = () => Promise.resolve();
  for (const tenantId of tenants.splice(0)) {
    await basePrisma.order.deleteMany({ where: { tenantId } });
    await basePrisma.inventoryTransaction.deleteMany({ where: { tenantId } });
    await basePrisma.shift.deleteMany({ where: { tenantId } });
    await basePrisma.customer.deleteMany({ where: { tenantId } });
    await basePrisma.productBatch.deleteMany({ where: { tenantId } });
    await basePrisma.product.deleteMany({ where: { tenantId } });
    await basePrisma.user.deleteMany({ where: { tenantId } });
    await basePrisma.tenant.delete({ where: { id: tenantId } });
  }
});

afterAll(() => basePrisma.$disconnect());

describe('Sales stock safety (real PostgreSQL)', () => {
  it.each(['POS', 'order'] as const)('rejects aggregate duplicate demand in %s without partial writes', async (writer) => {
    const f = await fixture(3);
    await expect(writer === 'POS' ? checkout(f, [2, 2]) : order(f, [2, 2]))
      .rejects.toMatchObject({ statusCode: 400 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(3);
    expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).quantity).toBe(3);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it.each(['POS', 'order'] as const)('allows only one buyer of the last unit when POS races %s', async (other) => {
    const f = await fixture(1);
    race.productId = f.product.id;
    race.arrivals = 0;
    race.gate = new Promise<void>((resolve) => { race.release = resolve; });
    const results = await Promise.allSettled([checkout(f), other === 'POS' ? checkout(f) : order(f)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({ reason: { statusCode: 400 } });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(0);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(1);
  }, 15000);

  it('shares batch availability between duplicate POS lines while preserving discounts', async () => {
    const f = await fixture(4);
    await basePrisma.productBatch.update({ where: { id: f.batch.id }, data: { quantity: 2 } });
    const secondBatch = await basePrisma.productBatch.create({ data: {
      tenantId: f.tenantId, productId: f.product.id, batchNumber: 'LOT-2',
      expiryDate: new Date('2099-02-01'), quantity: 2, costPrice: 40,
    } });
    const result = await inTenant(f, () => CheckoutService.checkout({
      shiftId: f.shift.id, paymentMethod: 'CASH', orderDiscountAmount: 0,
      cartItems: [
        { productId: f.product.id, quantity: 2, discountRate: 0 },
        { productId: f.product.id, quantity: 2, discountRate: 50 },
      ],
    }));
    expect(result.items.map((item) => item.discountRate)).toEqual([0, 50]);
    expect(Number(result.totalAmount)).toBe(300);
    for (const batchId of [f.batch.id, secondBatch.id]) {
      expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: batchId } })).quantity).toBe(0);
    }
  });

  it('rolls back stock, batches and movements when order creation fails', async () => {
    const f = await fixture(2);
    await expect(inTenant(f, () => CheckoutService.checkout({
      shiftId: f.shift.id, salesStaffId: randomUUID(), paymentMethod: 'CASH', orderDiscountAmount: 0,
      cartItems: [{ productId: f.product.id, quantity: 1, discountRate: 0 }],
    }))).rejects.toBeDefined();
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(2);
    expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).quantity).toBe(2);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('rolls back product stock when batches cannot cover the sale', async () => {
    const f = await fixture(2);
    await basePrisma.productBatch.update({ where: { id: f.batch.id }, data: { quantity: 0 } });
    await expect(checkout(f)).rejects.toMatchObject({ statusCode: 400 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(2);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('rejects a batch changed after selection without overwriting its new quantity', async () => {
    const f = await fixture(2);
    race.batchProductId = f.product.id;
    race.beforeBatchDebit = async () => {
      await basePrisma.productBatch.update({ where: { id: f.batch.id }, data: { quantity: 0 } });
    };
    await expect(checkout(f)).rejects.toMatchObject({ statusCode: 400 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(2);
    expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).quantity).toBe(0);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('rolls back an earlier product debit if a later product has insufficient stock', async () => {
    const f = await fixture(2);
    const second = await basePrisma.product.create({ data: {
      tenantId: f.tenantId, sku: 'SCARCE', name: 'Scarce product', retailPrice: 50, costPrice: 20, stockQuantity: 0,
    } });
    const [available, unavailable] = [f.product.id, second.id].sort();
    await basePrisma.product.update({ where: { id: available }, data: { stockQuantity: 2 } });
    await basePrisma.product.update({ where: { id: unavailable }, data: { stockQuantity: 0 } });
    await expect(inTenant(f, () => OrderService.createOrder({
      customerId: f.customer.id,
      items: [unavailable, available].map((productId) => ({ productId, quantity: 1 })),
    }))).rejects.toMatchObject({ statusCode: 400 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: available } })).stockQuantity).toBe(2);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it.each([0, -1, 1.5, 2_147_483_648])('rejects invalid service-level quantity %s', async (quantity) => {
    const f = await fixture(2);
    await expect(order(f, [quantity])).rejects.toMatchObject({ statusCode: 400 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(2);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('rejects a product from another tenant without debiting either tenant', async () => {
    const f = await fixture(2);
    const other = await fixture(2);
    await expect(inTenant(f, () => OrderService.createOrder({
      customerId: f.customer.id, items: [{ productId: other.product.id, quantity: 1 }],
    }))).rejects.toMatchObject({ statusCode: 404 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: other.product.id } })).stockQuantity).toBe(2);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('locks multiple products consistently even when carts use opposite order', async () => {
    const f = await fixture(2);
    const second = await basePrisma.product.create({ data: {
      tenantId: f.tenantId, sku: 'SECOND', name: 'Second product', retailPrice: 50, costPrice: 20, stockQuantity: 2,
    } });
    await basePrisma.productBatch.create({ data: {
      tenantId: f.tenantId, productId: second.id, batchNumber: 'LOT-SECOND',
      expiryDate: new Date('2099-01-01'), quantity: 2, costPrice: 20,
    } });
    race.productId = [f.product.id, second.id].sort()[0];
    race.arrivals = 0;
    race.gate = new Promise<void>((resolve) => { race.release = resolve; });
    await Promise.all([
      [f.product.id, second.id], [second.id, f.product.id],
    ].map((productIds) => inTenant(f, () => CheckoutService.checkout({
      shiftId: f.shift.id, paymentMethod: 'CASH', orderDiscountAmount: 0,
      cartItems: productIds.map((productId) => ({ productId, quantity: 1, discountRate: 0 })),
    }))));
    for (const productId of [f.product.id, second.id]) {
      expect((await basePrisma.product.findUniqueOrThrow({ where: { id: productId } })).stockQuantity).toBe(0);
      expect(await basePrisma.productBatch.aggregate({ where: { productId }, _sum: { quantity: true } }))
        .toMatchObject({ _sum: { quantity: 0 } });
    }
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(2);
  }, 15000);
});
