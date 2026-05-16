import { prisma } from '../../lib/prisma';
import { startOfMonth, endOfMonth, subMonths, format, parseISO, isValid, differenceInDays, addDays } from 'date-fns';

// ─── RFM Type Definitions ────────────────────────────────
export type RfmSegment = 'vip' | 'loyal' | 'new' | 'dormant' | 'at_risk';

export interface RfmCustomer {
    id: string;
    name: string | null;
    phone: string | null;
    segment: RfmSegment;
    recencyDays: number;
    frequency: number;
    monetary: number;
    lastPurchaseDate: Date | null;
}

export interface RfmResult {
    summary: Record<RfmSegment, number>;
    customers: RfmCustomer[];
}

export interface ChurnRiskCustomer {
    id: string;
    name: string | null;
    phone: string | null;
    avgIntervalDays: number;
    daysSinceLastPurchase: number;
    riskLevel: 'high' | 'medium' | 'low';
    estimatedChurnDate: string | null;
    purchaseCount: number;
}

// ─── ABC Product Analysis Type Definitions ───────────────
export type AbcQuadrant = 'star' | 'cash_cow' | 'hidden_gem' | 'underperformer';

export interface AbcProduct {
    id: string;
    name: string;
    sku: string;
    categoryName: string | null;
    supplierName: string | null;
    totalRevenue: number;
    totalQuantity: number;
    marginPct: number;
    quadrant: AbcQuadrant;
}

export interface AbcResult {
    summary: Record<AbcQuadrant, number>;
    medianRevenue: number;
    medianMargin: number;
    products: AbcProduct[];
}

// ─── Supplier Ranking Type Definitions ───────────────────
export interface RankedSupplier {
    id: string;
    name: string;
    totalRevenue: number;
    revenueShare: number;
    avgMarginPct: number;
    deliveryReliability: number | null;
    defectRate: number | null;
    compositeScore: number;
    productCount: number;
}

// ─── Sales Heatmap Type Definitions ──────────────────────
export interface HeatmapCell {
    weekday: number; // 0=Sun, 6=Sat
    hour: number;    // 0-23
    orderCount: number;
    revenue: number;
}

// ─── Bonus Gate Type Definitions ─────────────────────────
export interface BonusGateResult {
    period: string;
    grossMarginPct: number;
    grossMarginPass: boolean;
    cccDays: number;
    cccPass: boolean;
    gatePass: boolean;
    estimatedBonusPool: number;
    totalRevenue: number;
}

export class AnalyticsService {
    /**
     * Calculates the Gross Margin Percentage combined for all completed orders in the given period.
     * Formula: (Revenue - COGS) / Revenue * 100
     */
    static async getGrossMarginPct(startDate: Date, endDate: Date): Promise<number> {
        const orderItems = await prisma.orderItem.findMany({
            where: {
                order: {
                    status: 'completed',
                    createdAt: { gte: startDate, lte: endDate }
                }
            },
            include: { product: true }
        });

        if (orderItems.length === 0) return 0;

        let totalRevenue = 0;
        let totalCogs = 0;

        for (const item of orderItems) {
            totalRevenue += item.quantity * item.unitPrice;
            totalCogs += item.quantity * item.product.costPrice;
        }

        if (totalRevenue === 0) return 0;
        return Number((((totalRevenue - totalCogs) / totalRevenue) * 100).toFixed(2));
    }

    /**
     * Calculates Number of New Customers acquired within the period.
     */
    static async getNewCustomersCount(startDate: Date, endDate: Date): Promise<number> {
        return prisma.customer.count({
            where: { createdAt: { gte: startDate, lte: endDate } }
        });
    }

    /**
     * Calculates Customer Acquisition Cost (CAC) for the period.
     * Formula: Total Marketing Expenses / New Customers Acquired
     */
    static async getCacTwd(startDate: Date, endDate: Date): Promise<number> {
        const periodStr = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

        const marketingExpense = await prisma.expense.aggregate({
            _sum: { amount: true },
            where: {
                type: 'MARKETING',
                period: periodStr
            }
        });

        const totalMarketingSpend = marketingExpense._sum.amount || 0;
        if (totalMarketingSpend === 0) return 0;

        const newCustomers = await this.getNewCustomersCount(startDate, endDate);
        if (newCustomers === 0) return totalMarketingSpend; // Technically undefined without customers, return total spend as cost

        return Number((totalMarketingSpend / newCustomers).toFixed(2));
    }

