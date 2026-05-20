import api from './client';
import type {
    DashboardKPIs,
    CrmMetrics,
    KpiSnapshot as AnalyticsKPIs,
    KpiTrendPoint as AnalyticsTrend,
    BonusGateResult as BonusGateStatus,
    HeatmapCell,
} from '@pharmasaas/types';

export type {
    DashboardKPIs,
    CrmMetrics,
    AnalyticsKPIs,
    AnalyticsTrend,
    BonusGateStatus,
    HeatmapCell,
};

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
