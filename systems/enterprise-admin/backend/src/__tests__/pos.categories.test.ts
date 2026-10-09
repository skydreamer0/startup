import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma', () => ({ prisma: {
  productCategory: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
} }));
vi.mock('../lib/jwt', () => ({ verifyAccessToken: vi.fn(), signAccessToken: vi.fn() }));

import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../lib/jwt';
import { tenantContext } from '../lib/tenant.context';
import { CheckoutService } from '../modules/pos/checkout.service';
import posRoutes from '../modules/pos/pos.routes';
import { errorMiddleware } from '../middleware/error.middleware';

// Synthetic persistence and token verification; real tenant context, auth/RBAC,
// router, controller and service. This is not PostgreSQL isolation evidence.
function app(tenantId = 'tenant-a') {
  const server = express();
  server.use((_req, _res, next) => tenantContext.run({ tenantId, plan: 'free' }, next));
  server.use('/pos', posRoutes);
  server.use(errorMiddleware);
  return server;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(verifyAccessToken).mockReturnValue({ userId: 'cashier', email: 'synthetic@example.test', permissions: ['manage:pos'] });
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'cashier', email: 'synthetic@example.test', status: 'active' } as never);
  vi.mocked(prisma.productCategory.findMany).mockResolvedValue([]);
});

describe('GET /pos/categories', () => {
  it('isolates categories by tenant and returns only id/name independently of product filters', async () => {
    const fixtures = [
      { id: 'a', name: 'Empty category', tenantId: 'tenant-a', description: 'private' },
      { id: 'b', name: 'Other shop', tenantId: 'tenant-b', description: 'private' },
    ];
    vi.mocked(prisma.productCategory.findMany).mockImplementation(async (args) => fixtures
      .filter((category) => category.tenantId === args?.where?.tenantId)
      .map(({ id, name }) => ({ id, name })) as never);

    for (const [tenantId, expected] of [['tenant-a', 'a'], ['tenant-b', 'b']] as const) {
      const result = await request(app(tenantId)).get('/pos/categories?q=absent&categoryId=foreign&inStockOnly=true').set('Authorization', 'Bearer synthetic');
      expect(result.status).toBe(200);
      expect(result.body).toEqual({ success: true, data: [{ id: expected, name: expected === 'a' ? 'Empty category' : 'Other shop' }] });
      expect(prisma.productCategory.findMany).toHaveBeenLastCalledWith({
        where: { tenantId }, select: { id: true, name: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }],
      });
    }
  });

  it('returns an empty successful list for a tenant without categories', async () => {
    const result = await request(app()).get('/pos/categories').set('Authorization', 'Bearer synthetic');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true, data: [] });
  });

  it('requires authentication before querying categories', async () => {
    expect((await request(app()).get('/pos/categories')).status).toBe(401);
    expect(prisma.productCategory.findMany).not.toHaveBeenCalled();
  });

  it('requires the existing manage:pos permission', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ userId: 'cashier', email: 'synthetic@example.test', permissions: ['read:products'] });
    expect((await request(app()).get('/pos/categories').set('Authorization', 'Bearer synthetic')).status).toBe(403);
    expect(prisma.productCategory.findMany).not.toHaveBeenCalled();
  });

  it('does not turn a persistence failure into a successful empty list', async () => {
    vi.mocked(prisma.productCategory.findMany).mockRejectedValue(new Error('Synthetic unavailable'));
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const result = await request(app()).get('/pos/categories').set('Authorization', 'Bearer synthetic');
      expect(result.status).toBe(500);
      expect(result.body.success).toBe(false);
    } finally { errorLog.mockRestore(); }
  });

  it('fails closed without a tenant context', async () => {
    await expect(CheckoutService.getCategories()).rejects.toThrow('Tenant context missing');
    expect(prisma.productCategory.findMany).not.toHaveBeenCalled();
  });
});
