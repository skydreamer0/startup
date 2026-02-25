import api from './client';

export interface Expense {
    id: string;
    type: string;
    amount: number;
    description?: string;
    period: string;
    createdAt: string;
}

export const expensesApi = {
    getExpenses: async (query?: { period?: string; type?: string; page?: string; limit?: string }) => {
        const params = new URLSearchParams();
        if (query?.period) params.set('period', query.period);
        if (query?.type) params.set('type', query.type);
        if (query?.page) params.set('page', query.page);
        if (query?.limit) params.set('limit', query.limit);
        const { data } = await api.get(`/expenses?${params.toString()}`);
        return data.data;
    },
    createExpense: async (body: { type: string; amount: number; description?: string; period: string }): Promise<Expense> => {
        const { data } = await api.post('/expenses', body);
        return data.data;
    },
    updateExpense: async (id: string, body: Partial<{ type: string; amount: number; description: string; period: string }>): Promise<Expense> => {
        const { data } = await api.put(`/expenses/${id}`, body);
        return data.data;
    },
    deleteExpense: async (id: string): Promise<void> => {
        await api.delete(`/expenses/${id}`);
    },
};
