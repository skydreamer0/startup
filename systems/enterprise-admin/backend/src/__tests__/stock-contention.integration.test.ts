import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

// Synchronize actual PostgreSQL reads so both callers observe the last unit
// before either can debit it. No query results or writes are mocked.
const race = vi.hoisted(() => ({
  productId: '',
  arrivals: 0,
  release: () => {},
  gate: Promise.resolve(),
  batchProductId: '',
  beforeBatchDebit: () => Promise.resolve(),
  failAllocationAfter: -1,
  allocationWrites: 0,
  refundOrderId: '',
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
        saleBatchAllocation: {
          async createMany({ args, query }) {
            if (race.failAllocationAfter === race.allocationWrites++) throw new Error('Injected allocation persistence failure');
            return query(args);
          },
        },
        order: {
          async findFirst({ args, query }) {
            const result = await query(args);
            if (result?.id === race.refundOrderId && result.status === 'completed') {
              if (++race.arrivals === 2) race.release();
              await race.gate;
            }
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
import { ProductBatchService } from '../modules/product-batches/product-batches.service';
import { saleExpiryCutoff } from '../lib/batch-expiry';
import { createProductBatchSchema } from '../modules/product-batches/product-batches.schema';

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
    status: 'RELEASED',
  } });
  return { tenantId, customer, shift, product, batch };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

function inTenant<T>(f: Fixture, callback: () => Promise<T>) {
  return tenantContext.run({ tenantId: f.tenantId, plan: 'pro' }, callback);
}

function checkout(f: Fixture, quantities = [1]) {
  return inTenant(f, () => CheckoutService.checkout({
    commandId: randomUUID(),
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
  race.failAllocationAfter = -1;
  race.allocationWrites = 0;
  race.refundOrderId = '';
  vi.useRealTimers();
  for (const tenantId of tenants.splice(0)) {
    await basePrisma.checkoutCommand.deleteMany({ where: { tenantId } });
    await basePrisma.saleBatchAllocation.deleteMany({ where: { tenantId } });
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

describe('FEFO and durable sale allocations (real PostgreSQL)', () => {
  it.each(['POS', 'order'] as const)('persists an actual two-lot split for %s and reads it through a fresh DB client', async (writer) => {
    const f = await fixture(4);
    await basePrisma.productBatch.update({ where: { id: f.batch.id }, data: { quantity: 2 } });
    const second = await basePrisma.productBatch.create({ data: {
      tenantId: f.tenantId, productId: f.product.id, batchNumber: 'LOT-2',
      expiryDate: new Date('2099-02-01'), status: 'RELEASED', quantity: 2, costPrice: 40,
    } });
    const sale = await (writer === 'POS' ? checkout(f, [3]) : order(f, [3]));
    const freshClient = new PrismaClient();
    try {
      const allocations = await freshClient.saleBatchAllocation.findMany({
        where: { tenantId: f.tenantId, orderId: sale.id }, orderBy: { expiryDateAtSale: 'asc' },
        include: { movement: true, orderItem: true },
      });
      expect(allocations.map(({ batchId, quantity }) => ({ batchId, quantity }))).toEqual([
        { batchId: f.batch.id, quantity: 2 }, { batchId: second.id, quantity: 1 },
      ]);
      expect(allocations.every((a) => a.orderItemId === sale.items[0].id && a.movement.referenceId === sale.id && a.movement.quantity === 3)).toBe(true);
    } finally { await freshClient.$disconnect(); }
    const detail = await inTenant(f, () => writer === 'POS' ? CheckoutService.getOrderById(sale.id) : OrderService.getOrderById(sale.id));
    expect(detail.items[0].batchAllocations).toHaveLength(2);
    const lot = await inTenant(f, () => ProductBatchService.getById(second.id));
    expect(lot.saleAllocations).toMatchObject([{ orderId: sale.id, quantity: 1 }]);
    expect(lot._count.saleAllocations).toBe(1);
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(1);
    expect((await basePrisma.productBatch.aggregate({ where: { tenantId: f.tenantId }, _sum: { quantity: true } }))._sum.quantity).toBe(1);
  });

  it.each(['POS', 'order'] as const)('skips expired, expiry-day, quarantined and blocked batches for %s', async (writer) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
    const f = await fixture(5);
    await basePrisma.productBatch.update({ where: { id: f.batch.id }, data: { quantity: 1 } });
    await basePrisma.productBatch.createMany({ data: [
      { batchNumber: 'EXPIRED', expiryDate: new Date('2026-10-05T00:00:00Z'), status: 'RELEASED' as const },
      { batchNumber: 'TODAY', expiryDate: new Date('2026-10-06T15:00:00Z'), status: 'RELEASED' as const },
      { batchNumber: 'ISOLATED', expiryDate: new Date('2026-10-07T00:00:00Z'), status: 'QUARANTINE' as const },
      { batchNumber: 'BLOCKED', expiryDate: new Date('2026-10-08T00:00:00Z'), status: 'BLOCKED' as const },
    ].map((lot) => ({ ...lot, tenantId: f.tenantId, productId: f.product.id, quantity: 1, costPrice: 40 })) });
    const sale = await (writer === 'POS' ? checkout(f) : order(f));
    expect(await basePrisma.saleBatchAllocation.findMany({ where: { orderId: sale.id } })).toMatchObject([{ batchId: f.batch.id, quantity: 1 }]);
    expect((await basePrisma.productBatch.aggregate({ where: { productId: f.product.id }, _sum: { quantity: true } }))._sum.quantity).toBe(4);
  });

  it.each(['QUARANTINE', 'BLOCKED', 'EXPIRED', 'TODAY'] as const)('rejects %s-only stock without leaving any sale writes', async (state) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
    const f = await fixture(2);
    await basePrisma.productBatch.update({ where: { id: f.batch.id }, data: {
      ...(state === 'QUARANTINE' || state === 'BLOCKED' ? { status: state } : {
        expiryDate: new Date(state === 'EXPIRED' ? '2026-10-05T00:00:00Z' : '2026-10-06T15:59:59Z'),
      }),
    } });
    await expect(checkout(f)).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('無足夠可出庫批次') });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(2);
    expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).quantity).toBe(2);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await basePrisma.saleBatchAllocation.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('stops expiry-day stock at Taipei midnight rather than UTC midnight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T15:59:59Z'));
    expect(saleExpiryCutoff().toISOString()).toBe('2026-10-05T16:00:00.000Z');
    const f = await fixture(2);
    await basePrisma.productBatch.update({ where: { id: f.batch.id }, data: { expiryDate: new Date('2026-10-06T04:00:00Z') } });
    await checkout(f);
    vi.setSystemTime(new Date('2026-10-05T16:00:00Z'));
    expect(saleExpiryCutoff().toISOString()).toBe('2026-10-06T16:00:00.000Z');
    await expect(order(f)).rejects.toMatchObject({ statusCode: 400 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(1);
  });

  it.each(['quarantine', 'midnight'] as const)('rechecks %s eligibility after selection', async (change) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-05T15:59:59Z'));
    const f = await fixture(2);
    await basePrisma.productBatch.update({ where: { id: f.batch.id }, data: { expiryDate: new Date('2026-10-06T04:00:00Z') } });
    race.batchProductId = f.product.id;
    race.beforeBatchDebit = async () => {
      if (change === 'quarantine') await basePrisma.productBatch.update({ where: { id: f.batch.id }, data: { status: 'QUARANTINE' } });
      else vi.setSystemTime(new Date('2026-10-05T16:00:00Z'));
    };
    await expect(checkout(f)).rejects.toMatchObject({ statusCode: 400 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(2);
    expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).quantity).toBe(2);
    expect(await basePrisma.saleBatchAllocation.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it.each(['POS', 'order'] as const)('rolls back %s stock, order, movements and the first allocation when the next allocation fails', async (writer) => {
    const f = await fixture(2);
    race.allocationWrites = 0;
    race.failAllocationAfter = 1;
    await expect(writer === 'POS' ? checkout(f, [1, 1]) : order(f, [1, 1])).rejects.toThrow('allocation persistence failure');
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(2);
    expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).quantity).toBe(2);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect(await basePrisma.saleBatchAllocation.count({ where: { tenantId: f.tenantId } })).toBe(0);
  });

  it('defaults unreviewed batches to quarantine and rejects unknown/month-only expiry inputs', async () => {
    const f = await fixture(1);
    const created = await inTenant(f, () => ProductBatchService.create({
      productId: f.product.id, batchNumber: 'UNREVIEWED', expiryDate: '2099-02-01T00:00:00Z', quantity: 1, costPrice: 40,
    }));
    expect(created.status).toBe('QUARANTINE');
    for (const expiryDate of ['2026-10', '', 'unknown']) {
      expect(createProductBatchSchema.body.safeParse({ productId: f.product.id, batchNumber: 'BAD-DATE', expiryDate, quantity: 1, costPrice: 40 }).success).toBe(false);
    }
  });

  it('preserves referenced zero-stock batches and enforces allocation references and positive quantities in PostgreSQL', async () => {
    const f = await fixture(1);
    const other = await fixture(1);
    await checkout(f);
    const allocation = await basePrisma.saleBatchAllocation.findFirstOrThrow({ where: { tenantId: f.tenantId } });
    await expect(inTenant(f, () => ProductBatchService.delete(f.batch.id))).rejects.toMatchObject({ statusCode: 400 });
    await expect(basePrisma.productBatch.delete({ where: { id: f.batch.id } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(basePrisma.saleBatchAllocation.create({ data: { ...allocation, id: randomUUID(), batchId: other.batch.id } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(basePrisma.saleBatchAllocation.update({ where: { id: allocation.id }, data: { quantity: 0 } })).rejects.toBeDefined();
    await expect(inTenant(other, () => ProductBatchService.getById(f.batch.id))).rejects.toMatchObject({ statusCode: 404 });
  });

  it('warns before expiry through day 30 and omits zero stock and day 31', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T00:00:00Z'));
    const f = await fixture(1);
    await basePrisma.productBatch.createMany({ data: [
      { batchNumber: 'DAY30', expiryDate: new Date('2026-11-05T15:59:59Z'), quantity: 1 },
      { batchNumber: 'DAY31', expiryDate: new Date('2026-11-05T16:00:00Z'), quantity: 1 },
      { batchNumber: 'ZERO', expiryDate: new Date('2026-10-07T00:00:00Z'), quantity: 0 },
    ].map((lot) => ({ ...lot, productId: f.product.id, tenantId: f.tenantId, costPrice: 40 })) });
    expect((await inTenant(f, () => ProductBatchService.getAll({ expiringSoon: true }))).map((batch) => batch.batchNumber)).toEqual(['DAY30']);
  });
});

afterAll(() => basePrisma.$disconnect());

describe('Refund registration does not receive physical stock (real PostgreSQL)', () => {
  it('keeps product, lot, OUT movements and allocations unchanged after a money-only refund', async () => {
    const f = await fixture(2);
    const sale = await checkout(f);
    const originalAllocations = await basePrisma.saleBatchAllocation.findMany({ where: { orderId: sale.id } });
    const originalMovements = await basePrisma.inventoryTransaction.findMany({ where: { referenceId: sale.id } });
    const refund = await inTenant(f, () => CheckoutService.refundOrder(sale.id, '顧客取消，未收到退回商品'));
    expect(refund.status).toBe('refunded');
    expect(refund.discountNote).toContain('[退款]');
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(1);
    expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).quantity).toBe(1);
    expect(await basePrisma.saleBatchAllocation.findMany({ where: { orderId: sale.id } })).toEqual(originalAllocations);
    expect(await basePrisma.inventoryTransaction.findMany({ where: { referenceId: sale.id } })).toEqual(originalMovements);
  });

  it('rejects repeat refunds without adding stock or replacing the first reason and original discount note', async () => {
    const f = await fixture(2);
    const sale = await checkout(f);
    await basePrisma.order.update({ where: { id: sale.id }, data: { discountNote: '會員折扣理由' } });
    await inTenant(f, () => CheckoutService.refundOrder(sale.id, '第一次退款'));
    await expect(inTenant(f, () => CheckoutService.refundOrder(sale.id, '第二次重試'))).rejects.toMatchObject({ statusCode: 400 });
    const stored = await basePrisma.order.findUniqueOrThrow({ where: { id: sale.id } });
    expect(stored.discountNote).toBe('會員折扣理由\n[退款] 第一次退款');
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(1);
    expect(await basePrisma.inventoryTransaction.count({ where: { referenceId: sale.id, type: 'IN' } })).toBe(0);
  });

  it('allows only one concurrent refund status transition after both read completed', async () => {
    const f = await fixture(2);
    const sale = await checkout(f);
    race.refundOrderId = sale.id;
    race.arrivals = 0;
    race.gate = new Promise<void>((resolve) => { race.release = resolve; });
    const results = await Promise.allSettled(['退款一', '退款二'].map((reason) => inTenant(f, () => CheckoutService.refundOrder(sale.id, reason))));
    expect(race.arrivals).toBe(2);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(1);
    expect(await basePrisma.inventoryTransaction.count({ where: { referenceId: sale.id, type: 'IN' } })).toBe(0);
  }, 15000);

  it('does not fabricate stock receipt or allocations for a historical untraceable order', async () => {
    const f = await fixture(2);
    const historical = await basePrisma.order.create({ data: {
      tenantId: f.tenantId, customerId: f.customer.id, status: 'completed', totalAmount: 100,
      items: { create: { productId: f.product.id, quantity: 1, unitPrice: 100 } },
    } });
    await inTenant(f, () => CheckoutService.refundOrder(historical.id));
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(2);
    expect(await basePrisma.inventoryTransaction.count({ where: { referenceId: historical.id } })).toBe(0);
    expect(await basePrisma.saleBatchAllocation.count({ where: { orderId: historical.id } })).toBe(0);
  });

  it('rejects a refund from another tenant', async () => {
    const f = await fixture(2);
    const other = await fixture(2);
    const sale = await checkout(f);
    await expect(inTenant(other, () => CheckoutService.refundOrder(sale.id))).rejects.toMatchObject({ statusCode: 404 });
    expect((await basePrisma.order.findUniqueOrThrow({ where: { id: sale.id } })).status).toBe('completed');
  });

  it.each(['pending', 'cancelled'])('rejects refunding %s orders without changing stock', async (status) => {
    const f = await fixture(2);
    const sale = await checkout(f);
    await basePrisma.order.update({ where: { id: sale.id }, data: { status } });
    await expect(inTenant(f, () => CheckoutService.refundOrder(sale.id))).rejects.toMatchObject({ statusCode: 400 });
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(1);
  });
});

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
      status: 'RELEASED',
    } });
    const result = await inTenant(f, () => CheckoutService.checkout({
    commandId: randomUUID(),
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
    commandId: randomUUID(),
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
      status: 'RELEASED',
    } });
    race.productId = [f.product.id, second.id].sort()[0];
    race.arrivals = 0;
    race.gate = new Promise<void>((resolve) => { race.release = resolve; });
    await Promise.all([
      [f.product.id, second.id], [second.id, f.product.id],
    ].map((productIds) => inTenant(f, () => CheckoutService.checkout({
    commandId: randomUUID(),
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
