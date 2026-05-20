import { prisma } from '../../lib/prisma';
import { startOfMonth, endOfMonth, parseISO, isValid, format } from 'date-fns';

export class CashFlowService {
    /**
     * Compute cash flow metrics for a given period (YYYY-MM)
     */
    static async getCashFlowStatement(periodStr: string) {
        const date = parseISO(`${periodStr}-01`);
        if (!isValid(date)) throw new Error('Invalid period');

        const startDate = startOfMonth(date);
        const endDate = endOfMonth(date);

        // 1. Operating Inflows (Revenue from completed orders)
        const revenueAgg = await prisma.order.aggregate({
            _sum: { totalAmount: true },
            where: {
                status: 'completed',
                createdAt: { gte: startDate, lte: endDate }
            }
        });
        const operatingInflows = Number(revenueAgg._sum.totalAmount ?? 0);

        // 2. Operating Outflows (Manual Expenses)
        const expenses = await prisma.expense.findMany({
            where: { period: periodStr }
        });

        const operatingOutflows = expenses.reduce((sum: number, e) => sum + Number(e.amount), 0);
        const expensesBreakdown = expenses.map((e) => ({
            type: e.type,
            amount: Number(e.amount),
            description: e.description
        }));

        // 3. Investing Outflows (Inventory Purchasing Proxy)
        const inventoryIns = await prisma.inventoryTransaction.findMany({
            where: {
                type: 'IN',
                createdAt: { gte: startDate, lte: endDate }
            },
            include: { product: { select: { costPrice: true } } }
        });

        const investingOutflows = inventoryIns.reduce((sum, tx) => sum + (tx.quantity * Number(tx.product.costPrice)), 0);

        // 4. Net Cash Flow
        const netCashFlow = operatingInflows - operatingOutflows - investingOutflows;

        // For this SaaS MVP, we mock the Beginning Cash based on a static assumption ($300,000 as per template #13)
        // In a real system, this would be rolled forward iteratively or synced with a bank feed.
        const beginningCash = 300000;
        const endingCash = beginningCash + netCashFlow;

        return {
            period: periodStr,
            beginningCash,
            operatingInflows,
            operatingOutflows,
            investingOutflows,
            financingCashFlow: 0, // Placeholder
            netCashFlow,
            endingCash,
            expensesBreakdown
        };
    }

    /**
     * Get Cash Flow Trend over a 6-month window
     */
    static async getCashFlowTrend(endPeriodStr: string) {
        const endDateObj = parseISO(`${endPeriodStr}-01`);
        if (!isValid(endDateObj)) throw new Error('Invalid end period');

        const periods = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(endDateObj.getFullYear(), endDateObj.getMonth() - i, 1);
            periods.push(format(d, 'yyyy-MM'));
        }

        const results = await Promise.all(
            periods.map(period => this.getCashFlowStatement(period))
        );

        // Adjust beginning/ending cash to be sequential for the trend view
        let rollingCash = 300000;

        return results.map((res) => {
            const net = res.operatingInflows - res.operatingOutflows - res.investingOutflows;
            const begin = rollingCash;
            rollingCash += net;

            return {
                period: res.period,
                operatingInflows: res.operatingInflows,
                operatingOutflows: res.operatingOutflows,
                investingOutflows: res.investingOutflows,
                netCashFlow: net,
                beginningCash: begin,
                endingCash: rollingCash
            };
        });
    }
}
