import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TEST_TENANT_ID, withTenantContext } from './helpers/tenant-context';

// ─── Mock Prisma ─────────────────────────────────────────
vi.mock('../lib/prisma', () => ({
    prisma: {
        accountingSyncLog: {
            findFirst: vi.fn(),
            create: vi.fn(),
            count: vi.fn(),
            findMany: vi.fn(),
        },
        order: {
            findUnique: vi.fn(),
        },
        expense: {
            findUnique: vi.fn(),
        },
    },
}));

// ─── Mock provider factory ───────────────────────────────
const mockProvider = {
    name: 'mock' as const,
    isConfigured: vi.fn(() => true),
    syncOrder: vi.fn(),
    syncExpense: vi.fn(),
};

vi.mock('../modules/accounting/provider.factory', () => ({
    getProviderForTenant: vi.fn(() => Promise.resolve(mockProvider)),
}));

import { AccountingService } from '../modules/accounting/accounting.service';
import { prisma } from '../lib/prisma';

const mockSyncLogFindFirst = vi.mocked(prisma.accountingSyncLog.findFirst);
const mockSyncLogCreate = vi.mocked(prisma.accountingSyncLog.create);
const mockOrderFindUnique = vi.mocked(prisma.order.findUnique);

// ─── Helpers ─────────────────────────────────────────────
function makeOrder(id: string) {
    return {
        id,
        orderNumber: 'ORD-001',
        totalAmount: 1000,
        discountAmount: 0,
        paymentMethod: 'cash',
        createdAt: new Date('2026-05-19T00:00:00Z'),
        customer: { name: 'Test Customer', phone: '0912345678' },
        items: [
            {
                quantity: 2,
                unitPrice: 500,
                product: { sku: 'SKU-1', name: 'Test Product' },
            },
        ],
    };
}

// ─── Tests ───────────────────────────────────────────────

describe('AccountingService.syncOrder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockProvider.isConfigured.mockReturnValue(true);
    });

    it('writes a synced log row with externalId on success', async () => {
        mockSyncLogFindFirst.mockResolvedValue(null);
        mockOrderFindUnique.mockResolvedValue(makeOrder('order-1') as never);
        mockProvider.syncOrder.mockResolvedValue({ externalId: 'EXT-123' });
        const fakeLog = {
            id: 'log-1',
            status: 'synced',
            externalId: 'EXT-123',
            provider: 'mock',
        };
        mockSyncLogCreate.mockResolvedValue(fakeLog as never);

        const result = await withTenantContext(() => AccountingService.syncOrder('order-1'));

        expect(result.alreadySynced).toBe(false);
        expect(result.log).toEqual(fakeLog);
        expect(mockProvider.syncOrder).toHaveBeenCalledTimes(1);
        expect(mockSyncLogCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    tenantId: TEST_TENANT_ID,
                    provider: 'mock',
                    entityType: 'order',
                    entityId: 'order-1',
                    externalId: 'EXT-123',
                    status: 'synced',
                }),
            }),
        );
    });

    it('is idempotent — a second call on an already-synced order skips the provider', async () => {
        const existingLog = {
            id: 'log-existing',
            status: 'synced',
            externalId: 'EXT-OLD',
            entityType: 'order',
            entityId: 'order-1',
        };
        mockSyncLogFindFirst.mockResolvedValue(existingLog as never);

        const result = await withTenantContext(() => AccountingService.syncOrder('order-1'));

        expect(result.alreadySynced).toBe(true);
        expect(result.log).toEqual(existingLog);
        expect(mockProvider.syncOrder).not.toHaveBeenCalled();
        expect(mockSyncLogCreate).not.toHaveBeenCalled();
        expect(mockOrderFindUnique).not.toHaveBeenCalled();
    });

    it('records a failure log when the provider is not configured', async () => {
        mockSyncLogFindFirst.mockResolvedValue(null);
        mockOrderFindUnique.mockResolvedValue(makeOrder('order-2') as never);
        mockProvider.isConfigured.mockReturnValue(false);
        mockProvider.syncOrder.mockRejectedValue(new Error('Provider not configured'));
        mockSyncLogCreate.mockResolvedValue({ id: 'log-fail', status: 'failed' } as never);

        await expect(withTenantContext(() => AccountingService.syncOrder('order-2'))).rejects.toThrow(
            'Provider not configured',
        );

        expect(mockSyncLogCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    tenantId: TEST_TENANT_ID,
                    provider: 'mock',
                    entityType: 'order',
                    entityId: 'order-2',
                    status: 'failed',
                    errorMessage: 'Provider not configured',
                }),
            }),
        );
    });
});
