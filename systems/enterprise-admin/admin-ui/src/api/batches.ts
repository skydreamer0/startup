import api from './client';

export interface ProductBatch {
    id: string;
    productId: string;
    tenantId: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    status: 'RELEASED' | 'QUARANTINE' | 'BLOCKED';
    /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
    costPrice: number | string;
    receivedAt: string;
    product?: {
        name: string;
        sku: string;
    };
}

export interface BatchChangeRecord {
    id: string;
    tenantId: string;
    batchId: string;
    actorId: string;
    operation: 'STATUS' | 'EXPIRY' | 'COST' | 'INITIAL_RELEASE';
    before: { status: ProductBatch['status']; expiryDate: string; costPrice: string } | { exists: false };
    after: { status: ProductBatch['status']; expiryDate: string; costPrice: string };
    reason: string;
    createdAt: string;
}

export interface DailySettlement {
    id: string;
    shiftId: string;
    date: string;
    /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
    totalSales: number | string;
    totalOrders: number;
    /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
    cashAmount: number | string;
    /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
    cardAmount: number | string;
    /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
    linePayAmount: number | string;
    /** Prisma Decimal serialises as string in JSON — use Number() before arithmetic. */
    otherAmount: number | string;
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
        status?: ProductBatch['status'];
        reason?: string;
    }) => {
        const { data } = await api.post('/product-batches', payload);
        return data;
    },

    changeStatus: async (id: string, payload: { status: ProductBatch['status']; reason: string }) => {
        const { data } = await api.post(`/product-batches/${id}/status`, payload);
        return data;
    },
    correctExpiry: async (id: string, payload: { expiryDate: string; reason: string }) => {
        const { data } = await api.post(`/product-batches/${id}/expiry-corrections`, payload);
        return data;
    },
    correctCost: async (id: string, payload: { costPrice: number; reason: string }) => {
        const { data } = await api.post(`/product-batches/${id}/cost-corrections`, payload);
        return data;
    },
    history: async (id: string, cursor?: string): Promise<{ items: BatchChangeRecord[]; nextCursor: string | null }> => {
        const { data } = await api.get(`/product-batches/${id}/history`, { params: cursor ? { cursor } : {} });
        return data.data;
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
