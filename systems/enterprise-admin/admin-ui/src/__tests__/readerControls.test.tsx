import '@testing-library/jest-dom/vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { revealReaderFocus } from '../pages/useReaderFocusReveal';
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

describe('actual reader focus reveals the measured clipped top edge (DOM geometry, not Chrome)', () => {
    for (const subject of subjects) it(`${subject.id}: reveals a focused control and its 6px ring after the measured resize boundary`, () => {
        const pending = new Map<number, FrameRequestCallback>(); let id = 0;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { pending.set(++id, callback); return id; });
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(key => { pending.delete(key); });
        const doc = document.documentElement;
        const previous = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
        const oldMetrics = ['clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight', 'scrollTop', 'scrollLeft'].map(key => [key, Object.getOwnPropertyDescriptor(doc, key)] as const);
        Object.defineProperty(document, 'scrollingElement', { value: doc, configurable: true });
        Object.defineProperties(doc, { clientWidth: { value: 1366, configurable: true }, clientHeight: { value: 900, configurable: true }, scrollWidth: { value: 1366, configurable: true }, scrollHeight: { value: 3000, configurable: true }, scrollTop: { value: 40, writable: true, configurable: true }, scrollLeft: { value: 0, writable: true, configurable: true } });
        vi.stubGlobal('innerWidth', 1366); vi.stubGlobal('innerHeight', 900);
        const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        try {
            mount(subject.Component); const button = screen.getByRole('button', { name: subject.button });
            vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({ x: 1241.578125, left: 1241.578125, right: 1326, y: -0.21875, top: -0.21875, bottom: 43.78125, width: 84.421875, height: 44, toJSON: () => ({}) });
            button.focus(); for (const [key, callback] of [...pending]) { pending.delete(key); callback(0); }
            expect(scroll).toHaveBeenCalledWith({ left: 0, top: 33.78125, behavior: 'instant' });
        } finally {
            cleanup(); for (const [key, descriptor] of oldMetrics) { if (descriptor) Object.defineProperty(doc, key, descriptor); else delete (doc as unknown as Record<string, unknown>)[key]; } if (previous) Object.defineProperty(document, 'scrollingElement', previous); else delete (document as unknown as { scrollingElement?: Element }).scrollingElement;
            vi.restoreAllMocks(); vi.unstubAllGlobals();
        }
    });
});


function focusScene(run: (scene: { root: HTMLDivElement; button: HTMLButtonElement; doc: HTMLElement; scroll: ReturnType<typeof vi.spyOn>; box: { x: number; y: number; width: number; height: number } }) => void) {
    const doc = document.documentElement, root = document.createElement('div'), button = document.createElement('button');
    root.className = 'admin-reader-page'; button.className = 'btn'; root.append(button); document.body.append(root);
    const saved = ['clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight', 'scrollTop', 'scrollLeft'].map(key => [key, Object.getOwnPropertyDescriptor(doc, key)] as const);
    const oldScrolling = Object.getOwnPropertyDescriptor(document, 'scrollingElement');
    Object.defineProperty(document, 'scrollingElement', { value: doc, configurable: true });
    Object.defineProperties(doc, { clientWidth: { value: 1366, configurable: true }, clientHeight: { value: 900, configurable: true }, scrollWidth: { value: 1366, configurable: true }, scrollHeight: { value: 3000, configurable: true }, scrollTop: { value: 100, writable: true, configurable: true }, scrollLeft: { value: 0, writable: true, configurable: true } });
    vi.stubGlobal('innerWidth', 1366); vi.stubGlobal('innerHeight', 900);
    const box = { x: 500, y: 100, width: 84, height: 44 };
    vi.spyOn(button, 'getBoundingClientRect').mockImplementation(() => ({ ...box, left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height, toJSON: () => ({}) }));
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    button.focus();
    try { run({ root, button, doc, scroll, box }); }
    finally { root.remove(); for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(doc, key, descriptor); else delete (doc as unknown as Record<string, unknown>)[key]; } if (oldScrolling) Object.defineProperty(document, 'scrollingElement', oldScrolling); else delete (document as unknown as { scrollingElement?: Element }).scrollingElement; vi.restoreAllMocks(); vi.unstubAllGlobals(); }
}

