import { randomUUID } from 'node:crypto';
import express from 'express';
import { createServer, type Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Opt in only to the existing exclusively owned pagination CI service.
const databaseUrl = process.env.PRODUCT_PAGINATION_DATABASE_URL;
if (databaseUrl && (databaseUrl !== 'postgresql://test@127.0.0.1:55434/checkout_http_recovery_inventory_pagination_ci'
    || process.env.DATABASE_URL !== databaseUrl)) {
    throw new Error('Product update HTTP acceptance requires the exact isolated pagination database');
}

describe.skipIf(!databaseUrl)('Product update errors through real HTTP and PostgreSQL', () => {
    let db: typeof import('../lib/prisma').basePrisma;
    let sign: typeof import('../lib/jwt').signAccessToken;
    let app: ReturnType<typeof express>;
    let server: Server;
    const tenants = [randomUUID(), randomUUID()];
    const actors: Array<{ id: string; email: string }> = [];
    let productId: string;
    const snapshot = () => db.product.findMany({ where: { tenantId: { in: tenants } }, orderBy: { id: 'asc' } });
    const headers = (index = 0, permissions = ['read:products', 'update:products']) => ({
        Authorization: `Bearer ${sign({ userId: actors[index].id, email: actors[index].email,
            tenantId: tenants[index], plan: 'pro', permissions })}`,
    });
    const missingBody = { success: false, error: { code: 'NOT_FOUND', message: 'Product not found' } };

    beforeAll(async () => {
        ({ basePrisma: db } = await import('../lib/prisma'));
        ({ signAccessToken: sign } = await import('../lib/jwt'));
        const { setTenantContext } = await import('../middleware/tenant.middleware');
        const { defaultRateLimit } = await import('../middleware/rate-limit.middleware');
        const { default: inventory } = await import('../modules/inventory/inventory.routes');
        const { errorMiddleware } = await import('../middleware/error.middleware');
        app = express(); app.use(express.json()); app.use(defaultRateLimit); app.use(setTenantContext);
        app.use('/inventory', inventory); app.use(errorMiddleware);
        server = createServer(app);
        await new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
        });
        for (const tenantId of tenants) {
            await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Synthetic update tenant', plan: 'pro' } });
            actors.push(await db.user.create({ data: { tenantId, email: `${tenantId}@update.example.test`,
                fullName: 'Synthetic update actor', passwordHash: 'not-a-login-hash' } }));
        }
        productId = (await db.product.create({ data: { tenantId: tenants[0], sku: 'UPDATE-OWNED',
            name: 'Synthetic original product', costPrice: 1, retailPrice: 2, stockQuantity: 7 } })).id;
    });
    afterAll(async () => {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        if (!db) return;
        try {
            await db.product.deleteMany({ where: { tenantId: { in: tenants } } });
            await db.user.deleteMany({ where: { tenantId: { in: tenants } } });
            await db.tenant.deleteMany({ where: { id: { in: tenants } } });
        } finally { await db.$disconnect(); }
    });

    it('returns generic HTTP 404 for a missing product without writes', async () => {
        const before = await snapshot();
        const response = await request(server).put(`/inventory/products/${randomUUID()}`).set(headers()).send({ name: 'Missing write' });
        expect(response.status).toBe(404); expect(response.body).toEqual(missingBody);
        expect(await snapshot()).toEqual(before);
    });
    it('returns identical HTTP 404 across tenants and preserves the owner product', async () => {
        const before = await snapshot();
        const response = await request(server).put(`/inventory/products/${productId}`).set(headers(1)).send({ name: 'Forbidden replacement' });
        expect(response.status).toBe(404); expect(response.body).toEqual(missingBody);
        expect(await snapshot()).toEqual(before);
        const owner = await request(server).get(`/inventory/products/${productId}`).set(headers());
        expect(owner.status).toBe(200); expect(owner.body.data.name).toBe(before[0].name);
    });
    it('persists an authorized owner metadata update without changing stock', async () => {
        const before = await db.product.findUniqueOrThrow({ where: { id: productId } });
        const response = await request(server).put(`/inventory/products/${productId}`).set(headers()).send({ name: 'Synthetic revised product' });
        expect(response.status).toBe(200); expect(response.body.data.name).toBe('Synthetic revised product');
        const after = await db.product.findUniqueOrThrow({ where: { id: productId } });
        expect(after).toEqual({ ...before, name: 'Synthetic revised product', updatedAt: after.updatedAt });
    });
    it('retains authentication and update permission rejection without writes', async () => {
        const before = await snapshot();
        const path = `/inventory/products/${productId}`;
        expect((await request(server).put(path).set('X-Tenant-Id', tenants[0]).send({ name: 'No token' })).status).toBe(401);
        expect((await request(server).put(path).set(headers(0, ['read:products'])).send({ name: 'No permission' })).status).toBe(403);
        expect(await snapshot()).toEqual(before);
    });
    it('rejects direct stock updates without changing persisted product data', async () => {
        const before = await snapshot();
        const response = await request(server).put(`/inventory/products/${productId}`).set(headers()).send({ stockQuantity: 999 });
        expect(response.status).toBe(400);
        expect(await snapshot()).toEqual(before);
    });
});
