import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tenantContext } from '../../lib/tenant.context';
import { CashFlowService } from './cashflow.service';
import { MarginService } from './margin.service';
import { SalesRankingService } from './sales-ranking.service';
import { ProductAnalyticsService } from '../analytics/product-analytics.service';

type RelationScope = { where?: { order?: { tenantId?: unknown }; product?: { tenantId?: unknown } } };
const queries = vi.hoisted(() => ({
    items: vi.fn<(args?: RelationScope) => Promise<unknown[]>>(),
    order: vi.fn<() => Promise<unknown>>(),
    expenses: vi.fn<() => Promise<unknown[]>>(),
    movements: vi.fn<(args?: RelationScope) => Promise<unknown[]>>(),
    suppliers: vi.fn<() => Promise<unknown[]>>(),
    productGroups: vi.fn<() => Promise<unknown[]>>(),
    raw: vi.fn<(template: unknown, ...values: unknown[]) => Promise<unknown[]>>(),
}));
vi.mock('../../lib/prisma', () => ({ prisma: {
    orderItem: { findMany: queries.items }, order: { aggregate: queries.order },
    expense: { findMany: queries.expenses }, inventoryTransaction: { findMany: queries.movements },
    supplier: { findMany: queries.suppliers }, product: { groupBy: queries.productGroups }, $queryRaw: queries.raw,
} }));

const stamp = new Date('2026-01-10T12:00:00Z');
const rows = ['tenant-a', 'tenant-b'].map((tenantId, index) => ({
    productId: `product-${tenantId}`, quantity: 1, unitPrice: index ? 900 : 100,
    order: { tenantId, status: 'completed', createdAt: stamp },
    product: { id: `product-${tenantId}`, tenantId, name: `${tenantId} private product`, sku: 'SAME-SKU', costPrice: 10,
        category: { tenantId, name: `${tenantId} private category` }, supplier: { tenantId, name: `${tenantId} private supplier` } },
}));
let currentRows = structuredClone(rows);
const inTenant = <T>(id: string, work: () => Promise<T>) => tenantContext.run({ tenantId: id, plan: 'pro' }, work);

beforeEach(() => {
    vi.clearAllMocks();
    currentRows = structuredClone(rows);
    queries.order.mockResolvedValue({ _sum: { totalAmount: 100 } });
    queries.expenses.mockResolvedValue([]);
    queries.movements.mockImplementation(async args => {
        const product = args?.where?.product;
        const tenantId = product && 'tenantId' in product ? product.tenantId : undefined;
        return [{ tenantId: 'tenant-a', quantity: 5, product: { costPrice: 1 } }, { tenantId: 'tenant-b', quantity: 3, product: { costPrice: 900 } }].filter(row => !tenantId || row.tenantId === tenantId);
    });
    queries.items.mockImplementation(async args => {
        const where = args?.where;
        // Model the real unscoped OrderItem relation predicate. This is a unit
        // control, not PostgreSQL evidence; the native package adds DB sentinels.
        const order = where?.order && 'tenantId' in where.order ? where.order.tenantId : undefined;
        const product = where?.product && 'tenantId' in where.product ? where.product.tenantId : undefined;
        return currentRows.filter(row => (!order || row.order.tenantId === order) && (!product || row.product.tenantId === product));
    });
    queries.suppliers.mockImplementation(async () => [{ id: `supplier-${tenantContext.getStore()?.tenantId}`, name: 'Same supplier name', deliveryReliability: null, defectRate: null }]);
    queries.productGroups.mockResolvedValue([]);
    queries.raw.mockImplementation(async (template, ...values) => {
        const sql = Array.isArray(template) ? template.join('?') : String(template);
        const tenantId = tenantContext.getStore()?.tenantId;
        const constrained = /o\.tenant_id\s*=/.test(sql) && /p\.tenant_id\s*=/.test(sql) && values.filter(value => value === tenantId).length >= 2;
        const result = ['tenant-a', 'tenant-b'].filter(id => !constrained || id === tenantId)
            .map(id => ({ supplierId: `supplier-${id}`, totalRevenue: id === 'tenant-a' ? 100 : 900, totalCost: 10 }));
        return result;
    });
});

