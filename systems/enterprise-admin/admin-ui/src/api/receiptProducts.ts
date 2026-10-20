import { inventoryApi } from './inventory';

// This form only consumes a choice identity and its visible label. Validate those
// fields before publishing a query result; a TypeScript response type is not a
// runtime check and must not let malformed rows crash the receipt dialog.
export type ReceiptProductChoice = { id: string; sku: string; name: string };
type ReceiptProductPage = { total: number; page: number; limit: number; data: ReceiptProductChoice[] };
const malformed = () => new Error('可收貨商品資料格式不符，請重新載入。');
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

export function parseReceiptProductPage(value: unknown, requestedPage: number): ReceiptProductPage {
    if (!record(value) || !integer(value.total) || value.total < 0
        || !integer(value.page) || value.page !== requestedPage
        || !integer(value.limit) || value.limit < 1 || !Array.isArray(value.data)
        || value.data.length > value.limit || value.data.length > value.total) throw malformed();
    const seen = new Set<string>();
    const data = value.data.map((row: unknown): ReceiptProductChoice => {
        if (!record(row) || !text(row.id) || !text(row.sku) || !text(row.name) || seen.has(row.id)) throw malformed();
        seen.add(row.id);
        return { id: row.id, sku: row.sku, name: row.name };
    });
    return { total: value.total, page: value.page, limit: value.limit, data };
}

export async function loadReceiptProductChoices(): Promise<ReceiptProductChoice[]> {
    const all: ReceiptProductChoice[] = [];
    const seen = new Set<string>();
    let expectedTotal: number | undefined;
    let expectedLimit: number | undefined;
    for (let page = 1; ; page++) {
        const result = parseReceiptProductPage(await inventoryApi.getProducts({ page: String(page) }), page);
        expectedTotal ??= result.total; expectedLimit ??= result.limit;
        if (result.total !== expectedTotal || result.limit !== expectedLimit) throw malformed();
        for (const row of result.data) {
            if (seen.has(row.id)) throw malformed();
            seen.add(row.id); all.push(row);
        }
        if (all.length > result.total || (result.data.length === 0 && all.length < result.total)) throw malformed();
        if (all.length === result.total) return all;
    }
}
