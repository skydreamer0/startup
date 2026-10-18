import api from './client';

export interface ProductBatchRow {
    id: string;
    productId: string;
    tenantId: string;
    batchNumber: string;
    expiryDate: string;
    quantity: number;
    status: 'RELEASED' | 'QUARANTINE' | 'BLOCKED';
    product: { id: string; name: string; sku: string };
}

function record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function invalid(): never { throw new Error('商品批次資料格式不符，無法確認查詢結果。'); }

/** Read-only ledger quantities may be negative; receipt/write validation is separate.
 * Validate the existing envelope; server auth remains the tenant authority. */
export function parseProductBatches(value: unknown, productId: string): ProductBatchRow[] {
    if (!record(value) || value.success !== true || !Array.isArray(value.data)) return invalid();
    const rows = value.data.map((row: unknown): ProductBatchRow => {
        if (!record(row) || !text(row.id) || row.productId !== productId || !text(row.tenantId)
            || !text(row.batchNumber) || !text(row.expiryDate) || !Number.isFinite(Date.parse(row.expiryDate))
            || typeof row.quantity !== 'number' || !Number.isSafeInteger(row.quantity)
            || (row.status !== 'RELEASED' && row.status !== 'QUARANTINE' && row.status !== 'BLOCKED')
            || !record(row.product) || row.product.id !== productId || !text(row.product.name) || !text(row.product.sku)) return invalid();
        return { id: row.id, productId, tenantId: row.tenantId, batchNumber: row.batchNumber,
            expiryDate: row.expiryDate, quantity: row.quantity, status: row.status,
            product: { id: productId, name: row.product.name, sku: row.product.sku } };
    });
    if (new Set(rows.map(row => row.id)).size !== rows.length
        || new Set(rows.map(row => row.tenantId)).size > 1) return invalid();
    return rows;
}

export async function getProductBatches(productId: string, signal?: AbortSignal): Promise<ProductBatchRow[]> {
    const response = await api.get<unknown>('/product-batches', { params: { productId }, signal });
    return parseProductBatches(response.data, productId);
}
