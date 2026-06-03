import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig } from 'axios';

type RetryableRequestConfig = AxiosRequestConfig & { _retry?: boolean };

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

async function refreshAccessToken(refreshPath: string, refreshTokenKey: string): Promise<string | null> {
    const refreshToken = localStorage.getItem(refreshTokenKey);
    if (!refreshToken) return null;

    const response = await axios.post(refreshPath, { refreshToken });
    const newToken = response.data?.data?.accessToken;
    return typeof newToken === 'string' ? newToken : null;
}

export function createAdminJsonApiClient(options: AdminJsonClientOptions): AxiosInstance {
    const api = axios.create({
        baseURL: options.baseURL,
        headers: { 'Content-Type': 'application/json' },
    });

    api.interceptors.request.use((config) => {
        const token = localStorage.getItem(options.accessTokenKey);
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    });

    api.interceptors.response.use(
        (response) => response,
        async (error: AxiosError) => {
            const originalRequest = error.config as RetryableRequestConfig | undefined;

            if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
                originalRequest._retry = true;

                try {
                    const newToken = await refreshAccessToken(options.refreshPath, options.refreshTokenKey);
                    if (newToken) {
                        localStorage.setItem(options.accessTokenKey, newToken);
                        originalRequest.headers = originalRequest.headers ?? {};
                        originalRequest.headers.Authorization = `Bearer ${newToken}`;
                        return api(originalRequest);
                    }
                } catch {
                    clearAuthAndRedirect(options.loginPath);
                    return Promise.reject(error);
                }

                clearAuthAndRedirect(options.loginPath);
            }

            if (error.response?.status === 403) {
                dispatchPlanUpgradeToast(error);
            }

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
