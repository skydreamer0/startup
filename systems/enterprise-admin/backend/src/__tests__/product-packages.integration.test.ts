import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { packageAcceptanceDatabase } from './helpers/package-acceptance-guard';

const databaseUrl = packageAcceptanceDatabase();
describe.skipIf(!databaseUrl)('reviewed package mappings with native PostgreSQL and real HTTP', () => {
  let db: typeof import('../lib/prisma').basePrisma;
  let service: typeof import('../modules/inventory/product-packages.service').ProductPackagesService;
  let context: typeof import('../lib/tenant.context').tenantContext;
  let sign: typeof import('../lib/jwt').signAccessToken;
  let app: ReturnType<typeof express>;
  const tenantIds = [randomUUID(), randomUUID()];
  const products: string[] = [], actors: Array<{ id: string; email: string }> = [];
  const input = (code: string, extra = {}) => ({ label: '測試盒裝', contents: '測試規格／30 庫存單位', stockUnitLabel: '測試單位',
    unitsPerPackage: 30, source: '合成資料人工覆核 v1', reason: '合成初次覆核',
    validFrom: '2026-01-01T00:00:00.000Z', validUntil: null,
    identifiers: [{ namespace: 'MANUFACTURER' as const, value: code }], ...extra });
  const inTenant = <T>(index: number, work: () => T) => context.run({ tenantId: tenantIds[index], plan: 'pro' }, work);
  const save = (index: number, code: string, extra = {}) => inTenant(index, () => service.save(products[index], input(code, extra), actors[index].id));
  const lookup = (index: number, value: string, at?: Date) => inTenant(index, () => service.lookup({ namespace: 'MANUFACTURER', value }, at));
  const token = (index: number, permissions = ['manage:pos', 'read:products', 'update:products']) => sign({
    userId: actors[index].id, email: actors[index].email, tenantId: tenantIds[index], plan: 'pro', permissions,
  });
  const http = (index = 0, permissions?: string[]) => ({ Authorization: `Bearer ${token(index, permissions)}` });
  let emptyOtherTables: unknown;
  async function businessSnapshot() {
    return { products: await db.product.findMany({ orderBy: { id: 'asc' } }),
      orders: await db.order.count(), batches: await db.productBatch.count(), movements: await db.inventoryTransaction.count(), payments: await db.orderPayment.count() };
  }
  beforeAll(async () => {
    ({ basePrisma: db } = await import('../lib/prisma'));
    ({ ProductPackagesService: service } = await import('../modules/inventory/product-packages.service'));
    ({ tenantContext: context } = await import('../lib/tenant.context'));
    ({ signAccessToken: sign } = await import('../lib/jwt'));
    const { setTenantContext } = await import('../middleware/tenant.middleware');
    const { defaultRateLimit } = await import('../middleware/rate-limit.middleware');
    const { default: pos } = await import('../modules/pos/pos.routes');
    const { default: inventory } = await import('../modules/inventory/inventory.routes');
    const { errorMiddleware } = await import('../middleware/error.middleware');
    app = express(); app.use(express.json()); app.use(defaultRateLimit); app.use(setTenantContext);
    app.use('/pos', pos); app.use('/inventory', inventory); app.use(errorMiddleware);
    for (const tenantId of tenantIds) {
      await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: '合成包裝租戶', plan: 'pro' } });
      actors.push(await db.user.create({ data: { tenantId, email: `${tenantId}@package.example.test`, fullName: '合成覆核者', passwordHash: 'not-a-login-hash' } }));
      products.push((await db.product.create({ data: { tenantId, sku: '00123', name: '合成查找商品', costPrice: 1, retailPrice: 2, stockQuantity: 300 } })).id);
    }
    await db.product.createMany({ data: Array.from({ length: 110 }, (_, index) => ({ tenantId: tenantIds[0], sku: `A00123-${index}`, name: `A 模糊商品 ${index}`, costPrice: 1, retailPrice: 2 })) });
    emptyOtherTables = { orders: await db.order.count(), batches: await db.productBatch.count(), movements: await db.inventoryTransaction.count(), payments: await db.orderPayment.count() };
  });
  afterAll(async () => {
    if (!db) return;
    // Only this opt-in-owned, initially empty disposable database is eligible.
    // TRUNCATE is fixture cleanup, not an application history-deletion endpoint.
    try {
      await db.$executeRawUnsafe('TRUNCATE TABLE product_package_identifiers, product_package_revisions, product_packages');
      await db.product.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await db.user.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    } finally { await db.$disconnect(); }
  });

  it('persists multiple literal codes on one stable package without duplicated lookup results', async () => {
    const row = await save(0, '000AbC ', { identifiers: [{ namespace: 'MANUFACTURER', value: '000AbC ' }, { namespace: 'MANUFACTURER', value: 'SECOND' }, { namespace: 'GTIN', value: '6291041500213' }] });
    const first = await lookup(0, '000AbC '), second = await lookup(0, 'SECOND');
    expect(first).toHaveLength(1); expect(second).toHaveLength(1);
    expect(first[0].packageId).toBe(row.packageId); expect(second[0].packageId).toBe(row.packageId);
    expect(first[0]).toMatchObject({ revision: 1, unitsPerPackage: 30, stockUnitLabel: '測試單位' });
    expect(await lookup(0, '000abc ')).toEqual([]); expect(await lookup(0, '000AbC')).toEqual([]);
  });
  it('keeps namespaces and overlapping tenant codes distinct across the complete dataset', async () => {
    await save(1, '000AbC ');
    const responses = await Promise.all([0, 1, 0, 1].map(index => lookup(index, '000AbC ')));
    responses.forEach((rows, index) => { expect(rows).toHaveLength(1); expect(rows[0].product.id).toBe(products[index % 2]); });
    expect(await lookup(0, '6291041500213')).toEqual([]);
    const gtin = await inTenant(0, () => service.lookup({ namespace: 'GTIN', value: '6291041500213' }));
    expect(gtin).toHaveLength(1); expect(gtin[0].product.id).toBe(products[0]);
    expect((await request(app).get('/pos/products').set(http())).body.data).toHaveLength(100);
  });
  it('uses inclusive start and exclusive end without hiding future expired or zero-stock history', async () => {
    const from = '2030-01-01T00:00:00.000Z', until = '2030-02-01T00:00:00.000Z';
    await save(0, 'TEMPORAL', { validFrom: from, validUntil: until });
    expect(await lookup(0, 'TEMPORAL', new Date(Date.parse(from) - 1))).toEqual([]);
    expect(await lookup(0, 'TEMPORAL', new Date(from))).toHaveLength(1);
    expect(await lookup(0, 'TEMPORAL', new Date(Date.parse(until) - 1))).toHaveLength(1);
    expect(await lookup(0, 'TEMPORAL', new Date(until))).toEqual([]);
    const zero = await db.product.create({ data: { tenantId: tenantIds[0], sku: 'ZERO', name: '合成零庫存', costPrice: 0, retailPrice: 0 } });
    await inTenant(0, () => service.save(zero.id, input('ZERO-CODE'), actors[0].id));
    expect((await lookup(0, 'ZERO-CODE'))[0].product.stockQuantity).toBe(0);
  });
  it('returns different packages of the same product as explicit candidates', async () => {
    const first = await save(0, 'AMBIGUOUS', { label: '合成盒', unitsPerPackage: 30 });
    const second = await save(0, 'AMBIGUOUS', { label: '合成瓶', unitsPerPackage: 60 });
    const rows = await lookup(0, 'AMBIGUOUS');
    expect(rows).toHaveLength(2); expect(new Set(rows.map(row => row.packageId))).toEqual(new Set([first.packageId, second.packageId]));
    expect(new Set(rows.map(row => row.product.id))).toEqual(new Set([products[0]]));
  });
  it('retains retired history and creates a new revision instead of reactivating the old row', async () => {
    const row = await save(0, 'LIFECYCLE');
    await inTenant(0, () => service.retire(products[0], row.packageId, 1, '合成停用', actors[0].id));
    expect(await lookup(0, 'LIFECYCLE')).toEqual([]);
    await expect(inTenant(0, () => service.resolve({ namespace: 'MANUFACTURER', value: 'LIFECYCLE' }, row.packageId, 1))).rejects.toMatchObject({ statusCode: 409 });
    const next = await inTenant(0, () => service.save(products[0], input('LIFECYCLE'), actors[0].id, { packageId: row.packageId, expectedRevision: 1, expectedRetired: true }));
    expect(next.revision).toBe(2); expect(next.id).not.toBe(row.id);
    const old = await db.productPackageRevision.findUniqueOrThrow({ where: { id: row.id } });
    expect(old.retiredAt).not.toBeNull(); expect(old.retirementReason).toBe('合成停用');
    expect((await lookup(0, 'LIFECYCLE'))[0].revision).toBe(2);
  });
  it('retire then stale save returns HTTP 409 with no new mapping; refreshed replacement succeeds', async () => {
    const row = await save(0, 'RACE-RETIRE-FIRST');
    const path = `/inventory/products/${products[0]}/packages/${row.packageId}`;
    expect((await request(app).post(`${path}/retire`).set(http()).send({ expectedRevision: 1, reason: '合成停用' })).status).toBe(200);
    const before = await db.productPackageRevision.findMany({ where: { packageId: row.packageId }, include: { identifiers: true } });
    const draft = { expectedRevision: 1, expectedRetired: false, data: input('RACE-STALE-MAPPING') };
    expect((await request(app).post(`${path}/revisions`).set(http()).send(draft)).status).toBe(409);
    expect(await db.productPackageRevision.findMany({ where: { packageId: row.packageId }, include: { identifiers: true } })).toEqual(before);
    expect((await db.productPackage.findUniqueOrThrow({ where: { id: row.packageId } })).revision).toBe(1);
    expect(await lookup(0, 'RACE-STALE-MAPPING')).toEqual([]);
    const refreshed = await request(app).get(`/inventory/products/${products[0]}/packages`).set(http());
    expect(refreshed.status).toBe(200);
    const history = refreshed.body.data.packages as Array<{ id: string; revisions: Array<{ retiredAt: string | null }> }>;
    expect(history.find(item => item.id === row.packageId)!.revisions[0].retiredAt).not.toBeNull();
    const replacement = await request(app).post(`${path}/revisions`).set(http()).send({ ...draft, expectedRetired: true });
    expect(replacement.status).toBe(201); expect(replacement.body.data.revision).toBe(2);
    expect(await lookup(0, 'RACE-STALE-MAPPING')).toHaveLength(1);
  });
  it('save then stale retire returns HTTP 409 and leaves the new mapping active', async () => {
    const row = await save(0, 'RACE-SAVE-FIRST');
    const path = `/inventory/products/${products[0]}/packages/${row.packageId}`;
    const revised = await request(app).post(`${path}/revisions`).set(http()).send({ expectedRevision: 1, expectedRetired: false, data: input('RACE-SAVED-MAPPING') });
    expect(revised.status).toBe(201);
    expect((await request(app).post(`${path}/retire`).set(http()).send({ expectedRevision: 1, reason: '合成過期停用' })).status).toBe(409);
    expect(await db.productPackageRevision.count({ where: { packageId: row.packageId } })).toBe(2);
    expect((await lookup(0, 'RACE-SAVED-MAPPING'))[0].revision).toBe(2);
  });
  it.each(['retire', 'save'] as const)(
    'forces native lock overlap with %s first and rejects the stale second writer', async first => {
      const row = await save(0, `OVERLAP-${first}-ORIGINAL`);
      let unlock!: () => void;
      let reportLocked!: (pid: number) => void;
      const release = new Promise<void>(resolve => { unlock = resolve; });
      const locked = new Promise<number>(resolve => { reportLocked = resolve; });
      // A third real connection holds the identity row only long enough to
      // establish an observable PostgreSQL lock queue for two service calls.
      const holder = db.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM product_packages WHERE id = ${row.packageId} FOR UPDATE`;
        const [connection] = await tx.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
        reportLocked(connection.pid);
        await release;
      }, { timeout: 8000 });
      const holderOutcome = holder.then(() => ({ ok: true }), error => ({ error }));
      const calls: Array<Promise<{ ok: true; value: unknown } | { ok: false; error: unknown }>> = [];
      const capture = (call: Promise<unknown>) => {
        const outcome = call.then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }));
        calls.push(outcome); return outcome;
      };
      const run = (kind: 'retire' | 'save') => inTenant(0, () => kind === 'retire'
        ? service.retire(products[0], row.packageId, 1, 'synthetic overlap', actors[0].id)
        : service.save(products[0], input(`OVERLAP-${first}-NEW`), actors[0].id,
          { packageId: row.packageId, expectedRevision: 1, expectedRetired: false }));
      const waiterBehind = async (pid: number) => {
        const deadline = Date.now() + 900;
        do {
          const waiting = await db.$queryRaw<Array<{ pid: number }>>`
            SELECT pid FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
              AND ${pid}::int = ANY(pg_blocking_pids(pid))`;
          if (waiting.length === 1) return waiting[0].pid;
          await new Promise(resolve => setTimeout(resolve, 25));
        } while (Date.now() < deadline);
        throw new Error(`No unique PostgreSQL waiter behind PID ${pid}`);
      };
      try {
        const holderPid = await Promise.race([locked, holder.then(() => { throw new Error('holder ended before barrier'); })]);
        const firstResult = capture(run(first));
        const firstPid = await waiterBehind(holderPid);
        const secondResult = capture(run(first === 'retire' ? 'save' : 'retire'));
        const secondPid = await waiterBehind(firstPid);
        expect(new Set([holderPid, firstPid, secondPid]).size).toBe(3);
        unlock();
        expect(await holderOutcome).toEqual({ ok: true });
        expect((await firstResult).ok).toBe(true);
        expect(await secondResult).toMatchObject({ ok: false, error: { statusCode: 409 } });
        expect(await db.productPackageRevision.count({ where: { packageId: row.packageId } }))
          .toBe(first === 'retire' ? 1 : 2);
        expect(await lookup(0, `OVERLAP-${first}-NEW`)).toHaveLength(first === 'retire' ? 0 : 1);
        if (first === 'retire') {
          expect((await db.productPackageRevision.findUniqueOrThrow({ where: { id: row.id } })).retiredAt).not.toBeNull();
          const replacement = await inTenant(0, () => service.save(products[0], input('OVERLAP-REFRESHED'), actors[0].id,
            { packageId: row.packageId, expectedRevision: 1, expectedRetired: true }));
          expect(replacement.revision).toBe(2);
        } else {
          expect((await db.productPackageRevision.findFirstOrThrow({ where: { packageId: row.packageId, revision: 2 } })).retiredAt).toBeNull();
        }
      } finally {
        unlock();
        await Promise.allSettled([...calls, holderOutcome]);
      }
    }, 15000,
  );
  it.each(['mailto:synthetic@example.test', 'DATA:text/plain,synthetic', 'TeL:+886200000000',
    'javascript:alert(1)', 'sms:+886200000000', 'urn:uuid:synthetic'])(
    'rejects persisted URI mapping %s at lookup and resolve', async value => {
      // Preserve a pre-existing invalid mapping to prove read-path enforcement.
      const row = await save(0, value);
      expect(await db.productPackageIdentifier.count({ where: { revisionId: row.id, value } })).toBe(1);
      await expect(lookup(0, value)).rejects.toMatchObject({ statusCode: 422 });
      await expect(inTenant(0, () => service.resolve({ namespace: 'MANUFACTURER', value }, row.packageId, 1)))
        .rejects.toMatchObject({ statusCode: 422 });
      expect((await request(app).get('/pos/packages/lookup').query({ namespace: 'MANUFACTURER', value }).set(http())).status).toBe(422);
      expect((await request(app).post('/pos/packages/resolve').set(http()).send({
        identifier: { namespace: 'MANUFACTURER', value }, packageId: row.packageId, revision: 1,
      })).status).toBe(422);
    },
  );
  it('keeps manufacturer colon literals case- and whitespace-exact through lookup and resolve', async () => {
    const value = ' Maker:AbC ';
    const row = await save(0, value);
    expect((await lookup(0, value))[0].packageId).toBe(row.packageId);
    expect(await lookup(0, ' maker:AbC ')).toEqual([]);
    expect(await lookup(0, 'Maker:AbC ')).toEqual([]);
    expect(await lookup(0, ' Maker:AbC')).toEqual([]);
    await expect(inTenant(0, () => service.resolve({ namespace: 'MANUFACTURER', value }, row.packageId, 1)))
      .resolves.toMatchObject({ packageId: row.packageId, revision: 1 });
  });
  it('rejects stale concurrent revision writes atomically and preserves one current revision', async () => {
    const row = await save(0, 'CONCURRENT');
    const results = await Promise.allSettled([0, 1].map(index => inTenant(0, () => service.save(products[0], input(`CONCURRENT-${index}`), actors[0].id, { packageId: row.packageId, expectedRevision: 1 }))));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.statusCode).toBe(409);
    expect(await db.productPackageRevision.count({ where: { packageId: row.packageId, retiredAt: null } })).toBe(1);
    expect(await db.productPackageRevision.count({ where: { packageId: row.packageId } })).toBe(2);
  });
  it('rejects cross-tenant product actor and revision foreign keys in the native engine', async () => {
    await expect(db.productPackage.create({ data: { tenantId: tenantIds[0], productId: products[1] } })).rejects.toThrow();
    const row = await save(0, 'FK-BASE');
    await expect(inTenant(0, () => service.save(products[0], input('FK-ACTOR'), actors[1].id))).rejects.toThrow();
    await expect(db.productPackageIdentifier.create({ data: { tenantId: tenantIds[1], revisionId: row.id, namespace: 'MANUFACTURER', value: 'FK-LEAK' } })).rejects.toThrow();
    expect(await lookup(1, 'FK-LEAK')).toEqual([]);
  });
  it('enforces immutable revision identifier and stock-unit history in PostgreSQL', async () => {
    const row = await save(0, 'IMMUTABLE');
    await expect(db.productPackageRevision.update({ where: { id: row.id }, data: { label: 'silently replaced' } })).rejects.toThrow();
    await expect(db.productPackageRevision.delete({ where: { id: row.id } })).rejects.toThrow();
    await expect(db.productPackageIdentifier.updateMany({ where: { revisionId: row.id }, data: { value: 'silently replaced' } })).rejects.toThrow();
    await expect(db.productPackageIdentifier.create({ data: { tenantId: tenantIds[0], revisionId: row.id, namespace: 'MANUFACTURER', value: 'LATE-INSERT' } })).rejects.toThrow();
    expect(await lookup(0, 'LATE-INSERT')).toEqual([]);
    await expect(db.productPackageRevision.update({ where: { id: row.id }, data: { retiredAt: new Date(), retiredById: actors[0].id } })).rejects.toThrow();
    await expect(db.product.update({ where: { id: products[0] }, data: { stockUnitLabel: 'different unit' } })).rejects.toThrow();
    await expect(save(0, 'BAD-UNIT', { stockUnitLabel: 'different unit' })).rejects.toMatchObject({ statusCode: 409 });
  });
  it('requires authenticated permissions and isolates real HTTP lookup maintenance and confirmation', async () => {
    expect((await request(app).get('/pos/packages/lookup').query({ namespace: 'MANUFACTURER', value: 'SECOND' }).set('X-Tenant-Id', tenantIds[0])).status).toBe(401);
    expect((await request(app).get('/pos/packages/lookup').query({ namespace: 'MANUFACTURER', value: 'SECOND' }).set(http(0, []))).status).toBe(403);
    expect((await request(app).post(`/inventory/products/${products[0]}/packages`).send(input('DENIED')).set(http(0, ['read:products']))).status).toBe(403);
    const created = await request(app).post(`/inventory/products/${products[0]}/packages`).send(input('HTTP-CODE')).set(http());
    expect(created.status).toBe(201);
    const rows = await request(app).get('/pos/packages/lookup').query({ namespace: 'MANUFACTURER', value: 'HTTP-CODE' }).set(http());
    expect(rows.status).toBe(200); expect(rows.body.data).toHaveLength(1);
    const selected = rows.body.data[0];
    const resolved = await request(app).post('/pos/packages/resolve').send({ identifier: { namespace: 'MANUFACTURER', value: 'HTTP-CODE' }, packageId: selected.packageId, revision: selected.revision }).set(http());
    expect(resolved.status).toBe(200); expect(resolved.body.data.revisionId).toBe(selected.revisionId);
    expect((await request(app).get(`/inventory/products/${products[0]}/packages`).set(http(1))).status).toBe(404);
    expect((await request(app).get('/pos/packages/lookup').query({ namespace: 'MANUFACTURER', value: 'HTTP-CODE', tenantId: tenantIds[1] }).set(http())).status).toBe(400);
    const other = await request(app).get('/pos/packages/lookup').query({ namespace: 'MANUFACTURER', value: 'HTTP-CODE' }).set(http(1));
    expect(other.body.data).toEqual([]);
    const header = await request(app).get('/pos/packages/lookup').query({ namespace: 'MANUFACTURER', value: 'HTTP-CODE' }).set(http()).set('X-Tenant-Id', tenantIds[1]);
    expect(header.status).toBe(401);
  });
  it('blocks unknown conversion and stale confirmation without lookup side effects', async () => {
    const row = await save(0, 'UNKNOWN', { unitsPerPackage: null });
    const before = await businessSnapshot();
    expect(await lookup(0, 'UNKNOWN')).toHaveLength(1);
    await expect(inTenant(0, () => service.resolve({ namespace: 'MANUFACTURER', value: 'UNKNOWN' }, row.packageId, 1))).rejects.toMatchObject({ statusCode: 422 });
    expect(await businessSnapshot()).toEqual(before);
    expect({ orders: before.orders, batches: before.batches, movements: before.movements, payments: before.payments }).toEqual(emptyOtherTables);
  });
});
