import api from './client';

export interface Shift {
    id: string;
    staffId: string;
    status: 'OPEN' | 'CLOSED';
    openingCash: number | null;
    closingCash: number | null;
    openedAt: string;
    closedAt: string | null;
    notes: string | null;
    staff?: {
        id: string;
        fullName: string;
        email: string;
    };
    _count?: {
        orders: number;
    };
}

export const shiftsApi = {
    getAll: async (filters: { status?: string } = {}) => {
        const { data } = await api.get('/shifts', { params: filters });
        return data;
    },

    getById: async (id: string) => {
        const { data } = await api.get(`/shifts/${id}`);
        return data;
    },

    create: async (payload: { staffId: string; openingCash?: number; notes?: string }) => {
        const { data } = await api.post('/shifts', payload);
        return data;
    },

    close: async (id: string, payload: { closingCash: number; notes?: string }) => {
        const { data } = await api.patch(`/shifts/${id}/close`, payload);
        return data;
    },

    delete: async (id: string) => {
        const { data } = await api.delete(`/shifts/${id}`);
        return data;
    },
};
