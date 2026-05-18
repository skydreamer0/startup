import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrmAnalyticsService } from '../modules/analytics/crm-analytics.service';
import { ProductAnalyticsService } from '../modules/analytics/product-analytics.service';
import { OperationsAnalyticsService } from '../modules/analytics/operations-analytics.service';

// ─── Mock tenant context (AF-04 added requireTenantId() to all public methods) ─
vi.mock('../lib/tenant.context', () => ({
    requireTenantId: vi.fn(() => 'test-tenant-id'),
    tenantContext: { getStore: vi.fn(() => ({ tenantId: 'test-tenant-id', plan: 'pro' })) },
}));

// ─── Mock Prisma ─────────────────────────────────────────
vi.mock('../lib/prisma', () => ({
    prisma: {
        customer: {
            findMany: vi.fn(),
        },
        orderItem: {
            findMany: vi.fn(),
        },
        supplier: {
            findMany: vi.fn(),
        },
        product: {
            groupBy: vi.fn(),
        },
        order: {
            findMany: vi.fn(),
            aggregate: vi.fn(),
        },
        expense: {
            aggregate: vi.fn(),
        },
        $queryRaw: vi.fn(),
    },
}));

import { prisma } from '../lib/prisma';

const mockCustomerFindMany = vi.mocked(prisma.customer.findMany);
const mockOrderItemFindMany = vi.mocked(prisma.orderItem.findMany);
const mockSupplierFindMany = vi.mocked(prisma.supplier.findMany);
const mockProductGroupBy = vi.mocked(prisma.product.groupBy);
const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockOrderFindMany = vi.mocked(prisma.order.findMany);
const mockOrderAggregate = vi.mocked(prisma.order.aggregate);
const mockExpenseAggregate = vi.mocked(prisma.expense.aggregate);

// ─── Helpers ─────────────────────────────────────────────
function daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
}

const startDate = new Date('2026-03-01');
const endDate = new Date('2026-03-31');

// ─── RFM Segmentation Tests ─────────────────────────────

describe('CrmAnalyticsService.getRfmSegmentation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return empty result when no customers exist', async () => {
        mockCustomerFindMany.mockResolvedValue([]);

        const result = await CrmAnalyticsService.getRfmSegmentation();

        expect(result.customers).toHaveLength(0);
        expect(result.summary).toEqual({ vip: 0, loyal: 0, new: 0, dormant: 0, at_risk: 0 });
    });

    it('should classify a first-time buyer as "new"', async () => {
        mockCustomerFindMany.mockResolvedValue([
            {
                id: 'c1',
                name: 'New Customer',
                phone: '0912345678',
                totalSpent: 500,
                purchaseCount: 1,
                lastPurchaseDate: daysAgo(3),
            },
        ] as any);

        const result = await CrmAnalyticsService.getRfmSegmentation();

        expect(result.customers).toHaveLength(1);
        expect(result.customers[0].segment).toBe('new');
        expect(result.summary.new).toBe(1);
    });

    it('should classify a customer with R>60 days as "at_risk"', async () => {
        mockCustomerFindMany.mockResolvedValue([
            {
                id: 'c2',
                name: 'Lost Customer',
                phone: '0922222222',
                totalSpent: 3000,
                purchaseCount: 5,
                lastPurchaseDate: daysAgo(90),
            },
        ] as any);

        const result = await CrmAnalyticsService.getRfmSegmentation();

        expect(result.customers[0].segment).toBe('at_risk');
        expect(result.summary.at_risk).toBe(1);
    });

    it('should classify a customer with R=31-60 days as "dormant"', async () => {
        mockCustomerFindMany.mockResolvedValue([
            {
                id: 'c3',
                name: 'Dormant Customer',
                phone: '0933333333',
                totalSpent: 2000,
                purchaseCount: 4,
                lastPurchaseDate: daysAgo(45),
            },
        ] as any);

        const result = await CrmAnalyticsService.getRfmSegmentation();

        expect(result.customers[0].segment).toBe('dormant');
        expect(result.summary.dormant).toBe(1);
    });

    it('should classify a frequent recent big-spender as "vip"', async () => {
        const customers = [
            { id: 'vip1', name: 'VIP', phone: '0900000001', totalSpent: 50000, purchaseCount: 10, lastPurchaseDate: daysAgo(2) },
            { id: 'low1', name: 'Low1', phone: '0900000002', totalSpent: 100, purchaseCount: 1, lastPurchaseDate: daysAgo(5) },
            { id: 'low2', name: 'Low2', phone: '0900000003', totalSpent: 200, purchaseCount: 1, lastPurchaseDate: daysAgo(10) },
            { id: 'low3', name: 'Low3', phone: '0900000004', totalSpent: 300, purchaseCount: 1, lastPurchaseDate: daysAgo(15) },
            { id: 'low4', name: 'Low4', phone: '0900000005', totalSpent: 400, purchaseCount: 1, lastPurchaseDate: daysAgo(20) },
        ];
        mockCustomerFindMany.mockResolvedValue(customers as any);

        const result = await CrmAnalyticsService.getRfmSegmentation();

        const vipCustomer = result.customers.find((c) => c.id === 'vip1');
        expect(vipCustomer?.segment).toBe('vip');
        expect(result.summary.vip).toBe(1);
    });

    it('should classify a customer with R≤30, F≥3, M≥median as "loyal"', async () => {
        const customers = [
            { id: 'loyal1', name: 'Loyal', phone: '0911111111', totalSpent: 5000, purchaseCount: 4, lastPurchaseDate: daysAgo(10) },
            { id: 'low1', name: 'Low Spender', phone: '0922222222', totalSpent: 100, purchaseCount: 1, lastPurchaseDate: daysAgo(5) },
        ];
        mockCustomerFindMany.mockResolvedValue(customers as any);

        const result = await CrmAnalyticsService.getRfmSegmentation();

        const loyalCustomer = result.customers.find((c) => c.id === 'loyal1');
        expect(loyalCustomer?.segment).toBe('loyal');
    });
});

