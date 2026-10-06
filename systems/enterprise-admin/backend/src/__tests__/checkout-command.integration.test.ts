import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { basePrisma } from '../lib/prisma';
import { tenantContext } from '../lib/tenant.context';
import { CheckoutService } from '../modules/pos/checkout.service';

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

afterEach(async () => {
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

describe('Checkout command recovery (real PostgreSQL)', () => {
  it('returns the same original result to concurrent copies of one command with only one sale', async () => {
    const f = await fixture();
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => inTenant(f, () => CheckoutService.checkout(f.payload))));
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
    const values = results.flatMap((r) => r.status === 'fulfilled' ? [JSON.parse(JSON.stringify(r.value))] : []);
    expect(values).toHaveLength(6);
    for (const value of values) expect(value).toEqual(values[0]);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect(await basePrisma.orderPayment.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect(await basePrisma.saleBatchAllocation.count({ where: { tenantId: f.tenantId } })).toBe(1);
  });
});
