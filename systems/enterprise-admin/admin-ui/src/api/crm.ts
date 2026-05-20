import api from './client';
import type { Customer, Interaction } from '@pharmasaas/types';

export type { Customer, Interaction };

export const crmApi = {
    getCustomers: async (params?: { type?: string; hasLine?: string; page?: string }) => {
        const { data } = await api.get('/crm/customers', { params });
        return data.data; // Assuming JSend { status: 'success', data: {...} }
    },

    getCustomerById: async (id: string) => {
        const { data } = await api.get(`/crm/customers/${id}`);
        return data.data;
    },

    addInteraction: async (customerId: string, payload: { type: string; content?: string }) => {
        const { data } = await api.post(`/crm/customers/${customerId}/interactions`, payload);
        return data.data;
    },
};
