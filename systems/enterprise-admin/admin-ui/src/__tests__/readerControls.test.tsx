import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CashFlowPage from '../pages/Reports/CashFlowPage';
import MarginAnalysisPage from '../pages/Reports/MarginAnalysisPage';
import SalesRankingPage from '../pages/Reports/SalesRankingPage';
import InventoryAnalyticsPage from '../pages/Inventory/InventoryAnalyticsPage';
import SupplierListPage from '../pages/Inventory/SupplierListPage';

const state = vi.hoisted(() => ({ denied: false, fetching: false, refetch: vi.fn() }));
vi.mock('../hooks/useGuardedRead', () => ({ useGuardedRead: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey[1];
    const data = key === 'cashflow' ? { beginningCash: 300000, operatingInflows: 0, operatingOutflows: 0, investingOutflows: 0, endingCash: 300000, expensesBreakdown: [] }
        : key === 'margin' ? { summary: { totalRevenue: 0, totalCogs: 0, totalMargin: 0, totalMarginPct: 0 }, products: [] }
        : key === 'sales-ranking' ? { topProducts: [], categories: [] }
        : key === 'product-abc' ? { summary: { star: 0, cash_cow: 0, hidden_gem: 0, underperformer: 0 }, medianRevenue: 0, medianMargin: 0, products: [] } : [];
    return { data: state.denied ? undefined : data, isLoading: false, isPending: false, isError: state.denied,
        error: state.denied ? { response: { status: 403 } } : null, isFetching: state.fetching, refetch: state.refetch, readerId: 'synthetic-layout-reader' };
} }));
vi.mock('recharts', () => {
    const Chart = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
    return { BarChart: Chart, Bar: Chart, XAxis: Chart, YAxis: Chart, CartesianGrid: Chart, Tooltip: Chart, Legend: Chart, ResponsiveContainer: Chart, LineChart: Chart, Line: Chart, PieChart: Chart, Pie: Chart, Cell: Chart };
});
const subjects = [
    { id: 'cashflow', label: '現金流報表', Component: CashFlowPage, button: 'Refresh' },
    { id: 'margin', label: '毛利報表', Component: MarginAnalysisPage, button: 'Refresh' },
    { id: 'sales', label: '銷售排行', Component: SalesRankingPage, button: 'Refresh' },
    { id: 'analytics', label: '商品分析', Component: InventoryAnalyticsPage, button: '🏢 Supplier Ranking' },
    { id: 'suppliers', label: '供應商清單', Component: SupplierListPage, button: 'Add Supplier' },
];
const sourceRoot = existsSync('src/index.css') ? 'src' : 'systems/enterprise-admin/admin-ui/src';
const cssUrl = `${sourceRoot}/pages/ReaderControls.css`;
const localCss = existsSync(cssUrl) ? readFileSync(cssUrl, 'utf8') : '';
const globalCss = readFileSync(`${sourceRoot}/index.css`, 'utf8');
const sharedRules = [...globalCss.matchAll(/(?:\.btn|\.table-container|\*:focus-visible)\s*\{[^}]*\}/g)].map(([rule]) => rule).join('\n');
let client: QueryClient, stylesheet: HTMLStyleElement;
beforeEach(() => {
    state.denied = false; state.fetching = false; state.refetch.mockReset();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    stylesheet = document.createElement('style'); stylesheet.textContent = sharedRules + '\n' + localCss; document.head.append(stylesheet);
});
afterEach(() => { cleanup(); client.clear(); stylesheet.remove(); });
function mount(Component: typeof CashFlowPage) { return render(<QueryClientProvider client={client}><Component /></QueryClientProvider>); }

