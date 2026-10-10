import api from './client';

export interface BatchTrace {
    id: string;
    tenantId: string;
    batchNumber: string;
    product: { name: string; sku: string };
    receiptMovements: { id: string; quantity: number; createdAt: string }[];
    saleAllocations: {
        id: string;
        quantity: number;
        movementId: string;
        orderItemId: string;
        createdAt: string;
        expiryDateAtSale: string;
        order: { id: string; orderNumber: string | null };
    }[];
    totalAllocations: number;
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function string(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function date(value: unknown): value is string { return string(value) && Number.isFinite(Date.parse(value)); }
function invalid(): never { throw new Error('批次來源資料格式不符，無法確認追溯結果。'); }

/** Validate only the existing read contract; never infer missing historical links. */
export function parseBatchTrace(value: unknown, batchId: string, tenantId: string): BatchTrace {
    if (!record(value) || value.success !== true || !record(value.data)) return invalid();
    const data = value.data;
    if (data.id !== batchId || data.tenantId !== tenantId || !string(data.batchNumber)
        || !record(data.product) || !string(data.product.name) || !string(data.product.sku)
        || !Array.isArray(data.receiptMovements) || !Array.isArray(data.saleAllocations)
        || !record(data._count) || !integer(data._count.saleAllocations)
        || data.saleAllocations.length > 100 || data.saleAllocations.length !== Math.min(data._count.saleAllocations, 100)) return invalid();
    const receiptMovements = data.receiptMovements.map((row: unknown) => {
        if (!record(row) || !string(row.id) || row.batchId !== batchId || row.tenantId !== tenantId
            || row.type !== 'IN' || !integer(row.quantity) || row.quantity === 0 || !date(row.createdAt)) return invalid();
        return { id: row.id, quantity: row.quantity, createdAt: row.createdAt };
    });
    const saleAllocations = data.saleAllocations.map((row: unknown) => {
        if (!record(row) || !string(row.id) || row.batchId !== batchId || row.tenantId !== tenantId
            || !integer(row.quantity) || row.quantity === 0 || !string(row.movementId) || !string(row.orderItemId)
            || !date(row.createdAt) || !date(row.expiryDateAtSale) || !record(row.order)
            || !string(row.order.id) || row.orderId !== row.order.id
            || (row.order.orderNumber !== null && !string(row.order.orderNumber))) return invalid();
        return { id: row.id, quantity: row.quantity, movementId: row.movementId, orderItemId: row.orderItemId,
            createdAt: row.createdAt, expiryDateAtSale: row.expiryDateAtSale, order: { id: row.order.id, orderNumber: row.order.orderNumber } };
    });
    if (new Set(receiptMovements.map(row => row.id)).size !== receiptMovements.length
        || new Set(saleAllocations.map(row => row.id)).size !== saleAllocations.length) return invalid();
    return { id: batchId, tenantId, batchNumber: data.batchNumber, product: { name: data.product.name, sku: data.product.sku },
        receiptMovements, saleAllocations, totalAllocations: data._count.saleAllocations };
}

export async function getBatchTrace(batchId: string, tenantId: string, signal?: AbortSignal): Promise<BatchTrace> {
    const response = await api.get<unknown>(`/product-batches/${encodeURIComponent(batchId)}`, { signal });
    return parseBatchTrace(response.data, batchId, tenantId);
}
