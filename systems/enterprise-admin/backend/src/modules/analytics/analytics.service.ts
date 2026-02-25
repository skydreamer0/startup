import { prisma } from '../../lib/prisma';
import { startOfMonth, endOfMonth, subMonths, format, parseISO, isValid } from 'date-fns';

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
}