describe('five-reader scoped control contracts (CSS/DOM, not native geometry)', () => {
    for (const subject of subjects) {
        it(`${subject.id}: keeps its actual primary read control at least 44px and wrappable`, () => {
            mount(subject.Component); const button = screen.getByRole('button', { name: subject.button });
            expect(button.closest('.admin-reader-page')).not.toBeNull();
            const style = getComputedStyle(button);
            expect(style.minHeight).toBe('44px'); expect(style.minWidth).toBe('44px');
            expect(style.maxWidth).toBe('100%'); expect(style.whiteSpace).toBe('normal'); expect(style.overflowWrap).toBe('anywhere');
            button.focus(); expect(document.activeElement).toBe(button);
        });
        it(`${subject.id}: preserves disabled in-flight retry and only invokes an enabled retry`, () => {
            state.denied = true; state.fetching = true; const mounted = mount(subject.Component);
            const retry = within(screen.getByRole('alert', { name: `${subject.label}讀取狀態` })).getByRole('button', { name: '重試中…' });
            expect(retry).toBeDisabled(); fireEvent.click(retry); expect(state.refetch).not.toHaveBeenCalled();
            expect(getComputedStyle(retry).minHeight).toBe('44px');
            state.fetching = false; mounted.rerender(<QueryClientProvider client={client}><subject.Component /></QueryClientProvider>);
            const enabled = screen.getByRole('button', { name: `重試${subject.label}` });
            expect(enabled).toBeEnabled(); fireEvent.click(enabled); expect(state.refetch).toHaveBeenCalledTimes(1);
            if (subject.id === 'suppliers') expect(screen.getByRole('button', { name: 'Add Supplier' })).toBeDisabled();
        });
    }
    it('keeps every new selector within the five-reader opt-in and strengthens only keyboard focus', () => {
        const selectors = [...localCss.matchAll(/([^{}]+)\{/g)].flatMap(([, group]) => group.replace(/\/\*[\s\S]*?\*\//g, '').trim().split(',').map(s => s.trim()));
        expect(selectors.length).toBeGreaterThan(0); expect(selectors.every(s => s.startsWith('.admin-reader-page'))).toBe(true);
        const rules = [...stylesheet.sheet!.cssRules].filter(rule => 'selectorText' in rule) as CSSStyleRule[];
        const focus = rules.find(rule => rule.selectorText.split(',').some(selector => selector.trim() === '.admin-reader-page .btn:focus-visible'));
        expect(focus?.style.getPropertyValue('outline')).toBe('3px solid var(--text-primary)');
        expect(focus?.style.getPropertyValue('outline-offset')).toBe('3px');
        expect(localCss).not.toMatch(/pointer-events|opacity|:disabled|!important|position:\s*fixed/);
        const unrelated = document.createElement('button'); unrelated.className = 'btn'; document.body.append(unrelated);
        expect(getComputedStyle(unrelated).minHeight).not.toBe('44px'); unrelated.remove();
    });
    it('wraps actual month/sort toolbars and bounds their inline-width inputs without overflow hiding', () => {
        for (const subject of subjects.slice(0, 4)) {
            const mounted = mount(subject.Component); const month = mounted.container.querySelector('input[type="month"]')!;
            const toolbar = month.parentElement!;
            expect(toolbar).toHaveClass('reader-toolbar'); expect(getComputedStyle(toolbar).flexWrap).toBe('wrap');
            expect(getComputedStyle(toolbar).minWidth).toBe('0'); expect(getComputedStyle(toolbar).maxWidth).toBe('100%');
            expect(getComputedStyle(month).maxWidth).toBe('100%'); expect(getComputedStyle(month).minWidth).toBe('0');
            expect(getComputedStyle(month.closest('.page-header')!).flexWrap).toBe('wrap');
            mounted.unmount();
        }
        expect(localCss).not.toMatch(/overflow(?:-x|-y)?\s*:\s*hidden/);
    });
});

for (const Component of [CashFlowPage, MarginAnalysisPage]) it('replaces the four-column inline summary with a container-bounded wrapping grid', () => {
    const mounted = mount(Component); const grid = mounted.container.querySelector('.reader-summary-grid') as HTMLElement;
    expect(grid).not.toBeNull(); expect(grid.style.gridTemplateColumns).toBe('');
    expect(getComputedStyle(grid).gridTemplateColumns).toBe('repeat(auto-fit, minmax(min(100%, 200px), 1fr))');
    expect(grid.querySelectorAll('.stat-card')).toHaveLength(4);
    for (const card of grid.querySelectorAll('.stat-card')) expect(getComputedStyle(card).minWidth).toBe('0');
});
for (const [Component, name, ranking] of [
    [MarginAnalysisPage, '毛利明細表', false], [SalesRankingPage, '銷售排行表', false],
    [InventoryAnalyticsPage, '商品分析表', false], [InventoryAnalyticsPage, '供應商排行表', true],
    [SupplierListPage, '供應商清單表', false],
] as const) it(`${name}: exposes only its own table as a named keyboard scroll region`, () => {
    mount(Component); if (ranking) fireEvent.click(screen.getByRole('button', { name: '🏢 Supplier Ranking' }));
    const region = screen.getByRole('region', { name });
    expect(region).toHaveAttribute('tabindex', '0'); expect(region).toHaveClass('reader-table-scroll');
    expect(getComputedStyle(region).overflow).toBe('auto'); expect(getComputedStyle(region).maxWidth).toBe('100%');
    expect(getComputedStyle(within(region).getByRole('table')).minWidth).toBe('640px');
    region.focus(); expect(document.activeElement).toBe(region);
    const unrelated = document.createElement('div'); unrelated.className = 'table-container'; document.body.append(unrelated);
    expect(getComputedStyle(unrelated).overflow).toBe('hidden'); unrelated.remove();
});
