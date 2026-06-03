import api from './client';
import { downloadBlob } from '../lib/downloadBlob';

const BASE = '/excel';

function todayStamp(): string {
    return new Date().toISOString().slice(0, 10);
}

export const excelApi = {
    exportProducts: () =>
        downloadBlob(`${BASE}/export/products`, `products-${todayStamp()}.xlsx`),
    exportCustomers: () =>
        downloadBlob(`${BASE}/export/customers`, `customers-${todayStamp()}.xlsx`),
    exportOrders: (from?: string, to?: string) => {
        const qs = new URLSearchParams();
        if (from) qs.set('from', from);
        if (to) qs.set('to', to);
        const suffix = qs.toString() ? `?${qs.toString()}` : '';
        return downloadBlob(`${BASE}/export/orders${suffix}`, `orders-${todayStamp()}.xlsx`);
    },
    exportInventory: () =>
        downloadBlob(`${BASE}/export/inventory`, `inventory-${todayStamp()}.xlsx`),

    previewImportProducts: async (file: File): Promise<ImportSummary> => {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.post<{ success: boolean; data: ImportSummary }>(
            '/excel/import/products/preview',
            fd,
            { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        return res.data.data;
    },

    confirmImportProducts: async (file: File): Promise<ImportSummary> => {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.post<{ success: boolean; data: ImportSummary }>(
            '/excel/import/products/confirm',
            fd,
            { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        return res.data.data;
    },
};

export interface ImportError {
    row: number;
    message: string;
}

export interface ImportSummary {
    created: number;
    updated: number;
    errors: ImportError[];
}
