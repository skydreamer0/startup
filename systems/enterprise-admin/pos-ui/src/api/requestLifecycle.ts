import axios, { type AxiosError, type AxiosInstance } from 'axios';

export interface PosJsonClientOptions {
  baseURL: string;
  accessTokenKey: string;
  loginPath: string;
}

function clearPosAuthAndRedirect(accessTokenKey: string, loginPath: string): void {
  localStorage.removeItem(accessTokenKey);
  window.location.href = loginPath;
}

export function createPosJsonApiClient(options: PosJsonClientOptions): AxiosInstance {
  const api = axios.create({
    baseURL: options.baseURL,
    headers: { 'Content-Type': 'application/json' },
  });

  api.interceptors.request.use((config) => {
    const token = localStorage.getItem(options.accessTokenKey);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  });

  api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      if (error.response?.status === 401) {
        clearPosAuthAndRedirect(options.accessTokenKey, options.loginPath);
      }
      return Promise.reject(error);
    },
  );

  return api;
}
