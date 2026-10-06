import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { spawn } from 'node:child_process';

const fault = vi.hoisted(() => ({ stage: '', barrier: false, holdClaim: false, claimed: () => {}, claimReady: Promise.resolve(), arrivals: 0, release: () => {}, gate: Promise.resolve() }));
vi.mock('../lib/prisma', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/prisma')>();
  return { ...actual, prisma: actual.prisma.$extends({ query: { $allModels: { async $allOperations({ model, operation, args, query }) {
    const stage = `${model}.${operation}`;
    if (fault.barrier && stage === 'CheckoutCommand.createMany') {
      if (++fault.arrivals === 2) fault.release();
      await fault.gate;
    }
    const result = await query(args);
    if (fault.holdClaim && stage === 'CheckoutCommand.createMany') { fault.claimed(); await fault.gate; }
    if (fault.stage === stage) throw new Error(`Injected failure after ${stage}`);
    return result;
  } } } }) };
});
import { basePrisma } from '../lib/prisma';
import { tenantContext } from '../lib/tenant.context';
import { CheckoutService } from '../modules/pos/checkout.service';
import { CheckoutCommandService, checkoutPayloadHash } from '../modules/pos/checkout-command.service';
import { checkoutSchema } from '../modules/pos/pos.schema';
import hashVectors from '../../../infrastructure/api/checkout-command-hash-v1.json';
import app from '../app';
import { signAccessToken } from '../lib/jwt';

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

function commandProcess(f: Fixture, mode: string): Promise<{ code: number | null; signal: string | null; result?: unknown }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/__tests__/helpers/checkout-command.worker.ts', mode], { env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code && mode !== 'crash-before-commit') { reject(new Error(stderr)); return; }
      const line = stdout.split('\n').find((line) => line.startsWith('RESULT:'));
      resolve({ code, signal, result: line ? JSON.parse(line.slice(7)) : undefined });
    });
    child.stdin.end(JSON.stringify({ tenantId: f.tenantId, payload: f.payload }));
  });
}

async function noSale(f: Fixture, quantity: number) {
  expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(quantity);
  expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).quantity).toBe(quantity);
  for (const count of await Promise.all([
    basePrisma.checkoutCommand.count({ where: { tenantId: f.tenantId } }), basePrisma.order.count({ where: { tenantId: f.tenantId } }),
    basePrisma.orderPayment.count({ where: { tenantId: f.tenantId } }), basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } }),
    basePrisma.saleBatchAllocation.count({ where: { tenantId: f.tenantId } }),
  ])) expect(count).toBe(0);
}

