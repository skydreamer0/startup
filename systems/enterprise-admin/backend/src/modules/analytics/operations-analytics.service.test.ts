import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OperationsAnalyticsService } from './operations-analytics.service';

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
        order: {
            findMany: vi.fn(),
            aggregate: vi.fn(),
        },
        customer: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
        expense: {
            aggregate: vi.fn(),
        },
    },
}));

import { prisma } from '../../lib/prisma';

const mockOrderItemFindMany = vi.mocked(prisma.orderItem.findMany);
const mockOrderFindMany = vi.mocked(prisma.order.findMany);
const mockOrderAggregate = vi.mocked(prisma.order.aggregate);
const mockCustomerCount = vi.mocked(prisma.customer.count);
const mockExpenseAggregate = vi.mocked(prisma.expense.aggregate);

const startDate = new Date('2026-03-01');
const endDate = new Date('2026-03-31');

// ?€?€?€ Helpers ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€
function makeOrderItem(quantity: number, unitPrice: number, costPrice: number) {
    return { quantity, unitPrice, product: { costPrice } };
}

// ?€?€?€ getGrossMarginPct ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€

describe('OperationsAnalyticsService.getGrossMarginPct', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('happy path: calculates correct margin percentage', async () => {
        mockOrderItemFindMany.mockResolvedValue([
            makeOrderItem(10, 100, 50),  // revenue 1000, cost 500
            makeOrderItem(5, 200, 100),  // revenue 1000, cost 500
        ] as unknown as ReturnType<typeof mockOrderItemFindMany> extends Promise<infer T> ? T : never);

        const result = await OperationsAnalyticsService.getGrossMarginPct(startDate, endDate);

        // total revenue 2000, total cost 1000 ??margin 50%
        expect(result).toBe(50);
    });

    it('edge case: returns 0 when no order items exist', async () => {
        mockOrderItemFindMany.mockResolvedValue([]);

        const result = await OperationsAnalyticsService.getGrossMarginPct(startDate, endDate);

        expect(result).toBe(0);
    });

    it('edge case: returns 0 when total revenue is zero', async () => {
        mockOrderItemFindMany.mockResolvedValue([
            makeOrderItem(0, 100, 50),
        ] as unknown as ReturnType<typeof mockOrderItemFindMany> extends Promise<infer T> ? T : never);

        const result = await OperationsAnalyticsService.getGrossMarginPct(startDate, endDate);

        expect(result).toBe(0);
    });
});

// ?€?€?€ getAovTwd ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€

describe('OperationsAnalyticsService.getAovTwd', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('happy path: calculates AOV correctly', async () => {
        mockOrderAggregate.mockResolvedValue({
            _sum: { totalAmount: 3000 },
            _count: { id: 6 },
        } as unknown as ReturnType<typeof mockOrderAggregate> extends Promise<infer T> ? T : never);

        const result = await OperationsAnalyticsService.getAovTwd(startDate, endDate);

        expect(result).toBe(500);
    });

    it('edge case: returns 0 when no orders exist', async () => {
        mockOrderAggregate.mockResolvedValue({
            _sum: { totalAmount: null },
            _count: { id: 0 },
        } as unknown as ReturnType<typeof mockOrderAggregate> extends Promise<infer T> ? T : never);

        const result = await OperationsAnalyticsService.getAovTwd(startDate, endDate);

        expect(result).toBe(0);
    });
});

// ?€?€?€ getCacTwd ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€

describe('OperationsAnalyticsService.getCacTwd', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('happy path: calculates CAC when marketing spend and new customers exist', async () => {
        mockExpenseAggregate.mockResolvedValue({
            _sum: { amount: 5000 },
        } as unknown as ReturnType<typeof mockExpenseAggregate> extends Promise<infer T> ? T : never);
        mockCustomerCount.mockResolvedValue(10);

        const result = await OperationsAnalyticsService.getCacTwd(startDate, endDate);

        expect(result).toBe(500);
    });

    it('edge case: returns 0 when marketing spend is zero', async () => {
        mockExpenseAggregate.mockResolvedValue({
            _sum: { amount: 0 },
        } as unknown as ReturnType<typeof mockExpenseAggregate> extends Promise<infer T> ? T : never);

        const result = await OperationsAnalyticsService.getCacTwd(startDate, endDate);

        expect(result).toBe(0);
    });

    it('returns total spend when new customer count is zero', async () => {
        mockExpenseAggregate.mockResolvedValue({
            _sum: { amount: 2000 },
        } as unknown as ReturnType<typeof mockExpenseAggregate> extends Promise<infer T> ? T : never);
        mockCustomerCount.mockResolvedValue(0);

        const result = await OperationsAnalyticsService.getCacTwd(startDate, endDate);

        expect(result).toBe(2000);
    });
});

