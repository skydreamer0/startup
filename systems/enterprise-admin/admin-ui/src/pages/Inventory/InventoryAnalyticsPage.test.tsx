import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextType } from '../../hooks/authContext';
import Page from './InventoryAnalyticsPage';
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }));
vi.mock('../../api/client', () => ({ default: api }));
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => { act(() => root.unmount()); client.clear(); host.remove(); });
const auth = (id: string): AuthContextType => ({ user: { id, email: 'synthetic@example.test', fullName: 'Synthetic', roles: [], permissions: [] }, loading: false,
    login: async () => {}, logout: () => {}, demoLogin: () => {}, hasPermission: () => false });
function mount(id: string | null = 'reader-a') { act(() => root.render(<AuthContext.Provider value={id ? auth(id) : { ...auth('unused'), user: null, loading: true }}><QueryClientProvider client={client}><Page /></QueryClientProvider></AuthContext.Provider>)); }
async function until(check: () => void) { await vi.waitFor(async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); }); check(); }); }
function button(name: string) { const found = [...host.querySelectorAll('button')].find(element => element.textContent?.trim() === name); expect(found).toBeDefined(); return found!; }
async function click(name: string) { await until(() => { expect(button(name).disabled).toBe(false); }); await act(async () => { button(name).click(); }); }
async function refresh(key: string[]) { await act(async () => { await client.refetchQueries({ queryKey: key }); }); }
const failure = (status: number) => ({ response: { status } });

const products = { summary: { star: 1, cash_cow: 0, hidden_gem: 0, underperformer: 0 }, medianRevenue: 9, medianMargin: 2,
    products: [{ id: 'p', name: 'SYNTHETIC_PRODUCT', sku: 'TEST', quadrant: 'star', totalQuantity: 1, totalRevenue: 9, marginPct: 2 }] };
const suppliers = [{ id: 's', name: 'SYNTHETIC_RANKING', totalRevenue: 9, revenueShare: 100, avgMarginPct: 2, deliveryReliability: null, compositeScore: 4, productCount: 1 }];
function success(url: string) { return Promise.resolve({ data: { data: url.includes('product-abc') ? products : suppliers } }); }
describe('inventory analytics read state with real QueryClient', () => {
    it('offers independently scoped retry after initial errors on both tabs', async () => {
        api.get.mockRejectedValue(failure(500)); mount();
        await until(() => expect(host.textContent).toContain('重試商品分析'));
        expect(host.textContent).not.toContain('Median Revenue');
        const before = api.get.mock.calls.filter(([url]) => url.includes('supplier-ranking')).length;
        api.get.mockImplementation(success); await click('重試商品分析');
        await until(() => expect(host.textContent).toContain('SYNTHETIC_PRODUCT'));
        expect(api.get.mock.calls.filter(([url]) => url.includes('supplier-ranking'))).toHaveLength(before);
        await click('🏢 Supplier Ranking'); expect(host.textContent).toContain('重試供應商排行');
        await click('重試供應商排行'); await until(() => expect(host.textContent).toContain('SYNTHETIC_RANKING'));
    });
    it('preserves ordinary failed-refetch data with stale warning and recovers', async () => {
        api.get.mockImplementation(success); mount(); await until(() => expect(host.textContent).toContain('SYNTHETIC_PRODUCT'));
        api.get.mockRejectedValue(failure(500)); await refresh(['analytics', 'product-abc']);
        await until(() => expect(host.textContent).toContain('可能已過期')); expect(host.textContent).toContain('SYNTHETIC_PRODUCT');
        api.get.mockImplementation(success); await click('重試商品分析'); await until(() => expect(host.querySelector('[role="alert"]')).toBeNull());
    });
    it.each([401,403])('hides cached product and supplier rows on %s then allows successful reload', async status => {
        api.get.mockImplementation(success); mount(); await until(() => expect(host.textContent).toContain('SYNTHETIC_PRODUCT'));
        api.get.mockRejectedValue(failure(status)); await refresh(['analytics']);
        await until(() => expect(host.textContent).toContain('存取被拒絕')); expect(host.textContent).not.toContain('SYNTHETIC_PRODUCT');
        await click('🏢 Supplier Ranking'); expect(host.textContent).not.toContain('SYNTHETIC_RANKING'); expect(host.textContent).toContain('存取被拒絕');
        api.get.mockImplementation(success); await click('重試供應商排行'); await until(() => expect(host.textContent).toContain('SYNTHETIC_RANKING'));
    });
    it('distinguishes successful empty from loading and keeps late replies in their query owner', async () => {
        let resolveProduct!: (value: unknown) => void;
        api.get.mockImplementation((url: string) => url.includes('product-abc') ? new Promise(resolve => { resolveProduct = resolve; }) : Promise.resolve({data:{data:[]}}));
        mount(); expect(host.textContent).not.toContain('No Data');
        await click('🏢 Supplier Ranking'); await until(() => expect(host.textContent).toContain('No supplier data found'));
        await act(async () => { resolveProduct({data:{data:products}}); });
        expect(host.textContent).not.toContain('SYNTHETIC_PRODUCT');
        await click('📦 ABC Product Analysis'); await until(() => expect(host.textContent).toContain('SYNTHETIC_PRODUCT'));
    });
    it('consumes real observer cancellation signals on unmount without publishing late data', async () => {
        const signals: AbortSignal[] = [];
        api.get.mockImplementation((_url: string, options: {signal: AbortSignal}) => { signals.push(options.signal); return new Promise(() => {}); });
        mount(); await until(() => expect(signals).toHaveLength(2)); act(() => root.render(null));
        expect(signals.every(signal => signal.aborted)).toBe(true);
        expect(client.getQueryData(['analytics','product-abc',new Date().toISOString().substring(0,7),{readerId:'reader-a'}])).toBeUndefined();
    });
});

