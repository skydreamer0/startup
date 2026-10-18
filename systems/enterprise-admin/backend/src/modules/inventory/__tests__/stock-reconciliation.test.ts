import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StockReconciliationService, reconciliationPage } from '../stock-reconciliation.service';

const db = vi.hoisted(() => ({ count: vi.fn(), findMany: vi.fn(), batches: vi.fn(), movements: vi.fn(), transaction: vi.fn() }));
vi.mock('../../../lib/prisma', () => ({ prisma: { $transaction: db.transaction } }));
vi.mock('../../../lib/tenant.context', () => ({ requireTenantId: () => 'owner' }));

beforeEach(() => {
    vi.resetAllMocks();
    db.transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn({
        product: { count: db.count, findMany: db.findMany },
        productBatch: { groupBy: db.batches }, inventoryTransaction: { groupBy: db.movements },
    }));
    db.count.mockResolvedValue(51);
    db.findMany.mockResolvedValue([{ id: 'p', sku: 'SYNTHETIC', name: 'Fixture', stockQuantity: 9, stockUnitLabel: null }]);
    db.batches.mockResolvedValueOnce([
        { productId: 'p', status: 'RELEASED', _sum: { quantity: 2 }, _count: { _all: 2 } },
        { productId: 'p', status: 'QUARANTINE', _sum: { quantity: 3 }, _count: { _all: 1 } },
        { productId: 'p', status: 'BLOCKED', _sum: { quantity: 1 }, _count: { _all: 1 } },
    ]).mockResolvedValueOnce([{ productId: 'p', _sum: { quantity: 1 } }])
      .mockResolvedValueOnce([{ productId: 'p', _sum: { quantity: 4 } }]).mockResolvedValueOnce([]);
    db.movements.mockResolvedValue([{ productId: 'p', _count: { _all: 2 } }]);
});

describe('read-only physical reconciliation', () => {
    it('compares all physical states, not sale eligibility, without inventing history or reservations', async () => {
        const result = await StockReconciliationService.list(undefined, new Date('2026-10-18T12:00:00Z'));
        expect(result.data[0]).toMatchObject({ physicalBatchQuantity: 6, difference: 3, batchCount: 4,
            releasedQuantity: 2, quarantineQuantity: 3, blockedQuantity: 1, expiredQuantity: 4,
            eligibleReleasedQuantity: 1, untracedReceiptCount: 2, reservedQuantity: null, availableQuantity: null, historyComplete: null });
        expect(result.expiryCutoff).toBe('2026-10-18T16:00:00.000Z');
    });
    it('uses one repeatable-read snapshot and explicit tenant scope for every query', async () => {
        await StockReconciliationService.list('2');
        expect(db.transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: 'RepeatableRead' });
        expect(db.count).toHaveBeenCalledWith({ where: { tenantId: 'owner' } });
        expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 'owner' }, skip: 50, take: 50,
            orderBy: [{ name: 'asc' }, { id: 'asc' }] }));
        for (const [query] of [...db.batches.mock.calls, ...db.movements.mock.calls]) {
            expect(query.where).toMatchObject({ tenantId: 'owner', productId: { in: ['p'] } });
        }
        expect(db.batches.mock.calls[1][0].where).toMatchObject({ status: 'RELEASED', quantity: { gt: 0 }, expiryDate: { gte: expect.any(Date) } });
        expect(db.movements.mock.calls[0][0].where).toMatchObject({ type: 'IN', batchId: null });
    });
    it('does not infer traceability when there are no batches or movements', async () => {
        db.batches.mockReset().mockResolvedValue([]); db.movements.mockResolvedValue([]);
        const result = await StockReconciliationService.list('1');
        expect(result.data[0]).toMatchObject({ physicalBatchQuantity: 0, batchCount: 0, difference: 9, historyComplete: null });
    });
    it('preserves negative quantities rather than silently clamping or repairing them', async () => {
        db.batches.mockReset().mockResolvedValueOnce([{ productId: 'p', status: 'BLOCKED', _sum: { quantity: -2 }, _count: { _all: 1 } }])
            .mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([{ productId: 'p', _count: { _all: 1 } }]);
        const result = await StockReconciliationService.list('1');
        expect(result.data[0]).toMatchObject({ physicalBatchQuantity: -2, difference: 11, negativeBatchCount: 1 });
    });
    it('keeps an empty beyond-end page and full count without a fabricated row', async () => {
        db.findMany.mockResolvedValue([]); db.batches.mockReset().mockResolvedValue([]);
        const result = await StockReconciliationService.list('3');
        expect(result).toMatchObject({ total: 51, page: 3, limit: 50, data: [] });
    });
    it.each(['0', '-1', '1x', '1.5', '1000001', '', ['1'], {}])('rejects invalid page %j before querying', async value => {
        await expect(StockReconciliationService.list(value)).rejects.toMatchObject({ statusCode: 400 });
        expect(db.transaction).not.toHaveBeenCalled();
    });
    it('rejects unsafe integer aggregates instead of publishing rounded reconciliation', async () => {
        db.batches.mockReset().mockResolvedValueOnce([{ productId: 'p', status: 'RELEASED', _sum: { quantity: Number.MAX_SAFE_INTEGER + 1 }, _count: { _all: 1 } }])
            .mockResolvedValue([]);
        await expect(StockReconciliationService.list('1')).rejects.toMatchObject({ statusCode: 422 });
    });
    it('accepts only canonical bounded page values', () => {
        expect(reconciliationPage(undefined)).toBe(1); expect(reconciliationPage('1000000')).toBe(1000000);
    });
});