// ?€?€?€ getSalesHeatmap ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€

describe('OperationsAnalyticsService.getSalesHeatmap', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('edge case: returns 168-cell grid of zeros when no orders exist', async () => {
        mockOrderFindMany.mockResolvedValue([]);

        const result = await OperationsAnalyticsService.getSalesHeatmap(startDate, endDate);

        expect(result).toHaveLength(168); // 7 days ? 24 hours
        expect(result.every((c) => c.orderCount === 0)).toBe(true);
        expect(result.every((c) => c.revenue === 0)).toBe(true);
    });

    it('happy path: correctly buckets orders by weekday and hour (Taiwan time +8h)', async () => {
        // 2026-03-04T06:00:00Z ??Taiwan time = 2026-03-04T14:00:00+08 ??Wednesday (3), hour 14
        const utcTime = new Date('2026-03-04T06:00:00.000Z');
        mockOrderFindMany.mockResolvedValue([
            { createdAt: utcTime, totalAmount: 500 },
            { createdAt: utcTime, totalAmount: 300 },
        ] as unknown as ReturnType<typeof mockOrderFindMany> extends Promise<infer T> ? T : never);

        const result = await OperationsAnalyticsService.getSalesHeatmap(startDate, endDate);

        // Taiwan time: Wednesday = 3, hour = 14
        const cell = result.find((c) => c.weekday === 3 && c.hour === 14);
        expect(cell).toBeDefined();
        expect(cell?.orderCount).toBe(2);
        expect(cell?.revenue).toBe(800);
    });

    it('grid covers all weekdays 0-6 and hours 0-23', async () => {
        mockOrderFindMany.mockResolvedValue([]);

        const result = await OperationsAnalyticsService.getSalesHeatmap(startDate, endDate);

        for (let d = 0; d < 7; d++) {
            for (let h = 0; h < 24; h++) {
                const cell = result.find((c) => c.weekday === d && c.hour === h);
                expect(cell).toBeDefined();
            }
        }
    });
});

// ?€?€?€ getKpiSnapshot ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€

describe('OperationsAnalyticsService.getKpiSnapshot', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('happy path: bonus_gate_pass=true when margin >= 30% and CCC <= 30', async () => {
        mockOrderItemFindMany.mockResolvedValue([
            makeOrderItem(10, 100, 50),
        ] as unknown as ReturnType<typeof mockOrderItemFindMany> extends Promise<infer T> ? T : never);
        mockExpenseAggregate.mockResolvedValue({ _sum: { amount: 0 } } as unknown as ReturnType<typeof mockExpenseAggregate> extends Promise<infer T> ? T : never);
        mockOrderAggregate.mockResolvedValue({
            _sum: { totalAmount: 1000 },
            _count: { id: 10 },
        } as unknown as ReturnType<typeof mockOrderAggregate> extends Promise<infer T> ? T : never);
        mockCustomerCount.mockResolvedValue(0);

        const result = await OperationsAnalyticsService.getKpiSnapshot(startDate, endDate);

        expect(result.gross_margin_pct).toBe(50);
        expect(result.ccc_days).toBe(22); // static proxy
        expect(result.bonus_gate_pass).toBe(true);
        expect(result.aov_twd).toBe(100);
    });

    it('edge case: bonus_gate_pass=false when gross margin < 30%', async () => {
        mockOrderItemFindMany.mockResolvedValue([
            makeOrderItem(10, 100, 80), // 20% margin
        ] as unknown as ReturnType<typeof mockOrderItemFindMany> extends Promise<infer T> ? T : never);
        mockExpenseAggregate.mockResolvedValue({ _sum: { amount: 0 } } as unknown as ReturnType<typeof mockExpenseAggregate> extends Promise<infer T> ? T : never);
        mockOrderAggregate.mockResolvedValue({
            _sum: { totalAmount: 1000 },
            _count: { id: 10 },
        } as unknown as ReturnType<typeof mockOrderAggregate> extends Promise<infer T> ? T : never);
        mockCustomerCount.mockResolvedValue(0);

        const result = await OperationsAnalyticsService.getKpiSnapshot(startDate, endDate);

        expect(result.gross_margin_pct).toBe(20);
        expect(result.bonus_gate_pass).toBe(false);
    });
});

