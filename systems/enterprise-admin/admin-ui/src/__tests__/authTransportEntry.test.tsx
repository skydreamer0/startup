import '@testing-library/jest-dom/vitest';
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import api from '../api/client';
import { AuthProvider } from '../hooks/useAuth';
import { AuthCacheBoundary } from '../hooks/AuthCacheBoundary';
import { useAuth } from '../hooks/authContext';

const originalAdapter = axios.defaults.adapter, originalApiAdapter = api.defaults.adapter;
const response = (config: InternalAxiosRequestConfig, data: unknown, status = 200) => ({ config, data, status, statusText: String(status), headers: {} });
function Harness() { const { user, logout } = useAuth(); return <><p>{user?.id ?? 'anonymous'}</p><button onClick={logout}>Logout</button></>; }
afterEach(() => { cleanup(); axios.defaults.adapter = originalAdapter; api.defaults.adapter = originalApiAdapter; localStorage.clear(); sessionStorage.clear(); });
it('actual provider, cache and Axios keep logout authenticated and abort an old refresh without restoring identity', async () => {
    localStorage.setItem('accessToken', 'synthetic-A'); localStorage.setItem('refreshToken', 'synthetic-refresh-A');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let refreshConfig!: InternalAxiosRequestConfig, release!: (value: ReturnType<typeof response>) => void; let logoutHeader: unknown; let reports = 0;
    axios.defaults.adapter = async config => { refreshConfig = config; return new Promise(resolve => { release = resolve; }); };
    api.defaults.adapter = async config => {
        if (config.url === '/auth/me') return response(config, { data: { id: 'reader-A', permissions: [] } });
        if (config.url === '/auth/logout') { logoutHeader = config.headers.Authorization; return response(config, { data: {} }); }
        reports++; throw new AxiosError('synthetic expiry', 'ERR_BAD_REQUEST', config, {}, response(config, {}, 401));
    };
    render(<QueryClientProvider client={client}><AuthCacheBoundary><AuthProvider><Harness /></AuthProvider></AuthCacheBoundary></QueryClientProvider>);
    await screen.findByText('reader-A'); const pending = client.fetchQuery({ queryKey: ['protected-A'], queryFn: ({ signal }) => api.get('/reports/cashflow', { signal }) }).catch(() => null);
    await waitFor(() => expect(refreshConfig).toBeDefined()); fireEvent.click(screen.getByRole('button', { name: 'Logout' }));
    expect(logoutHeader).toBe('Bearer synthetic-A'); expect(refreshConfig.signal?.aborted).toBe(true);
    await act(async () => { release(response(refreshConfig, { data: { accessToken: 'synthetic-late-A' } })); await pending; });
    expect(localStorage.getItem('accessToken')).toBeNull(); expect(localStorage.getItem('refreshToken')).toBeNull(); expect(screen.getByText('anonymous')).toBeVisible(); expect(reports).toBe(1); expect(client.getQueryCache().getAll()).toHaveLength(0);
    client.clear();
});
