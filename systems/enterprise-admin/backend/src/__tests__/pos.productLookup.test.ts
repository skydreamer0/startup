import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { prisma } from '../lib/prisma';
import { tenantContext } from '../lib/tenant.context';
import { ProductLookupService } from '../modules/pos/product-lookup.service';
import { productLookupSchema } from '../modules/pos/product-lookup.schema';
import { lookupProduct } from '../modules/pos/product-lookup.controller';
import { validate } from '../middleware/validate.middleware';

vi.mock('../lib/prisma', () => ({ prisma: { product: { findMany: vi.fn() } } }));
const inTenant = <T>(id: string, work: () => T) => tenantContext.run({ tenantId: id, plan: 'pro' }, work);

beforeEach(() => vi.resetAllMocks());
describe('exact SKU lookup', () => {
  it.each(['00123', 'AbC', ' SKU '])('preserves literal identifier %s and never caps or stock-filters the result', async (code) => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    await inTenant('tenant-a', () => ProductLookupService.lookup(code));
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', sku: code },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { id: 'asc' },
    });
  });
  it('fails closed without a tenant', async () => {
    await expect(ProductLookupService.lookup('123')).rejects.toThrow(/Tenant context missing/);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });
  it.each([{}, { code: '' }, { code: ['123', '456'] }, { code: 123 }, { code: '123', tenantId: 'other' }])('rejects malformed query %j', (query) => {
    expect(productLookupSchema.query.safeParse(query).success).toBe(false);
  });
  it('returns the envelope through validated HTTP and forwards lookup errors', async () => {
    const app = express();
    app.use((_req, _res, next) => inTenant('tenant-a', next));
    app.get('/lookup', validate(productLookupSchema), lookupProduct);
    vi.mocked(prisma.product.findMany).mockResolvedValue([]);
    expect((await request(app).get('/lookup?code=00123')).body).toEqual({ success: true, data: [] });
    expect((await request(app).get('/lookup')).status).toBe(400);
    vi.mocked(prisma.product.findMany).mockRejectedValue(new Error('synthetic failure'));
    expect((await request(app).get('/lookup?code=00123')).status).toBe(500);
  });
});