describe('reader focus nearest-boundary policy (measured DOM adapters)', () => {
    it('moves only the minimum amount at the lower viewport edge', () => focusScene(({ root, button, scroll, box }) => { box.y = 880; revealReaderFocus(button, root); expect(scroll).toHaveBeenCalledWith({ left: 0, top: 130, behavior: 'instant' }); }));
    it('does not scroll a control that already has full ring clearance', () => focusScene(({ root, button, scroll }) => { revealReaderFocus(button, root); expect(scroll).not.toHaveBeenCalled(); }));
    it('clamps upper and lower movement to the actual document bounds', () => focusScene(({ root, button, doc, scroll, box }) => {
        doc.scrollTop = 0; box.y = -0.21875; revealReaderFocus(button, root); expect(scroll).not.toHaveBeenCalled();
        doc.scrollTop = 2098; box.y = 880; revealReaderFocus(button, root); expect(scroll).toHaveBeenCalledWith({ left: 0, top: 2100, behavior: 'instant' });
    }));
    it('ignores disabled, foreign-root and no-longer-focused controls', () => focusScene(({ root, button, scroll, box }) => {
        box.y = -1; button.disabled = true; revealReaderFocus(button, root); button.disabled = false;
        revealReaderFocus(button, document.createElement('div')); button.blur(); revealReaderFocus(button, root); expect(scroll).not.toHaveBeenCalled();
    }));
    for (const side of ['left', 'right']) it(`reveals only its own horizontal table at the ${side} edge`, () => focusScene(({ root, button, scroll, box }) => {
        const region = document.createElement('div'), unrelated = document.createElement('div'); region.style.overflowX = 'auto'; root.append(region, unrelated); region.append(button); button.focus();
        Object.defineProperties(region, { clientLeft: { value: 1 }, clientTop: { value: 0 }, clientWidth: { value: 236 }, clientHeight: { value: 300 }, scrollWidth: { value: 900 }, scrollHeight: { value: 300 }, scrollLeft: { value: 600, writable: true }, scrollTop: { value: 17, writable: true } });
        vi.spyOn(region, 'getBoundingClientRect').mockReturnValue({ x: 112, left: 112, right: 350, y: 80, top: 80, bottom: 380, width: 238, height: 300, toJSON: () => ({}) });
        const own = vi.fn(), other = vi.fn(); Object.defineProperty(region, 'scrollTo', { value: own }); Object.defineProperty(unrelated, 'scrollTo', { value: other });
        box.x = side === 'left' ? 105 : 249; box.width = 129; revealReaderFocus(button, root);
        expect(own).toHaveBeenCalledWith({ left: side === 'left' ? 586 : 635, top: 17, behavior: 'instant' }); expect(other).not.toHaveBeenCalled(); expect(scroll).not.toHaveBeenCalled();
    }));
    it('keeps the focused reader visible on resize back and cancels pending work after unmount', () => {
        const pending = new Map<number, FrameRequestCallback>(); let id = 0;
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { pending.set(++id, callback); return id; });
        vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(key => { pending.delete(key); });
        const flush = () => { for (const [key, callback] of [...pending]) { pending.delete(key); callback(0); } };
        focusScene(({ doc, scroll, box }) => {
            const mounted = mount(CashFlowPage), button = screen.getByRole('button', { name: 'Refresh' });
            vi.spyOn(button, 'getBoundingClientRect').mockImplementation(() => ({ ...box, left: box.x, right: box.x + box.width, top: box.y, bottom: box.y + box.height, toJSON: () => ({}) }));
            button.focus(); flush(); expect(scroll).not.toHaveBeenCalled();
            vi.stubGlobal('innerWidth', 390); box.x = 112; fireEvent(window, new Event('resize')); flush(); expect(scroll).not.toHaveBeenCalled();
            vi.stubGlobal('innerWidth', 1366); doc.scrollTop = 40; box.x = 1241.578125; box.y = -0.21875; fireEvent(window, new Event('resize')); flush(); expect(scroll).toHaveBeenLastCalledWith({ left: 0, top: 33.78125, behavior: 'instant' });
            scroll.mockClear(); fireEvent(window, new Event('resize')); mounted.unmount(); flush(); expect(scroll).not.toHaveBeenCalled();
        });
    });
});
