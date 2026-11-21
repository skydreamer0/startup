import { createHash, randomUUID } from 'node:crypto';
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
    const { defaultRateLimit } = await import('../middleware/rate-limit.middleware');
    const { default: routes } = await import('../modules/receiving-drafts/receiving-drafts.routes');
    const { errorMiddleware } = await import('../middleware/error.middleware');
    app = express(); app.use(express.json()); app.use(defaultRateLimit); app.use(setTenantContext); app.use('/receiving-drafts', routes); app.use(errorMiddleware);
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
    const { default: realApp } = await import('../app');
    const { hashPassword } = await import('../lib/password');
    const password = randomUUID();
    const passwordHash = await hashPassword(password);
    const reader = await db.user.create({ data: { tenantId: tenants[0], email: `${randomUUID()}@receiving.example.test`, fullName: '合成唯讀人員', passwordHash } });
    const grants = await Promise.all(['read', 'create'].map(action => db.permission.create({ data: { action, resource: 'products' } })));
    const headers: { Authorization: string }[] = [];
    for (const actor of [...actors, reader]) {
      await db.user.update({ where: { id: actor.id }, data: { passwordHash } });
      const role = await db.role.create({ data: { tenantId: actor.tenantId, name: `receiving-${actor.id}` } });
      await db.rolePermission.createMany({ data: grants.filter(g => actor !== reader || g.action === 'read').map(g => ({ roleId: role.id, permissionId: g.id })) });
      await db.userRole.create({ data: { userId: actor.id, roleId: role.id } });
      const login = await request(realApp).post('/api/v1/admin/auth/login').set('x-tenant-id', actor.tenantId).send({ email: actor.email, password });
      expect(login.status).toBe(200);
      headers.push({ Authorization: `Bearer ${login.body.data.accessToken}` });
    }
    // Compare every raw business table, including immutable revisions, without writing sensitive fields to test output.
    const snapshot = async () => {
      const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
      const digests: Record<string, string> = {};
      for (const { tablename } of tables) {
        if (!/^[a-z_]+$/.test(tablename)) throw new Error('Unexpected table name');
        const rows = await db.$queryRawUnsafe<{ row: string }[]>(`SELECT row_to_json(t)::text AS row FROM public."${tablename}" t ORDER BY row_to_json(t)::text`);
        digests[tablename] = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
      }
      return digests;
    };
    const drafts = '/api/v1/admin/receiving-drafts';
    const id = randomUUID(), original = payload();
    const url = `${drafts}/${id}`;
    expect((await request(realApp).put(url).set(headers[0]).send({ expectedRevision: 0, payload: original })).status).toBe(200);
    const before = await snapshot();
    const missing = await request(realApp).get(`${drafts}/${randomUUID()}`).set(headers[0]);
    expect(missing.status).toBe(404);
    for (const actor of [1, 2]) {
      for (const suffix of ['', '/history', '/history/1']) {
        const response = await request(realApp).get(url + suffix).set(headers[actor]);
        expect(response.status).toBe(404); expect(response.body).toEqual(missing.body);
      }
      const update = await request(realApp).put(url).set(headers[actor]).send({ expectedRevision: 1, payload: payload('禁止覆寫') });
      expect(update.status).toBe(404); expect(update.body).toEqual(missing.body);
      const list = await request(realApp).get(drafts).query({ ownerId: actors[0].id, tenantId: tenants[0] }).set(headers[actor]);
      expect(list.status).toBe(200); expect(list.body.data.data).toEqual([]);
    }
    for (const [draftId, expectedRevision] of [[randomUUID(), 0], [id, 1]] as const) {
      const denied = await request(realApp).put(`${drafts}/${draftId}`).set(headers[3]).send({ expectedRevision, payload: original });
      expect(denied.status).toBe(403);
    }
    const own = await request(realApp).get(url + '/history/1').set(headers[0]);
    expect(own.status).toBe(200);
    expect(own.body.data).toMatchObject({ revision: 1, payload: original });
    expect(await snapshot()).toEqual(before);
  }, 30000);
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
