import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { requireTenantId } from '../../lib/tenant.context';

export class CrmService {
    // 1. Get Customers with filters
    static async getCustomers(query: {
        type?: 'new' | 'repeat';
        hasLine?: 'true' | 'false';
        page?: string;
        limit?: string;
    }) {
        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '20');
        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = {};

        if (query.type === 'new') {
            where.purchaseCount = { equals: 1 };
        } else if (query.type === 'repeat') {
            where.purchaseCount = { gt: 1 };
        }

        if (query.hasLine === 'true') {
            where.lineUid = { not: null };
        } else if (query.hasLine === 'false') {
            where.lineUid = null;
        }

        const [total, customers] = await Promise.all([
            prisma.customer.count({ where }),
            prisma.customer.findMany({
                where,
                skip,
                take: limit,
                orderBy: { lastInteractionDate: 'desc' },
            }),
        ]);

        return { total, page, limit, data: customers };
    }

    // 2. Get Single Customer + Interactions
    static async getCustomerById(id: string) {
        const customer = await prisma.customer.findUnique({
            where: { id },
            include: {
                interactions: {
                    orderBy: { interactedAt: 'desc' },
                },
                tags: {
                    include: { tag: true },
                },
            },
        });

        if (!customer) throw new AppError(404, 'Customer not found');
        return customer;
    }

    // 3. Create Customer
    static async createCustomer(data: {
        name?: string;
        phone?: string;
        lineUid?: string;
        gender?: string;
        birthday?: string;
    }) {
        if (data.phone) {
            const existing = await prisma.customer.findUnique({
                where: { phone_tenantId: { phone: data.phone, tenantId: requireTenantId() } },
            });
            if (existing) throw new AppError(409, 'Phone number already registered');
        }

        return await prisma.customer.create({ data: data as any });
    }

    // 4. Update Customer
    static async updateCustomer(id: string, data: {
        name?: string;
        phone?: string;
        lineUid?: string;
        gender?: string;
        birthday?: string;
    }) {
        return await prisma.customer.update({
            where: { id },
            data,
        });
    }

    // 5. Add Interaction
    static async addInteraction(customerId: string, data: { type: string; content?: string }) {
        const [interaction] = await prisma.$transaction([
            prisma.interaction.create({
                data: {
                    customerId,
                    type: data.type,
                    content: data.content,
                } as any,
            }),
            prisma.customer.update({
                where: { id: customerId },
                data: { lastInteractionDate: new Date() },
            }),
        ]);

        return interaction;
    }

    // 6. Retention & LTV Metrics
    static async getRetentionMetrics() {
        const totalCustomers = await prisma.customer.count();
        if (totalCustomers === 0) {
            return {
                totalCustomers: 0,
                repeatCustomers: 0,
                repurchaseRate: 0,
                averageLTV: 0,
                totalRevenue: 0,
                churnRate90d: 0,
                atRiskCustomers: 0,
            };
        }

        const repeatCustomers = await prisma.customer.count({
            where: { purchaseCount: { gt: 1 } },
        });

        const spentAgg = await prisma.customer.aggregate({
            _sum: { totalSpent: true },
            _avg: { totalSpent: true },
        });

        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const atRiskCustomers = await prisma.customer.count({
            where: {
                lastInteractionDate: { lt: ninetyDaysAgo },
            },
        });

        return {
            totalCustomers,
            repeatCustomers,
            repurchaseRate: parseFloat(((repeatCustomers / totalCustomers) * 100).toFixed(1)),
            averageLTV: Math.round(spentAgg._avg.totalSpent || 0),
            totalRevenue: spentAgg._sum.totalSpent || 0,
            churnRate90d: parseFloat(((atRiskCustomers / totalCustomers) * 100).toFixed(1)),
            atRiskCustomers,
        };
    }
}
