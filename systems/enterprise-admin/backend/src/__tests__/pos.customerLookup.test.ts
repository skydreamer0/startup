import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    customer: { findFirst: vi.fn() },
  },
}));

vi.mock('../lib/tenant.context', () => ({
  requireTenantId: vi.fn(() => 'tenant-1'),
}));

import { prisma } from '../lib/prisma';
import { CheckoutService } from '../modules/pos/checkout.service';

describe('CheckoutService.lookupCustomer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('looks up a customer by phone within the current tenant and returns POS intelligence signals', async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({
      id: 'customer-1',
      name: '王小美',
      phone: '0912345678',
      totalSpent: 12500,
      purchaseCount: 8,
      lastPurchaseDate: new Date('2026-02-01T00:00:00.000Z'),
      orders: [
        {
          id: 'order-1',
          createdAt: new Date('2026-02-01T00:00:00.000Z'),
          items: [
            {
              quantity: 1,
              product: { id: 'prod-1', name: '魚油', sku: 'FISH', retailPrice: 980 },
            },
          ],
        },
      ],
    });

    const result = await CheckoutService.lookupCustomer('0912345678', new Date('2026-05-01T00:00:00.000Z'));

    expect(prisma.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          OR: [{ phone: { contains: '0912345678' } }, { id: '0912345678' }],
        }),
        include: expect.objectContaining({
          orders: expect.objectContaining({
            where: { tenantId: 'tenant-1' },
          }),
        }),
      }),
    );
    expect(result).toMatchObject({
      id: 'customer-1',
      name: '王小美',
      phone: '0912345678',
      rfmSegment: 'vip',
      totalSpent: 12500,
      purchaseCount: 8,
      daysSinceLastPurchase: 89,
      supplementDueItems: [{ productId: 'prod-1', name: '魚油', sku: 'FISH', daysSincePurchase: 89 }],
    });
  });

  it('marks 90 day inactive customers as at risk', async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({
      id: 'customer-2',
      name: '陳先生',
      phone: '0922000000',
      totalSpent: 3200,
      purchaseCount: 2,
      lastPurchaseDate: new Date('2026-01-01T00:00:00.000Z'),
      orders: [],
    });

    const result = await CheckoutService.lookupCustomer('0922', new Date('2026-05-01T00:00:00.000Z'));

    expect(result?.rfmSegment).toBe('at_risk');
    expect(result?.daysSinceLastPurchase).toBe(120);
  });

  it('returns null when no customer matches', async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue(null);

    await expect(CheckoutService.lookupCustomer('not-found')).resolves.toBeNull();
  });
});
