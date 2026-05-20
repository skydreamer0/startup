import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrmAnalyticsService } from './crm-analytics.service';

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
        customer: {
            findMany: vi.fn(),
        },
    },
}));

import { prisma } from '../../lib/prisma';

const mockCustomerFindMany = vi.mocked(prisma.customer.findMany);

// ?€?€?€ Helpers ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
function daysAgo(n: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(0, 0, 0, 0);
    return d;
}

// ?€?€?€ RFM Segmentation ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€

describe('CrmAnalyticsService.getRfmSegmentation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('happy path: classifies a first-time buyer as "new"', async () => {
        mockCustomerFindMany.mockResolvedValue([
            {
                id: 'c1',
                name: 'New Customer',
                phone: '0912345678',
                totalSpent: 500,
                purchaseCount: 1,
                lastPurchaseDate: daysAgo(3),
            },
        ] as unknown as ReturnType<typeof mockCustomerFindMany> extends Promise<infer T> ? T : never);

        const result = await CrmAnalyticsService.getRfmSegmentation();

        expect(result.customers).toHaveLength(1);
        expect(result.customers[0].segment).toBe('new');
        expect(result.summary.new).toBe(1);
    });

    it('edge case: empty customers returns zero-summary', async () => {
        mockCustomerFindMany.mockResolvedValue([]);

        const result = await CrmAnalyticsService.getRfmSegmentation();

        expect(result.customers).toHaveLength(0);
        expect(result.summary).toEqual({ vip: 0, loyal: 0, new: 0, dormant: 0, at_risk: 0 });
    });

    it('classifies customer with recency > 60 days as "at_risk"', async () => {
        mockCustomerFindMany.mockResolvedValue([
            {
                id: 'c2',
                name: 'At Risk',
                phone: '0922222222',
                totalSpent: 3000,
                purchaseCount: 5,
                lastPurchaseDate: daysAgo(90),
            },
        ] as unknown as ReturnType<typeof mockCustomerFindMany> extends Promise<infer T> ? T : never);

        const result = await CrmAnalyticsService.getRfmSegmentation();

        expect(result.customers[0].segment).toBe('at_risk');
        expect(result.summary.at_risk).toBe(1);
    });

    it('classifies customer with recency 31-60 days as "dormant"', async () => {
        mockCustomerFindMany.mockResolvedValue([
            {
                id: 'c3',
                name: 'Dormant',
                phone: '0933333333',
                totalSpent: 2000,
                purchaseCount: 4,
                lastPurchaseDate: daysAgo(45),
            },
        ] as unknown as ReturnType<typeof mockCustomerFindMany> extends Promise<infer T> ? T : never);

        const result = await CrmAnalyticsService.getRfmSegmentation();

        expect(result.customers[0].segment).toBe('dormant');
        expect(result.summary.dormant).toBe(1);
    });

    it('classifies a high-value frequent recent customer as "vip"', async () => {
        const customers = [
            { id: 'vip1', name: 'VIP', phone: '0900000001', totalSpent: 50000, purchaseCount: 10, lastPurchaseDate: daysAgo(2) },
            { id: 'low1', name: 'Low1', phone: '0900000002', totalSpent: 100, purchaseCount: 1, lastPurchaseDate: daysAgo(5) },
            { id: 'low2', name: 'Low2', phone: '0900000003', totalSpent: 200, purchaseCount: 1, lastPurchaseDate: daysAgo(10) },
            { id: 'low3', name: 'Low3', phone: '0900000004', totalSpent: 300, purchaseCount: 1, lastPurchaseDate: daysAgo(15) },
            { id: 'low4', name: 'Low4', phone: '0900000005', totalSpent: 400, purchaseCount: 1, lastPurchaseDate: daysAgo(20) },
        ];
        mockCustomerFindMany.mockResolvedValue(
            customers as unknown as ReturnType<typeof mockCustomerFindMany> extends Promise<infer T> ? T : never,
        );

        const result = await CrmAnalyticsService.getRfmSegmentation();

        const vip = result.customers.find((c) => c.id === 'vip1');
        expect(vip?.segment).toBe('vip');
        expect(result.summary.vip).toBe(1);
    });

    it('classifies a recent frequent above-median spender as "loyal"', async () => {
        const customers = [
            { id: 'loyal1', name: 'Loyal', phone: '0911111111', totalSpent: 5000, purchaseCount: 4, lastPurchaseDate: daysAgo(10) },
            { id: 'low1', name: 'Low', phone: '0922222222', totalSpent: 100, purchaseCount: 1, lastPurchaseDate: daysAgo(5) },
        ];
        mockCustomerFindMany.mockResolvedValue(
            customers as unknown as ReturnType<typeof mockCustomerFindMany> extends Promise<infer T> ? T : never,
        );

        const result = await CrmAnalyticsService.getRfmSegmentation();

        const loyal = result.customers.find((c) => c.id === 'loyal1');
        expect(loyal?.segment).toBe('loyal');
    });
});