async function month(value: string) {
    const input = host.querySelector('input[type="month"]')!;
    await act(async()=>{ Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value')!.set!.call(input,value); input.dispatchEvent(new Event('input',{bubbles:true})); });
}
describe('analytics denial persists across owners', () => {
    it.each([401,403])('hides both tabs after denial then 500, remount and another month/reader success (%s)', async status => {
        client.setDefaultOptions({queries:{retry:false,gcTime:Infinity}});
        const originalMonth = new Date().toISOString().substring(0,7);
        api.get.mockImplementation(success); mount(); await until(()=>expect(host.textContent).toContain('SYNTHETIC_PRODUCT'));
        api.get.mockRejectedValue(failure(status)); await refresh(['analytics']); await until(()=>expect(host.textContent).toContain('存取被拒絕'));
        api.get.mockRejectedValue(failure(500)); await refresh(['analytics']);
        const hiddenProduct=()=>{expect(host.textContent).not.toContain('SYNTHETIC_PRODUCT');expect(host.textContent).not.toContain('Median Revenue');expect(host.textContent).not.toContain('High Revenue, High Margin');};
        hiddenProduct(); await click('🏢 Supplier Ranking'); expect(host.textContent).not.toContain('SYNTHETIC_RANKING');
        // Successful supplier read is a different query and cannot unlock products.
        api.get.mockImplementation(success); await click('重試供應商排行'); await until(()=>expect(host.textContent).toContain('SYNTHETIC_RANKING'));
        await click('📦 ABC Product Analysis'); hiddenProduct();
        await month('2020-01'); await until(()=>expect(host.textContent).toContain('SYNTHETIC_PRODUCT'));
        api.get.mockRejectedValue(failure(500)); await month(originalMonth); await until(()=>{ expect(client.isFetching()).toBe(0); expect(host.textContent).toContain('存取被拒絕'); }); hiddenProduct();
        act(()=>root.render(null)); mount(); await until(()=>{ expect(client.isFetching()).toBe(0); expect(host.textContent).toContain('存取被拒絕'); }); hiddenProduct();
        api.get.mockImplementation(success); mount('reader-b'); await until(()=>expect(host.textContent).toContain('SYNTHETIC_PRODUCT'));
        api.get.mockRejectedValue(failure(500)); mount(); await until(()=>{ expect(client.isFetching()).toBe(0); expect(host.textContent).toContain('存取被拒絕'); }); hiddenProduct();
        api.get.mockImplementation(success); await click('重試商品分析'); await until(()=>expect(host.textContent).toContain('SYNTHETIC_PRODUCT'));
    });
});

it('wraps the analytics tab row instead of forcing whole-page horizontal scrolling', async () => {
    api.get.mockRejectedValue(failure(500)); mount();
    await until(() => expect(host.textContent).toContain('重試商品分析'));
    const tabs = button('📦 ABC Product Analysis').parentElement!;
    expect(tabs.style.flexWrap).toBe('wrap');
    expect(tabs.contains(button('🏢 Supplier Ranking'))).toBe(true);
});
