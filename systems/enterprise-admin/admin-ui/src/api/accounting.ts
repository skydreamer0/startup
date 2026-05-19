import api from './client';

export interface AccountingProviderInfo {
    name: 'mock' | 'quickbooks' | 'xero';
    configured: boolean;
}

export interface AccountingSyncLog {
    id: string;
    provider: string;
    entityType: 'order' | 'expense';
    entityId: string;
    externalId: string | null;
    status: 'pending' | 'synced' | 'failed';
    errorMessage: string | null;
    syncedAt: string | null;
    createdAt: string;
}

export interface AccountingSyncStatus {
    total: number;
    page: number;
    limit: number;
    data: AccountingSyncLog[];
}

export interface AccountingSyncResult {
    log: AccountingSyncLog;
    alreadySynced: boolean;
}

export const accountingApi = {
    getProviderInfo: async (): Promise<AccountingProviderInfo> => {
        const { data } = await api.get('/accounting/provider');
        return data.data;
    },
    getSyncStatus: async (params?: {
        entityType?: 'order' | 'expense';
        status?: 'pending' | 'synced' | 'failed';
        page?: number;
        limit?: number;
    }): Promise<AccountingSyncStatus> => {
        const { data } = await api.get('/accounting/sync/status', { params });
        return data.data;
    },
    syncOrder: async (orderId: string): Promise<AccountingSyncResult> => {
        const { data } = await api.post(`/accounting/sync/orders/${orderId}`);
        return data.data;
    },
    syncExpense: async (expenseId: string): Promise<AccountingSyncResult> => {
        const { data } = await api.post(`/accounting/sync/expenses/${expenseId}`);
        return data.data;
    },
};
