import '@testing-library/jest-dom/vitest';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextType } from '../hooks/authContext';
import CashFlowPage from '../pages/Reports/CashFlowPage';
import MarginAnalysisPage from '../pages/Reports/MarginAnalysisPage';
import SalesRankingPage from '../pages/Reports/SalesRankingPage';
const { get, write } = vi.hoisted(() => ({ get: vi.fn(), write: vi.fn() }));
vi.mock('../api/client', () => ({ default: { get, post: write, put: write, delete: write } }));
vi.mock('recharts', () => {
    const Chart = ({ data, children }: { data?: unknown; children?: ReactNode }) => <div>{data ? <pre>{JSON.stringify(data)}</pre> : null}{children}</div>;
    return { BarChart: Chart, Bar: Chart, XAxis: Chart, YAxis: Chart, CartesianGrid: Chart, Tooltip: Chart, Legend: Chart, ResponsiveContainer: Chart, LineChart: Chart, Line: Chart, PieChart: Chart, Pie: Chart, Cell: Chart };
});
const subjects = [
    { slug: 'cashflow', label: '現金流報表', Component: CashFlowPage, data: { beginningCash: 300000, operatingInflows: 1543, operatingOutflows: 0, investingOutflows: 0, endingCash: 301543, expensesBreakdown: [] } },
    { slug: 'margin', label: '毛利報表', Component: MarginAnalysisPage, data: { summary: { totalRevenue: 1543, totalCogs: 1, totalMargin: 1542, totalMarginPct: 99 }, products: [] } },
    { slug: 'sales-ranking', label: '銷售排行', Component: SalesRankingPage, data: { topProducts: [{ id: 'a', name: 'PRIVATE_READER_A', sku: 'A', quantity: 1, revenue: 1543, marginPct: 99, categoryName: 'Synthetic' }], categories: [] } },
];
let client: QueryClient, status: number, trendStatus: number;
let active: typeof subjects[number];
let pending = false;
let reader = 'reader-a';
const currentData = () => ({ data: { success: true, data: active.data } });
function Harness() {
    const [readerId, setReader] = useState('reader-a'); const [shown, setShown] = useState(true);
    const auth: AuthContextType = { user: { id: readerId, email: 'synthetic@example.test', fullName: 'Reader', roles: [], permissions: ['read:reports'] }, loading: false, login: vi.fn(), demoLogin: vi.fn(), logout: vi.fn(), hasPermission: () => true };
    return <AuthContext.Provider value={auth}><button onClick={() => { reader = reader === 'reader-a' ? 'reader-b' : 'reader-a'; setReader(reader); }}>Change reader</button><button onClick={() => setShown(value => !value)}>Toggle report</button>{shown && <active.Component />}</AuthContext.Provider>;
}
function setup(subject: typeof subjects[number]) { active = subject; client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); render(<QueryClientProvider client={client}><Harness /></QueryClientProvider>); }
beforeEach(() => { vi.clearAllMocks(); status = 200; trendStatus = 200; pending = false; reader = 'reader-a';
    get.mockImplementation(async (url: string) => {
        if (pending) return new Promise(() => {});
        const trend = url.includes('/trend?'); const code = trend ? trendStatus : status;
        if (code !== 200) throw { response: { status: code } };
        return trend ? { data: { success: true, data: [{ period: 'TREND_PRIVATE_SENTINEL', revenue: 1543, margin: 1542, marginPct: 99 }] } } : currentData();
    });
});
afterEach(() => { expect(write).not.toHaveBeenCalled(); cleanup(); client?.clear(); });

