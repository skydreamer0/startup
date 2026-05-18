import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';
import type {
    AbcQuadrant,
    AbcProduct,
    AbcResult,
    RankedSupplier,
} from './analytics.types';

/**
 * Product-domain analytics: ABC quadrant analysis and Supplier ranking.
 *
 * Extracted from `analytics.service.ts` as part of C-04. The supplier ranking
 * preserves FIX-03 (the single $queryRaw GROUP BY that replaced the N+1
 * per-supplier aggregate loop).
 */
export class ProductAnalyticsService {
    /**
     * Cross-analyses products by revenue contribution and margin percentage.
     * Quadrants:
     * - Star:          High Revenue + High Margin
     * - Cash Cow:      High Revenue + Low Margin
     * - Hidden Gem:    Low Revenue  + High Margin
     * - Underperformer: Low Revenue + Low Margin
     *
     * Thresholds use the median of all products as the dividing line.
     */
    static async getProductAbcAnalysis(startDate: Date, endDate: Date): Promise<AbcResult> {
        requireTenantId();
        const orderItems = await prisma.orderItem.findMany({
            where: {
                order: {
                    status: 'completed',
                    createdAt: { gte: startDate, lte: endDate },
                },
            },
            include: {
                product: {
                    include: {
                        category: true,
                        supplier: true,
                    },
                },
            },
        });

        // Aggregate per product
        const productMap = new Map<string, {
            product: typeof orderItems[0]['product'];
            totalRevenue: number;
            totalCost: number;
            totalQuantity: number;
        }>();

        for (const item of orderItems) {
            const existing = productMap.get(item.productId);
            const revenue = item.quantity * item.unitPrice;
            const cost = item.quantity * item.product.costPrice;

            if (existing) {
                existing.totalRevenue += revenue;
                existing.totalCost += cost;
                existing.totalQuantity += item.quantity;
            } else {
                productMap.set(item.productId, {
                    product: item.product,
                    totalRevenue: revenue,
                    totalCost: cost,
                    totalQuantity: item.quantity,
                });
            }
        }

        if (productMap.size === 0) {
            return {
                summary: { star: 0, cash_cow: 0, hidden_gem: 0, underperformer: 0 },
                medianRevenue: 0,
                medianMargin: 0,
                products: [],
            };
        }

        // Calculate margins and find medians
        const entries = Array.from(productMap.values()).map((e) => ({
            ...e,
            marginPct: e.totalRevenue > 0
                ? Number((((e.totalRevenue - e.totalCost) / e.totalRevenue) * 100).toFixed(2))
                : 0,
        }));

        const sortedRevenues = entries.map((e) => e.totalRevenue).sort((a, b) => a - b);
        const sortedMargins = entries.map((e) => e.marginPct).sort((a, b) => a - b);
        const medianRevenue = sortedRevenues[Math.floor(sortedRevenues.length / 2)];
        const medianMargin = sortedMargins[Math.floor(sortedMargins.length / 2)];

        const products: AbcProduct[] = entries.map((e) => {
            const highRevenue = e.totalRevenue >= medianRevenue;
            const highMargin = e.marginPct >= medianMargin;

            let quadrant: AbcQuadrant;
            if (highRevenue && highMargin) quadrant = 'star';
            else if (highRevenue && !highMargin) quadrant = 'cash_cow';
            else if (!highRevenue && highMargin) quadrant = 'hidden_gem';
            else quadrant = 'underperformer';

            return {
                id: e.product.id,
                name: e.product.name,
                sku: e.product.sku,
                categoryName: e.product.category?.name ?? null,
                supplierName: e.product.supplier?.name ?? null,
                totalRevenue: Number(e.totalRevenue.toFixed(2)),
                totalQuantity: e.totalQuantity,
                marginPct: e.marginPct,
                quadrant,
            };
        });

        // Sort by revenue descending
        products.sort((a, b) => b.totalRevenue - a.totalRevenue);

        const summary: Record<AbcQuadrant, number> = { star: 0, cash_cow: 0, hidden_gem: 0, underperformer: 0 };
        for (const p of products) {
            summary[p.quadrant]++;
        }

        return { summary, medianRevenue, medianMargin, products };
    }

