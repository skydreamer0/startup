import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/prisma', () => ({ prisma: {
  product: { findMany: vi.fn() }, user: { findUnique: vi.fn() },
} }));
vi.mock('../lib/jwt', () => ({ verifyAccessToken: vi.fn(), signAccessToken: vi.fn() }));
import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../lib/jwt';
import { tenantContext } from '../lib/tenant.context';
import posRoutes from '../modules/pos/pos.routes';
import { errorMiddleware } from '../middleware/error.middleware';

// Real route/auth/RBAC/validation chain with synthetic token/persistence adapters.
const app = express();
app.use((_req, _res, next) => tenantContext.run({ tenantId: 'tenant-a', plan: 'free' }, next));
app.use('/pos', posRoutes);
app.use(errorMiddleware);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(verifyAccessToken).mockReturnValue({ userId: 'cashier', email: 'synthetic@example.test', permissions: ['manage:pos'] });
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'cashier', email: 'synthetic@example.test', status: 'active' } as never);
  vi.mocked(prisma.product.findMany).mockResolvedValue([]);
});

describe('POS exact lookup route integration', () => {
  it('uses the dedicated literal lookup through existing POS permission and tenant scope', async () => {
    const result = await request(app).get('/pos/products/lookup').query({ code: '00123' }).set('Authorization', 'Bearer synthetic');
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ success: true, data: [] });
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-a', sku: '00123' },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { id: 'asc' },
    });
  });

  it('does not query before authentication', async () => {
    expect((await request(app).get('/pos/products/lookup?code=00123')).status).toBe(401);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('does not query without manage:pos', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue({ userId: 'cashier', email: 'synthetic@example.test', permissions: ['read:products'] });
    expect((await request(app).get('/pos/products/lookup?code=00123').set('Authorization', 'Bearer synthetic')).status).toBe(403);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });

  it('validates the lookup query before the controller', async () => {
    expect((await request(app).get('/pos/products/lookup?code=00123&categoryId=foreign').set('Authorization', 'Bearer synthetic')).status).toBe(400);
    expect(prisma.product.findMany).not.toHaveBeenCalled();
  });
});
