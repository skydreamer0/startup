import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductAnalyticsService } from './product-analytics.service';

// ?€?€?€ Mock tenant context ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
vi.mock('../../lib/tenant.context', () => ({
    requireTenantId: vi.fn(() => 'test-tenant-id'),
    tenantContext: {
        getStore: vi.fn(() => ({ tenantId: 'test-tenant-id', plan: 'pro' })),
    },
}));

// ?€?€?€ Mock Prisma ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
vi.mock('../../lib/prisma', () => ({
    prisma: {
        orderItem: {
            findMany: vi.fn(),
        },
        supplier: {
            findMany: vi.fn(),
        },
        product: {
            groupBy: vi.fn(),
        },
        $queryRaw: vi.fn(),
    },
}));

import { prisma } from '../../lib/prisma';

const mockOrderItemFindMany = vi.mocked(prisma.orderItem.findMany);
const mockSupplierFindMany = vi.mocked(prisma.supplier.findMany);
const mockProductGroupBy = vi.mocked(prisma.product.groupBy);
const mockQueryRaw = vi.mocked(prisma.$queryRaw);

const startDate = new Date('2026-03-01');
const endDate = new Date('2026-03-31');

// ?€?€?€ ABC Product Analysis ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€

describe('ProductAnalyticsService.getProductAbcAnalysis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('happy path: classifies products into correct quadrants', async () => {
        // star: high revenue (10000), high margin (90%)
        // cash_cow: high revenue (10000), low margin (10%)
        // hidden_gem: low revenue (10), high margin (90%)
        // underperformer: low revenue (10), low margin (10%)
        mockOrderItemFindMany.mockResolvedValue([
            {
                productId: 'p1',
                quantity: 100,
                unitPrice: 100,
                product: { id: 'p1', name: 'Star', sku: 'S1', costPrice: 10, category: { name: 'Cat1' }, supplier: { name: 'Sup1' } },
            },
            {
                productId: 'p2',
                quantity: 100,
                unitPrice: 100,
                product: { id: 'p2', name: 'CashCow', sku: 'S2', costPrice: 90, category: { name: 'Cat1' }, supplier: { name: 'Sup2' } },
            },
            {
                productId: 'p3',
                quantity: 1,
                unitPrice: 10,
                product: { id: 'p3', name: 'HiddenGem', sku: 'S3', costPrice: 1, category: null, supplier: null },
            },
            {
                productId: 'p4',
                quantity: 1,
                unitPrice: 10,
                product: { id: 'p4', name: 'Underperformer', sku: 'S4', costPrice: 9, category: null, supplier: null },
            },
        ] as unknown as ReturnType<typeof mockOrderItemFindMany> extends Promise<infer T> ? T : never);

        const result = await ProductAnalyticsService.getProductAbcAnalysis(startDate, endDate);

        expect(result.products).toHaveLength(4);

        const star = result.products.find((p) => p.id === 'p1');
        const cashCow = result.products.find((p) => p.id === 'p2');
        const gem = result.products.find((p) => p.id === 'p3');
        const under = result.products.find((p) => p.id === 'p4');

        expect(star?.quadrant).toBe('star');
        expect(cashCow?.quadrant).toBe('cash_cow');
        expect(gem?.quadrant).toBe('hidden_gem');
        expect(under?.quadrant).toBe('underperformer');

        expect(result.summary.star).toBe(1);
        expect(result.summary.cash_cow).toBe(1);
        expect(result.summary.hidden_gem).toBe(1);
        expect(result.summary.underperformer).toBe(1);
    });

    it('edge case: returns empty result when no order items exist', async () => {
        mockOrderItemFindMany.mockResolvedValue([]);

        const result = await ProductAnalyticsService.getProductAbcAnalysis(startDate, endDate);

        expect(result.products).toHaveLength(0);
        expect(result.summary).toEqual({ star: 0, cash_cow: 0, hidden_gem: 0, underperformer: 0 });
        expect(result.medianRevenue).toBe(0);
        expect(result.medianMargin).toBe(0);
    });

    it('aggregates multiple order items for the same product', async () => {
        // Product p1 appears in two order items ??revenues should be summed
        mockOrderItemFindMany.mockResolvedValue([
            {
                productId: 'p1',
                quantity: 10,
                unitPrice: 100,
                product: { id: 'p1', name: 'Widget', sku: 'W1', costPrice: 40, category: null, supplier: null },
            },
            {
                productId: 'p1',
                quantity: 5,
                unitPrice: 100,
                product: { id: 'p1', name: 'Widget', sku: 'W1', costPrice: 40, category: null, supplier: null },
            },
        ] as unknown as ReturnType<typeof mockOrderItemFindMany> extends Promise<infer T> ? T : never);

        const result = await ProductAnalyticsService.getProductAbcAnalysis(startDate, endDate);

        expect(result.products).toHaveLength(1);
        expect(result.products[0].totalRevenue).toBe(1500); // (10+5) * 100
        expect(result.products[0].totalQuantity).toBe(15);
    });

    it('products with null category/supplier return null in result', async () => {
        mockOrderItemFindMany.mockResolvedValue([
            {
                productId: 'p1',
                quantity: 1,
                unitPrice: 50,
                product: { id: 'p1', name: 'Solo', sku: 'SL1', costPrice: 25, category: null, supplier: null },
            },
        ] as unknown as ReturnType<typeof mockOrderItemFindMany> extends Promise<infer T> ? T : never);

        const result = await ProductAnalyticsService.getProductAbcAnalysis(startDate, endDate);

        expect(result.products[0].categoryName).toBeNull();
        expect(result.products[0].supplierName).toBeNull();
    });
});

