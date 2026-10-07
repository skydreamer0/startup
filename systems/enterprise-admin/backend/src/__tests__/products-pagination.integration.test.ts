import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { basePrisma } from '../lib/prisma';
import { tenantContext } from '../lib/tenant.context';
import { InventoryService } from '../modules/inventory/inventory.service';

// Opt in explicitly: never fall back to the checkout's ambient DATABASE_URL.
const databaseUrl = process.env.PRODUCT_PAGINATION_DATABASE_URL;
if (databaseUrl) {
    const url = new URL(databaseUrl);
    if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || !url.port
        || url.username !== 'test' || url.password
        || !/^\/checkout_http_recovery_inventory_pagination_[a-z0-9_]+$/.test(url.pathname)
        || process.env.DATABASE_URL !== databaseUrl) {
        throw new Error('Product pagination requires an explicit isolated synthetic loopback database');
    }
}

describe.skipIf(!databaseUrl)('Product pagination through real tenant-scoped Prisma (PostgreSQL)', () => {
    const ownedTenants: string[] = [];
    let tenantA: string;
    let tenantB: string;
    let ids: Record<string, string>;
    let supplierId: string;
    let categoryId: string;

    const inTenant = <T>(tenantId: string, work: () => T) => tenantContext.run({ tenantId, plan: 'pro' }, work);

    beforeEach(async () => {
        tenantA = randomUUID();
        tenantB = randomUUID();
        for (const id of [tenantA, tenantB]) {
            await basePrisma.tenant.create({ data: { id, slug: id, name: 'Synthetic pagination tenant' } });
            ownedTenants.push(id);
        }
        const supplier = await basePrisma.supplier.create({ data: { tenantId: tenantA, name: 'Synthetic supplier' } });
        const category = await basePrisma.productCategory.create({ data: { tenantId: tenantA, name: 'Synthetic category' } });
        supplierId = supplier.id;
        categoryId = category.id;
        ids = {};
        for (const [name, stockQuantity, safetyStock] of [
            ['E', 0, 0], ['D', 2, 2], ['C', 1, 3], ['B', 10, 3], ['A', 10, 3],
        ] as const) {
            const row = await basePrisma.product.create({ data: {
                tenantId: tenantA, sku: name, name, stockQuantity, safetyStock, costPrice: 1, retailPrice: 2,
                ...(name === 'C' ? { supplierId, categoryId } : {}),
            } });
            ids[name] = row.id;
        }
        await basePrisma.product.createMany({ data: [
            { tenantId: tenantB, sku: 'A', name: 'A', stockQuantity: 10, safetyStock: 1, costPrice: 1, retailPrice: 2 },
            { tenantId: tenantB, sku: 'C', name: 'C', stockQuantity: 0, safetyStock: 0, costPrice: 1, retailPrice: 2 },
        ] });
    });

    afterEach(async () => {
        for (const tenantId of ownedTenants.splice(0)) {
            await basePrisma.product.deleteMany({ where: { tenantId } });
            await basePrisma.supplier.deleteMany({ where: { tenantId } });
            await basePrisma.productCategory.deleteMany({ where: { tenantId } });
            await basePrisma.tenant.delete({ where: { id: tenantId } });
        }
    });
    afterAll(() => basePrisma.$disconnect());

    it('filters by each row safetyStock before paging and counts all matches on every page', async () => {
        const pages = await inTenant(tenantA, () => Promise.all(['1', '2', '3'].map((page) =>
            InventoryService.getProducts({ lowStock: 'true', page, limit: '2' }))));

        expect(pages.map((page) => page.total)).toEqual([3, 3, 3]);
        expect(pages.map((page) => page.data.map((row) => row.id))).toEqual([[ids.C, ids.D], [ids.E], []]);
        expect(pages.map(({ page, limit }) => ({ page, limit }))).toEqual([
            { page: 1, limit: 2 }, { page: 2, limit: 2 }, { page: 3, limit: 2 },
        ]);
        expect(pages.flatMap((page) => page.data).every((row) => row.isLowStock)).toBe(true);
    });

    it('retains supplier/category objects and null relations in the existing data shape', async () => {
        const result = await inTenant(tenantA, () => InventoryService.getProducts({ lowStock: 'true' }));

        expect(result.data[0]).toMatchObject({
            id: ids.C, isLowStock: true,
            supplier: { id: supplierId, name: 'Synthetic supplier' },
            category: { id: categoryId, name: 'Synthetic category' },
        });
        expect(result.data[1]).toMatchObject({ id: ids.D, supplier: null, category: null, isLowStock: true });
    });

    it.each([undefined, 'false'])('keeps all tenant products and defaults with lowStock=%s', async (lowStock) => {
        const result = await inTenant(tenantA, () => InventoryService.getProducts({ lowStock }));

        expect(result).toMatchObject({ total: 5, page: 1, limit: 50 });
        expect(result.data.map((row) => row.id)).toEqual(['A', 'B', 'C', 'D', 'E'].map((name) => ids[name]));
        expect(result.data.map((row) => row.isLowStock)).toEqual([false, false, true, true, true]);
    });

    it('uses name then unique ID with reversed same-name insertion and no duplicate or missing rows', async () => {
        await basePrisma.product.deleteMany({ where: { tenantId: tenantA } });
        const prefix = randomUUID().slice(0, 24);
        const expected = [1, 2, 3, 4].map((number) => prefix + String(number).padStart(12, '0'));
        for (const id of [...expected].reverse()) {
            await basePrisma.product.create({ data: {
                id, tenantId: tenantA, sku: id, name: 'Same name', stockQuantity: 0, safetyStock: 1, costPrice: 1, retailPrice: 2,
            } });
        }
        const pages = await inTenant(tenantA, () => Promise.all(['1', '2', '3'].map((page) =>
            InventoryService.getProducts({ lowStock: 'true', page, limit: '2' }))));

        expect(pages.map((page) => page.total)).toEqual([4, 4, 4]);
        expect(pages.flatMap((page) => page.data.map((row) => row.id))).toEqual(expected);
    });

    it('isolates both data and count for concurrent tenant A/B queries', async () => {
        const [a, b] = await Promise.all([tenantA, tenantB].map((tenantId) => inTenant(tenantId, () =>
            InventoryService.getProducts({ lowStock: 'true', limit: '2' }))));

        expect(a.total).toBe(3);
        expect(a.data.map((row) => row.id)).toEqual([ids.C, ids.D]);
        expect(b.total).toBe(1);
        expect(b.data).toHaveLength(1);
        expect(a.data.every((row) => row.tenantId === tenantA)).toBe(true);
        expect(b.data.every((row) => row.tenantId === tenantB)).toBe(true);
        const allB = await inTenant(tenantB, () => InventoryService.getProducts({}));
        expect(allB.total).toBe(2);
        expect(allB.data.every((row) => row.tenantId === tenantB)).toBe(true);
    });

    it.each([undefined, 'true'])('fails closed without a tenant for lowStock=%s', async (lowStock) => {
        await expect(InventoryService.getProducts({ lowStock })).rejects.toThrow(/Missing tenant context/);
    });
});