describe('existing report readers constrain every unscoped query to the actor tenant', () => {
    it('margin rows, numerator, denominator and count stay isolated for concurrent same-SKU tenants', async () => {
        const [a, b] = await Promise.all(['tenant-a', 'tenant-b'].map(id => inTenant(id, () => MarginService.getMarginByProduct('2026-01'))));
        expect(a.products.map(row => row.id)).toEqual(['product-tenant-a']);
        expect(b.products.map(row => row.id)).toEqual(['product-tenant-b']);
        expect(a.summary).toEqual({ totalRevenue: 100, totalCogs: 10, totalMargin: 90, totalMarginPct: 90 });
        expect(a.products[0].contributionPct).toBe(100);
        expect(b.summary.totalRevenue).toBe(900);
    });
    it('sales ranking and category totals exclude another tenant at either sort setting', async () => {
        for (const sort of ['revenue', 'quantity'] as const) {
            const result = await inTenant('tenant-a', () => SalesRankingService.getTopProducts('2026-01', 20, sort));
            expect(result.map(row => row.id)).toEqual(['product-tenant-a']);
            expect(result[0].revenue).toBe(100);
        }
        expect(await inTenant('tenant-a', () => SalesRankingService.getCategoryBreakdown('2026-01')))
            .toEqual([{ category: 'tenant-a private category', revenue: 100, quantity: 1 }]);
    });
    it('ABC medians, quadrants, counts and rows exclude a second tenant', async () => {
        const result = await inTenant('tenant-a', () => ProductAnalyticsService.getProductAbcAnalysis(stamp, stamp));
        expect(result.products.map(row => row.id)).toEqual(['product-tenant-a']);
        expect(result.medianRevenue).toBe(100);
        expect(result.medianMargin).toBe(90);
        expect(result.summary).toEqual({ star: 1, cash_cow: 0, hidden_gem: 0, underperformer: 0 });
    });
    it('supplier raw query uses tenant-bound numerator and denominator', async () => {
        const result = await inTenant('tenant-a', () => ProductAnalyticsService.getSupplierRanking(stamp, stamp));
        expect(result).toHaveLength(1);
        expect(result[0].totalRevenue).toBe(100);
        expect(result[0].revenueShare).toBe(100);
        const [template, ...values] = queries.raw.mock.calls[0];
        const sql = Array.isArray(template) ? template.join('?') : String(template);
        expect(sql).toMatch(/o\.tenant_id\s*=/);
        expect(sql).toMatch(/p\.tenant_id\s*=/);
        expect(values.filter(value => value === 'tenant-a').length).toBeGreaterThanOrEqual(2);
    });
    it('missing actor context fails before any relation/raw query', async () => {
        await expect(MarginService.getMarginByProduct('2026-01')).rejects.toThrow(/Tenant context missing/);
        await expect(SalesRankingService.getTopProducts('2026-01')).rejects.toThrow(/Tenant context missing/);
        await expect(ProductAnalyticsService.getProductAbcAnalysis(stamp, stamp)).rejects.toThrow(/Tenant context missing/);
        await expect(ProductAnalyticsService.getSupplierRanking(stamp, stamp)).rejects.toThrow(/Tenant context missing/);
        expect(queries.items).not.toHaveBeenCalled();
        expect(queries.raw).not.toHaveBeenCalled();
    });
});


describe('malformed legacy relation and trend boundaries stay read-only and tenant-safe', () => {
    it('excludes an A order pointing at a B product from all OrderItem readers', async () => {
        currentRows.push({ ...structuredClone(rows[1]), order: { ...rows[0].order } });
        const margin = await inTenant('tenant-a', () => MarginService.getMarginByProduct('2026-01'));
        const ranking = await inTenant('tenant-a', () => SalesRankingService.getTopProducts('2026-01'));
        const abc = await inTenant('tenant-a', () => ProductAnalyticsService.getProductAbcAnalysis(stamp, stamp));
        expect(margin.summary.totalRevenue).toBe(100);
        expect(ranking.map(row => row.id)).toEqual(['product-tenant-a']);
        expect(abc.products.map(row => row.id)).toEqual(['product-tenant-a']);
    });
    it('masks foreign category and supplier labels instead of publishing joined relation data', async () => {
        currentRows[0].product.category = structuredClone(rows[1].product.category);
        currentRows[0].product.supplier = structuredClone(rows[1].product.supplier);
        const ranking = await inTenant('tenant-a', () => SalesRankingService.getTopProducts('2026-01'));
        const abc = await inTenant('tenant-a', () => ProductAnalyticsService.getProductAbcAnalysis(stamp, stamp));
        expect(ranking[0].categoryName).toBe('Uncategorized');
        expect(abc.products[0].categoryName).toBeNull();
        expect(abc.products[0].supplierName).toBeNull();
    });
    it('cash-flow receipt proxy excludes a foreign product behind a legacy same-tenant movement', async () => {
        const result = await inTenant('tenant-a', () => CashFlowService.getCashFlowStatement('2026-01'));
        expect(result.investingOutflows).toBe(5);
        expect(result.beginningCash).toBe(300000); // Existing disclosed estimate, not an approved balance.
        expect(result.endingCash).toBe(300095);
    });
    it('every month in margin trend retains the actor relation scope', async () => {
        const result = await inTenant('tenant-a', () => MarginService.getMarginTrend('2026-01'));
        expect(result).toHaveLength(6);
        expect(result.every(row => row.revenue === 100)).toBe(true);
        expect(queries.items).toHaveBeenCalledTimes(6);
    });
    it('empty tenant and repeated A/B/A do not inherit another result or total', async () => {
        const results = [];
        for (const id of ['tenant-a','tenant-empty','tenant-b','tenant-a']) results.push(await inTenant(id, () => MarginService.getMarginByProduct('2026-01')));
        expect(results.map(row => row.summary.totalRevenue)).toEqual([100, 0, 900, 100]);
        expect(results[1].products).toEqual([]);
        expect(results[3]).toEqual(results[0]);
    });
    it('supplier SQL also rejects a foreign supplier relation without changing score weights', async () => {
        const result = await inTenant('tenant-a', () => ProductAnalyticsService.getSupplierRanking(stamp, stamp));
        const [template, ...values] = queries.raw.mock.calls[0];
        const sql = Array.isArray(template) ? template.join('?') : String(template);
        expect(sql).toMatch(/INNER JOIN suppliers s ON s.id = p.supplier_id/);
        expect(sql).toMatch(/s\.tenant_id\s*=/);
        expect(values.filter(value => value === 'tenant-a')).toHaveLength(3);
        expect(result[0].compositeScore).toBe(82);
    });
});
