import axios, { CanceledError, type AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import { advanceAuthGeneration, currentAuthGeneration } from './authSession';

type RequestSession = { generation: number; accessToken: string | null; refreshToken: string | null };
type RetryableRequestConfig = AxiosRequestConfig & { _retry?: boolean; _authGeneration?: number };

export interface AdminJsonClientOptions {
    baseURL: string;
    accessTokenKey: string;
    refreshTokenKey: string;
    refreshPath: string;
    loginPath: string;
}

export interface BlobDownloadClient {
    get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<{ data: T }>;
}

function clearAuthAndRedirect(loginPath: string): void {
    advanceAuthGeneration();
    localStorage.clear();
    window.location.href = loginPath;
}

function dispatchPlanUpgradeToast(error: AxiosError): void {
    const data = error.response?.data as { error?: { code?: string; message?: string } } | undefined;
    if (data?.error?.code !== 'PLAN_UPGRADE_REQUIRED') return;

    window.dispatchEvent(new CustomEvent('plan-upgrade-required', {
        detail: { message: data.error.message ?? '此功能需要升級方案' },
    }));
}

async function refreshAccessToken(refreshPath: string, refreshToken: string | null, signal?: AxiosRequestConfig['signal']): Promise<string | null> {
    if (!refreshToken) return null;

    const response = await axios.post(refreshPath, { refreshToken }, { signal });
    const newToken = response.data?.data?.accessToken;
    return typeof newToken === 'string' ? newToken : null;
}

export function createAdminJsonApiClient(options: AdminJsonClientOptions): AxiosInstance {
    const api = axios.create({
        baseURL: options.baseURL,
        headers: { 'Content-Type': 'application/json' },
    });

    // Credential snapshots stay out of Axios config/error serialization.
    const sessions = new WeakMap<object, RequestSession>();
    function captureSession(): RequestSession {
        return { generation: currentAuthGeneration(), accessToken: localStorage.getItem(options.accessTokenKey), refreshToken: localStorage.getItem(options.refreshTokenKey) };
    }
    function isCurrent(config: RetryableRequestConfig): boolean {
        const previous = sessions.get(config);
        const current = captureSession();
        return !config.signal?.aborted && !!previous && previous.generation === current.generation
            && previous.accessToken === current.accessToken && previous.refreshToken === current.refreshToken;
    }
    function staleSession(): CanceledError<unknown> { return new CanceledError('Authentication intent changed'); }
    function isSessionEndpoint(config: RetryableRequestConfig): boolean {
        return ['/auth/login', '/auth/logout', '/auth/refresh', options.refreshPath].includes(config.url ?? '');
    }

    api.interceptors.request.use((config) => {
        const request = config as typeof config & RetryableRequestConfig;
        if (request._authGeneration !== undefined && request._authGeneration !== currentAuthGeneration()) throw staleSession();
        const session = captureSession();
        request._authGeneration = session.generation;
        sessions.set(request, session);
        if (session.accessToken) config.headers.Authorization = `Bearer ${session.accessToken}`;
        return config;
    }, (error) => { throw error; }, { synchronous: true });

    api.interceptors.response.use(
        (response) => {
            if (!isCurrent(response.config as RetryableRequestConfig)) throw staleSession();
            return response;
        },
        async (error: AxiosError) => {
            const originalRequest = error.config as RetryableRequestConfig | undefined;
            if (originalRequest && !isCurrent(originalRequest)) return Promise.reject(staleSession());

            if (error.response?.status === 401 && originalRequest && !originalRequest._retry && !isSessionEndpoint(originalRequest)) {
                originalRequest._retry = true;
                try {
                    const newToken = await refreshAccessToken(options.refreshPath, sessions.get(originalRequest)!.refreshToken, originalRequest.signal);
                    if (!isCurrent(originalRequest)) return Promise.reject(staleSession());
                    if (newToken) {
                        localStorage.setItem(options.accessTokenKey, newToken);
                        sessions.set(originalRequest, captureSession());
                        originalRequest.headers = originalRequest.headers ?? {};
                        originalRequest.headers.Authorization = `Bearer ${newToken}`;
                        return api(originalRequest);
                    }
                } catch {
                    if (!isCurrent(originalRequest)) return Promise.reject(staleSession());
                    clearAuthAndRedirect(options.loginPath);
                    return Promise.reject(error);
                }
                if (isCurrent(originalRequest)) clearAuthAndRedirect(options.loginPath);
            }

            if (error.response?.status === 403) dispatchPlanUpgradeToast(error);
            return Promise.reject(error);
        },
    );

    return api;
}

export async function downloadAuthenticatedBlob(client: BlobDownloadClient, url: string): Promise<Blob> {
    const response = await client.get<Blob>(url, { responseType: 'blob' });
    return response.data;
}

export function saveBlob(blob: Blob, filename: string): void {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
}
