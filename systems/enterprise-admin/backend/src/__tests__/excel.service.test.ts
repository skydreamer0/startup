import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';

// ─── Mock tenant context ─────────────────────────────────
vi.mock('../lib/tenant.context', () => ({
    requireTenantId: vi.fn(() => 'test-tenant-id'),
    tenantContext: { getStore: vi.fn(() => ({ tenantId: 'test-tenant-id', plan: 'starter' })) },
}));

// ─── Mock Prisma ─────────────────────────────────────────
vi.mock('../lib/prisma', () => ({
    prisma: {
        product: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        supplier: {
            findMany: vi.fn(),
        },
        productCategory: {
            findMany: vi.fn(),
        },
        customer: {
            findMany: vi.fn(),
        },
        order: {
            findMany: vi.fn(),
        },
    },
}));

import { ExcelService } from '../modules/excel/excel.service';
import { prisma } from '../lib/prisma';

const mockProductFindMany = vi.mocked(prisma.product.findMany);
const mockProductFindFirst = vi.mocked(prisma.product.findFirst);
const mockProductCreate = vi.mocked(prisma.product.create);
const mockProductUpdate = vi.mocked(prisma.product.update);
const mockSupplierFindMany = vi.mocked(prisma.supplier.findMany);
const mockCategoryFindMany = vi.mocked(prisma.productCategory.findMany);

// ─── Helpers ─────────────────────────────────────────────

async function buildProductImportWorkbook(rows: Array<Record<string, unknown>>): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Products');
    ws.columns = [
        { header: 'sku', key: 'sku' },
        { header: 'name', key: 'name' },
        { header: 'description', key: 'description' },
        { header: 'cost_price', key: 'cost_price' },
        { header: 'retail_price', key: 'retail_price' },
        { header: 'stock_quantity', key: 'stock_quantity' },
        { header: 'safety_stock', key: 'safety_stock' },
    ];
    for (const r of rows) ws.addRow(r);
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
}

async function headersFromBuffer(buffer: Buffer, sheetName: string): Promise<string[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet(sheetName);
    if (!ws) throw new Error(`sheet ${sheetName} not found`);
    const header = ws.getRow(1);
    const out: string[] = [];
    header.eachCell({ includeEmpty: false }, (cell) => {
        out.push(String(cell.value));
    });
    return out;
}

async function sheetNamesFromBuffer(buffer: Buffer): Promise<string[]> {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    return wb.worksheets.map((ws) => ws.name);
}

// ─── Export round-trip ───────────────────────────────────

describe('ExcelService.exportProducts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockProductFindMany.mockResolvedValue([
            {
                id: 'p1', sku: 'SKU-1', name: 'Widget', description: 'Useful',
                costPrice: 10, retailPrice: 25, stockQuantity: 100, safetyStock: 10,
                supplier: { id: 's1', name: 'ACME' },
                category: { id: 'c1', name: 'General' },
            },
        ] as never);
        mockSupplierFindMany.mockResolvedValue([
            { id: 's1', name: 'ACME', contactName: 'Bob', email: 'b@x.com', phone: '1', address: 'HQ', rating: 5 },
        ] as never);
        mockCategoryFindMany.mockResolvedValue([
            { id: 'c1', name: 'General', description: 'misc' },
        ] as never);
    });

    it('produces a workbook with Products/Suppliers/Categories sheets and snake_case headers', async () => {
        const buf = await ExcelService.exportProducts();
        const sheets = await sheetNamesFromBuffer(buf);
        expect(sheets).toEqual(['Products', 'Suppliers', 'Categories']);

        const productHeaders = await headersFromBuffer(buf, 'Products');
        expect(productHeaders).toEqual([
            'sku', 'name', 'description', 'category', 'supplier',
            'cost_price', 'retail_price', 'stock_quantity', 'safety_stock',
        ]);

        const supplierHeaders = await headersFromBuffer(buf, 'Suppliers');
        expect(supplierHeaders).toEqual([
            'name', 'contact_name', 'email', 'phone', 'address', 'rating',
        ]);

        const categoryHeaders = await headersFromBuffer(buf, 'Categories');
        expect(categoryHeaders).toEqual(['name', 'description']);
    });
});