// ?€?€?€ Supplier Ranking ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€

describe('ProductAnalyticsService.getSupplierRanking', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('happy path: ranks suppliers by composite score descending', async () => {
        mockSupplierFindMany.mockResolvedValue([
            { id: 's1', name: 'Good Supplier', deliveryReliability: 95, defectRate: 1 },
            { id: 's2', name: 'Average Supplier', deliveryReliability: 60, defectRate: 5 },
        ] as unknown as ReturnType<typeof mockSupplierFindMany> extends Promise<infer T> ? T : never);
        mockProductGroupBy.mockResolvedValue([
            { supplierId: 's1', _count: { id: 3 } },
            { supplierId: 's2', _count: { id: 2 } },
        ] as unknown as ReturnType<typeof mockProductGroupBy> extends Promise<infer T> ? T : never);
        mockQueryRaw.mockResolvedValue([
            { supplierId: 's1', totalRevenue: 1000, totalCost: 500 },
            { supplierId: 's2', totalRevenue: 500, totalCost: 400 },
        ] as unknown as ReturnType<typeof mockQueryRaw> extends Promise<infer T> ? T : never);

        const result = await ProductAnalyticsService.getSupplierRanking(startDate, endDate);

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('s1');
        expect(result[0].compositeScore).toBeGreaterThan(result[1].compositeScore);
    });

    it('edge case: handles suppliers with no sales', async () => {
        mockSupplierFindMany.mockResolvedValue([
            { id: 's1', name: 'No Sales Supplier', deliveryReliability: null, defectRate: null },
        ] as unknown as ReturnType<typeof mockSupplierFindMany> extends Promise<infer T> ? T : never);
        mockProductGroupBy.mockResolvedValue([]);
        mockQueryRaw.mockResolvedValue([]);

        const result = await ProductAnalyticsService.getSupplierRanking(startDate, endDate);

        expect(result).toHaveLength(1);
        expect(result[0].totalRevenue).toBe(0);
        expect(result[0].revenueShare).toBe(0);
    });

    it('edge case: returns empty array when no suppliers exist', async () => {
        mockSupplierFindMany.mockResolvedValue([]);
        mockProductGroupBy.mockResolvedValue([]);
        mockQueryRaw.mockResolvedValue([]);

        const result = await ProductAnalyticsService.getSupplierRanking(startDate, endDate);

        expect(result).toHaveLength(0);
    });

    it('uses default scores (50) for suppliers with null deliveryReliability and defectRate', async () => {
        mockSupplierFindMany.mockResolvedValue([
            { id: 's1', name: 'Unknown Reliability', deliveryReliability: null, defectRate: null },
        ] as unknown as ReturnType<typeof mockSupplierFindMany> extends Promise<infer T> ? T : never);
        mockProductGroupBy.mockResolvedValue([{ supplierId: 's1', _count: { id: 1 } }] as unknown as ReturnType<typeof mockProductGroupBy> extends Promise<infer T> ? T : never);
        mockQueryRaw.mockResolvedValue([
            { supplierId: 's1', totalRevenue: 1000, totalCost: 600 },
        ] as unknown as ReturnType<typeof mockQueryRaw> extends Promise<infer T> ? T : never);

        const result = await ProductAnalyticsService.getSupplierRanking(startDate, endDate);

        expect(result).toHaveLength(1);
        // compositeScore uses 50 defaults for reliability and defect ??should still be a valid number
        expect(result[0].compositeScore).toBeGreaterThan(0);
    });
});