describe('actual QueryClient report authorization recovery', () => {
    for (const subject of subjects) {
        it(`${subject.slug}: denied cached data stays hidden after 500 and remount until authorized success`, async () => {
            setup(subject); await waitFor(() => expect(document.body.textContent).toContain('1,543'));
            status = 403; await act(async () => { await client.invalidateQueries({ queryKey: ['reports', subject.slug] }); });
            const retry = await screen.findByRole('button', { name: `重試${subject.label}` });
            expect(document.body.textContent).not.toContain('1,543');
            status = 500; fireEvent.click(retry);
            await waitFor(() => expect(retry).toBeEnabled());
            await waitFor(() => expect(client.getQueryCache().getAll().find(query => query.queryKey[1] === subject.slug)?.state.error).toMatchObject({ response: { status: 500 } }));
            expect(document.body.textContent).not.toContain('1,543');
            fireEvent.click(screen.getByRole('button', { name: 'Toggle report' })); fireEvent.click(screen.getByRole('button', { name: 'Toggle report' }));
            await screen.findByRole('button', { name: `重試${subject.label}` }); expect(document.body.textContent).not.toContain('1,543');
            status = 200; fireEvent.click(screen.getByRole('button', { name: `重試${subject.label}` }));
            await waitFor(() => expect(document.body.textContent).toContain('1,543'));
        });
        it(`${subject.slug}: ordinary 500 retains authorized data with a stale notice`, async () => {
            setup(subject); await waitFor(() => expect(document.body.textContent).toContain('1,543'));
            status = 500; await act(async () => { await client.invalidateQueries({ queryKey: ['reports', subject.slug] }); });
            await screen.findByText(/可能已過期/); expect(document.body.textContent).toContain('1,543');
        });
        it(`${subject.slug}: actor change aborts pending old transport and late success cannot replace B or clear A denial`, async () => {
            setup(subject); await waitFor(() => expect(document.body.textContent).toContain('1,543'));
            status = 403; await act(async () => { await client.invalidateQueries({ queryKey: ['reports', subject.slug] }); });
            const retry = await screen.findByRole('button', { name: `重試${subject.label}` });
            const old = currentData(); const signals: AbortSignal[] = []; const releases: (() => void)[] = [];
            get.mockImplementation(async (url: string, options: { signal: AbortSignal }) => {
                if (reader === 'reader-a') return new Promise(resolve => { signals.push(options.signal); releases.push(() => resolve(old)); });
                if (url.includes('/trend?')) return { data: { success: true, data: [] } };
                return { data: { success: true, data: JSON.parse(JSON.stringify(active.data).replace(/1543/g, '2543')) } };
            });
            fireEvent.click(retry); await waitFor(() => expect(signals.length).toBeGreaterThan(0));
            fireEvent.click(screen.getByRole('button', { name: 'Change reader' }));
            await waitFor(() => expect(document.body.textContent).toContain('2,543'));
            expect(signals.every(signal => signal.aborted)).toBe(true);
            await act(async () => { releases.forEach(release => release()); });
            expect(document.body.textContent).not.toContain('1,543');
            get.mockImplementation(async () => { throw { response: { status: 500 } }; });
            fireEvent.click(screen.getByRole('button', { name: 'Change reader' }));
            await screen.findByRole('button', { name: `重試${subject.label}` });
            expect(document.body.textContent).not.toContain('1,543'); expect(document.body.textContent).not.toContain('2,543');
        });
        it(`${subject.slug}: changed reader cannot see a cached previous-reader report while new read is pending`, async () => {
            setup(subject); await waitFor(() => expect(document.body.textContent).toContain('1,543'));
            pending = true; fireEvent.click(screen.getByRole('button', { name: 'Change reader' }));
            await waitFor(() => expect(document.body.textContent).not.toContain('1,543'));
        });
    }
    for (const subject of subjects.slice(0, 2)) it(`${subject.slug}: trend denial does not reappear after failed retry`, async () => {
        setup(subject); await screen.findByText(/TREND_PRIVATE_SENTINEL/);
        trendStatus = 403; await act(async () => { await client.invalidateQueries({ queryKey: ['reports', `${subject.slug}-trend`] }); });
        await waitFor(() => expect(screen.queryByText(/TREND_PRIVATE_SENTINEL/)).not.toBeInTheDocument());
        trendStatus = 500; const retry = screen.getByRole('button', { name: '重試趨勢' }); fireEvent.click(retry);
        await waitFor(() => expect(client.getQueryCache().getAll().find(query => query.queryKey[1] === `${subject.slug}-trend`)?.state.error).toMatchObject({ response: { status: 500 } }));
        expect(screen.queryByText(/TREND_PRIVATE_SENTINEL/)).not.toBeInTheDocument();
    });
});