// ?€?€?€ Churn Risk ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€

describe('CrmAnalyticsService.getChurnRisk', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('happy path: flags a customer as "high" risk when days since last purchase > 1.5 ? avg interval', async () => {
        mockCustomerFindMany.mockResolvedValue([
            {
                id: 'churn1',
                name: 'Churning',
                phone: '0944444444',
                purchaseCount: 3,
                lastPurchaseDate: daysAgo(20),
                orders: [
                    { createdAt: daysAgo(40) },
                    { createdAt: daysAgo(30) },
                    { createdAt: daysAgo(20) },
                ],
            },
        ] as unknown as ReturnType<typeof mockCustomerFindMany> extends Promise<infer T> ? T : never);

        const result = await CrmAnalyticsService.getChurnRisk();

        expect(result).toHaveLength(1);
        expect(result[0].riskLevel).toBe('high');
        expect(result[0].avgIntervalDays).toBe(10);
    });

    it('edge case: returns empty array when no repeat customers exist', async () => {
        mockCustomerFindMany.mockResolvedValue([]);

        const result = await CrmAnalyticsService.getChurnRisk();

        expect(result).toHaveLength(0);
    });

    it('flags a customer as "low" risk when within normal repurchase window', async () => {
        mockCustomerFindMany.mockResolvedValue([
            {
                id: 'safe1',
                name: 'Safe',
                phone: '0955555555',
                purchaseCount: 3,
                lastPurchaseDate: daysAgo(5),
                orders: [
                    { createdAt: daysAgo(35) },
                    { createdAt: daysAgo(20) },
                    { createdAt: daysAgo(5) },
                ],
            },
        ] as unknown as ReturnType<typeof mockCustomerFindMany> extends Promise<infer T> ? T : never);

        const result = await CrmAnalyticsService.getChurnRisk();

        expect(result).toHaveLength(1);
        expect(result[0].riskLevel).toBe('low');
    });

    it('sorts results with high-risk customers first', async () => {
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
        ] as unknown as ReturnType<typeof mockCustomerFindMany> extends Promise<infer T> ? T : never);

        const result = await CrmAnalyticsService.getChurnRisk();

        expect(result[0].id).toBe('high-risk');
        expect(result[0].riskLevel).toBe('high');
        expect(result[1].id).toBe('low-risk');
        expect(result[1].riskLevel).toBe('low');
    });

    it('skips customers with fewer than 2 recorded orders (cannot compute interval)', async () => {
        mockCustomerFindMany.mockResolvedValue([
            {
                id: 'single-order',
                name: 'Single Order',
                phone: '0988888888',
                purchaseCount: 2,
                lastPurchaseDate: daysAgo(10),
                orders: [{ createdAt: daysAgo(10) }], // only 1 order fetched
            },
        ] as unknown as ReturnType<typeof mockCustomerFindMany> extends Promise<infer T> ? T : never);

        const result = await CrmAnalyticsService.getChurnRisk();

        // The service skips customers with < 2 orderDates
        expect(result).toHaveLength(0);
    });
});
