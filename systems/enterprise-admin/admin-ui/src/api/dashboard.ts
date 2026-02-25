import api from './client';

export interface DashboardKPIs {
    customers: { total: number; newThisMonth: number };
    revenue: { totalLifetime: number };
    inventory: {
        totalProducts: number;
        lowStockCount: number;
        lowStockItems: { name: string; sku: string; stockQuantity: number; safetyStock: number }[];
    };
    suppliers: { avgDeliveryReliability: number | null; avgDefectRate: number | null };
    recentInteractions: {
        id: string;
        type: string;
        content: string;
        interactedAt: string;
        customer: { name: string; phone: string };
    }[];
}

export interface CrmMetrics {
    totalCustomers: number;
    repeatCustomers: number;
    repurchaseRate: number;
    averageLTV: number;
    totalRevenue: number;
    churnRate90d: number;
    atRiskCustomers: number;
}

export interface AnalyticsKPIs {
    gross_margin_pct: number;
    cac_twd: number;
    aov_twd: number;
    ccc_days: number;
    ltv_twd: number;
    bonus_gate_pass: boolean;
    periodStart: string;
    periodEnd: string;
}

export const dashboardApi = {
    getKPIs: async (): Promise<DashboardKPIs> => {
        const { data } = await api.get('/dashboard/kpis');
        return data.data;
    },
    getCrmMetrics: async (): Promise<CrmMetrics> => {
        const { data } = await api.get('/crm/metrics');
        return data.data;
    },
    getAnalyticsKpis: async (period?: string): Promise<AnalyticsKPIs> => {
        const url = period ? `/analytics/kpis?period=${period}` : '/analytics/kpis';
        const { data } = await api.get(url);
        return data.data;
    },
};
