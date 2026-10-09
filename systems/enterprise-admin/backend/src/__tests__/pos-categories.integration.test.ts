import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

// Never fall back to ambient DATABASE_URL. Only the existing owned CI service is eligible.
const databaseUrl = process.env.POS_CATEGORIES_DATABASE_URL;
if (databaseUrl) {
  const expected = 'postgresql://test@127.0.0.1:55435/checkout_http_recovery_pos_lookup_ci';
  if (databaseUrl !== expected || process.env.DATABASE_URL !== expected
    || process.env.POS_PRODUCT_LOOKUP_DATABASE_URL !== expected || process.env.NODE_ENV !== 'test') {
    throw new Error('POS categories require the explicit isolated synthetic CI database');
  }
}

describe.skipIf(!databaseUrl)('POS categories with real PostgreSQL and HTTP middleware', () => {
  let db: typeof import('../lib/prisma').basePrisma;
  let service: typeof import('../modules/pos/checkout.service').CheckoutService;
  let context: typeof import('../lib/tenant.context').tenantContext;
  let sign: typeof import('../lib/jwt').signAccessToken;
  let app: ReturnType<typeof express>;
  const tenantIds = [randomUUID(), randomUUID(), randomUUID()];
  const users: Array<{ id: string; email: string; tenantId: string }> = [];
  const categoryRows: Array<Array<{ id: string; name: string }>> = [];
  let suspendedId: string;
  let baseline: unknown;
  let fixturesReady = false;

  const inTenant = <T>(index: number, work: () => T) => context.run({ tenantId: tenantIds[index], plan: 'pro' }, work);
  const token = (index: number, permissions = ['manage:pos'], userId = users[index].id) => sign({
    userId, email: users[index].email, tenantId: tenantIds[index], plan: 'pro', permissions,
  });
  const categories = (index: number, query = '') => request(app).get(`/pos/categories${query}`)
    .set('Authorization', `Bearer ${token(index)}`);
  async function snapshot() {
    const where = { tenantId: { in: tenantIds } };
    return {
      categories: await db.productCategory.findMany({ where, orderBy: { id: 'asc' } }),
      products: await db.product.findMany({ where, orderBy: { id: 'asc' } }),
      users: await db.user.findMany({ where, orderBy: { id: 'asc' } }),
      orders: await db.order.count({ where }),
      payments: await db.orderPayment.count({ where }),
      movements: await db.inventoryTransaction.count({ where }),
    };
  }

  beforeAll(async () => {
    // Load the real modules only after the opt-in guard, including Prisma, JWT,
    // tenant resolution, auth/RBAC, router, controller and error middleware. No mocks.
    ({ basePrisma: db } = await import('../lib/prisma'));
    ({ CheckoutService: service } = await import('../modules/pos/checkout.service'));
    ({ tenantContext: context } = await import('../lib/tenant.context'));
    ({ signAccessToken: sign } = await import('../lib/jwt'));
    const { setTenantContext } = await import('../middleware/tenant.middleware');
    const { defaultRateLimit } = await import('../middleware/rate-limit.middleware');
    const { default: posRoutes } = await import('../modules/pos/pos.routes');
    const { errorMiddleware } = await import('../middleware/error.middleware');
    app = express();
    // Match the production app's existing outer rate limit before tenant/auth work.
    app.use(defaultRateLimit);
    app.use(setTenantContext);
    app.use('/pos', posRoutes);
    app.use(errorMiddleware);
    for (const [index, tenantId] of tenantIds.entries()) {
      await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Synthetic category tenant', plan: 'pro' } });
      users.push(await db.user.create({ data: {
        tenantId, email: `${tenantId}@category.example.test`, fullName: 'Synthetic cashier', passwordHash: 'not-a-login-hash',
      }, select: { id: true, email: true, tenantId: true } }));
      const rows: Array<{ id: string; name: string }> = [];
      if (index < 2) {
        // Insert backwards to prove database ordering, and repeat names across tenants.
        for (const name of ['Z 零庫存', 'M 有商品', 'A 空分類']) {
          rows.push(await db.productCategory.create({ data: {
            tenantId, name, description: `Private synthetic description for tenant ${index}`,
          }, select: { id: true, name: true } }));
        }
        rows.reverse();
      }
      categoryRows.push(rows);
    }
    for (const index of [0, 1]) {
      await db.product.createMany({ data: Array.from({ length: 105 }, (_, n) => ({
        tenantId: tenantIds[index], sku: `CATEGORY-${n}`, name: `Synthetic category product ${n}`,
        categoryId: categoryRows[index][1].id, costPrice: 1, retailPrice: 2, stockQuantity: 3,
      })).concat([{
        tenantId: tenantIds[index], sku: 'CATEGORY-ZERO', name: 'Synthetic zero stock',
        categoryId: categoryRows[index][2].id, costPrice: 1, retailPrice: 2, stockQuantity: 0,
      }]) });
    }
    suspendedId = (await db.user.create({ data: {
      tenantId: tenantIds[0], email: `${randomUUID()}@category.example.test`, fullName: 'Synthetic suspended cashier',
      passwordHash: 'not-a-login-hash', status: 'suspended',
    } })).id;
    baseline = await snapshot();
    fixturesReady = true;
  });

  afterEach(async () => {
    if (fixturesReady) expect(await snapshot()).toEqual(baseline);
  });
  afterAll(async () => {
    if (!db) return;
    try {
      const where = { tenantId: { in: tenantIds } };
      await db.product.deleteMany({ where });
      await db.productCategory.deleteMany({ where });
      await db.user.deleteMany({ where });
      await db.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    } finally { await db.$disconnect(); }
  });

  it('isolates concurrent category service reads for same-name categories in different tenants', async () => {
    const results = await Promise.all([0, 1, 0, 1].map(index => inTenant(index, () => service.getCategories())));
    expect(results).toEqual([categoryRows[0], categoryRows[1], categoryRows[0], categoryRows[1]]);
    expect(categoryRows[0].map(row => row.id)).not.toEqual(categoryRows[1].map(row => row.id));
  });

  it('returns ordered id-name-only categories through real JWT tenant and permission middleware', async () => {
    const responses = await Promise.all([categories(0), categories(1)]);
    responses.forEach((response, index) => {
      expect(response.status).toBe(200);
      expect(response.headers['ratelimit-limit']).toBe('300');
      expect(response.body).toEqual({ success: true, data: categoryRows[index] });
      expect(response.body.data.every((row: object) => Object.keys(row).sort().join(',') === 'id,name')).toBe(true);
    });
  });

  it('keeps empty and zero-stock categories independent of capped or filtered product results', async () => {
    const auth = `Bearer ${token(0)}`;
    const capped = await request(app).get('/pos/products').set('Authorization', auth);
    expect(capped.status).toBe(200);
    expect(capped.body.data).toHaveLength(100);
    const missing = await request(app).get('/pos/products?q=does-not-exist').set('Authorization', auth);
    expect(missing.status).toBe(200);
    expect(missing.body.data).toEqual([]);
    for (const query of ['', '?q=does-not-exist', `?categoryId=${categoryRows[1][1].id}`, '?inStockOnly=true']) {
      const response = await categories(0, query);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ success: true, data: categoryRows[0] });
    }
  });

  it('returns a successful empty list only for the authenticated tenant without categories', async () => {
    const response = await categories(2);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [] });
  });

  it('rejects missing and invalid authentication without returning category data', async () => {
    for (const auth of [undefined, 'Bearer invalid-synthetic-token']) {
      let pending = request(app).get('/pos/categories').set('x-tenant-id', tenantIds[0]);
      if (auth) pending = pending.set('Authorization', auth);
      const response = await pending;
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body).not.toHaveProperty('data');
    }
  });

  it('rejects a real active user token without the existing manage-pos permission', async () => {
    const response = await request(app).get('/pos/categories').set('Authorization', `Bearer ${token(0, ['read:products'])}`);
    expect(response.status).toBe(403);
    expect(response.body.success).toBe(false);
    expect(response.body).not.toHaveProperty('data');
  });

  it('rejects a suspended user and a token used against a different tenant header', async () => {
    const suspended = await request(app).get('/pos/categories').set('Authorization', `Bearer ${token(0, ['manage:pos'], suspendedId)}`);
    expect(suspended.status).toBe(401);
    const foreign = await request(app).get('/pos/categories').set('Authorization', `Bearer ${token(0)}`).set('x-tenant-id', tenantIds[1]);
    expect(foreign.status).toBe(401);
    expect(foreign.body).not.toHaveProperty('data');
  });

  it('does not leak a prior tenant when authenticated requests alternate A-B-A', async () => {
    for (const index of [0, 1, 0]) {
      const response = await categories(index);
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(categoryRows[index]);
    }
  });

  it('fails closed when category service has no tenant context', async () => {
    await expect(service.getCategories()).rejects.toThrow('Tenant context missing');
  });
});
