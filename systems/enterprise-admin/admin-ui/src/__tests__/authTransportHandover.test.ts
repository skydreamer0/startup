import axios, { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAdminJsonApiClient } from '../api/requestLifecycle';
import { advanceAuthGeneration } from '../api/authSession';

function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const originalAdapter = axios.defaults.adapter;
const response = (config: InternalAxiosRequestConfig, data: unknown, status = 200) => ({ config, data, status, statusText: String(status), headers: {} });
const failure = (config: InternalAxiosRequestConfig, status = 401) => new AxiosError('synthetic transport', 'ERR_BAD_REQUEST', config, {}, response(config, {}, status));
const setActor = (actor: string) => { localStorage.setItem('accessToken', `synthetic-access-${actor}`); localStorage.setItem('refreshToken', `synthetic-refresh-${actor}`); };
beforeEach(() => { localStorage.clear(); });
afterEach(() => { axios.defaults.adapter = originalAdapter; localStorage.clear(); });

describe('real Axios interceptor identity handover', () => {
    const options = { baseURL: '/api/v1/admin', accessTokenKey: 'accessToken', refreshTokenKey: 'refreshToken', refreshPath: '/api/v1/admin/auth/refresh', loginPath: '/login' };
    for (const resolution of ['success', 'failure'] as const) it(`old in-flight refresh ${resolution} cannot mutate a new actor`, async () => {
        setActor('A');
        const refresh = deferred<ReturnType<typeof response>>();
        const started = deferred<InternalAxiosRequestConfig>();
        axios.defaults.adapter = (async config => { started.resolve(config); return refresh.promise; }) as AxiosAdapter;
        const api = createAdminJsonApiClient({ baseURL: '/api/v1/admin', accessTokenKey: 'accessToken', refreshTokenKey: 'refreshToken', refreshPath: '/api/v1/admin/auth/refresh', loginPath: '/login' });
        let calls = 0;
        api.defaults.adapter = async config => { if (++calls === 1) throw failure(config); return response(config, { privateOldResponse: true }); };
        const pending = api.get('/reports/cashflow').then(() => 'resolved', () => 'rejected');
        const config = await started.promise;
        setActor('B');
        if (resolution === 'success') refresh.resolve(response(config, { data: { accessToken: 'synthetic-refreshed-A' } }));
        else refresh.reject(new Error('synthetic old refresh failure'));
        await pending;
        expect(localStorage.getItem('accessToken')).toBe('synthetic-access-B');
        expect(localStorage.getItem('refreshToken')).toBe('synthetic-refresh-B');
        expect(calls).toBe(1);
    });
    it('old 401 cannot use the newer actor refresh credential or replay the old request', async () => {
        setActor('A'); const transport = deferred<ReturnType<typeof response>>(); const started = deferred<InternalAxiosRequestConfig>(); let refreshes = 0;
        axios.defaults.adapter = async config => { refreshes++; return response(config, { data: { accessToken: 'synthetic-refreshed-B' } }); };
        const api = createAdminJsonApiClient({ baseURL: '/api/v1/admin', accessTokenKey: 'accessToken', refreshTokenKey: 'refreshToken', refreshPath: '/api/v1/admin/auth/refresh', loginPath: '/login' });
        let calls = 0;
        api.defaults.adapter = async config => { if (++calls === 1) { started.resolve(config); return transport.promise; } return response(config, { oldRequestReplayedUnderNewActor: true }); };
        const pending = api.get('/reports/cashflow').then(() => 'resolved', () => 'rejected');
        const config = await started.promise; setActor('B'); transport.reject(failure(config)); await pending;
        expect(refreshes).toBe(0); expect(calls).toBe(1); expect(localStorage.getItem('accessToken')).toBe('synthetic-access-B');
    });
    it('same-token ABA handover invalidates an old request before it can refresh', async () => {
        setActor('A'); const pending = deferred<ReturnType<typeof response>>(); let config!: InternalAxiosRequestConfig; let refreshes = 0;
        axios.defaults.adapter = async request => { refreshes++; return response(request, {}); }; const api = createAdminJsonApiClient(options);
        api.defaults.adapter = async request => { config = request; return pending.promise; };
        const result = api.get('/reports/cashflow').catch(error => error); expect(config).toBeDefined(); advanceAuthGeneration(); setActor('A'); pending.reject(failure(config));
        expect(axios.isCancel(await result)).toBe(true); expect(refreshes).toBe(0); expect(localStorage.getItem('accessToken')).toBe('synthetic-access-A');
    });
    it('stale stamped replay is a cancellation before any second HTTP dispatch', async () => {
        setActor('A'); const api = createAdminJsonApiClient(options); let config!: InternalAxiosRequestConfig; let calls = 0;
        api.defaults.adapter = async request => { calls++; config = request; return response(request, {}); };
        await api.get('/reports/cashflow'); advanceAuthGeneration(); const error = await api(config).catch(value => value);
        expect(axios.isCancel(error)).toBe(true); expect(calls).toBe(1);
    });
    it('private refresh snapshots are absent from serialized request errors', async () => {
        setActor('A'); const api = createAdminJsonApiClient(options);
        api.defaults.adapter = async request => { throw failure(request, 500); };
        const error = await api.get('/reports/cashflow').catch(value => value);
        expect(JSON.stringify(error)).not.toContain('synthetic-refresh-A');
        expect(JSON.stringify(error.config)).not.toContain('synthetic-refresh-A');
        expect(Object.keys(error.config)).not.toContain('_authSession');
    });
    it('ordinary current-session refresh retries once and carries cancellation to its real adapter', async () => {
        setActor('A'); const controller = new AbortController(); let refreshes = 0;
        axios.defaults.adapter = async request => { refreshes++; expect(request.signal).toBe(controller.signal); return response(request, { data: { accessToken: 'synthetic-refreshed-A' } }); };
        const api = createAdminJsonApiClient(options); let calls = 0;
        api.defaults.adapter = async request => { if (++calls === 1) throw failure(request); expect(request.headers.Authorization).toBe('Bearer synthetic-refreshed-A'); return response(request, { ok: true }); };
        expect((await api.get('/reports/cashflow', { signal: controller.signal })).data).toEqual({ ok: true }); expect(calls).toBe(2); expect(refreshes).toBe(1);
    });
    for (const endpoint of ['/auth/login', '/auth/logout', '/auth/refresh']) it(`${endpoint} denial never triggers automatic identity refresh/replay`, async () => {
        setActor('A'); let refreshes = 0; axios.defaults.adapter = async request => { refreshes++; return response(request, {}); };
        const api = createAdminJsonApiClient(options); let calls = 0; api.defaults.adapter = async request => { calls++; throw failure(request); };
        await expect(api.post(endpoint, {})).rejects.toBeInstanceOf(AxiosError); expect(calls).toBe(1); expect(refreshes).toBe(0); expect(localStorage.getItem('accessToken')).toBe('synthetic-access-A');
    });
});
