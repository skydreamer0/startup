import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextType } from '../../hooks/authContext';
import Page from './SupplierListPage';
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
async function click(name: string) { await until(() => { button(name); }); await act(async () => { button(name).click(); }); }
async function refresh(key: string[]) { await act(async () => { await client.refetchQueries({ queryKey: key }); }); }
const failure = (status: number) => ({ response: { status } });

const supplier = { id: 's', name: 'SYNTHETIC_CONTACT', email: 'fixture@example.test', phone: '000', deliveryReliability: 0, defectRate: 0 };
const success = () => Promise.resolve({data:{data:[supplier]}});
describe('supplier reader with real QueryClient', () => {
    it('distinguishes loading, initial failure, recovery and successful empty', async () => {
        let reject!: (error: unknown) => void; api.get.mockImplementation(() => new Promise((_resolve, fail) => { reject=fail; })); mount();
        expect(host.textContent).toContain('Loading suppliers'); expect(host.textContent).not.toContain('No suppliers found');
        await act(async () => { reject(failure(500)); }); await until(() => expect(host.textContent).toContain('重試供應商清單'));
        api.get.mockResolvedValue({data:{data:[]}}); await click('重試供應商清單'); await until(() => expect(host.textContent).toContain('No suppliers found'));
    });
    it('marks retained data stale and retries without supplier mutations', async () => {
        api.get.mockImplementation(success); mount(); await until(() => expect(host.textContent).toContain('SYNTHETIC_CONTACT'));
        api.get.mockRejectedValue(failure(500)); await refresh(['inventory','suppliers']);
        await until(() => expect(host.textContent).toContain('可能已過期')); expect(host.textContent).toContain('SYNTHETIC_CONTACT');
        api.get.mockImplementation(success); await click('重試供應商清單'); await until(() => expect(host.querySelector('[role="alert"]')).toBeNull());
        expect(api.post).not.toHaveBeenCalled(); expect(api.put).not.toHaveBeenCalled();
    });
    it.each([401,403])('hides cached contacts and open edit draft on %s; reload does not resurrect draft', async status => {
        api.get.mockImplementation(success); mount(); await until(() => expect(host.textContent).toContain('SYNTHETIC_CONTACT')); await click('Edit');
        expect(host.querySelector('input')?.value).toBe('SYNTHETIC_CONTACT');
        api.get.mockRejectedValue(failure(status)); await refresh(['inventory','suppliers']);
        await until(() => expect(host.textContent).toContain('存取被拒絕')); expect(host.textContent).not.toContain('SYNTHETIC_CONTACT');
        expect(host.querySelector('input')).toBeNull(); expect(host.textContent).not.toContain('Edit'); expect(button('Add Supplier').disabled).toBe(true);
        api.get.mockImplementation(success); await click('重試供應商清單'); await until(() => expect(host.textContent).toContain('SYNTHETIC_CONTACT'));
        expect(host.querySelector('input')).toBeNull(); expect(api.post).not.toHaveBeenCalled(); expect(api.put).not.toHaveBeenCalled();
    });
    it('aborts the actual GET observer on unmount; late response cannot populate canceled cache', async () => {
        let signal!: AbortSignal; let resolve!: (value: unknown) => void;
        api.get.mockImplementation((_url: string, options: {signal: AbortSignal}) => { signal=options.signal; return new Promise(done=>{resolve=done;}); });
        mount(); await until(() => expect(signal).toBeDefined()); act(()=>root.render(null)); expect(signal.aborted).toBe(true);
        await act(async()=>{resolve({data:{data:[supplier]}});}); expect(client.getQueryData(['inventory','suppliers',{readerId:'reader-a'}])).toBeUndefined();
    });
});

