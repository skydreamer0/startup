import { prisma } from '../../lib/prisma';
import { startOfMonth, endOfMonth, parseISO, isValid, format } from 'date-fns';

export class MarginService {
    /**
     * Get Margin Analysis per Product for a specific period (YYYY-MM)
     */
    static async getMarginByProduct(periodStr: string) {
        const date = parseISO(`${periodStr}-01`);
        if (!isValid(date)) throw new Error('Invalid period');

        const startDate = startOfMonth(date);
        const endDate = endOfMonth(date);

        // Fetch all completed order items within the period
        const orderItems = await prisma.orderItem.findMany({
            where: {
                order: {
                    status: 'completed',
                    createdAt: { gte: startDate, lte: endDate }
                }
            },
            include: { product: true }
        });

        const productMap = new Map<string, { id: string; name: string; sku: string; revenue: number; cogs: number; qty: number }>();

        let totalRevenue = 0;
        let totalCogs = 0;

        for (const item of orderItems) {
            const rev = item.quantity * item.unitPrice;
            const cogs = item.quantity * item.product.costPrice;

            totalRevenue += rev;
            totalCogs += cogs;

            const existing = productMap.get(item.productId) || {
                id: item.product.id,
                name: item.product.name,
                sku: item.product.sku,
                revenue: 0,
                cogs: 0,
                qty: 0
            };

            existing.revenue += rev;
            existing.cogs += cogs;
            existing.qty += item.quantity;
            productMap.set(item.productId, existing);
        }

        const totalMargin = totalRevenue - totalCogs;
        const totalMarginPct = totalRevenue > 0 ? (totalMargin / totalRevenue) * 100 : 0;

        const productMargins = Array.from(productMap.values()).map(p => {
            const margin = p.revenue - p.cogs;
            const marginPct = p.revenue > 0 ? (margin / p.revenue) * 100 : 0;
            const contributionPct = totalMargin > 0 ? (margin / totalMargin) * 100 : 0;

            return {
                ...p,
                margin,
                marginPct: Number(marginPct.toFixed(2)),
                contributionPct: Number(contributionPct.toFixed(2))
            };
        }).sort((a, b) => b.margin - a.margin);

        return {
            period: periodStr,
            summary: {
                totalRevenue,
                totalCogs,
                totalMargin,
                totalMarginPct: Number(totalMarginPct.toFixed(2))
            },
            products: productMargins
        };
    }

    /**
     * Get Margin Trend over a 6-month window up to the given period
     */
    static async getMarginTrend(endPeriodStr: string) {
        const endDateObj = parseISO(`${endPeriodStr}-01`);
        if (!isValid(endDateObj)) throw new Error('Invalid end period');

        const periods: string[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(endDateObj.getFullYear(), endDateObj.getMonth() - i, 1);
            periods.push(format(d, 'yyyy-MM'));
        }

        // Run the monthly analysis for each of the 6 periods concurrently
        const results = await Promise.all(
            periods.map(period => this.getMarginByProduct(period))
        );

        return results.map((res, index) => ({
            period: periods[index],
            revenue: res.summary.totalRevenue,
            margin: res.summary.totalMargin,
            marginPct: res.summary.totalMarginPct
        }));
    }
}
