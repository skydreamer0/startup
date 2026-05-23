import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  prisma: {
    customer: { findFirst: vi.fn() },
    orderItem: { findMany: vi.fn() },
  },
}));

vi.mock('../lib/tenant.context', () => ({
  requireTenantId: vi.fn(() => 'tenant-1'),
}));

import { prisma } from '../lib/prisma';
import { CheckoutService } from '../modules/pos/checkout.service';

describe('CheckoutService.getRecommendations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns up to 3 tenant-scoped replenishment candidates from older in-stock purchases', async () => {
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({ id: 'customer-1' });
    vi.mocked(prisma.orderItem.findMany).mockResolvedValue([
      {
        productId: 'prod-1',
        quantity: 1,
        order: { createdAt: new Date('2026-04-01T00:00:00.000Z') },
        product: { id: 'prod-1', name: '魚油', sku: 'FISH', retailPrice: 980, stockQuantity: 6 },
      },
      {
        productId: 'prod-2',
        quantity: 2,
        order: { createdAt: new Date('2026-03-20T00:00:00.000Z') },
        product: { id: 'prod-2', name: '益生菌', sku: 'PROBIO', retailPrice: 1280, stockQuantity: 4 },
      },
      {
        productId: 'prod-1',
        quantity: 1,
        order: { createdAt: new Date('2026-02-10T00:00:00.000Z') },
        product: { id: 'prod-1', name: '魚油', sku: 'FISH', retailPrice: 980, stockQuantity: 6 },
      },
      {
        productId: 'prod-3',
        quantity: 1,
        order: { createdAt: new Date('2026-03-01T00:00:00.000Z') },
        product: { id: 'prod-3', name: '葉黃素', sku: 'LUTEIN', retailPrice: 760, stockQuantity: 3 },
      },
      {
        productId: 'prod-4',
        quantity: 1,
        order: { createdAt: new Date('2026-02-01T00:00:00.000Z') },
        product: { id: 'prod-4', name: '維他命D', sku: 'VITD', retailPrice: 450, stockQuantity: 8 },
      },
    ]);

    const result = await CheckoutService.getRecommendations(
      'customer-1',
      new Date('2026-05-01T00:00:00.000Z'),
    );

    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: { id: 'customer-1', tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(prisma.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          order: {
            customerId: 'customer-1',
            tenantId: 'tenant-1',
            createdAt: { lte: new Date('2026-04-06T00:00:00.000Z') },
          },
          product: { tenantId: 'tenant-1', stockQuantity: { gt: 0 } },
        },
      }),
    );
    expect(result).toEqual([
      {
        productId: 'prod-1',
        name: '魚油',
        sku: 'FISH',
        retailPrice: 980,
        stockQuantity: 6,
        lastPurchasedAt: '2026-04-01T00:00:00.000Z',
        daysSincePurchase: 30,
        reason: 'REPLENISHMENT_DUE',
      },
      {
        productId: 'prod-2',
        name: '益生菌',
        sku: 'PROBIO',
        retailPrice: 1280,
        stockQuantity: 4,
        lastPurchasedAt: '2026-03-20T00:00:00.000Z',
        daysSincePurchase: 42,
        reason: 'REPLENISHMENT_DUE',
      },
      {
        productId: 'prod-3',
        name: '葉黃素',
        sku: 'LUTEIN',
        retailPrice: 760,
        stockQuantity: 3,
        lastPurchasedAt: '2026-03-01T00:00:00.000Z',
        daysSincePurchase: 61,
        reason: 'REPLENISHMENT_DUE',
      },
    ]);
  });

  it('returns hot seller recommendations when no customer is selected', async () => {
    vi.mocked(prisma.orderItem.findMany).mockResolvedValue([
      {
        productId: 'prod-1',
        quantity: 2,
        product: { id: 'prod-1', name: '感冒藥', sku: 'COLD', retailPrice: 180, stockQuantity: 20 },
      },
      {
        productId: 'prod-2',
        quantity: 5,
        product: { id: 'prod-2', name: '口罩', sku: 'MASK', retailPrice: 120, stockQuantity: 30 },
      },
      {
        productId: 'prod-1',
        quantity: 4,
        product: { id: 'prod-1', name: '感冒藥', sku: 'COLD', retailPrice: 180, stockQuantity: 20 },
      },
    ]);

    const result = await CheckoutService.getHotRecommendations(new Date('2026-05-01T00:00:00.000Z'));

    expect(prisma.orderItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          order: {
            tenantId: 'tenant-1',
            status: 'completed',
            createdAt: {
              gte: new Date('2026-04-24T00:00:00.000Z'),
              lte: new Date('2026-05-01T00:00:00.000Z'),
            },
          },
          product: { tenantId: 'tenant-1', stockQuantity: { gt: 0 } },
        },
      }),
    );
    expect(result).toEqual([
      {
        productId: 'prod-1',
        name: '感冒藥',
        sku: 'COLD',
        retailPrice: 180,
        stockQuantity: 20,
        quantitySold: 6,
        reason: 'HOT_SELLER',
      },
      {
        productId: 'prod-2',
        name: '口罩',
        sku: 'MASK',
        retailPrice: 120,
        stockQuantity: 30,
        quantitySold: 5,
        reason: 'HOT_SELLER',
      },
    ]);
  });
});
