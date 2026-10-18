import { randomUUID } from 'node:crypto';
import express from 'express';
import { createServer, type Server } from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.PRODUCT_PAGINATION_DATABASE_URL;
if (databaseUrl && (databaseUrl !== 'postgresql://test@127.0.0.1:55434/checkout_http_recovery_inventory_pagination_ci'
    || process.env.DATABASE_URL !== databaseUrl)) {
    throw new Error('Stock reconciliation acceptance requires the exact isolated pagination database');
}

describe.skipIf(!databaseUrl)('Stock reconciliation through real HTTP and PostgreSQL', () => {
    let db: typeof import('../lib/prisma').basePrisma;
    let sign: typeof import('../lib/jwt').signAccessToken;
    let server: Server;
    const tenants = [randomUUID(), randomUUID()];
    const actors: Array<{ id: string; email: string }> = [];
    let productId: string;
    const headers = (index = 0, permissions = ['read:products']) => ({
        Authorization: `Bearer ${sign({ userId: actors[index].id, email: actors[index].email,
            tenantId: tenants[index], plan: 'pro', permissions })}`,
    });
    const snapshot = async () => ({
        products: await db.product.findMany({ where: { tenantId: { in: tenants } }, orderBy: { id: 'asc' } }),
        batches: await db.productBatch.findMany({ where: { tenantId: { in: tenants } }, orderBy: { id: 'asc' } }),
        movements: await db.inventoryTransaction.findMany({ where: { tenantId: { in: tenants } }, orderBy: { id: 'asc' } }),
        packages: await db.productPackage.findMany({ where: { tenantId: { in: tenants } } }),
    });
    beforeAll(async () => {
        ({ basePrisma: db } = await import('../lib/prisma'));
        ({ signAccessToken: sign } = await import('../lib/jwt'));
        const { setTenantContext } = await import('../middleware/tenant.middleware');
        const { defaultRateLimit } = await import('../middleware/rate-limit.middleware');
        const { default: inventory } = await import('../modules/inventory/inventory.routes');
        const { errorMiddleware } = await import('../middleware/error.middleware');
        const app = express(); app.use(express.json()); app.use(defaultRateLimit); app.use(setTenantContext);
        app.use('/inventory', inventory); app.use(errorMiddleware); server = createServer(app);
        await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); }); });
        for (const tenantId of tenants) {
            await db.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Synthetic reconciliation tenant', plan: 'pro' } });
            actors.push(await db.user.create({ data: { tenantId, email: `${tenantId}@reconciliation.example.test`, fullName: 'Synthetic actor', passwordHash: 'not-a-login-hash' } }));
        }
        productId = (await db.product.create({ data: { tenantId: tenants[0], sku: 'RECON-LEGACY', name: 'A discrepancy', costPrice: 1, retailPrice: 2, stockQuantity: 9 } })).id;
        for (const [batchNumber, status, quantity, expiry] of [
            ['released', 'RELEASED', 1, '2099-01-01'], ['expired', 'RELEASED', 1, '2000-01-01'],
            ['quarantine', 'QUARANTINE', 1, '2099-01-01'], ['blocked', 'BLOCKED', 1, '2099-01-01'],
        ] as const) await db.productBatch.create({ data: { tenantId: tenants[0], productId, batchNumber, status, quantity, expiryDate: new Date(expiry), costPrice: 1 } });
        await db.inventoryTransaction.create({ data: { tenantId: tenants[0], productId, type: 'IN', quantity: 9, notes: 'Synthetic legacy receipt without batch' } });
        for (let i = 0; i < 51; i++) await db.product.create({ data: { tenantId: tenants[0], sku: `RECON-${i}`, name: 'B same name', costPrice: 1, retailPrice: 2 } });
        await db.product.create({ data: { tenantId: tenants[1], sku: 'OTHER', name: 'Other tenant private product', costPrice: 1, retailPrice: 2, stockQuantity: 999 } });
    });
    afterAll(async () => {
        if (server?.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        if (!db) return;
        try {
            await db.inventoryTransaction.deleteMany({ where: { tenantId: { in: tenants } } });
            await db.productBatch.deleteMany({ where: { tenantId: { in: tenants } } });
            await db.product.deleteMany({ where: { tenantId: { in: tenants } } });
            await db.user.deleteMany({ where: { tenantId: { in: tenants } } });
            await db.tenant.deleteMany({ where: { id: { in: tenants } } });
        } finally { await db.$disconnect(); }
    });
    it('reports the preserved legacy 9 versus 4 discrepancy with explicit untraced history', async () => {
        const before = await snapshot();
        const response = await request(server).get('/inventory/stock-reconciliation').set(headers());
        expect(response.status).toBe(200);
        expect(response.body.data.data.find((row: { id: string }) => row.id === productId)).toMatchObject({
            stockQuantity: 9, physicalBatchQuantity: 4, difference: 5, batchCount: 4,
            releasedQuantity: 2, quarantineQuantity: 1, blockedQuantity: 1, expiredQuantity: 1,
            eligibleReleasedQuantity: 1, untracedReceiptCount: 1, reservedQuantity: null, availableQuantity: null, historyComplete: null,
        });
        expect(await snapshot()).toEqual(before);
    });
    it('paginates stable same-name products without duplicates or missing rows', async () => {
        const first = await request(server).get('/inventory/stock-reconciliation?page=1').set(headers());
        const second = await request(server).get('/inventory/stock-reconciliation?page=2').set(headers());
        expect([first.status, second.status]).toEqual([200, 200]);
        expect([first.body.data.total, second.body.data.total]).toEqual([52, 52]);
        expect([first.body.data.data.length, second.body.data.data.length]).toEqual([50, 2]);
        const rows = [...first.body.data.data, ...second.body.data.data];
        expect(new Set(rows.map(row => row.id)).size).toBe(52);
        expect(rows.map(row => row.id)).toEqual((await db.product.findMany({ where: { tenantId: tenants[0] }, orderBy: [{ name: 'asc' }, { id: 'asc' }] })).map(row => row.id));
    });
    it('isolates concurrent tenant counts and batch totals', async () => {
        const [a, b] = await Promise.all([0, 1].map(index => request(server).get('/inventory/stock-reconciliation').set(headers(index))));
        expect([a.status, b.status]).toEqual([200, 200]);
        expect(a.body.data.total).toBe(52); expect(b.body.data.total).toBe(1);
        expect(b.body.data.data[0]).toMatchObject({ sku: 'OTHER', stockQuantity: 999, physicalBatchQuantity: 0, batchCount: 0 });
        expect(JSON.stringify(a.body)).not.toContain('Other tenant private product');
        expect(JSON.stringify(b.body)).not.toContain('RECON-LEGACY');
    });
    it('rejects unauthenticated and unauthorized readers without writes', async () => {
        const before = await snapshot(); const path = '/inventory/stock-reconciliation';
        expect((await request(server).get(path).set('X-Tenant-Id', tenants[0])).status).toBe(401);
        expect((await request(server).get(path).set(headers(0, ['update:products']))).status).toBe(403);
        expect(await snapshot()).toEqual(before);
    });
    it('distinguishes invalid pages from valid empty pages without writes', async () => {
        const before = await snapshot();
        expect((await request(server).get('/inventory/stock-reconciliation?page=1x').set(headers())).status).toBe(400);
        const empty = await request(server).get('/inventory/stock-reconciliation?page=3').set(headers());
        expect(empty.status).toBe(200); expect(empty.body.data).toMatchObject({ total: 52, page: 3, data: [] });
        expect(await snapshot()).toEqual(before);
    });
});
