import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';

// No ambient DB fallback. The Actions harness first proves ownership and an
// empty dedicated service. Never use this opt-in with business data.
const databaseUrl = process.env.ORDER_SEQUENCE_DATABASE_URL;
const expectedUrl = 'postgresql://test@127.0.0.1:55436/checkout_order_sequence_ci';
if (databaseUrl && (databaseUrl !== expectedUrl || process.env.DATABASE_URL !== databaseUrl)) {
  throw new Error('Order sequence tests require the exact isolated fixture database');
}
const fault = vi.hoisted(() => ({
  failAllocation: false, barrier: false, arrivals: 0,
  release: () => {}, gate: Promise.resolve(),
}));
vi.mock('../lib/prisma', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/prisma')>();
  return { ...actual, prisma: actual.prisma.$extends({ query: {
    orderNumberCounter: { async createMany({ args, query }) {
      if (fault.barrier) {
        if (++fault.arrivals === 2) fault.release();
        await fault.gate;
      }
      return query(args);
    } },
    saleBatchAllocation: { async createMany({ args, query }) {
      const result = await query(args);
      if (fault.failAllocation) throw new Error('Synthetic allocation failure after number allocation');
      return result;
    } },
  } }) };
});
import { basePrisma } from '../lib/prisma';
import { tenantContext } from '../lib/tenant.context';
import { CheckoutService } from '../modules/pos/checkout.service';
import { CheckoutCommandService } from '../modules/pos/checkout-command.service';