describe('supplier denial persists by query and authenticated reader', () => {
    it.each([401,403])('keeps denied data hidden through 500, remount, reset and canceled late success (%s)', async status => {
        client.setDefaultOptions({queries:{retry:false,gcTime:Infinity}});
        api.get.mockImplementation(success); mount(); await until(()=>expect(host.textContent).toContain('SYNTHETIC_CONTACT')); await click('Edit');
        api.get.mockRejectedValue(failure(status)); await refresh(['inventory','suppliers']);
        await until(()=>expect(host.textContent).toContain('存取被拒絕'));
        api.get.mockRejectedValue(failure(500)); await click('重試供應商清單');
        await until(()=>expect(client.isFetching()).toBe(0));
        const hidden = () => { expect(host.textContent).not.toContain('fixture@example.test'); expect(host.textContent).not.toContain('Last loaded: 1'); expect(host.textContent).not.toContain('Edit'); expect(button('Add Supplier').disabled).toBe(true); expect(host.querySelector('input')).toBeNull(); };
        hidden(); act(()=>root.render(null)); mount(); await until(()=>expect(client.isFetching()).toBe(0)); hidden();
        // A successful read for another identity cannot unlock reader-a's query.
        api.get.mockResolvedValue({data:{data:[]}}); mount('reader-b'); await until(()=>expect(host.textContent).toContain('No suppliers found'));
        api.get.mockRejectedValue(failure(500)); mount(); await until(()=>expect(client.isFetching()).toBe(0)); hidden();
        let resolve!: (value: unknown)=>void; let signal!: AbortSignal;
        api.get.mockImplementation((_url: string, options: {signal:AbortSignal})=>{signal=options.signal; return new Promise(done=>{resolve=done;});});
        await click('重試供應商清單'); await until(()=>expect(signal).toBeDefined()); hidden();
        await act(async()=>{await client.cancelQueries({queryKey:['inventory','suppliers']});}); expect(signal.aborted).toBe(true);
        await act(async()=>{resolve({data:{data:[supplier]}});}); hidden();
        // Reset clears React Query's error but cannot clear the denied-read marker.
        act(()=>{void client.resetQueries({queryKey:['inventory','suppliers',{readerId:'reader-a'}],exact:true});});
        await until(()=>expect(client.isFetching()).toBe(1)); hidden();
        await act(async()=>{resolve({data:{data:[supplier]}});}); await until(()=>expect(host.textContent).toContain('fixture@example.test'));
        expect(host.querySelector('input')).toBeNull(); expect(button('Add Supplier').disabled).toBe(false);
        expect(api.post).not.toHaveBeenCalled(); expect(api.put).not.toHaveBeenCalled();
    });
    it('hides editor and data immediately on identity change or identity not ready; same-reader empty success unlocks', async () => {
        api.get.mockImplementation(success); mount(); await until(()=>expect(host.textContent).toContain('SYNTHETIC_CONTACT')); await click('Edit');
        api.get.mockImplementation(()=>new Promise(()=>{})); mount('reader-b');
        expect(host.querySelector('input')).toBeNull(); expect(host.textContent).not.toContain('fixture@example.test');
        mount(null); const before=api.get.mock.calls.length; expect(host.querySelector('input')).toBeNull(); expect(button('Add Supplier').disabled).toBe(true);
        await click('重試供應商清單'); await until(()=>expect(client.isFetching()).toBe(0)); expect(api.get).toHaveBeenCalledTimes(before);
        api.get.mockRejectedValue(failure(403)); mount(); await until(()=>expect(host.textContent).toContain('存取被拒絕'));
        api.get.mockResolvedValue({data:{data:[]}}); await click('重試供應商清單'); await until(()=>expect(host.textContent).toContain('No suppliers found'));
        expect(button('Add Supplier').disabled).toBe(false); expect(host.querySelector('input')).toBeNull();
    });
});

it('does not share denial across QueryClients; removing an owner cannot retain its denied rows', async () => {
    client.setDefaultOptions({queries:{retry:false,gcTime:Infinity}});
    api.get.mockImplementation(success); mount(); await until(()=>expect(host.textContent).toContain('SYNTHETIC_CONTACT'));
    api.get.mockRejectedValue(failure(403)); await refresh(['inventory','suppliers']); await until(()=>expect(host.textContent).toContain('存取被拒絕'));
    const deniedClient=client; act(()=>root.render(null));
    client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
    api.get.mockImplementation(success); mount(); await until(()=>expect(host.textContent).toContain('SYNTHETIC_CONTACT'));
    const otherClient=client; act(()=>root.render(null)); client=deniedClient;
    api.get.mockRejectedValue(failure(500)); mount(); await until(()=>expect(host.textContent).toContain('存取被拒絕')); expect(host.textContent).not.toContain('fixture@example.test');
    act(()=>root.render(null)); client.removeQueries({queryKey:['inventory','suppliers']});
    expect(client.getQueriesData({queryKey:['inventory','suppliers']})).toHaveLength(0);
    mount(); await until(()=>expect(host.textContent).toContain('資料尚不可用')); expect(host.textContent).not.toContain('fixture@example.test');
    otherClient.clear();
});

it('does not present an old empty supplier result as a currently successful empty state', async () => {
    api.get.mockResolvedValue({ data: { data: [] } }); mount();
    await until(() => expect(host.textContent).toContain('No suppliers found'));
    api.get.mockRejectedValue(failure(500)); await refresh(['inventory', 'suppliers']);
    await until(() => expect(host.textContent).toContain('可能已過期'));
    expect(host.textContent).not.toContain('No suppliers found');
    expect(host.textContent).toContain('Last loaded: 0 suppliers');
    api.get.mockResolvedValue({ data: { data: [] } }); await click('重試供應商清單');
    await until(() => expect(host.textContent).toContain('No suppliers found'));
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(api.post).not.toHaveBeenCalled(); expect(api.put).not.toHaveBeenCalled();
});
