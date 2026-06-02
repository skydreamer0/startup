import '@testing-library/jest-dom/vitest';
import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import DashboardPage from '../pages/DashboardPage';
import UsersPage from '../pages/UsersPage';
import RolesPage from '../pages/RolesPage';
import MarginAnalysisPage from '../pages/Reports/MarginAnalysisPage';
import CashFlowPage from '../pages/Reports/CashFlowPage';
import SalesRankingPage from '../pages/Reports/SalesRankingPage';
import api from '../api/client';

vi.mock('../components/toastContext', () => ({
    useToast: () => ({
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
        info: vi.fn(),
    }),
}));

vi.mock('../components/PlanGate', () => ({
    default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('recharts', () => ({
    AreaChart: ({ children }: { children?: ReactNode }) => <svg data-testid="area-chart">{children}</svg>,
    Area: () => null,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    ResponsiveContainer: ({ children }: { children?: ReactNode }) => <div data-testid="responsive-chart">{children}</div>,
    Legend: () => null,
    LineChart: ({ children }: { children?: ReactNode }) => <svg data-testid="line-chart">{children}</svg>,
    Line: () => null,
    BarChart: ({ children }: { children?: ReactNode }) => <svg data-testid="bar-chart">{children}</svg>,
    Bar: () => null,
    PieChart: ({ children }: { children?: ReactNode }) => <svg data-testid="pie-chart">{children}</svg>,
    Pie: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    Cell: () => null,
}));

vi.mock('../api/client', () => ({
    default: {
        get: vi.fn(),
        put: vi.fn(),
        post: vi.fn(),
        delete: vi.fn(),
    },
}));

vi.mock('../api/dashboard', () => ({
    dashboardApi: {
        getKPIs: vi.fn(async () => ({
            revenue: { totalLifetime: 125000 },
            customers: { total: 42, newThisMonth: 5 },
            inventory: { lowStockCount: 2, totalProducts: 128 },
            suppliers: { avgDeliveryReliability: 96, avgDefectRate: 1.2 },
            recentInteractions: [],
        })),
        getCrmMetrics: vi.fn(async () => ({ averageLTV: 12000, churnRate90d: 12, repurchaseRate: 44 })),
        getAnalyticsKpis: vi.fn(async () => ({ gross_margin_pct: 31, aov_twd: 850, cac_twd: 120, ccc_days: 15, ltv_twd: 12000 })),
        getAnalyticsTrends: vi.fn(async () => [
            { period: '2026-05', gross_margin_pct: 31, aov_twd: 850, cac_twd: 120, ccc_days: 15 },
        ]),
        getBonusGate: vi.fn(async () => ({ gatePass: true, grossMarginPass: true, grossMarginPct: 31, cccPass: true, cccDays: 15, estimatedBonusPool: 5000 })),
        getHeatmap: vi.fn(async () => [{ weekday: 1, hour: 10, orderCount: 3, revenue: 1500 }] ),
        getReorderForecast: vi.fn(async () => [
            { productId: 'p1', sku: 'SKU-1', name: 'Omega 3', currentStock: 3, reorderPoint: 5, daysUntilStockout: 2, urgency: 'HIGH' },
        ]),
    },
}));

vi.mock('../api/reports', () => ({
    reportsApi: {
        getMarginAnalysis: vi.fn(async () => ({
            period: '2026-06',
            summary: { totalRevenue: 100000, totalCogs: 62000, totalMargin: 38000, totalMarginPct: 38 },
            products: [{ id: 'p1', sku: 'SKU-1', name: 'Omega 3', revenue: 5000, cogs: 3000, qty: 10, margin: 2000, marginPct: 40, contributionPct: 5 }],
        })),
        getMarginTrend: vi.fn(async () => [{ period: '2026-06', revenue: 100000, margin: 38000, marginPct: 38 }]),
        getCashFlowStatement: vi.fn(async () => ({
            period: '2026-06',
            beginningCash: 10000,
            operatingInflows: 50000,
            operatingOutflows: 25000,
            investingOutflows: 8000,
            financingCashFlow: 0,
            netCashFlow: 17000,
            endingCash: 27000,
            expensesBreakdown: [{ type: 'rent', amount: 12000, description: 'Store rent' }],
        })),
        getCashFlowTrend: vi.fn(async () => [
            { period: '2026-06', beginningCash: 10000, operatingInflows: 50000, operatingOutflows: 25000, investingOutflows: 8000, financingCashFlow: 0, netCashFlow: 17000, endingCash: 27000 },
        ]),
        getSalesRanking: vi.fn(async () => ({
            period: '2026-06',
            topProducts: [{ id: 'p1', sku: 'SKU-1', name: 'Omega 3', categoryName: 'Supplements', revenue: 5000, quantity: 10, margin: 2000, marginPct: 40 }],
            categories: [{ category: 'Supplements', revenue: 5000, quantity: 10 }],
        })),
    },
}));

const mockedApi = api as unknown as { get: Mock; put: Mock; post: Mock; delete: Mock };

function renderWithQuery(ui: ReactElement) {
    const queryClient = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
        },
    });

    return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('admin page visual refresh smoke tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedApi.get.mockImplementation(async (url: string) => {
            if (url === '/users') {
                return {
                    data: {
                        data: [{
                            id: 'u1',
                            email: 'owner@example.com',
                            fullName: 'Owner User',
                            status: 'active',
                            lastLoginAt: null,
                            createdAt: '2026-06-01T00:00:00.000Z',
                            roles: [{ id: 'r1', name: 'Admin' }],
                        }],
                        meta: { total: 1 },
                    },
                };
            }
            if (url === '/roles') {
                return {
                    data: {
                        data: [{
                            id: 'r1',
                            name: 'Admin',
                            description: 'System administrator',
                            isSystem: false,
                            permissions: [{ id: 'p1', action: 'read', resource: 'users' }],
                        }],
                    },
                };
            }
            if (url === '/roles/permissions') {
                return {
                    data: {
                        data: [
                            { id: 'p1', action: 'read', resource: 'users' },
                            { id: 'p2', action: 'update', resource: 'users' },
                        ],
                    },
                };
            }
            return { data: { data: [] } };
        });
        mockedApi.put.mockResolvedValue({ data: { success: true } });
    });

    it('renders Dashboard with the refreshed admin page shell and KPI cards', async () => {
        const { container } = renderWithQuery(<DashboardPage />);

        expect(await screen.findByRole('heading', { name: /operations overview/i })).toBeInTheDocument();
        expect(container.querySelector('.admin-page.dashboard-content')).toBeInTheDocument();
        expect(container.querySelectorAll('.stat-card.card').length).toBeGreaterThanOrEqual(4);
        expect(screen.getByRole('button', { name: /refresh data/i })).toHaveClass('btn-primary');
    });

    it('renders Users with shared table and badge primitives', async () => {
        const { container } = renderWithQuery(<UsersPage />);

        expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
        expect(await screen.findByText('Owner User')).toBeInTheDocument();
        expect(container.querySelector('.admin-page.users-page')).toBeInTheDocument();
        expect(container.querySelector('.table-container .table')).toBeInTheDocument();
        expect(screen.getByText('active')).toHaveClass('badge-active');
    });

    it('renders Roles and shows permission chips after selecting a role', async () => {
        const { container } = renderWithQuery(<RolesPage />);

        const role = await screen.findByText('Admin');
        expect(container.querySelector('.admin-surface-grid')).toBeInTheDocument();

        fireEvent.click(role);

        await waitFor(() => {
            expect(screen.getByText('read:users')).toHaveClass('permission-chip', 'assigned');
            expect(screen.getByText('update:users')).toHaveClass('permission-chip');
        });
    });

    it('renders report pages with shared report layout classes', async () => {
        const { container: margin } = renderWithQuery(<MarginAnalysisPage />);
        expect(await screen.findByRole('heading', { name: /gross margin analysis/i })).toBeInTheDocument();
        expect(margin.querySelector('.report-grid-balanced')).toBeInTheDocument();

        const { container: cashflow } = renderWithQuery(<CashFlowPage />);
        expect(await screen.findByRole('heading', { name: /cash flow statement/i })).toBeInTheDocument();
        expect(cashflow.querySelector('.report-grid-wide')).toBeInTheDocument();

        const { container: sales } = renderWithQuery(<SalesRankingPage />);
        expect(await screen.findByRole('heading', { name: /product sales ranking/i })).toBeInTheDocument();
        expect(sales.querySelector('.report-grid-wide')).toBeInTheDocument();
    });
});
