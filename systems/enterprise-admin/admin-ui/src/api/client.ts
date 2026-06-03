import { createAdminJsonApiClient } from './requestLifecycle';

const api = createAdminJsonApiClient({
    baseURL: '/api/v1/admin',
    accessTokenKey: 'accessToken',
    refreshTokenKey: 'refreshToken',
    refreshPath: '/api/v1/admin/auth/refresh',
    loginPath: '/login',
});

export default api;
