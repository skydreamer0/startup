import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { basePrisma } from '../lib/prisma';
import { tenantContext } from '../lib/tenant.context';
import { CheckoutService } from '../modules/pos/checkout.service';
import { CheckoutCommandService, checkoutPayloadHash } from '../modules/pos/checkout-command.service';

// No ambient DB fallback. The unchanged native runner proves ownership first.
const databaseUrl = process.env.CHECKOUT_RETRY_DATABASE_URL;
const expectedUrl = 'postgresql://test@127.0.0.1:55436/checkout_order_sequence_ci';
if (databaseUrl && (databaseUrl !== expectedUrl || process.env.DATABASE_URL !== databaseUrl)) {
  throw new Error('Checkout retry tests require the exact isolated fixture database');
}
const tenants: string[] = [];
async function fixture(quantity = 1) {
  const tenantId = randomUUID();
  await basePrisma.tenant.create({ data: { id: tenantId, name: 'Synthetic command test', slug: tenantId } });
  tenants.push(tenantId);
  const staff = await basePrisma.user.create({ data: { tenantId, email: `${tenantId}@command.test`, fullName: 'Synthetic cashier', passwordHash: 'not-a-login-hash' } });
  const customer = await basePrisma.customer.create({ data: { tenantId, phone: 'WALK_IN' } });
  const shift = await basePrisma.shift.create({ data: { tenantId, staffId: staff.id } });
  const product = await basePrisma.product.create({ data: { tenantId, sku: 'COMMAND', name: 'Synthetic product', retailPrice: 100, costPrice: 40, stockQuantity: quantity } });
  const batch = await basePrisma.productBatch.create({ data: { tenantId, productId: product.id, batchNumber: 'SYNTHETIC', expiryDate: new Date('2099-01-01'), quantity, costPrice: 40, status: 'RELEASED' } });
  const payload = { commandId: randomUUID(), shiftId: shift.id, paymentMethod: 'CASH' as const, orderDiscountAmount: 0, cartItems: [{ productId: product.id, quantity: 1, discountRate: 0 }], payments: [{ method: 'CASH' as const, amount: 100 }] };
  return { tenantId, staff, customer, shift, product, batch, payload };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
function inTenant<T>(f: Fixture, work: () => T) { return tenantContext.run({ tenantId: f.tenantId, plan: 'pro' }, work); }


async function removeFault() {
  await basePrisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS synthetic_retry ON checkout_commands');
  await basePrisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS synthetic_retry()');
  await basePrisma.$executeRawUnsafe('DROP SEQUENCE IF EXISTS synthetic_retry_attempts');
}

async function installFault(f: Fixture, code: '40001' | '40P01' | 'P0001', failures: number, deadlock = false) {
  await basePrisma.$executeRawUnsafe('CREATE SEQUENCE synthetic_retry_attempts');
  // Test-only sequence counts attempted writes across rollback; it is not a business effect.
  const body = deadlock ? `
    IF nextval('synthetic_retry_attempts') = 1 THEN
      PERFORM set_config('deadlock_timeout', '50ms', true);
      PERFORM pg_advisory_xact_lock(30030, 1);
      PERFORM pg_advisory_xact_lock(30030, 2);
    END IF;` : `
    IF nextval('synthetic_retry_attempts') <= ${failures} THEN
      RAISE EXCEPTION USING ERRCODE = '${code}', MESSAGE = 'Synthetic checkout abort';
    END IF;`;
  // The final command update occurs AFTER stock/order/payment/movement/allocation writes.
  await basePrisma.$executeRawUnsafe(`CREATE FUNCTION synthetic_retry() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.tenant_id = '${f.tenantId}' THEN ${body} END IF;
    RETURN NEW;
  END $$`);
  await basePrisma.$executeRawUnsafe('CREATE TRIGGER synthetic_retry BEFORE UPDATE ON checkout_commands FOR EACH ROW EXECUTE FUNCTION synthetic_retry()');
}

async function attempts() {
  const rows = await basePrisma.$queryRaw<{ count: number }[]>`SELECT last_value::integer AS count FROM synthetic_retry_attempts`;
  return rows[0].count;
}

async function saleState(f: Fixture, count: 0 | 1) {
  expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(1 - count);
  expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).quantity).toBe(1 - count);
  for (const actual of await Promise.all([
    basePrisma.checkoutCommand.count({ where: { tenantId: f.tenantId } }),
    basePrisma.order.count({ where: { tenantId: f.tenantId } }),
    basePrisma.orderItem.count({ where: { order: { tenantId: f.tenantId } } }),
    basePrisma.orderPayment.count({ where: { tenantId: f.tenantId } }),
    basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } }),
    basePrisma.saleBatchAllocation.count({ where: { tenantId: f.tenantId } }),
  ])) expect(actual).toBe(count);
  const counters = await basePrisma.orderNumberCounter.findMany({ where: { tenantId: f.tenantId } });
  expect(counters.map(counter => counter.lastSequence)).toEqual(count ? [1] : []);
}