// ─── Churn Risk Tests ────────────────────────────────────

describe('CrmAnalyticsService.getChurnRisk', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return empty array when no repeat customers exist', async () => {
        mockCustomerFindMany.mockResolvedValue([]);

        const result = await CrmAnalyticsService.getChurnRisk();

        expect(result).toHaveLength(0);
    });

    it('should flag a customer as "high" risk when daysSinceLastPurchase > 1.5 × avgInterval', async () => {
        mockCustomerFindMany.mockResolvedValue([
            {
                id: 'churn1',
                name: 'Churning Customer',
                phone: '0944444444',
                purchaseCount: 3,
                lastPurchaseDate: daysAgo(20),
                orders: [
                    { createdAt: daysAgo(40) },
                    { createdAt: daysAgo(30) },
                    { createdAt: daysAgo(20) },
                ],
            },
        ] as any);

        const result = await CrmAnalyticsService.getChurnRisk();

        expect(result).toHaveLength(1);
        expect(result[0].riskLevel).toBe('high');
        expect(result[0].avgIntervalDays).toBe(10);
    });

    it('should flag a customer as "low" risk when within normal repurchase window', async () => {
        mockCustomerFindMany.mockResolvedValue([
            {
                id: 'safe1',
                name: 'Safe Customer',
                phone: '0955555555',
                purchaseCount: 3,
                lastPurchaseDate: daysAgo(5),
                orders: [
                    { createdAt: daysAgo(35) },
                    { createdAt: daysAgo(20) },
                    { createdAt: daysAgo(5) },
                ],
            },
        ] as any);

        const result = await CrmAnalyticsService.getChurnRisk();

        expect(result).toHaveLength(1);
        expect(result[0].riskLevel).toBe('low');
    });

    it('should sort results with high-risk customers first', async () => {
        mockCustomerFindMany.mockResolvedValue([
            {
                id: 'low-risk',
                name: 'Low Risk',
                phone: '0966666666',
                purchaseCount: 3,
                lastPurchaseDate: daysAgo(5),
                orders: [
                    { createdAt: daysAgo(35) },
                    { createdAt: daysAgo(20) },
                    { createdAt: daysAgo(5) },
                ],
            },
            {
                id: 'high-risk',
                name: 'High Risk',
                phone: '0977777777',
                purchaseCount: 3,
                lastPurchaseDate: daysAgo(60),
                orders: [
                    { createdAt: daysAgo(80) },
                    { createdAt: daysAgo(70) },
                    { createdAt: daysAgo(60) },
                ],
            },
        ] as any);

        const result = await CrmAnalyticsService.getChurnRisk();

        expect(result[0].id).toBe('high-risk');
        expect(result[0].riskLevel).toBe('high');
        expect(result[1].id).toBe('low-risk');
        expect(result[1].riskLevel).toBe('low');
    });
});

// ─── ABC Product Analysis Tests ─────────────────────────

describe('ProductAnalyticsService.getProductAbcAnalysis', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return empty result when no order items exist', async () => {
        mockOrderItemFindMany.mockResolvedValue([]);

        const result = await ProductAnalyticsService.getProductAbcAnalysis(startDate, endDate);

        expect(result.products).toHaveLength(0);
        expect(result.summary).toEqual({ star: 0, cash_cow: 0, hidden_gem: 0, underperformer: 0 });
    });

    it('should classify products into correct quadrants based on revenue and margin', async () => {
        // Star: high revenue + high margin
        // Cash Cow: high revenue + low margin
        // Hidden Gem: low revenue + high margin
        // Underperformer: low revenue + low margin
        mockOrderItemFindMany.mockResolvedValue([
            // Star product: high revenue, high margin (cost=10, price=100 → 90% margin)
            { productId: 'p1', quantity: 100, unitPrice: 100, product: { id: 'p1', name: 'Star', sku: 'S1', costPrice: 10, category: { name: 'Cat1' }, supplier: { name: 'Sup1' } } },
            // Cash Cow: high revenue, low margin (cost=90, price=100 → 10% margin)
            { productId: 'p2', quantity: 100, unitPrice: 100, product: { id: 'p2', name: 'CashCow', sku: 'S2', costPrice: 90, category: { name: 'Cat1' }, supplier: { name: 'Sup2' } } },
            // Hidden Gem: low revenue, high margin (cost=1, price=10 → 90% margin)
            { productId: 'p3', quantity: 1, unitPrice: 10, product: { id: 'p3', name: 'HiddenGem', sku: 'S3', costPrice: 1, category: null, supplier: null } },
            // Underperformer: low revenue, low margin (cost=9, price=10 → 10% margin)
            { productId: 'p4', quantity: 1, unitPrice: 10, product: { id: 'p4', name: 'Underperformer', sku: 'S4', costPrice: 9, category: null, supplier: null } },
        ] as any);

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
});

