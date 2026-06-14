import { prisma } from '../../lib/prisma';
import { startOfMonth, endOfMonth, parseISO, isValid } from 'date-fns';

interface RankedProduct {
    id: string;
    name: string;
    sku: string;
    categoryName: string;
    revenue: number;
    quantity: number;
    margin: number;
}

export class SalesRankingService {
    /**
     * Get Top selling products by Revenue, Quantity, or Margin Contribution
     */
    static async getTopProducts(periodStr: string, limit: number = 10, sortBy: 'revenue' | 'quantity' = 'revenue') {
        const date = parseISO(`${periodStr}-01`);
        if (!isValid(date)) throw new Error('Invalid period');

        const startDate = startOfMonth(date);
        const endDate = endOfMonth(date);

        const orderItems = await prisma.orderItem.findMany({
            where: {
                order: {
                    status: 'completed',
                    createdAt: { gte: startDate, lte: endDate }
                }
            },
            include: { product: { include: { category: true } } }
        });

        const productMap = new Map<string, RankedProduct>();

        for (const item of orderItems) {
            const rev = item.quantity * Number(item.unitPrice);
            const cogs = item.quantity * Number(item.product.costPrice);
            const margin = rev - cogs;

            const existing = productMap.get(item.productId) || {
                id: item.product.id,
                name: item.product.name,
                sku: item.product.sku,
                categoryName: item.product.category?.name || 'Uncategorized',
                revenue: 0,
                quantity: 0,
                margin: 0
            };

            existing.revenue += rev;
            existing.quantity += item.quantity;
            existing.margin += margin;
            productMap.set(item.productId, existing);
        }

        const results = Array.from(productMap.values());

        if (sortBy === 'revenue') {
            results.sort((a, b) => b.revenue - a.revenue);
        } else {
            results.sort((a, b) => b.quantity - a.quantity);
        }

        return results.slice(0, limit).map(r => ({
            ...r,
            marginPct: r.revenue > 0 ? Number(((r.margin / r.revenue) * 100).toFixed(2)) : 0
        }));
    }

    /**
     * Get sales breakdown by Product Category
     */
    static async getCategoryBreakdown(periodStr: string) {
        const data = await this.getTopProducts(periodStr, 1000, 'revenue'); // Get all

        const categoryMap = new Map<string, { category: string, revenue: number, quantity: number }>();

        for (const item of data) {
            const cat = item.categoryName;
            const existing = categoryMap.get(cat) || { category: cat, revenue: 0, quantity: 0 };
            existing.revenue += item.revenue;
            existing.quantity += item.quantity;
            categoryMap.set(cat, existing);
        }

        return Array.from(categoryMap.values()).sort((a, b) => b.revenue - a.revenue);
    }
}
