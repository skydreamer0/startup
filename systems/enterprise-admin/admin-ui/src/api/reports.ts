import api from './client';
import type { CashFlowStatement, MarginAnalysis, SalesRankingProduct } from '@pharmasaas/types';

export type { CashFlowStatement, MarginAnalysis, SalesRankingProduct };

export const reportsApi = {
    getMarginAnalysis: async (period: string, signal?: AbortSignal): Promise<MarginAnalysis> => {
        const { data } = await api.get(`/reports/margin?period=${period}`, { signal });
        return data.data;
    },
    getMarginTrend: async (to: string, signal?: AbortSignal): Promise<{ period: string; revenue: number; margin: number; marginPct: number }[]> => {
        const { data } = await api.get(`/reports/margin/trend?to=${to}`, { signal });
        return data.data;
    },
    getCashFlowStatement: async (period: string, signal?: AbortSignal): Promise<CashFlowStatement> => {
        const { data } = await api.get(`/reports/cashflow?period=${period}`, { signal });
        return data.data;
    },
    getCashFlowTrend: async (to: string, signal?: AbortSignal): Promise<Omit<CashFlowStatement, 'expensesBreakdown'>[]> => {
        const { data } = await api.get(`/reports/cashflow/trend?to=${to}`, { signal });
        return data.data;
    },
    getSalesRanking: async (period: string, sort: 'revenue' | 'quantity' = 'revenue', limit: number = 10, signal?: AbortSignal): Promise<{ period: string; topProducts: SalesRankingProduct[]; categories: { category: string; revenue: number; quantity: number }[] }> => {
        const { data } = await api.get(`/reports/sales-ranking?period=${period}&sort=${sort}&limit=${limit}`, { signal });
        return data.data;
    }
};
