import { PrismaClient } from '@prisma/client';

class AppError extends Error {
    statusCode: number;
    constructor(statusCode: number, message: string) {
        super(message);
        this.statusCode = statusCode;
    }
}

const prisma: any = new PrismaClient();

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

        const where: any = {};

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

    // 3. Create or Update Customer
    static async createCustomer(data: any) {
        // Basic verification - assume logic checks for existing phone/line
        if (data.phone) {
            const existing = await prisma.customer.findUnique({ where: { phone: data.phone } });
            if (existing) throw new AppError(409, 'Phone number already registered');
        }

        return await prisma.customer.create({ data });
    }

    static async updateCustomer(id: string, data: any) {
        return await prisma.customer.update({
            where: { id },
            data,
        });
    }

    // 4. Add Interaction
    static async addInteraction(customerId: string, data: { type: string; content?: string }) {
        // Use transaction to update customer's lastInteractionDate and create interaction
        const [interaction, customer] = await prisma.$transaction([
            prisma.interaction.create({
                data: {
                    customerId,
                    type: data.type,
                    content: data.content,
                },
            }),
            prisma.customer.update({
                where: { id: customerId },
                data: { lastInteractionDate: new Date() },
            }),
        ]);

        return interaction;
    }
}