async function replayOnce(f: Fixture, original: Awaited<ReturnType<typeof CheckoutService.checkout>>) {
  expect(await inTenant(f, () => CheckoutService.checkout(f.payload))).toEqual(original);
  const saved = await inTenant(f, () => CheckoutCommandService.getResult(f.payload.commandId));
  expect(saved).toMatchObject({ status: 'SUCCEEDED', payloadHash: checkoutPayloadHash(f.payload), result: original });
  await saleState(f, 1);
}

afterEach(async () => {
  if (!databaseUrl) return;
  await removeFault();
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
afterAll(() => basePrisma.$disconnect());


describe.skipIf(!databaseUrl)('Checkout abort retry (native PostgreSQL)', () => {
  it.each(['40001', '40P01'] as const)('retries server SQLSTATE %s after all sale writes and replays only one sale', async (code) => {
    const f = await fixture();
    await installFault(f, code, 2);
    const result = await inTenant(f, () => CheckoutService.checkout(f.payload));
    expect(await attempts()).toBe(3);
    await replayOnce(f, result);
    expect(await attempts()).toBe(3); // replay never invokes the sale callback
  });

  it.each(['40001', '40P01'] as const)('exhausts server SQLSTATE %s at three attempts, rolls back and reuses the same command', async (code) => {
    const f = await fixture();
    await installFault(f, code, 99);
    await expect(inTenant(f, () => CheckoutService.checkout(f.payload))).rejects.toThrow(code === '40001' ? 'write conflict' : 'code: "40P01"');
    expect(await attempts()).toBe(3);
    await saleState(f, 0);
    expect(await inTenant(f, () => CheckoutCommandService.getResult(f.payload.commandId))).toMatchObject({ status: 'UNKNOWN' });
    await removeFault();
    await replayOnce(f, await inTenant(f, () => CheckoutService.checkout(f.payload)));
  });

  it('propagates a nonretry server failure after all sale writes and rolls back once', async () => {
    const f = await fixture();
    await installFault(f, 'P0001', 99);
    await expect(inTenant(f, () => CheckoutService.checkout(f.payload))).rejects.toThrow('Synthetic checkout abort');
    expect(await attempts()).toBe(1);
    await saleState(f, 0);
    await removeFault();
    await replayOnce(f, await inTenant(f, () => CheckoutService.checkout(f.payload)));
  });

  it('allows concurrent resends during an aborted attempt with only one committed sale', async () => {
    const f = await fixture();
    await installFault(f, '40001', 1);
    const results = await Promise.all(Array.from({ length: 6 }, () => inTenant(f, () => CheckoutService.checkout(f.payload))));
    expect(await attempts()).toBe(2);
    for (const result of results) expect(result).toEqual(results[0]);
    await replayOnce(f, results[0]);
  });

  it('retries a real PostgreSQL deadlock victim after late writes without duplicate effects', async () => {
    const f = await fixture();
    await installFault(f, '40P01', 0, true);
    let release = () => {};
    const ready = new Promise<void>(resolve => { release = resolve; });
    const competitor = basePrisma.$transaction(async tx => {
      await tx.$executeRawUnsafe("SET LOCAL deadlock_timeout = '10s'");
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(30030, 2)::text`;
      release();
      // Wait until the checkout has key 1 and is waiting on key 2, then close the cycle.
      let waiting = false;
      for (let poll = 0; poll < 100; poll++) {
        const rows = await tx.$queryRaw<{ waiting: boolean }[]>`SELECT EXISTS (
          SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND classid = 30030 AND objid = 2 AND NOT granted
        ) AS waiting`;
        if (rows[0].waiting) { waiting = true; break; }
        await delay(10);
      }
      expect(waiting).toBe(true);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(30030, 1)::text`;
    });
    // Handle both promises immediately, including a setup failure before ready.
    const sale = Promise.race([ready, competitor.then(() => { throw new Error('Competitor exited before checkout'); })])
      .then(() => inTenant(f, () => CheckoutService.checkout(f.payload)));
    const [outcome, other] = await Promise.allSettled([sale, competitor]);
    expect(other.status).toBe('fulfilled');
    if (outcome.status === 'rejected') throw outcome.reason;
    expect(await attempts()).toBe(2);
    await replayOnce(f, outcome.value);
  });
});
