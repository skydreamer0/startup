import { prisma } from '../../lib/prisma';

export class DashboardService {
    static async getKPIs() {
        // 1. Customer metrics
        const totalCustomers = await prisma.customer.count();
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const newCustomersThisMonth = await prisma.customer.count({
            where: { createdAt: { gte: startOfMonth } },
        });

        const revenueAgg = await prisma.customer.aggregate({
            _sum: { totalSpent: true },
        });

        // 2. Inventory alerts
        const allProducts = await prisma.product.findMany({
            select: { stockQuantity: true, safetyStock: true, name: true, sku: true },
        });
        const lowStockProducts = allProducts.filter(
            (p) => p.stockQuantity <= p.safetyStock
        );

        // 3. Supplier average reliability
        const supplierAgg = await prisma.supplier.aggregate({
            _avg: { deliveryReliability: true, defectRate: true },
        });

        // 4. Recent interactions (Top 5)
        const recentInteractions = await prisma.interaction.findMany({
            take: 5,
            orderBy: { interactedAt: 'desc' },
            include: { customer: { select: { name: true, phone: true } } },
        });

        return {
            customers: {
                total: totalCustomers,
                newThisMonth: newCustomersThisMonth,
            },
            revenue: {
                totalLifetime: revenueAgg._sum.totalSpent || 0,
            },
            inventory: {
                totalProducts: allProducts.length,
                lowStockCount: lowStockProducts.length,
                lowStockItems: lowStockProducts.slice(0, 5).map((p) => ({
                    name: p.name,
                    sku: p.sku,
                    stockQuantity: p.stockQuantity,
                    safetyStock: p.safetyStock,
                })),
            },
            suppliers: {
                avgDeliveryReliability: supplierAgg._avg.deliveryReliability
                    ? parseFloat(supplierAgg._avg.deliveryReliability.toFixed(1))
                    : null,
                avgDefectRate: supplierAgg._avg.defectRate
                    ? parseFloat(supplierAgg._avg.defectRate.toFixed(2))
                    : null,
            },
            recentInteractions,
        };
    }
}