    /**
     * Ranks suppliers by a composite score derived from:
     * - Revenue share (40% weight)
     * - Average margin of supplied products (30% weight)
     * - Delivery reliability (20% weight)
     * - Defect rate inverted (10% weight)
     *
     * FIX-03: revenue/cost rollup uses a single GROUP BY $queryRaw (no N+1
     * per-supplier aggregate loop). Do not "refactor" back to Prisma's
     * aggregate API without verifying query count stays O(1).
     */
    static async getSupplierRanking(startDate: Date, endDate: Date): Promise<RankedSupplier[]> {
        requireTenantId();
        const suppliers = await prisma.supplier.findMany();
        const [productCounts, revenueRows] = await Promise.all([
            prisma.product.groupBy({
                by: ['supplierId'],
                where: { supplierId: { not: null } },
                _count: { id: true },
            }),
            prisma.$queryRaw<Array<{
                supplierId: string;
                totalRevenue: number;
                totalCost: number;
            }>>`
                SELECT
                    p.supplier_id AS "supplierId",
                    COALESCE(SUM(oi.quantity * oi.unit_price), 0) AS "totalRevenue",
                    COALESCE(SUM(oi.quantity * p.cost_price), 0) AS "totalCost"
                FROM order_items oi
                INNER JOIN products p ON p.id = oi.product_id
                INNER JOIN orders o ON o.id = oi.order_id
                WHERE p.supplier_id IS NOT NULL
                    AND o.status = 'completed'
                    AND o.created_at >= ${startDate}
                    AND o.created_at <= ${endDate}
                GROUP BY p.supplier_id
            `,
        ]);

        const productCountBySupplier = new Map<string, number>();
        for (const row of productCounts) {
            if (row.supplierId) {
                productCountBySupplier.set(row.supplierId, row._count.id);
            }
        }

        const revenueBySupplier = new Map<string, { totalRevenue: number; totalCost: number }>();
        for (const row of revenueRows) {
            revenueBySupplier.set(row.supplierId, {
                totalRevenue: Number(row.totalRevenue),
                totalCost: Number(row.totalCost),
            });
        }

        // Calculate total revenue across all suppliers for share computation
        const globalRevenue = Array.from(revenueBySupplier.values())
            .reduce((sum, row) => sum + row.totalRevenue, 0);

        const supplierStats = suppliers.map((supplier) => {
            const stats = revenueBySupplier.get(supplier.id);
            const totalRevenue = stats?.totalRevenue ?? 0;
            const totalCost = stats?.totalCost ?? 0;

            const marginPct = totalRevenue > 0
                ? Number((((totalRevenue - totalCost) / totalRevenue) * 100).toFixed(2))
                : 0;

            return {
                id: supplier.id,
                name: supplier.name,
                totalRevenue,
                avgMarginPct: marginPct,
                deliveryReliability: supplier.deliveryReliability,
                defectRate: supplier.defectRate,
                productCount: productCountBySupplier.get(supplier.id) ?? 0,
            };
        });

        // Compute composite scores
        const results: RankedSupplier[] = supplierStats.map((s) => {
            const revenueShare = globalRevenue > 0 ? (s.totalRevenue / globalRevenue) * 100 : 0;

            // Normalize each dimension to 0-100 scale
            const revenueScore = Math.min(revenueShare * 5, 100); // 20% share = 100 score
            const marginScore = Math.min(s.avgMarginPct, 100);
            const reliabilityScore = s.deliveryReliability ?? 50; // Default 50 if unknown
            const defectScore = s.defectRate != null ? Math.max(100 - s.defectRate * 10, 0) : 50;

            const compositeScore = Number((
                revenueScore * 0.4 +
                marginScore * 0.3 +
                reliabilityScore * 0.2 +
                defectScore * 0.1
            ).toFixed(2));

            return {
                ...s,
                revenueShare: Number(revenueShare.toFixed(2)),
                compositeScore,
            };
        });

        // Sort by composite score descending
        results.sort((a, b) => b.compositeScore - a.compositeScore);

        return results;
    }
}