// ?€?€?€ getBonusGateStatus ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€

describe('OperationsAnalyticsService.getBonusGateStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('happy path: gatePass=true and estimatedBonusPool > 0 when margin >= 30% and CCC <= 30', async () => {
        mockOrderItemFindMany.mockResolvedValue([
            makeOrderItem(10, 100, 50),
        ] as unknown as ReturnType<typeof mockOrderItemFindMany> extends Promise<infer T> ? T : never);
        mockExpenseAggregate.mockResolvedValue({ _sum: { amount: 0 } } as unknown as ReturnType<typeof mockExpenseAggregate> extends Promise<infer T> ? T : never);
        mockOrderAggregate
            .mockResolvedValueOnce({
                _sum: { totalAmount: 1000 },
                _count: { id: 10 },
            } as unknown as ReturnType<typeof mockOrderAggregate> extends Promise<infer T> ? T : never)
            .mockResolvedValueOnce({
                _sum: { totalAmount: 1000 },
                _count: { id: 10 },
            } as unknown as ReturnType<typeof mockOrderAggregate> extends Promise<infer T> ? T : never);
        mockCustomerCount.mockResolvedValue(0);

        const result = await OperationsAnalyticsService.getBonusGateStatus('2026-03');

        expect(result.grossMarginPct).toBe(50);
        expect(result.grossMarginPass).toBe(true);
        expect(result.cccPass).toBe(true); // CCC is hardcoded to 22
        expect(result.gatePass).toBe(true);
        expect(result.estimatedBonusPool).toBeGreaterThan(0);
    });

    it('edge case: estimatedBonusPool=0 when gate fails', async () => {
        mockOrderItemFindMany.mockResolvedValue([
            makeOrderItem(10, 100, 85), // 15% margin ??below 30% threshold
        ] as unknown as ReturnType<typeof mockOrderItemFindMany> extends Promise<infer T> ? T : never);
        mockExpenseAggregate.mockResolvedValue({ _sum: { amount: 0 } } as unknown as ReturnType<typeof mockExpenseAggregate> extends Promise<infer T> ? T : never);
        mockOrderAggregate
            .mockResolvedValueOnce({
                _sum: { totalAmount: 1000 },
                _count: { id: 10 },
            } as unknown as ReturnType<typeof mockOrderAggregate> extends Promise<infer T> ? T : never)
            .mockResolvedValueOnce({
                _sum: { totalAmount: 1000 },
                _count: { id: 10 },
            } as unknown as ReturnType<typeof mockOrderAggregate> extends Promise<infer T> ? T : never);
        mockCustomerCount.mockResolvedValue(0);

        const result = await OperationsAnalyticsService.getBonusGateStatus('2026-03');

        expect(result.grossMarginPass).toBe(false);
        expect(result.gatePass).toBe(false);
        expect(result.estimatedBonusPool).toBe(0);
    });
});

// ?€?€?€ getKpiTrend ?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€?€

describe('OperationsAnalyticsService.getKpiTrend', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('happy path: returns 6 monthly trend points', async () => {
        // Each getKpiSnapshot call needs these mocks
        mockOrderItemFindMany.mockResolvedValue([]);
        mockExpenseAggregate.mockResolvedValue({ _sum: { amount: 0 } } as unknown as ReturnType<typeof mockExpenseAggregate> extends Promise<infer T> ? T : never);
        mockOrderAggregate.mockResolvedValue({
            _sum: { totalAmount: 0 },
            _count: { id: 0 },
        } as unknown as ReturnType<typeof mockOrderAggregate> extends Promise<infer T> ? T : never);
        mockCustomerCount.mockResolvedValue(0);

        const result = await OperationsAnalyticsService.getKpiTrend('2026-03');

        expect(result).toHaveLength(6);
        expect(result[5].period).toBe('2026-03');
        expect(result[0].period).toBe('2025-10');
    });

    it('edge case: throws for invalid period string', async () => {
        await expect(OperationsAnalyticsService.getKpiTrend('not-a-date')).rejects.toThrow('Invalid end period');
    });
});
