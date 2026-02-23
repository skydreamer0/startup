import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

export class ExpensesService {
    /**
     * Get a list of expenses, optionally filtered by period or type
     */
    static async getExpenses(query: { period?: string; type?: string; page?: string; limit?: string }) {
        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '50');
        const skip = (page - 1) * limit;

        const where: any = {};
        if (query.period) where.period = query.period;
        if (query.type) where.type = query.type;

        const [total, data] = await Promise.all([
            prisma.expense.count({ where }),
            prisma.expense.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' }
            })
        ]);

        return { total, page, limit, data };
    }

    /**
     * Create a new expense record
     */
    static async createExpense(data: {
        type: string;
        amount: number;
        description?: string;
        period: string; // YYYY-MM
    }) {
        if (!/^\d{4}-\d{2}$/.test(data.period)) {
            throw new AppError(400, 'Invalid period format. Must be YYYY-MM');
        }

        return await prisma.expense.create({
            data: data as any
        });
    }

    /**
     * Update an existing expense record
     */
    static async updateExpense(id: string, data: {
        type?: string;
        amount?: number;
        description?: string;
        period?: string;
    }) {
        if (data.period && !/^\d{4}-\d{2}$/.test(data.period)) {
            throw new AppError(400, 'Invalid period format. Must be YYYY-MM');
        }

        const existing = await prisma.expense.findUnique({ where: { id } });
        if (!existing) throw new AppError(404, 'Expense record not found');

        return await prisma.expense.update({
            where: { id },
            data
        });
    }

    /**
     * Delete an expense record
     */
    static async deleteExpense(id: string) {
        const existing = await prisma.expense.findUnique({ where: { id } });
        if (!existing) throw new AppError(404, 'Expense record not found');

        await prisma.expense.delete({ where: { id } });
        return { message: 'Expense deleted successfully' };
    }
}
