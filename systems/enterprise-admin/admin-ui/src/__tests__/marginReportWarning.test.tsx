import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { ApiSuccess, MarginAnalysis } from '@pharmasaas/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reportsApi } from '../api/reports';
import MarginAnalysisPage from '../pages/Reports/MarginAnalysisPage';
import SalesRankingPage from '../pages/Reports/SalesRankingPage';

const { httpGet } = vi.hoisted(() => ({ httpGet: vi.fn<(path: string) => Promise<{ data: ApiSuccess<unknown> }>>() }));
vi.mock('../api/client', () => ({ default: { get: httpGet } }));
// JSDOM cannot measure layout; retain real charts with a test-only fixed viewport.
vi.mock('recharts', async importOriginal => {
    const original = await importOriginal<typeof import('recharts')>();
    return { ...original, ResponsiveContainer: ({ children }: { children: ReactElement }) =>
        <original.ResponsiveContainer width={600} height={300}>{children}</original.ResponsiveContainer> };
});

const margin: MarginAnalysis = {
    period: '2026-10',
    summary: { totalRevenue: 1500, totalCogs: 1100, totalMargin: 400, totalMarginPct: 26.67 },
    products: [{ id: 'synthetic-1', name: 'Synthetic margin product', sku: 'SYN-1', qty: 3,
        revenue: 1500, cogs: 1100, margin: 400, marginPct: 26.67, contributionPct: 100 }],
};
const trend: Awaited<ReturnType<typeof reportsApi.getMarginTrend>> = [
    { period: '2026-10', revenue: 1500, margin: 400, marginPct: 26.67 },
];
const ranking: Awaited<ReturnType<typeof reportsApi.getSalesRanking>> = {
    period: '2026-10', categories: [{ category: 'Synthetic category', revenue: 2100, quantity: 9 }],
    topProducts: [
        { id: 'synthetic-1', name: 'Revenue leader', sku: 'SYN-1', categoryName: 'Synthetic category',
            quantity: 3, revenue: 1500, margin: 400, marginPct: 26.67 },
        { id: 'synthetic-2', name: 'Quantity leader', sku: 'SYN-2', categoryName: 'Synthetic category',
            quantity: 6, revenue: 600, margin: -60, marginPct: -10 },
    ],
};
function response<T>(data: T): { data: ApiSuccess<T> } { return { data: { success: true, data } }; }
function deferred() {
    let resolve!: (value: { data: ApiSuccess<unknown> }) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<{ data: ApiSuccess<unknown> }>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}
function successfulReads() {
    httpGet.mockImplementation(async path => {
        if (path.startsWith('/reports/margin/trend?')) return response(trend);
        if (path.startsWith('/reports/margin?')) return response(margin);
        if (path.startsWith('/reports/sales-ranking?')) return response(ranking);
        throw new Error(`Unexpected synthetic request: ${path}`);
    });
}

const clients: QueryClient[] = [];
function setup(page: ReactElement = <MarginAnalysisPage />) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    return render(<QueryClientProvider client={client}>{page}</QueryClientProvider>);
}
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); vi.resetAllMocks(); });
const noticeName = '目前成本估算，非歷史實際毛利';
const pages = [
    { name: 'margin', element: <MarginAnalysisPage />, loading: 'Loading margin data...', product: 'Synthetic margin product',
        request: (period: string) => `/reports/margin?period=${period}` },
    { name: 'ranking', element: <SalesRankingPage />, loading: 'Loading sales ranking...', product: 'Revenue leader',
        request: (period: string) => `/reports/sales-ranking?period=${period}&sort=revenue&limit=20` },
];