afterEach(async () => {
  fault.release(); fault.stage = ''; fault.barrier = false; fault.holdClaim = false;
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
  it.each(hashVectors)('$name matches the backend/browser normalization v1 contract', ({ payload, sha256 }) => {
    expect(checkoutPayloadHash(checkoutSchema.body.parse(payload))).toBe(sha256);
  });
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

  it('replays the original result before changed shift, price, stock and refund checks', async () => {
    const f = await fixture();
    const original = await inTenant(f, () => CheckoutService.checkout(f.payload));
    await basePrisma.shift.update({ where: { id: f.shift.id }, data: { status: 'CLOSED' } });
    await basePrisma.product.update({ where: { id: f.product.id }, data: { retailPrice: 999 } });
    await inTenant(f, () => CheckoutService.refundOrder(original.id, 'Synthetic refund'));
    const replay = await inTenant(f, () => CheckoutService.checkout({ ...f.payload, adminPin: 'never-persist-this' }));
    expect(replay).toEqual(original);
    expect(await inTenant(f, () => CheckoutCommandService.getResult(f.payload.commandId))).toMatchObject({ commandId: f.payload.commandId, status: 'SUCCEEDED', result: original });
    expect(JSON.stringify(await basePrisma.checkoutCommand.findFirst({ where: { tenantId: f.tenantId } }))).not.toContain('never-persist-this');
  });

  it('returns HTTP 409 for a changed committed payload with no additional writes', async () => {
    const f = await fixture(2);
    const token = signAccessToken({ userId: f.staff.id, email: f.staff.email, tenantId: f.tenantId, plan: 'pro', permissions: ['manage:pos'] });
    const sale = await request(app).post('/api/v1/admin/pos/checkout').set('Authorization', `Bearer ${token}`).send(f.payload);
    expect(sale.status).toBe(201);
    const changed = await request(app).post('/api/v1/admin/pos/checkout').set('Authorization', `Bearer ${token}`).send({ ...f.payload, orderDiscountAmount: 5 });
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe('COMMAND_PAYLOAD_CONFLICT');
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(1);
    expect(await basePrisma.checkoutCommand.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect(await basePrisma.orderPayment.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect(await basePrisma.saleBatchAllocation.count({ where: { tenantId: f.tenantId } })).toBe(1);
  });

  it('normalizes defaults consistently between direct calls and HTTP without merging/reordering lines', async () => {
    const f = await fixture(3);
    const item = { productId: f.product.id, quantity: 1 };
    const rest = { commandId: f.payload.commandId, shiftId: f.payload.shiftId, paymentMethod: f.payload.paymentMethod, payments: f.payload.payments };
    const original = await inTenant(f, () => CheckoutService.checkout(f.payload));
    const token = signAccessToken({ userId: f.staff.id, email: f.staff.email, tenantId: f.tenantId, permissions: ['manage:pos'] });
    const replay = await request(app).post('/api/v1/admin/pos/checkout').set('Authorization', `Bearer ${token}`).send({ ...rest, cartItems: [item], orderDiscountNote: '', commandId: f.payload.commandId.toUpperCase(), adminPin: 'exclude-from-hash' });
    expect(replay.status).toBe(201);
    expect(replay.body.data).toEqual(original);
    const secondCommand = randomUUID();
    const different = await inTenant(f, () => CheckoutService.checkout({ ...f.payload, commandId: secondCommand, payments: [], cartItems: [f.payload.cartItems[0], { ...f.payload.cartItems[0], discountRate: 10 }] }));
    await expect(inTenant(f, () => CheckoutService.checkout({ ...f.payload, commandId: secondCommand, payments: [], cartItems: [{ ...f.payload.cartItems[0], discountRate: 10 }, f.payload.cartItems[0]] }))).rejects.toMatchObject({ statusCode: 409 });
    expect(different.items).toHaveLength(2);
    expect(different.payments).toHaveLength(1);
  });

  it('isolates lookup and replay by tenant, using only the existing POS permission', async () => {
    const first = await fixture(); const other = await fixture();
    other.payload.commandId = first.payload.commandId;
    const result = await inTenant(first, () => CheckoutService.checkout(first.payload));
    expect(await inTenant(other, () => CheckoutCommandService.getResult(first.payload.commandId))).toMatchObject({ status: 'UNKNOWN' });
    const otherResult = await inTenant(other, () => CheckoutService.checkout(other.payload));
    expect(otherResult.id).not.toBe(result.id);
    const token = signAccessToken({ userId: other.staff.id, email: other.staff.email, tenantId: other.tenantId, permissions: ['manage:pos'] });
    const found = await request(app).get(`/api/v1/admin/pos/checkout-commands/${first.payload.commandId}`).set('Authorization', `Bearer ${token}`);
    expect(found.status).toBe(200); expect(found.body.data.result.id).toBe(otherResult.id);
    expect((await request(app).get(`/api/v1/admin/pos/checkout-commands/${first.payload.commandId}`).set("x-tenant-id", first.tenantId)).status).toBe(401);
    const denied = signAccessToken({ userId: other.staff.id, email: other.staff.email, tenantId: other.tenantId, permissions: ['read:products'] });
    expect((await request(app).get(`/api/v1/admin/pos/checkout-commands/${first.payload.commandId}`).set('Authorization', `Bearer ${denied}`)).status).toBe(403);
  });

  it('chooses one committed payload winner for concurrent different payloads on the same key', async () => {
    const f = await fixture(2);
    fault.barrier = true; fault.arrivals = 0; fault.gate = new Promise<void>((resolve) => { fault.release = resolve; });
    const results = await Promise.allSettled([f.payload, { ...f.payload, paymentMethod: 'CARD' as const }].map((payload) => inTenant(f, () => CheckoutService.checkout(payload))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.flatMap((r) => r.status === 'rejected' ? [r.reason.statusCode] : [])).toEqual([409]);
    expect((await basePrisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stockQuantity).toBe(1);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(1);
  });

  it('allows only one distinct command to buy the last unit', async () => {
    const f = await fixture();
    const results = await Promise.allSettled([f.payload, { ...f.payload, commandId: randomUUID() }].map((payload) => inTenant(f, () => CheckoutService.checkout(payload))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.flatMap((r) => r.status === 'rejected' ? [r.reason.statusCode] : [])).toEqual([400]);
    expect(await basePrisma.checkoutCommand.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect((await basePrisma.productBatch.findUniqueOrThrow({ where: { id: f.batch.id } })).quantity).toBe(0);
  });

  it('reports an uncommitted claim as UNKNOWN without mistaking it for failure or confirmation', async () => {
    const f = await fixture(); fault.holdClaim = true;
    fault.gate = new Promise<void>((resolve) => { fault.release = resolve; });
    fault.claimReady = new Promise<void>((resolve) => { fault.claimed = resolve; });
    const sale = inTenant(f, () => CheckoutService.checkout(f.payload));
    await fault.claimReady;
    expect(await inTenant(f, () => CheckoutCommandService.getResult(f.payload.commandId))).toEqual({ commandId: f.payload.commandId, status: 'UNKNOWN' });
    fault.release(); await sale;
    expect(await inTenant(f, () => CheckoutCommandService.getResult(f.payload.commandId))).toMatchObject({ status: 'SUCCEEDED' });
  });

  it.each(['CheckoutCommand.createMany', 'Product.updateMany', 'ProductBatch.updateMany', 'Order.create', 'InventoryTransaction.create', 'SaleBatchAllocation.createMany', 'CheckoutCommand.updateMany'])('rolls back all writes after an injected %s failure, then reuses the original command', async (stage) => {
    const f = await fixture(); fault.stage = stage;
    await expect(inTenant(f, () => CheckoutService.checkout(f.payload))).rejects.toThrow('Injected failure');
    fault.stage = '';
    await noSale(f, 1);
    expect(await inTenant(f, () => CheckoutCommandService.getResult(f.payload.commandId))).toMatchObject({ status: 'UNKNOWN' });
    await inTenant(f, () => CheckoutService.checkout(f.payload));
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(1);
  });

  it('rolls back stock, order/items and command when PostgreSQL rejects a payment record', async () => {
    const f = await fixture();
    await basePrisma.$executeRawUnsafe(`CREATE FUNCTION synthetic_payment_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tenant_id = '${f.tenantId}' THEN RAISE EXCEPTION 'Injected payment failure'; END IF; RETURN NEW; END $$`);
    await basePrisma.$executeRawUnsafe('CREATE TRIGGER synthetic_payment_failure BEFORE INSERT ON order_payments FOR EACH ROW EXECUTE FUNCTION synthetic_payment_failure()');
    try {
      await expect(inTenant(f, () => CheckoutService.checkout(f.payload))).rejects.toThrow('Injected payment failure');
      await noSale(f, 1);
    } finally {
      await basePrisma.$executeRawUnsafe('DROP TRIGGER synthetic_payment_failure ON order_payments');
      await basePrisma.$executeRawUnsafe('DROP FUNCTION synthetic_payment_failure()');
    }
  });

  it('rolls back after a real process crash before commit and recovers in a new process', async () => {
    const f = await fixture();
    expect((await commandProcess(f, 'crash-before-commit')).signal).toBe('SIGKILL');
    await noSale(f, 1);
    expect(await inTenant(f, () => CheckoutCommandService.getResult(f.payload.commandId))).toMatchObject({ status: 'UNKNOWN' });
    const replay = await commandProcess(f, 'reply');
    expect(replay.code).toBe(0); expect(replay.result).toHaveProperty('id');
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(1);
  });

  it('recovers a committed lost response after the command service process exits and restarts', async () => {
    const f = await fixture();
    const lost = await commandProcess(f, 'drop-after-commit');
    expect(lost.code).toBe(0); expect(lost.result).toBeUndefined();
    const stored = await inTenant(f, () => CheckoutCommandService.getResult(f.payload.commandId));
    const replay = await commandProcess(f, 'reply');
    expect(stored.status).toBe('SUCCEEDED');
    if (stored.status === 'SUCCEEDED') expect(replay.result).toEqual(stored.result);
    expect(await basePrisma.order.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect(await basePrisma.orderPayment.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect(await basePrisma.inventoryTransaction.count({ where: { tenantId: f.tenantId } })).toBe(1);
    expect(await basePrisma.saleBatchAllocation.count({ where: { tenantId: f.tenantId } })).toBe(1);
  });

  it('enforces tenant/order/result identity constraints in PostgreSQL', async () => {
    const f = await fixture(); const other = await fixture();
    await inTenant(f, () => CheckoutService.checkout(f.payload));
    const saved = await basePrisma.checkoutCommand.findFirstOrThrow({ where: { tenantId: f.tenantId } });
    await expect(basePrisma.checkoutCommand.update({ where: { id: saved.id }, data: { tenantId: other.tenantId } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(basePrisma.checkoutCommand.update({ where: { id: saved.id }, data: { result: { id: randomUUID() } } })).rejects.toThrow('checkout_commands_result_state_check');
  });
});
