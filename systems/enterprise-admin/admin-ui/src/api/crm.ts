import api from './client';

export interface Customer {
    id: string;
    name?: string;
    phone?: string;
    lineUid?: string;
    totalSpent: number;
    purchaseCount: number;
    lastInteractionDate?: string;
}

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