// ─── Supplier Ranking Tests ─────────────────────────────

describe('ProductAnalyticsService.getSupplierRanking', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should rank suppliers by composite score descending', async () => {
        mockSupplierFindMany.mockResolvedValue([
            { id: 's1', name: 'Good Supplier', deliveryReliability: 95, defectRate: 1 },
            { id: 's2', name: 'Average Supplier', deliveryReliability: 60, defectRate: 5 },
        ] as any);
        mockProductGroupBy.mockResolvedValue([
            { supplierId: 's1', _count: { id: 3 } },
            { supplierId: 's2', _count: { id: 2 } },
        ] as any);
        mockQueryRaw.mockResolvedValue([
            { supplierId: 's1', totalRevenue: 1000, totalCost: 500 },
            { supplierId: 's2', totalRevenue: 500, totalCost: 400 },
        ] as any);

        const result = await ProductAnalyticsService.getSupplierRanking(startDate, endDate);

        expect(result).toHaveLength(2);
        expect(result[0].id).toBe('s1');
        expect(result[0].compositeScore).toBeGreaterThan(result[1].compositeScore);
    });

    it('should handle suppliers with no sales', async () => {
        mockSupplierFindMany.mockResolvedValue([
            { id: 's1', name: 'No Sales Supplier', deliveryReliability: null, defectRate: null },
        ] as any);
        mockProductGroupBy.mockResolvedValue([]);
        mockQueryRaw.mockResolvedValue([]);

        const result = await ProductAnalyticsService.getSupplierRanking(startDate, endDate);

        expect(result).toHaveLength(1);
        expect(result[0].totalRevenue).toBe(0);
        expect(result[0].revenueShare).toBe(0);
    });
});

// ─── Sales Heatmap Tests ─────────────────────────────────

describe('OperationsAnalyticsService.getSalesHeatmap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return a 168-cell grid (7 days × 24 hours) when no orders exist', async () => {
        mockOrderFindMany.mockResolvedValue([]);

        const result = await OperationsAnalyticsService.getSalesHeatmap(startDate, endDate);

        expect(result).toHaveLength(168);
        expect(result.every((c) => c.orderCount === 0)).toBe(true);
    });

    it('should correctly bucket orders by weekday and hour', async () => {
        // Wednesday, 14:00 UTC (weekday=3 in getDay())
        const wed14 = new Date('2026-03-04T14:00:00');
        mockOrderFindMany.mockResolvedValue([
            { createdAt: wed14, totalAmount: 500 },
            { createdAt: wed14, totalAmount: 300 },
        ] as any);

        const result = await OperationsAnalyticsService.getSalesHeatmap(startDate, endDate);

        const cell = result.find((c) => c.weekday === wed14.getDay() && c.hour === wed14.getHours());
        expect(cell?.orderCount).toBe(2);
        expect(cell?.revenue).toBe(800);
    });
});

// ─── Bonus Gate Status Tests ─────────────────────────────

describe('OperationsAnalyticsService.getBonusGateStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return gatePass=true when margin ≥ 30% and CCC ≤ 30', async () => {
        // Mock the methods that getKpiSnapshot calls
        mockOrderItemFindMany.mockResolvedValue([
            { quantity: 10, unitPrice: 100, product: { costPrice: 50 } },
        ] as any);
        mockCustomerFindMany.mockResolvedValue([]);
        mockExpenseAggregate.mockResolvedValue({ _sum: { amount: 0 } } as any);
        mockOrderAggregate.mockResolvedValue({
            _sum: { totalAmount: 1000 },
            _count: { id: 1 },
        } as any);

        const result = await OperationsAnalyticsService.getBonusGateStatus('2026-03');

        expect(result.grossMarginPct).toBe(50); // (100-50)/100 * 100
        expect(result.grossMarginPass).toBe(true);
        expect(result.cccPass).toBe(true); // CCC is hardcoded to 22
        expect(result.gatePass).toBe(true);
        expect(result.estimatedBonusPool).toBeGreaterThan(0);
    });
});
