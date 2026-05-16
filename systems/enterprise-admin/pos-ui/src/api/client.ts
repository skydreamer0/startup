import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1/admin',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pos_accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('pos_accessToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;