describe('current-cost margin disclosure', () => {
    it('discloses the historical-cost limitation before margin requests complete', () => {
        httpGet.mockImplementation(() => new Promise(() => {}));
        setup();
        expect(screen.getByRole('note', { name: '目前成本估算，非歷史實際毛利' })).toHaveTextContent('舊訂單缺少成交時成本快照');
        expect(screen.getByText('Loading margin data...')).toBeInTheDocument();
    });

    it('discloses the same limitation before sales ranking requests complete', () => {
        httpGet.mockImplementation(() => new Promise(() => {}));
        setup(<SalesRankingPage />);
        expect(screen.getByRole('note', { name: '目前成本估算，非歷史實際毛利' })).toHaveTextContent('舊訂單缺少成交時成本快照');
        expect(screen.getByText('Loading sales ranking...')).toBeInTheDocument();
    });

    it('labels margin totals and trends as estimates without changing API values', async () => {
        successfulReads();
        setup();
        await screen.findByText('Synthetic margin product');
        expect(screen.getByRole('heading', { name: 'Gross Margin Analysis（目前成本估算）' })).toBeInTheDocument();
        for (const label of ['Total Revenue（明細收入）', 'Total COGS（目前成本估算）', 'Gross Margin ($)（估算）',
            'Gross Margin (%)（估算）', '6-Month Margin Trend（目前成本估算）', 'SKU Margin Breakdown（目前成本估算）']) {
            expect(screen.getByText(label)).toBeInTheDocument();
        }
        expect(screen.getByRole('columnheader', { name: 'Margin %（估算）' })).toBeInTheDocument();
        expect(screen.getByRole('columnheader', { name: 'Contrib. %（估算）' })).toBeInTheDocument();
        expect(screen.getByText('$1,100')).toBeInTheDocument();
        expect(screen.getByText('$400')).toBeInTheDocument();
        expect(screen.getAllByText('$1,500')).toHaveLength(2);
        expect(screen.getAllByText('26.67%')).toHaveLength(2);
        expect(screen.getByText('100%')).toBeInTheDocument();
        expect(screen.queryByText(/historical margin trends/i)).not.toBeInTheDocument();
    });

    it('labels ranking margin percentages as estimates and preserves the returned order and values', async () => {
        successfulReads();
        setup(<SalesRankingPage />);
        await screen.findByText('Revenue leader');
        expect(screen.getByRole('columnheader', { name: 'Margin %（估算）' })).toBeInTheDocument();
        const rows = screen.getAllByRole('row').slice(1);
        expect(rows).toHaveLength(2);
        for (const value of ['Revenue leader', 'SYN-1', '3', '$1,500', '26.67%']) {
            expect(within(rows[0]).getByText(value)).toBeInTheDocument();
        }
        for (const value of ['Quantity leader', 'SYN-2', '6', '$600', '-10%']) {
            expect(within(rows[1]).getByText(value)).toBeInTheDocument();
        }
    });

    it.each(pages)('exposes revenue, current-cost and reconciliation limits on the $name page', async page => {
        successfulReads();
        setup(page.element);
        await screen.findByText(page.product);
        const notice = screen.getByRole('note', { name: noticeName });
        expect(within(notice).getByText(/折扣分攤與退款尚未完成對帳/)).toBeVisible();
        const toggle = within(notice).getByText('查看毛利估算來源與限制');
        const details = toggle.closest('details');
        expect(details).not.toHaveAttribute('open');
        fireEvent.click(toggle);
        expect(details).toHaveAttribute('open');
        for (const text of ['收入以已完成訂單明細的數量 × 成交單價', '非折扣／退款對帳後的淨實收',
            '明細數量 × 商品目前成本', '未使用成交時成本快照', '商品成本變更會影響過往月份的估算']) {
            expect(notice).toHaveTextContent(text);
        }
        fireEvent.click(toggle);
        expect(details).not.toHaveAttribute('open');
        expect(within(notice).getByText(noticeName)).toBeVisible();
    });

    it.each(pages)('keeps disclosure after initial $name request failure', async page => {
        httpGet.mockRejectedValue(new Error('Synthetic failure'));
        setup(page.element);
        await waitFor(() => expect(screen.queryByText(page.loading)).not.toBeInTheDocument());
        expect(screen.getByRole('note', { name: noticeName })).toBeVisible();
        expect(screen.queryByText(page.product)).not.toBeInTheDocument();
    });

    it.each(pages)('keeps disclosure and prior values during $name refresh and refresh failure', async page => {
        successfulReads();
        const { container } = setup(page.element);
        await screen.findByText(page.product);
        const period = container.querySelector('input')!.value;
        const request = deferred();
        httpGet.mockReset().mockReturnValue(request.promise);
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
        await waitFor(() => expect(httpGet).toHaveBeenCalledWith(page.request(period)));
        expect(screen.getByRole('note', { name: noticeName })).toBeVisible();
        expect(screen.getByText(page.product)).toBeInTheDocument();
        await act(async () => { request.reject(new Error('Synthetic refresh failure')); });
        await waitFor(() => expect(clients[0].isFetching()).toBe(0));
        expect(screen.getByRole('note', { name: noticeName })).toBeVisible();
        expect(screen.getByText(page.product)).toBeInTheDocument();
    });

    it.each(pages)('retains disclosure while changing $name periods and recovering with new data', async page => {
        successfulReads();
        const { container } = setup(page.element);
        await screen.findByText(page.product);
        const input = container.querySelector('input[type="month"]')!;
        const nextPeriod = (input as HTMLInputElement).value === '2026-09' ? '2026-08' : '2026-09';
        const request = deferred();
        httpGet.mockReset().mockImplementation(path => path.includes('/trend?') ? Promise.resolve(response(trend)) : request.promise);
        fireEvent.change(input, { target: { value: nextPeriod } });
        expect(screen.getByRole('note', { name: noticeName })).toBeVisible();
        expect(screen.getByText(page.loading)).toBeInTheDocument();
        expect(screen.queryByText(page.product)).not.toBeInTheDocument();
        await waitFor(() => expect(httpGet).toHaveBeenCalledWith(page.request(nextPeriod)));
        if (page.name === 'margin') expect(httpGet).toHaveBeenCalledWith(`/reports/margin/trend?to=${nextPeriod}`);
        await act(async () => { request.resolve(response(page.name === 'margin'
            ? { ...margin, period: nextPeriod } : { ...ranking, period: nextPeriod })); });
        await screen.findByText(page.product);
        expect(screen.getByRole('note', { name: noticeName })).toBeVisible();
        expect(container.querySelector('input')).toHaveValue(nextPeriod);
    });

    it('retains the disclosure through a quantity sort and displays the returned ranking', async () => {
        successfulReads();
        const { container } = setup(<SalesRankingPage />);
        await screen.findByText('Revenue leader');
        const period = container.querySelector('input')!.value;
        const request = deferred();
        httpGet.mockReset().mockReturnValue(request.promise);
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'quantity' } });
        expect(screen.getByRole('note', { name: noticeName })).toBeVisible();
        expect(screen.getByText('Loading sales ranking...')).toBeInTheDocument();
        await waitFor(() => expect(httpGet).toHaveBeenCalledWith(`/reports/sales-ranking?period=${period}&sort=quantity&limit=20`));
        await act(async () => { request.resolve(response({ ...ranking, topProducts: [...ranking.topProducts].reverse() })); });
        await screen.findByText('Quantity leader');
        expect(screen.getByRole('combobox')).toHaveValue('quantity');
        expect(screen.getAllByRole('row')[1]).toHaveTextContent('Quantity leader');
        expect(screen.getByRole('columnheader', { name: 'Margin %（估算）' })).toBeInTheDocument();
        expect(screen.getByRole('note', { name: noticeName })).toBeVisible();
    });
});