    /**
     * Calculates Average Order Value (AOV).
     * Formula: Total Revenue / Total Number of Orders
     */
    static async getAovTwd(startDate: Date, endDate: Date): Promise<number> {
        const result = await prisma.order.aggregate({
            _sum: { totalAmount: true },
            _count: { id: true },
            where: {
                status: 'completed',
                createdAt: { gte: startDate, lte: endDate }
            }
        });

        const totalRevenue = result._sum.totalAmount || 0;
        const totalOrders = result._count.id || 0;

        if (totalOrders === 0) return 0;
        return Number((totalRevenue / totalOrders).toFixed(2));
    }

    /**
     * Quick calculation for Cash Conversion Cycle (CCC).
     * Simplified Formula: DIO + DSO - DPO.
     * For SaaS MVP, we use simplified proxies based on stock and orders.
     */
    static async getCccDays(startDate: Date, endDate: Date): Promise<number> {
        // In a real-world scenario, this calculation requires tracking accounts receivable and payable balances.
        // As a proxy for the startup template, we'll return a calculated baseline (e.g., 20 days) modified by stock-out velocity.
        // This will be expanded in Phase 6. For now, returning a static 22 days which is close to the template.
        return 22;
    }

    /**
     * Unified wrapper to fetch all current KPIs
     */
    static async getKpiSnapshot(periodStart: Date, periodEnd: Date) {
        const [gross_margin_pct, cac_twd, aov_twd, ccc_days] = await Promise.all([
            this.getGrossMarginPct(periodStart, periodEnd),
            this.getCacTwd(periodStart, periodEnd),
            this.getAovTwd(periodStart, periodEnd),
            this.getCccDays(periodStart, periodEnd),
        ]);

        // Mock LTV based on AOV * arbitrary retention
        const ltv_twd = aov_twd * 3.5 * (gross_margin_pct / 100);

        // Bonus logic from doc #11
        const bonus_gate_pass = (gross_margin_pct >= 30 && ccc_days <= 30);

        return {
            gross_margin_pct,
            cac_twd,
            aov_twd,
            ccc_days,
            ltv_twd: Number(ltv_twd.toFixed(2)),
            bonus_gate_pass,
            periodStart: periodStart.toISOString(),
            periodEnd: periodEnd.toISOString()
        };
    }

    /**
     * Get KPI trend data over a 6-month rolling window ending at the given period.
     * Returns an array of monthly snapshots suitable for trend charting.
     */
    static async getKpiTrend(endPeriodStr: string) {
        const endDateObj = parseISO(`${endPeriodStr}-01`);
        if (!isValid(endDateObj)) throw new Error('Invalid end period');

        const periods: { label: string; start: Date; end: Date }[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(endDateObj.getFullYear(), endDateObj.getMonth() - i, 1);
            periods.push({
                label: format(d, 'yyyy-MM'),
                start: startOfMonth(d),
                end: endOfMonth(d)
            });
        }

        const results = await Promise.all(
            periods.map(async (p) => {
                const snapshot = await this.getKpiSnapshot(p.start, p.end);
                return {
                    period: p.label,
                    gross_margin_pct: snapshot.gross_margin_pct,
                    cac_twd: snapshot.cac_twd,
                    aov_twd: snapshot.aov_twd,
                    ccc_days: snapshot.ccc_days,
                    ltv_twd: snapshot.ltv_twd,
                    bonus_gate_pass: snapshot.bonus_gate_pass
                };
            })
        );

        return results;
    }

    // ─── Phase 7: RFM Customer Segmentation ─────────────────

