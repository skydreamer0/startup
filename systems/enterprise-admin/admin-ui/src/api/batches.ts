import api from './client';

export interface ProductBatch {
    id: string;
    productId: string;
    tenantId: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    costPrice: number;
    receivedAt: string;
    product?: {
        name: string;
        sku: string;
    };
}

export interface DailySettlement {
    id: string;
    shiftId: string;
    date: string;
    totalSales: number;
    totalOrders: number;
    cashAmount: number;
    cardAmount: number;
    linePayAmount: number;
    otherAmount: number;
    confirmedAt: string | null;
    notes?: string;
    shift?: {
        id: string;
        staff?: {
            fullName: string;
        };
    };
}

export const batchesApi = {
    getAll: async (filters: { productId?: string; expiringSoon?: boolean } = {}) => {
        const params: Record<string, string> = {};
        if (filters.productId) params.productId = filters.productId;
        if (filters.expiringSoon) params.expiringSoon = 'true';
        const { data } = await api.get('/product-batches', { params });
        return data;
    },

    create: async (payload: {
        productId: string;
        batchNumber: string;
        expiryDate: string;
        quantity: number;
        costPrice: number;
    }) => {
        const { data } = await api.post('/product-batches', payload);
        return data;
    },

    update: async (id: string, payload: { quantity?: number; notes?: string }) => {
        const { data } = await api.patch(`/product-batches/${id}`, payload);
        return data;
    },

    delete: async (id: string) => {
        const { data } = await api.delete(`/product-batches/${id}`);
        return data;
    },
};

export const settlementsApi = {
    getAll: async (filters: { shiftId?: string } = {}) => {
        const { data } = await api.get('/daily-settlements', { params: filters });
        return data;
    },

    calculate: async (shiftId: string) => {
        const { data } = await api.post('/daily-settlements/calculate', { shiftId });
        return data;
    },

    create: async (payload: {
        shiftId: string;
        date: string;
        totalSales: number;
        totalOrders: number;
        cashAmount: number;
        cardAmount: number;
        linePayAmount: number;
        otherAmount: number;
        notes?: string;
    }) => {
        const { data } = await api.post('/daily-settlements', payload);
        return data;
    },

    confirm: async (id: string) => {
        const { data } = await api.post(`/daily-settlements/${id}/confirm`);
        return data;
    },
};