// ─── previewImport ───────────────────────────────────────

describe('ExcelService.previewImport', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('categorizes rows as create/update/error without writing to DB', async () => {
        const buffer = await buildProductImportWorkbook([
            // valid - new
            {
                sku: 'NEW-1', name: 'Pen', description: 'blue',
                cost_price: 1, retail_price: 3, stock_quantity: 50, safety_stock: 5,
            },
            // valid - existing
            {
                sku: 'EXIST-1', name: 'Notebook', description: '',
                cost_price: 5, retail_price: 12, stock_quantity: 20, safety_stock: 5,
            },
            // invalid - missing name
            {
                sku: 'BAD-1', name: '',
                cost_price: 2, retail_price: 4, stock_quantity: 10, safety_stock: 1,
            },
        ]);

        // EXIST-1 already exists, NEW-1 doesn't
        mockProductFindMany.mockResolvedValueOnce([{ sku: 'EXIST-1' }] as never);

        const summary = await ExcelService.previewImport(buffer);

        expect(summary.created).toBe(1);
        expect(summary.updated).toBe(1);
        expect(summary.errors.length).toBe(1);
        expect(summary.errors[0].row).toBe(4); // row 1 is header, row 4 is the 3rd data row

        // Critically, no writes happened
        expect(mockProductCreate).not.toHaveBeenCalled();
        expect(mockProductUpdate).not.toHaveBeenCalled();
    });
});

// ─── importProducts ──────────────────────────────────────

describe('ExcelService.importProducts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('upserts rows and returns counts', async () => {
        const buffer = await buildProductImportWorkbook([
            {
                sku: 'NEW-1', name: 'Pen', description: 'blue',
                cost_price: 1, retail_price: 3, stock_quantity: 50, safety_stock: 5,
            },
            {
                sku: 'EXIST-1', name: 'Notebook', description: '',
                cost_price: 5, retail_price: 12, stock_quantity: 20, safety_stock: 5,
            },
        ]);

        // Row 1 (NEW-1): no existing product
        // Row 2 (EXIST-1): existing product
        mockProductFindFirst
            .mockResolvedValueOnce(null as never)
            .mockResolvedValueOnce({ id: 'p-exist-1' } as never);

        mockProductCreate.mockResolvedValue({ id: 'p-new-1' } as never);
        mockProductUpdate.mockResolvedValue({ id: 'p-exist-1' } as never);

        const summary = await ExcelService.importProducts(buffer);

        expect(summary.created).toBe(1);
        expect(summary.updated).toBe(1);
        expect(summary.errors).toEqual([]);
        expect(mockProductCreate).toHaveBeenCalledTimes(1);
        expect(mockProductUpdate).toHaveBeenCalledTimes(1);
        expect(mockProductCreate).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ sku: 'NEW-1', name: 'Pen' }) }),
        );
        expect(mockProductUpdate).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'p-exist-1' },
                data: expect.objectContaining({ name: 'Notebook' }),
            }),
        );
    });

    it('records DB errors per row without aborting the rest', async () => {
        const buffer = await buildProductImportWorkbook([
            {
                sku: 'OK-1', name: 'Pen',
                cost_price: 1, retail_price: 3, stock_quantity: 50, safety_stock: 5,
            },
            {
                sku: 'FAIL-1', name: 'Boom',
                cost_price: 2, retail_price: 4, stock_quantity: 10, safety_stock: 1,
            },
        ]);

        mockProductFindFirst.mockResolvedValue(null as never);
        mockProductCreate
            .mockResolvedValueOnce({ id: 'p-ok-1' } as never)
            .mockRejectedValueOnce(new Error('DB exploded'));

        const summary = await ExcelService.importProducts(buffer);

        expect(summary.created).toBe(1);
        expect(summary.updated).toBe(0);
        expect(summary.errors.length).toBe(1);
        expect(summary.errors[0].message).toContain('DB exploded');
    });
});