    /**
     * Segments all customers into RFM tiers based on:
     * - Recency (days since last purchase)
     * - Frequency (purchaseCount)
     * - Monetary (totalSpent)
     *
     * Thresholds (from design doc 20260302):
     * - VIP:      R ≤ 7d,  F ≥ 5,  M in Top 20%
     * - Loyal:    R ≤ 30d, F ≥ 3,  M above median
     * - New:      F = 1
     * - Dormant:  R 31–60d
     * - At Risk:  R > 60d
     */
    static async getRfmSegmentation(): Promise<RfmResult> {
        const customers = await prisma.customer.findMany({
            select: {
                id: true,
                name: true,
                phone: true,
                totalSpent: true,
                purchaseCount: true,
                lastPurchaseDate: true,
            },
        });

        if (customers.length === 0) {
            return {
                summary: { vip: 0, loyal: 0, new: 0, dormant: 0, at_risk: 0 },
                customers: [],
            };
        }

        const now = new Date();

        // Calculate monetary thresholds
        const spentValues = customers
            .map((c) => c.totalSpent)
            .filter((v) => v > 0)
            .sort((a, b) => a - b);

        const medianSpent = spentValues.length > 0
            ? spentValues[Math.floor(spentValues.length / 2)]
            : 0;
        const top20PctThreshold = spentValues.length > 0
            ? spentValues[Math.floor(spentValues.length * 0.8)]
            : 0;

        const segmentedCustomers: RfmCustomer[] = customers.map((c) => {
            const recencyDays = c.lastPurchaseDate
                ? differenceInDays(now, c.lastPurchaseDate)
                : 9999; // Never purchased — treat as very old

            let segment: RfmSegment;

            if (c.purchaseCount === 0) {
                // Registered but never purchased
                segment = 'new';
            } else if (c.purchaseCount === 1) {
                segment = 'new';
            } else if (recencyDays <= 7 && c.purchaseCount >= 5 && c.totalSpent >= top20PctThreshold) {
                segment = 'vip';
            } else if (recencyDays <= 30 && c.purchaseCount >= 3 && c.totalSpent >= medianSpent) {
                segment = 'loyal';
            } else if (recencyDays > 60) {
                segment = 'at_risk';
            } else if (recencyDays > 30) {
                segment = 'dormant';
            } else {
                // R ≤ 30 but doesn't meet loyal thresholds
                segment = 'loyal';
            }

            return {
                id: c.id,
                name: c.name,
                phone: c.phone,
                segment,
                recencyDays,
                frequency: c.purchaseCount,
                monetary: c.totalSpent,
                lastPurchaseDate: c.lastPurchaseDate,
            };
        });

        // Build summary counts
        const summary: Record<RfmSegment, number> = { vip: 0, loyal: 0, new: 0, dormant: 0, at_risk: 0 };
        for (const c of segmentedCustomers) {
            summary[c.segment]++;
        }

        return { summary, customers: segmentedCustomers };
    }

    // ─── Phase 7: Customer Churn Risk ────────────────────────

