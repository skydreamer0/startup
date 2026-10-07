import api from './client';
import type { ApiSuccess, Product, Supplier } from '@pharmasaas/types';

export type { Product, Supplier };

export const inventoryApi = {
    // Suppliers
    getSuppliers: async (): Promise<Supplier[]> => {
        const { data } = await api.get<ApiSuccess<Supplier[]>>('/inventory/suppliers');
        return data.data;
    },
    getSupplierById: async (id: string) => {
        const { data } = await api.get(`/inventory/suppliers/${id}`);
        return data.data;
    },
    createSupplier: async (payload: Partial<Supplier>) => {
        const { data } = await api.post('/inventory/suppliers', payload);
        return data.data;
    },
    updateSupplier: async (id: string, payload: Partial<Supplier>) => {
        const { data } = await api.put(`/inventory/suppliers/${id}`, payload);
        return data.data;
    },

    // Products
    getProducts: async (params?: { lowStock?: string; page?: string }) => {
        const { data } = await api.get('/inventory/products', { params });
        return data.data;
    },
    getProductById: async (id: string) => {
        const { data } = await api.get(`/inventory/products/${id}`);
        return data.data;
    },
    createProduct: async (payload: Partial<Product>) => {
        const { data } = await api.post('/inventory/products', payload);
        return data.data;
    },
    updateProduct: async (id: string, payload: Partial<Product>) => {
        const { data } = await api.put(`/inventory/products/${id}`, payload);
        return data.data;
    },
};
