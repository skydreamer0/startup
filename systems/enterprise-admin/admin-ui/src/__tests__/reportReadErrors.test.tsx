import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CashFlowPage from '../pages/Reports/CashFlowPage';
import MarginAnalysisPage from '../pages/Reports/MarginAnalysisPage';
import SalesRankingPage from '../pages/Reports/SalesRankingPage';
import ReportReadNotice, { isReportAccessDenied } from '../components/ReportReadNotice';

const query = vi.hoisted(() => ({ read: vi.fn(), invalidate: vi.fn(), write: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({
    useQuery: query.read,
    useQueryClient: () => ({ invalidateQueries: query.invalidate }),
    useMutation: () => ({ mutate: query.write, isPending: false, isError: false }),
}));
vi.mock('../api/reports', () => ({ reportsApi: {} }));
vi.mock('../api/expenses', () => ({ expensesApi: {} }));
vi.mock('recharts', () => {
    const Chart = ({ children }: { children?: ReactNode }) => <div data-chart="synthetic">{children}</div>;
    return { BarChart: Chart, Bar: Chart, XAxis: Chart, YAxis: Chart, CartesianGrid: Chart,
        Tooltip: Chart, Legend: Chart, ResponsiveContainer: Chart, LineChart: Chart,
        Line: Chart, PieChart: Chart, Pie: Chart, Cell: Chart };
});

const pages = [
    { name: 'cashflow', Component: CashFlowPage, data: { beginningCash: 300000, operatingInflows: 1543,
        operatingOutflows: 231, investingOutflows: 10, endingCash: 301302, expensesBreakdown: [] } },
    { name: 'margin', Component: MarginAnalysisPage, data: { summary: { totalRevenue: 1543,
        totalCogs: 1000, totalMargin: 543, totalMarginPct: 35 }, products: [] } },
    { name: 'ranking', Component: SalesRankingPage, data: { topProducts: [{ id: '1', name: 'Synthetic product',
        sku: 'SYN', quantity: 1, revenue: 1543, marginPct: 35, categoryName: 'Synthetic category' }], categories: [] } },
];
const result = (data: unknown, error: unknown = null) => ({ data, isLoading: false,
    isError: error !== null, error, isFetching: false, refetch: vi.fn() });
beforeEach(() => { vi.resetAllMocks(); });

describe('report error rendering with synthetic query snapshots, not browser acceptance', () => {
    for (const { name, Component, data } of pages) {
        it(`${name}: initial error never becomes a zero/empty report`, () => {
            query.read.mockReturnValue(result(undefined, { response: { status: 500 } }));
            const html = renderToStaticMarkup(<Component />);
            expect(html).toContain('資料尚不可用');
            expect(html).toContain('role="note"');
            expect(html).not.toMatch(/stat-value|No sales data for this period|No manual expenses registered/);
        });
        it(`${name}: failed refresh retains data with stale warning`, () => {
            query.read.mockReturnValueOnce(result(data, new Error('offline'))).mockReturnValue(result([]));
            const html = renderToStaticMarkup(<Component />);
            expect(html).toContain('可能已過期'); expect(html).toContain('1,543');
            expect(query.write).not.toHaveBeenCalled(); expect(query.invalidate).not.toHaveBeenCalled();
        });
        it.each([401, 403])(`${name}: denial %s hides previous data`, status => {
            query.read.mockReturnValueOnce(result(data, { response: { status } })).mockReturnValue(result([]));
            const html = renderToStaticMarkup(<Component />);
            expect(html).toContain('存取被拒絕'); expect(html).not.toContain('1,543');
        });
        it(`${name}: recovered snapshot has values and no error`, () => {
            query.read.mockReturnValueOnce(result(data)).mockReturnValue(result([]));
            const html = renderToStaticMarkup(<Component />);
            expect(html).toContain('1,543'); expect(html).not.toContain('role="alert"');
        });
    }
    for (const { name, Component, data } of pages.slice(0, 2)) {
        it(`${name}: unavailable trend does not pretend to be an empty chart`, () => {
            query.read.mockReturnValueOnce(result(data)).mockReturnValue(result(undefined, new Error('offline')));
            const html = renderToStaticMarkup(<Component />);
            expect(html).toContain('趨勢讀取失敗'); expect(html).not.toContain('data-chart');
            expect(html).toContain('1,543');
        });
        it(`${name}: successful empty trend remains distinct`, () => {
            query.read.mockReturnValueOnce(result(data)).mockReturnValue(result([]));
            expect(renderToStaticMarkup(<Component />)).toContain('此期間沒有趨勢資料');
        });
    }
    it('retry callback is a button and disabled while read is pending', () => {
        const onRetry = vi.fn();
        const notice = ReportReadNotice({ label: '報表', isError: true, error: new Error('offline'),
            hasData: false, isFetching: true, onRetry });
        expect(renderToStaticMarkup(notice)).toContain('disabled');
        expect(renderToStaticMarkup(notice)).toContain('type="button"');
        expect(onRetry).not.toHaveBeenCalled();
    });
    it('only authorization statuses are classified as denied', () => {
        expect(isReportAccessDenied({ response: { status: 403 } })).toBe(true);
        expect(isReportAccessDenied({ status: 401 })).toBe(true);
        for (const error of [undefined, null, '403', {}, { response: null }, { response: { status: 500 } }]) {
            expect(isReportAccessDenied(error)).toBe(false);
        }
    });
});
