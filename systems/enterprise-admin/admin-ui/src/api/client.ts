import axios from 'axios';

const api = axios.create({
    baseURL: '/api/v1/admin',
    headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — inject JWT
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor — handle 401 (token expired)
api.interceptors.response.use(
    (res) => res,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            const refreshToken = localStorage.getItem('refreshToken');
            if (refreshToken) {
                try {
                    const res = await axios.post('/api/v1/admin/auth/refresh', { refreshToken });
                    const newToken = res.data.data.accessToken;
                    localStorage.setItem('accessToken', newToken);
                    originalRequest.headers.Authorization = `Bearer ${newToken}`;
                    return api(originalRequest);
                } catch {
                    localStorage.clear();
                    window.location.href = '/login';
                }
            } else {
                localStorage.clear();
                window.location.href = '/login';
            }
        }

        if (error.response?.status === 403) {
            const code = error.response?.data?.error?.code;
            if (code === 'PLAN_UPGRADE_REQUIRED') {
                const msg = error.response.data.error.message ?? '此功能需要升級方案';
                window.dispatchEvent(new CustomEvent('plan-upgrade-required', { detail: { message: msg } }));
                return Promise.reject(error);
            }
        }

        return Promise.reject(error);
    },
);

export default api;