const tenants: string[] = [];
async function fixture() {
  const tenantId = randomUUID();
  await basePrisma.tenant.create({ data: { id: tenantId, name: 'Synthetic number test', slug: tenantId } });
  tenants.push(tenantId);
  const staff = await basePrisma.user.create({ data: {
    tenantId, email: `${tenantId}@sequence.test`, fullName: 'Synthetic cashier', passwordHash: 'not-a-login-hash',
  } });
  await basePrisma.customer.create({ data: { tenantId, phone: 'WALK_IN' } });
  const shift = await basePrisma.shift.create({ data: { tenantId, staffId: staff.id } });
  const products = [];
  for (let i = 0; i < 2; i++) {
    const product = await basePrisma.product.create({ data: {
      tenantId, sku: `SEQ-${i}`, name: 'Synthetic product', retailPrice: 100, costPrice: 40, stockQuantity: 10,
    } });
    await basePrisma.productBatch.create({ data: {
      tenantId, productId: product.id, batchNumber: `SYNTHETIC-${i}`, expiryDate: new Date('2099-01-01'),
      quantity: 10, costPrice: 40, status: 'RELEASED',
    } });
    products.push(product);
  }
  const payload = (index = 0) => ({
    commandId: randomUUID(), shiftId: shift.id, paymentMethod: 'CASH' as const,
    orderDiscountAmount: 0, cartItems: [{ productId: products[index].id, quantity: 1, discountRate: 0 }],
  });
  return { tenantId, shift, products, payload };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function inTenant<T>(f: Fixture, run: () => T) { return tenantContext.run({ tenantId: f.tenantId, plan: 'pro' }, run); }
const clock = () => new Date('2026-10-08T16:00:00.000Z');
function barrier() { fault.barrier = true; fault.arrivals = 0; fault.gate = new Promise<void>(resolve => { fault.release = resolve; }); }

// Only rows belonging to synthetic tenants created in this suite are removed.
// Tenant cascade also removes counters; final harness independently checks zero.
afterEach(async () => {
  fault.release(); fault.barrier = false; fault.failAllocation = false;
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
afterAll(async () => { await basePrisma.$disconnect(); });

describe.skipIf(!databaseUrl)('Taipei order sequence (real PostgreSQL)', () => {
  it('allocates distinct numbers to simultaneous different commands on different stock', async () => {
    const f = await fixture(); barrier();
    const orders = await Promise.all([0, 1].map(i => inTenant(f, () => CheckoutService.checkout(f.payload(i), clock))));
    expect(orders.map(order => order.orderNumber).sort()).toEqual(['POS-20261009-00001', 'POS-20261009-00002']);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(2);
  });

  it('separates simultaneous commands on opposite sides of Taipei midnight', async () => {
    const f = await fixture(); barrier();
    const instants = ['2026-10-08T15:59:59.999Z', '2026-10-08T16:00:00.000Z'];
    const orders = await Promise.all(instants.map((instant, i) => inTenant(f, () => CheckoutService.checkout(f.payload(i), () => new Date(instant)))));
    expect(orders.map(order => order.orderNumber)).toEqual(['POS-20261008-00001', 'POS-20261009-00001']);
    expect(orders.map(order => order.businessDate)).toEqual(['2026-10-08T00:00:00.000Z', '2026-10-09T00:00:00.000Z']);
  });

  it('reads the numbering date after earlier stock work instead of freezing arrival time', async () => {
    const f = await fixture(); let reads = 0;
    const advancingClock = () => new Date(++reads <= 2 ? '2026-10-08T15:59:59.999Z' : '2026-10-08T16:00:00.000Z');
    const order = await inTenant(f, () => CheckoutService.checkout(f.payload(), advancingClock));
    expect(reads).toBe(3);
    expect(order.orderNumber).toBe('POS-20261009-00001');
    expect(order.businessDate).toBe('2026-10-09T00:00:00.000Z');
  });

  it('replays the immutable number after midnight and changed price and closed shift', async () => {
    const f = await fixture(); const dto = f.payload();
    const original = await inTenant(f, () => CheckoutService.checkout(dto, clock));
    await basePrisma.shift.update({ where: { id: f.shift.id }, data: { status: 'CLOSED' } });
    await basePrisma.product.update({ where: { id: f.products[0].id }, data: { retailPrice: 900 } });
    const replay = await inTenant(f, () => CheckoutService.checkout(dto, () => { throw new Error('Replay must not read the clock'); }));
    expect(replay).toEqual(original);
    expect((await inTenant(f, () => CheckoutCommandService.getResult(dto.commandId))).result).toEqual(original);
    const fresh = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    try {
      expect(await fresh.orderNumberCounter.findMany({ where: { tenantId: f.tenantId } })).toHaveLength(1);
      expect((await fresh.orderNumberCounter.findFirstOrThrow({ where: { tenantId: f.tenantId } })).lastSequence).toBe(1);
    } finally { await fresh.$disconnect(); }
  });

  it('rolls back a claimed number and all sale effects on late failure', async () => {
    const f = await fixture(); const dto = f.payload(); fault.failAllocation = true;
    await expect(inTenant(f, () => CheckoutService.checkout(dto, clock))).rejects.toThrow('Synthetic allocation failure');
    for (const count of await Promise.all([
      basePrisma.orderNumberCounter.count({ where: { tenantId: f.tenantId } }),
      basePrisma.order.count({ where: { tenantId: f.tenantId } }),
      basePrisma.checkoutCommand.count({ where: { tenantId: f.tenantId } }),
      basePrisma.orderPayment.count({ where: { tenantId: f.tenantId } }),
      basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } }),
      basePrisma.saleBatchAllocation.count({ where: { tenantId: f.tenantId } }),
    ])) expect(count).toBe(0);
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).stockQuantity).toBe(10);
    expect((await basePrisma.productBatch.findFirstOrThrow({ where: { tenantId: f.tenantId, productId: f.products[0].id } })).quantity).toBe(10);
    fault.failAllocation = false;
    expect((await inTenant(f, () => CheckoutService.checkout(dto, clock))).orderNumber).toBe('POS-20261009-00001');
  });

  it('allows 99999 once then explicitly rejects overflow without rollback gaps or wrapping', async () => {
    const f = await fixture();
    await basePrisma.orderNumberCounter.create({ data: { tenantId: f.tenantId, businessDate: new Date('2026-10-09'), lastSequence: 99998 } });
    expect((await inTenant(f, () => CheckoutService.checkout(f.payload(), clock))).orderNumber).toBe('POS-20261009-99999');
    await expect(inTenant(f, () => CheckoutService.checkout(f.payload(1), clock))).rejects.toMatchObject({ errorCode: 'ORDER_SEQUENCE_EXHAUSTED' });
    expect((await basePrisma.orderNumberCounter.findFirstOrThrow({ where: { tenantId: f.tenantId } })).lastSequence).toBe(99999);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect(await basePrisma.checkoutCommand.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.products[1].id } })).stockQuantity).toBe(10);
  });

  it('isolates counters and permits the same printed number in different tenants', async () => {
    const a = await fixture(); const b = await fixture();
    const results = await Promise.all([a, b].map(f => inTenant(f, () => CheckoutService.checkout(f.payload(), clock))));
    expect(results.map(order => order.orderNumber)).toEqual(['POS-20261009-00001', 'POS-20261009-00001']);
  });

  it('database uniqueness rejects another order with the same tenant and number', async () => {
    const f = await fixture();
    const order = await inTenant(f, () => CheckoutService.checkout(f.payload(), clock));
    await expect(basePrisma.order.create({ data: {
      tenantId: f.tenantId, customerId: order.customerId, orderNumber: order.orderNumber, totalAmount: 0,
    } })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('fresh FEFO checks reject an expiring batch after the injected clock crosses midnight', async () => {
    const f = await fixture();
    await basePrisma.productBatch.updateMany({ where: { tenantId: f.tenantId }, data: { expiryDate: new Date('2026-10-10T00:00:00+08:00') } });
    let reads = 0;
    const crossingClock = () => new Date(++reads === 1 ? '2026-10-09T15:59:59.999Z' : '2026-10-09T16:00:00.000Z');
    await expect(inTenant(f, () => CheckoutService.checkout(f.payload(), crossingClock))).rejects.toMatchObject({ statusCode: 400 });
    expect(reads).toBe(2);
    expect(await basePrisma.orderNumberCounter.count({ where: { tenantId: f.tenantId } })).toBe(0);
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.products[0].id } })).stockQuantity).toBe(10);
  });
});
