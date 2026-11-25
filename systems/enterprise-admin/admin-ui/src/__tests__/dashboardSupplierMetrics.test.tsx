import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DashboardKPIs } from '../api/dashboard';
import { ToastContext } from '../components/toastContext';
import DashboardPage from '../pages/DashboardPage';

const api = vi.hoisted(() => ({
    getKPIs: vi.fn(),
    getCrmMetrics: vi.fn(),
    getAnalyticsKpis: vi.fn(),
    getAnalyticsTrends: vi.fn(),
    getBonusGate: vi.fn(),
    getHeatmap: vi.fn(),
    getReorderForecast: vi.fn(),
}));
vi.mock('../api/dashboard', () => ({ dashboardApi: api }));
// Plan-gated sections are outside the supply-chain display contract.
// Do not mount their plan reader or make a real network request.
vi.mock('../components/PlanGate', () => ({
    default: ({ fallback }: { children?: ReactNode; fallback?: ReactNode }) => fallback ?? null,
}));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const toast = { info: vi.fn(), success: vi.fn(), warning: vi.fn(), error: vi.fn() };

function kpis(delivery: number | null | undefined, defect: number | null | undefined): DashboardKPIs {
    return {
        customers: { total: 0, newThisMonth: 0 },
        revenue: { totalLifetime: 0 },
        inventory: { totalProducts: 0, lowStockCount: 0, lowStockItems: [] },
        // Undefined deliberately models an omitted runtime field; the declared API allows null.
        suppliers: { avgDeliveryReliability: delivery, avgDefectRate: defect } as DashboardKPIs['suppliers'],
        recentInteractions: [],
    };
}

beforeEach(() => {
    vi.resetAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    api.getKPIs.mockResolvedValue(kpis(null, null));
    api.getCrmMetrics.mockResolvedValue({
        totalCustomers: 0, repeatCustomers: 0, repurchaseRate: 0,
        averageLTV: 0, totalRevenue: 0, churnRate90d: 0, atRiskCustomers: 0,
    });
    api.getAnalyticsKpis.mockResolvedValue({ ltv_twd: 0, cac_twd: 0, aov_twd: 0 });
    api.getAnalyticsTrends.mockResolvedValue([]);
    api.getBonusGate.mockResolvedValue({
        gatePass: false, grossMarginPass: false, grossMarginPct: 0,
        cccPass: false, cccDays: 0, estimatedBonusPool: 0,
    });
    api.getHeatmap.mockResolvedValue([]);
    api.getReorderForecast.mockResolvedValue([]);
});

afterEach(() => {
    act(() => root.unmount());
    client.clear();
    host.remove();
});

function mount() {
    act(() => root.render(
        <ToastContext.Provider value={toast}>
            <QueryClientProvider client={client}><DashboardPage /></QueryClientProvider>
        </ToastContext.Provider>,
    ));
}

function metric(label: string): HTMLElement {
    const row = [...host.querySelectorAll('.supply-row')]
        .find(element => element.querySelector('.stat-label')?.textContent === label);
    expect(row).toBeDefined();
    return row!.lastElementChild as HTMLElement;
}

async function settled() {
    await vi.waitFor(async () => {
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
        expect(host.textContent).toContain('🏢 Supply Chain');
        expect(client.isFetching()).toBe(0);
    });
}

function missing(element: HTMLElement) {
    expect(element.textContent?.trim()).toBe('--');
    expect(element.classList.contains('text-muted')).toBe(true);
    expect(element.classList.contains('badge')).toBe(false);
    expect(element.className).not.toMatch(/success|warning|danger/);
    expect(element.style.background).toBe('');
    expect(element.style.color).toBe('');
}

describe('Dashboard supply-chain missing rates with the real QueryClient', () => {
    it.each([null, undefined])('shows neutral missing markers for %s, without percent or severity badges', async value => {
        api.getKPIs.mockResolvedValue(kpis(value, value));
        mount();
        await settled();
        missing(metric('Avg. Delivery Rate'));
        missing(metric('Avg. Defect Rate'));
        for (const read of Object.values(api)) expect(read).toHaveBeenCalledTimes(1);
    });

    it('keeps each metric independent when only one value is missing', async () => {
        api.getKPIs.mockResolvedValue(kpis(null, 0));
        mount();
        await settled();
        missing(metric('Avg. Delivery Rate'));
        expect(metric('Avg. Defect Rate').textContent?.trim()).toBe('0%');
        api.getKPIs.mockResolvedValue(kpis(95, undefined));
        await act(async () => { await client.refetchQueries({ queryKey: ['dashboard', 'kpis'] }); });
        await settled();
        expect(metric('Avg. Delivery Rate').textContent?.trim()).toBe('95%');
        missing(metric('Avg. Defect Rate'));
    });

    it.each([
        { delivery: 0, defect: 0, deliveryBackground: 'rgba(245, 158, 11, 0.1)', defectColor: 'rgb(16, 185, 129)' },
        { delivery: 94.5, defect: 1.5, deliveryBackground: 'rgba(245, 158, 11, 0.1)', defectColor: 'rgb(16, 185, 129)' },
        { delivery: 95, defect: 2, deliveryBackground: 'rgba(16, 185, 129, 0.1)', defectColor: 'rgb(16, 185, 129)' },
        { delivery: 95.5, defect: 2.5, deliveryBackground: 'rgba(16, 185, 129, 0.1)', defectColor: 'rgb(239, 68, 68)' },
    ])('preserves numbers and existing thresholds for $delivery / $defect', async values => {
        api.getKPIs.mockResolvedValue(kpis(values.delivery, values.defect));
        mount();
        await settled();
        const delivery = metric('Avg. Delivery Rate');
        const defect = metric('Avg. Defect Rate');
        expect(delivery.textContent?.trim()).toBe(String(values.delivery) + '%');
        expect(defect.textContent?.trim()).toBe(String(values.defect) + '%');
        expect(delivery.className).toBe('badge badge-success tabular');
        expect(defect.className).toBe('badge tabular');
        expect(delivery.style.background).toBe(values.deliveryBackground);
        expect(defect.style.color).toBe(values.defectColor);
        expect(defect.style.background).toBe(values.defect > 2
            ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)');
    });

    it('removes prior severity badges when a successful refresh returns missing values, then restores real zeros', async () => {
        api.getKPIs.mockResolvedValue(kpis(98, 3));
        mount();
        await settled();
        expect(metric('Avg. Defect Rate').style.color).toBe('rgb(239, 68, 68)');
        api.getKPIs.mockResolvedValue(kpis(null, undefined));
        await act(async () => { await client.refetchQueries({ queryKey: ['dashboard', 'kpis'] }); });
        await settled();
        missing(metric('Avg. Delivery Rate'));
        missing(metric('Avg. Defect Rate'));
        api.getKPIs.mockResolvedValue(kpis(0, 0));
        await act(async () => { await client.refetchQueries({ queryKey: ['dashboard', 'kpis'] }); });
        await settled();
        expect(metric('Avg. Delivery Rate').textContent?.trim()).toBe('0%');
        expect(metric('Avg. Defect Rate').textContent?.trim()).toBe('0%');
    });
});
