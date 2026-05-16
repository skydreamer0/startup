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

export interface AnalyticsTrend {
    period: string;
    gross_margin_pct: number;
    cac_twd: number;
    aov_twd: number;
    ccc_days: number;
    ltv_twd: number;
    bonus_gate_pass: boolean;
}

export interface BonusGateStatus {
    period: string;
    grossMarginPct: number;
    grossMarginPass: boolean;
    cccDays: number;
    cccPass: boolean;
    gatePass: boolean;
    estimatedBonusPool: number;
    totalRevenue: number;
}

export interface HeatmapCell {
    weekday: number;
    hour: number;
    orderCount: number;
    revenue: number;
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
    getAnalyticsTrends: async (to?: string): Promise<AnalyticsTrend[]> => {
        const url = to ? `/analytics/trends?to=${to}` : '/analytics/trends';
        const { data } = await api.get(url);
        return data.data;
    },
    getBonusGate: async (period?: string): Promise<BonusGateStatus> => {
        const url = period ? `/analytics/bonus-gate?period=${period}` : '/analytics/bonus-gate';
        const { data } = await api.get(url);
        return data.data;
    },
    getHeatmap: async (period?: string): Promise<HeatmapCell[]> => {
        const url = period ? `/analytics/heatmap?period=${period}` : '/analytics/heatmap';
        const { data } = await api.get(url);
        return data.data;
    },
};
