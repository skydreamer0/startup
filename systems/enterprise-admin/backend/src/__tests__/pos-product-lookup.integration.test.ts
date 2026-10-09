import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { basePrisma } from '../lib/prisma';
import { tenantContext } from '../lib/tenant.context';
import { ProductLookupService } from '../modules/pos/product-lookup.service';

// Never fall back to ambient DATABASE_URL or a store database.
const databaseUrl = process.env.POS_PRODUCT_LOOKUP_DATABASE_URL;
if (databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || !url.port
    || url.username !== 'test' || url.password
    || !/^\/checkout_http_recovery_pos_lookup_[a-z0-9_]+$/.test(url.pathname)
    || process.env.DATABASE_URL !== databaseUrl) {
    throw new Error('POS lookup requires an explicit isolated synthetic loopback database');
  }
}

describe.skipIf(!databaseUrl)('exact POS lookup with real PostgreSQL', () => {
  const tenants = [randomUUID(), randomUUID()];
  const inTenant = <T>(id: string, work: () => T) => tenantContext.run({ tenantId: id, plan: 'pro' }, work);
  beforeAll(async () => {
    for (const tenantId of tenants) {
      await basePrisma.tenant.create({ data: { id: tenantId, slug: tenantId, name: 'Synthetic lookup tenant' } });
      await basePrisma.product.create({ data: {
        tenantId, sku: '00123', name: 'Z exact', costPrice: 1, retailPrice: 2, stockQuantity: 0,
      } });
    }
    await basePrisma.product.createMany({ data: Array.from({ length: 110 }, (_, i) => ({
      tenantId: tenants[0], sku: `A00123-${i}`, name: `A fuzzy ${i}`, costPrice: 1, retailPrice: 2,
    })) });
  });
  afterAll(async () => {
    for (const tenantId of tenants) {
      await basePrisma.product.deleteMany({ where: { tenantId } });
      await basePrisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await basePrisma.$disconnect();
  });
  it('finds the exact zero-stock SKU beyond 100 fuzzy matches and isolates concurrent tenants', async () => {
    const results = await Promise.all(tenants.map((id) => inTenant(id, () => ProductLookupService.lookup('00123'))));
    results.forEach((rows, index) => {
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ sku: '00123', stockQuantity: 0, tenantId: tenants[index] });
    });
    expect(results[0][0].id).not.toBe(results[1][0].id);
  });
  it.each(['123', '001', 'a00123-1', ' 00123'])('does not normalize or fuzzy match %s', async (code) => {
    expect(await inTenant(tenants[0], () => ProductLookupService.lookup(code))).toEqual([]);
  });
});
