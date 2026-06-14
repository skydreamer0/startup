import api from './client';
import type { Order } from '@pharmasaas/types';

export type { Order };

export const ordersApi = {
    getOrders: async (filters: { customerId?: string; status?: string } = {}) => {
        const { data } = await api.get('/orders', { params: filters });
        return data;
    },

    getOrderById: async (id: string) => {
        const { data } = await api.get(`/orders/${id}`);
        return data;
    },

    createOrder: async (data: Record<string, unknown>) => {
        const response = await api.post('/orders', data);
        return response.data;
    },

    updateStatus: async (id: string, status: string) => {
        const { data } = await api.patch(`/orders/${id}/status`, { status });
        return data;
    }
};
