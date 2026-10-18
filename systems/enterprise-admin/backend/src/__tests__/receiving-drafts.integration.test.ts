import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Opt in explicitly: only the dedicated Actions-owned empty synthetic service.
const databaseUrl = process.env.RECEIVING_DRAFT_DATABASE_URL;
if (databaseUrl && (databaseUrl !== 'postgresql://test@127.0.0.1:55438/checkout_http_recovery_receiving_drafts_ci'
  || process.env.DATABASE_URL !== databaseUrl || process.env.RECEIVING_DRAFT_OWNED !== 'true')) {
  throw new Error('Refuse unowned receiving acceptance database');
}
describe.skipIf(!databaseUrl)('private receiving drafts with native PostgreSQL and real auth HTTP', () => {
  let db: typeof import('../lib/prisma').basePrisma;
  let service: typeof import('../modules/receiving-drafts/receiving-drafts.service').ReceivingDraftService;
  let context: typeof import('../lib/tenant.context').tenantContext;
  let sign: typeof import('../lib/jwt').signAccessToken;
  let app: ReturnType<typeof express>;
  const tenants = [randomUUID(), randomUUID()];
  const actors: Array<{ id: string; email: string; tenantId: string }> = [];
  const products: string[] = [];
  const payload = (title = '合成未完成收貨草稿', productId = '') => ({ title, lines: [{ id: randomUUID(), reviewed: false,
    fields: { productId, baseUnit: '', batchNumber: '', expiryDate: '', quantity: '待確認', note: '合成資料' } }] });
  const within = <T>(actor: number, fn: () => T) => context.run({ tenantId: actors[actor].tenantId, plan: 'pro' }, fn);
  const save = (id: string, expectedRevision = 0, data = payload(), actor = 0) => within(actor, () => service.save(id, actors[actor].id, { expectedRevision, payload: data }));
  const token = (actor = 0, permissions = ['read:products', 'create:products']) => sign({ userId: actors[actor].id,
    email: actors[actor].email, tenantId: actors[actor].tenantId, plan: 'pro', permissions });
  const http = (actor = 0, permissions?: string[]) => ({ Authorization: `Bearer ${token(actor, permissions)}` });
  async function stockSnapshot() { return { products: await db.product.findMany({ orderBy: { id: 'asc' } }),
    orders: await db.order.count(), batches: await db.productBatch.count(), movements: await db.inventoryTransaction.count(), payments: await db.orderPayment.count() }; }
  let baseline: Awaited<ReturnType<typeof stockSnapshot>>;
  beforeAll(async () => {
    ({ basePrisma: db } = await import('../lib/prisma'));
    ({ ReceivingDraftService: service } = await import('../modules/receiving-drafts/receiving-drafts.service'));
    ({ tenantContext: context } = await import('../lib/tenant.context'));
    ({ signAccessToken: sign } = await import('../lib/jwt'));
    const { setTenantContext } = await import('../middleware/tenant.middleware');
    const { default: routes } = await import('../modules/receiving-drafts/receiving-drafts.routes');
    const { errorMiddleware } = await import('../middleware/error.middleware');
    app = express(); app.use(express.json()); app.use(setTenantContext); app.use('/receiving-drafts', routes); app.use(errorMiddleware);
    for (const tenantId of tenants) await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: '合成收貨租戶', plan: 'pro' } });
    for (const [index, tenantId] of [tenants[0], tenants[1], tenants[0]].entries()) {
      actors.push(await db.user.create({ data: { tenantId, email: `${index}-${tenantId}@receiving.example.test`, fullName: '合成草稿作者', passwordHash: 'not-a-login-hash' } }));
    }
    for (const tenantId of tenants) products.push((await db.product.create({ data: { tenantId, sku: 'RECEIVING-SYNTHETIC', name: '合成選品', costPrice: 1, retailPrice: 2, stockQuantity: 12 } })).id);
    baseline = await stockSnapshot();
  });
  afterAll(async () => { if (db) await db.$disconnect(); }); // Keep append-only snapshots for receipts; owned harness drops only its disposable DB.

  it('atomically persists an incomplete private draft and immutable revision one', async () => {
    const id = randomUUID(), data = payload(); const row = await save(id, 0, data);
    expect(row).toMatchObject({ id, revision: 1, tenantId: tenants[0], ownerId: actors[0].id, payload: data });
    expect(await db.receivingDraftRevision.findMany({ where: { draftId: id } })).toMatchObject([{ revision: 1, payload: data }]);
  });
  it('admits exactly one concurrent create for the same draft UUID', async () => {
    const id = randomUUID(); const outcomes = await Promise.allSettled([save(id), save(id)]);
    expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(x => x.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } });
    expect(await db.receivingDraftRevision.count({ where: { draftId: id } })).toBe(1);
  });
  it('admits exactly one concurrent CAS update and retains both historical revisions', async () => {
    const id = randomUUID(); await save(id);
    const outcomes = await Promise.allSettled([save(id, 1, payload('版本 A')), save(id, 1, payload('版本 B'))]);
    expect(outcomes.filter(x => x.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.find(x => x.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } });
    const winner = outcomes.find(x => x.status === 'fulfilled');
    expect(await within(0, () => service.get(id, actors[0].id))).toEqual(winner && 'value' in winner ? winner.value : null);
    expect((await db.receivingDraftRevision.findMany({ where: { draftId: id }, orderBy: { revision: 'asc' } })).map(x => x.revision)).toEqual([1, 2]);
  });
  it('isolates list read history and update across tenants and same-tenant actors', async () => {
    const id = randomUUID(); await save(id);
    const missing = (await request(app).get(`/receiving-drafts/${randomUUID()}`).set(http())).body;
    for (const actor of [1, 2]) {
      for (const suffix of ['', '/history', '/history/1']) {
        const response = await request(app).get(`/receiving-drafts/${id}${suffix}`).set(http(actor));
        expect(response.status).toBe(404); expect(response.body).toEqual(missing);
      }
      const update = await request(app).put(`/receiving-drafts/${id}`).set(http(actor)).send({ expectedRevision: 1, payload: payload() });
      expect(update.status).toBe(404); expect(update.body).toEqual(missing);
      const list = await request(app).get('/receiving-drafts').set(http(actor));
      expect(list.status).toBe(200); expect(list.body.data.data).toEqual([]);
    }
    expect((await within(0, () => service.get(id, actors[0].id))).revision).toBe(1);
  });
  it('enforces real authentication active-user and existing read/create permissions', async () => {
    const id = randomUUID(), body = { expectedRevision: 0, payload: payload() };
    // Tenant resolution precedes route auth in the real stack. Exercise both gates without bypassing either.
    const unscoped = await request(app).put(`/receiving-drafts/${id}`).send(body);
    expect(unscoped.status).toBe(400);
    expect(unscoped.body.error.code).toBe('TENANT_REQUIRED');
    const anonymous = await request(app).put(`/receiving-drafts/${id}`).set('x-tenant-id', tenants[0]).send(body);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe('UNAUTHORIZED');
    expect((await request(app).get('/receiving-drafts').set(http(0, []))).status).toBe(403);
    expect((await request(app).put(`/receiving-drafts/${id}`).set(http(0, ['read:products'])).send(body)).status).toBe(403);
    await db.user.update({ where: { id: actors[2].id }, data: { status: 'inactive' } });
    try { expect((await request(app).get('/receiving-drafts').set(http(2))).status).toBe(401); }
    finally { await db.user.update({ where: { id: actors[2].id }, data: { status: 'active' } }); }
    expect(await db.receivingDraft.count({ where: { id } })).toBe(0);
  });
  it('enforces composite owner tenant foreign keys and append-only revision triggers', async () => {
    const id = randomUUID(); const row = await save(id);
    await expect(db.receivingDraft.create({ data: { id: randomUUID(), tenantId: tenants[0], ownerId: actors[1].id, title: '合成錯誤歸屬', revision: 1, payload: row.payload } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.receivingDraftRevision.create({ data: { draftId: id, tenantId: tenants[0], ownerId: actors[2].id, revision: 2, payload: row.payload } })).rejects.toMatchObject({ code: 'P2003' });
    await expect(db.receivingDraftRevision.updateMany({ where: { draftId: id }, data: { payload: payload('禁止覆寫') } })).rejects.toThrow(/append-only/);
    await expect(db.receivingDraftRevision.deleteMany({ where: { draftId: id } })).rejects.toThrow(/append-only/);
    expect(await db.receivingDraftRevision.count({ where: { draftId: id } })).toBe(1);
  });
  it('rejects cross-tenant product references without creating a draft', async () => {
    const id = randomUUID(); await expect(save(id, 0, payload('錯誤商品', products[1]))).rejects.toMatchObject({ statusCode: 400 });
    expect(await db.receivingDraft.count({ where: { id } })).toBe(0);
    expect(await db.receivingDraftRevision.count({ where: { draftId: id } })).toBe(0);
  });
  it('recovers a committed lost HTTP response using GET without another write', async () => {
    const id = randomUUID(), data = payload('合成失回應');
    // Discard the successful PUT body, modelling a transport that lost the response after commit.
    expect((await request(app).put(`/receiving-drafts/${id}`).set(http()).send({ expectedRevision: 0, payload: data })).status).toBe(200);
    const recovered = await request(app).get(`/receiving-drafts/${id}`).set(http());
    expect(recovered.status).toBe(200); expect(recovered.headers['cache-control']).toBe('no-store');
    expect(recovered.body.data).toMatchObject({ id, revision: 1, payload: data });
    expect(await db.receivingDraftRevision.count({ where: { draftId: id } })).toBe(1);
  });
  it('rolls back the head CAS when immutable snapshot insertion fails', async () => {
    const id = randomUUID(); const before = await save(id);
    // Synthetic DB-only collision forces the real transaction's snapshot INSERT to fail.
    await db.receivingDraftRevision.create({ data: { draftId: id, tenantId: tenants[0], ownerId: actors[0].id, revision: 2, payload: before.payload } });
    await expect(save(id, 1, payload('不得部分保存'))).rejects.toMatchObject({ statusCode: 409 });
    expect(await within(0, () => service.get(id, actors[0].id))).toEqual(before);
  });
  it('retains all stock order payment and movement data unchanged', async () => {
    expect(await stockSnapshot()).toEqual(baseline);
    expect(await db.receivingDraft.count()).toBeGreaterThan(0);
    expect(await db.receivingDraftRevision.count()).toBeGreaterThan(0);
  });
});
