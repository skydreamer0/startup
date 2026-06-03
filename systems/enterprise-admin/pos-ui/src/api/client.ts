import { createPosJsonApiClient } from './requestLifecycle';

const api = createPosJsonApiClient({
  baseURL: '/api/v1/admin',
  accessTokenKey: 'pos_accessToken',
  loginPath: '/login',
});

export default api;