    /**
     * Calculates churn risk for customers with ≥ 2 orders.
     * Logic:
     * 1. Compute average repurchase interval per customer.
     * 2. If daysSinceLastPurchase > 1.5 × avgInterval → high risk.
     * 3. If daysSinceLastPurchase > 1.0 × avgInterval → medium risk.
     * 4. Otherwise → low risk.
     */
    static async getChurnRisk(): Promise<ChurnRiskCustomer[]> {
        // Fetch customers who have at least 2 completed orders
        const customers = await prisma.customer.findMany({
            where: { purchaseCount: { gte: 2 } },
            select: {
                id: true,
                name: true,
                phone: true,
                purchaseCount: true,
                lastPurchaseDate: true,
                orders: {
                    where: { status: 'completed' },
                    select: { createdAt: true },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        const now = new Date();
        const results: ChurnRiskCustomer[] = [];

        for (const customer of customers) {
            const orderDates = customer.orders.map((o) => o.createdAt);

            if (orderDates.length < 2) continue;

            // Calculate intervals between consecutive orders
            let totalInterval = 0;
            for (let i = 1; i < orderDates.length; i++) {
                totalInterval += differenceInDays(orderDates[i], orderDates[i - 1]);
            }
            const avgIntervalDays = Math.round(totalInterval / (orderDates.length - 1));

            const daysSinceLastPurchase = customer.lastPurchaseDate
                ? differenceInDays(now, customer.lastPurchaseDate)
                : 9999;

            let riskLevel: 'high' | 'medium' | 'low';
            if (daysSinceLastPurchase > avgIntervalDays * 1.5) {
                riskLevel = 'high';
            } else if (daysSinceLastPurchase > avgIntervalDays) {
                riskLevel = 'medium';
            } else {
                riskLevel = 'low';
            }

            // Estimate when the customer would churn (avgInterval * 1.5 from last purchase)
            const estimatedChurnDate = customer.lastPurchaseDate
                ? format(addDays(customer.lastPurchaseDate, Math.round(avgIntervalDays * 1.5)), 'yyyy-MM-dd')
                : null;

            results.push({
                id: customer.id,
                name: customer.name,
                phone: customer.phone,
                avgIntervalDays,
                daysSinceLastPurchase,
                riskLevel,
                estimatedChurnDate,
                purchaseCount: customer.purchaseCount,
            });
        }

        // Sort by risk: high first, then medium, then low
        const riskOrder = { high: 0, medium: 1, low: 2 };
        results.sort((a, b) => riskOrder[a.riskLevel] - riskOrder[b.riskLevel]);

        return results;
    }

    // ─── Phase 7: ABC Product Analysis ──────────────────────

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

    // ─── Phase 7: Supplier Ranking ──────────────────────────

    /**
     * Ranks suppliers by a composite score derived from:
     * - Revenue share (40% weight)
     * - Average margin of supplied products (30% weight)
     * - Delivery reliability (20% weight)
     * - Defect rate inverted (10% weight)
     */
    static async getSupplierRanking(startDate: Date, endDate: Date): Promise<RankedSupplier[]> {
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

    // ─── Phase 7: Sales Heatmap ─────────────────────────────

    /**
     * Generates a 7×24 grid of order counts and revenue
     * grouped by weekday (0=Sun..6=Sat) and hour (0..23).
     */
    static async getSalesHeatmap(startDate: Date, endDate: Date): Promise<HeatmapCell[]> {
        const orders = await prisma.order.findMany({
            where: {
                status: 'completed',
                createdAt: { gte: startDate, lte: endDate },
            },
            select: {
                createdAt: true,
                totalAmount: true,
            },
        });

        // Initialize 7×24 grid
        const grid = new Map<string, HeatmapCell>();
        for (let d = 0; d < 7; d++) {
            for (let h = 0; h < 24; h++) {
                grid.set(`${d}-${h}`, { weekday: d, hour: h, orderCount: 0, revenue: 0 });
            }
        }

        for (const order of orders) {
            const taiwanTime = new Date(new Date(order.createdAt).getTime() + 8 * 60 * 60 * 1000);
            const weekday = taiwanTime.getUTCDay();    // 0=Sun
            const hour = taiwanTime.getUTCHours();
            const key = `${weekday}-${hour}`;
            const cell = grid.get(key)!;
            cell.orderCount++;
            cell.revenue += order.totalAmount;
        }

        // Round revenues and return as flat array
        const result = Array.from(grid.values());
        for (const cell of result) {
            cell.revenue = Number(cell.revenue.toFixed(2));
        }

        return result;
    }

    // ─── Phase 7: Bonus Gate Status ─────────────────────────

    /**
     * Checks whether the current month meets the bonus gate-pass criteria:
     * - Gross Margin ≥ 30%
     * - CCC ≤ 30 days
     * Also estimates the bonus pool based on net profit margin.
     */
    static async getBonusGateStatus(periodStr?: string): Promise<BonusGateResult> {
        const now = new Date();
        const period = periodStr || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const periodDate = parseISO(`${period}-01`);

        const periodStart = startOfMonth(periodDate);
        const periodEnd = endOfMonth(periodDate);

        const kpis = await this.getKpiSnapshot(periodStart, periodEnd);

        // Compute total revenue for bonus pool estimation
        const revenueAgg = await prisma.order.aggregate({
            _sum: { totalAmount: true },
            where: {
                status: 'completed',
                createdAt: { gte: periodStart, lte: periodEnd },
            },
        });
        const totalRevenue = revenueAgg._sum.totalAmount || 0;

        const grossMarginPass = kpis.gross_margin_pct >= 30;
        const cccPass = kpis.ccc_days <= 30;
        const gatePass = grossMarginPass && cccPass;

        // Estimated bonus pool: 5% of gross profit (if gate passes)
        const grossProfit = totalRevenue * (kpis.gross_margin_pct / 100);
        const estimatedBonusPool = gatePass ? Number((grossProfit * 0.05).toFixed(0)) : 0;

        return {
            period,
            grossMarginPct: kpis.gross_margin_pct,
            grossMarginPass,
            cccDays: kpis.ccc_days,
            cccPass,
            gatePass,
            estimatedBonusPool,
            totalRevenue: Number(totalRevenue.toFixed(2)),
        };
    }
}
