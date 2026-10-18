import api from './client';

export interface StockReconciliationRow {
    id: string; sku: string; name: string; stockUnitLabel: string | null;
    stockQuantity: number; physicalBatchQuantity: number; difference: number; batchCount: number;
    releasedQuantity: number; quarantineQuantity: number; blockedQuantity: number;
    expiredQuantity: number; eligibleReleasedQuantity: number;
    negativeBatchCount: number; untracedReceiptCount: number;
    reservedQuantity: null; availableQuantity: null; historyComplete: null;
}
export interface StockReconciliationPage {
    total: number; page: number; limit: number; observedAt: string; expiryCutoff: string;
    data: StockReconciliationRow[];
}
export async function getStockReconciliation(page: number, signal?: AbortSignal): Promise<StockReconciliationPage> {
    const response = await api.get<{ success: boolean; data: StockReconciliationPage }>(
        '/inventory/stock-reconciliation', { params: { page }, signal });
    return response.data.data;
}
