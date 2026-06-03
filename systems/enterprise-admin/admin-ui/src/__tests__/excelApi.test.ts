import { beforeEach, describe, expect, it, vi } from 'vitest';

const downloadBlob = vi.fn();

vi.mock('../lib/downloadBlob', () => ({ downloadBlob }));
vi.mock('../api/client', () => ({ default: { post: vi.fn() } }));

describe('excelApi exports', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-06-03T10:00:00.000Z'));
    });

    it('downloads export files through admin-client relative paths', async () => {
        const { excelApi } = await import('../api/excel');

        excelApi.exportProducts();
        excelApi.exportOrders('2026-06-01', '2026-06-03');

        expect(downloadBlob).toHaveBeenNthCalledWith(1, '/excel/export/products', 'products-2026-06-03.xlsx');
        expect(downloadBlob).toHaveBeenNthCalledWith(
            2,
            '/excel/export/orders?from=2026-06-01&to=2026-06-03',
            'orders-2026-06-03.xlsx',
        );
    });
});
