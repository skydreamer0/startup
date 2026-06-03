import api from './client';
import type { ApiSuccess, Customer, Interaction, PaginatedData } from '@pharmasaas/types';

export type { Customer, Interaction };

export type CustomerListResponse = PaginatedData<Customer>;

export const crmApi = {
    getCustomers: async (params?: { type?: string; hasLine?: string; page?: string }) => {
        const { data } = await api.get<ApiSuccess<CustomerListResponse>>('/crm/customers', { params });
        return data.data;
    },

    getCustomerById: async (id: string) => {
        const { data } = await api.get<ApiSuccess<Customer>>(`/crm/customers/${id}`);
        return data.data;
    },

    addInteraction: async (customerId: string, payload: { type: string; content?: string }) => {
        const { data } = await api.post<ApiSuccess<Interaction>>(`/crm/customers/${customerId}/interactions`, payload);
        return data.data;
    },
};
