import api from './client';

export interface MarginProduct {
    id: string;
    sku: string;
    name: string;
    revenue: number;
    cogs: number;
    qty: number;
    margin: number;
    marginPct: number;
    contributionPct: number;
}

export interface MarginAnalysis {
    period: string;
    summary: {
        totalRevenue: number;
        totalCogs: number;
        totalMargin: number;
        totalMarginPct: number;
    };
    products: MarginProduct[];
}

export interface CashFlowStatement {
    period: string;
    beginningCash: number;
    operatingInflows: number;
    operatingOutflows: number;
    investingOutflows: number;
    financingCashFlow: number;
    netCashFlow: number;
    endingCash: number;
    expensesBreakdown: { type: string; amount: number; description?: string }[];
}

export interface SalesRankingProduct {
    id: string;
    sku: string;
    name: string;
    categoryName: string;
    revenue: number;
    quantity: number;
    margin: number;
    marginPct: number;
}

export const reportsApi = {
    getMarginAnalysis: async (period: string): Promise<MarginAnalysis> => {
        const { data } = await api.get(`/reports/margin?period=${period}`);
        return data.data;
    },
    getMarginTrend: async (to: string): Promise<{ period: string; revenue: number; margin: number; marginPct: number }[]> => {
        const { data } = await api.get(`/reports/margin/trend?to=${to}`);
        return data.data;
    },
    getCashFlowStatement: async (period: string): Promise<CashFlowStatement> => {
        const { data } = await api.get(`/reports/cashflow?period=${period}`);
        return data.data;
    },
    getCashFlowTrend: async (to: string): Promise<Omit<CashFlowStatement, 'expensesBreakdown'>[]> => {
        const { data } = await api.get(`/reports/cashflow/trend?to=${to}`);
        return data.data;
    },
    getSalesRanking: async (period: string, sort: 'revenue' | 'quantity' = 'revenue', limit: number = 10): Promise<{ period: string; topProducts: SalesRankingProduct[]; categories: { category: string; revenue: number; quantity: number }[] }> => {
        const { data } = await api.get(`/reports/sales-ranking?period=${period}&sort=${sort}&limit=${limit}`);
        return data.data;
    }
};
