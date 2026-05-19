import ExcelJS from 'exceljs';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';
import { AppError } from '../../lib/errors';

// ─── Validation Schemas ─────────────────────────────────────
const productImportSchema = z.object({
    sku: z.string().min(1, 'SKU is required'),
    name: z.string().min(1, 'Name is required'),
    description: z.string().optional().nullable(),
    costPrice: z.number().nonnegative(),
    retailPrice: z.number().nonnegative(),
    stockQuantity: z.number().int().nonnegative(),
    safetyStock: z.number().int().nonnegative(),
});

export interface ImportError {
    row: number;
    message: string;
}

export interface ImportSummary {
    created: number;
    updated: number;
    errors: ImportError[];
}

interface ParsedProductRow {
    rowNumber: number;
    raw: Record<string, unknown>;
    parsed?: z.infer<typeof productImportSchema>;
    error?: string;
}

const SHEET_FONT_HEADER: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };
const SHEET_FILL_HEADER: ExcelJS.FillPattern = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF334155' },
};
const SHEET_FILL_LOW_STOCK: ExcelJS.FillPattern = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFEE2E2' },
};

function applyHeaderStyle(worksheet: ExcelJS.Worksheet) {
    const header = worksheet.getRow(1);
    header.font = SHEET_FONT_HEADER;
    header.fill = SHEET_FILL_HEADER;
    header.alignment = { vertical: 'middle', horizontal: 'left' };
    header.commit();
}

function toCellNumber(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const n = Number(value);
        return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
}

function toCellString(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number') return String(value);
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object' && 'text' in (value as Record<string, unknown>)) {
        const text = (value as { text: unknown }).text;
        return typeof text === 'string' ? text.trim() : undefined;
    }
    return String(value);
}

export class ExcelService {
    // ─── Exports ────────────────────────────────────────────
    static async exportProducts(): Promise<Buffer> {
        requireTenantId();
        const [products, suppliers, categories] = await Promise.all([
            prisma.product.findMany({
                include: { supplier: true, category: true },
                orderBy: { name: 'asc' },
            }),
            prisma.supplier.findMany({ orderBy: { name: 'asc' } }),
            prisma.productCategory.findMany({ orderBy: { name: 'asc' } }),
        ]);

        const workbook = new ExcelJS.Workbook();
        workbook.created = new Date();

        const productsSheet = workbook.addWorksheet('Products');
        productsSheet.columns = [
            { header: 'sku', key: 'sku', width: 18 },
            { header: 'name', key: 'name', width: 28 },
            { header: 'description', key: 'description', width: 30 },
            { header: 'category', key: 'category', width: 18 },
            { header: 'supplier', key: 'supplier', width: 22 },
            { header: 'cost_price', key: 'costPrice', width: 12 },
            { header: 'retail_price', key: 'retailPrice', width: 14 },
            { header: 'stock_quantity', key: 'stockQuantity', width: 14 },
            { header: 'safety_stock', key: 'safetyStock', width: 12 },
        ];
        for (const p of products) {
            productsSheet.addRow({
                sku: p.sku,
                name: p.name,
                description: p.description ?? '',
                category: p.category?.name ?? '',
                supplier: p.supplier?.name ?? '',
                costPrice: p.costPrice,
                retailPrice: p.retailPrice,
                stockQuantity: p.stockQuantity,
                safetyStock: p.safetyStock,
            });
        }
        applyHeaderStyle(productsSheet);

        const suppliersSheet = workbook.addWorksheet('Suppliers');
        suppliersSheet.columns = [
            { header: 'name', key: 'name', width: 24 },
            { header: 'contact_name', key: 'contactName', width: 20 },
            { header: 'email', key: 'email', width: 28 },
            { header: 'phone', key: 'phone', width: 16 },
            { header: 'address', key: 'address', width: 32 },
            { header: 'rating', key: 'rating', width: 10 },
        ];
        for (const s of suppliers) {
            suppliersSheet.addRow({
                name: s.name,
                contactName: s.contactName ?? '',
                email: s.email ?? '',
                phone: s.phone ?? '',
                address: s.address ?? '',
                rating: s.rating ?? '',
            });
        }
        applyHeaderStyle(suppliersSheet);

        const categoriesSheet = workbook.addWorksheet('Categories');
        categoriesSheet.columns = [
            { header: 'name', key: 'name', width: 24 },
            { header: 'description', key: 'description', width: 40 },
        ];
        for (const c of categories) {
            categoriesSheet.addRow({ name: c.name, description: c.description ?? '' });
        }
        applyHeaderStyle(categoriesSheet);

        const buf = await workbook.xlsx.writeBuffer();
        return Buffer.from(buf);
    }

    static async exportCustomers(): Promise<Buffer> {
        requireTenantId();
        const customers = await prisma.customer.findMany({
            orderBy: { createdAt: 'desc' },
        });

        const workbook = new ExcelJS.Workbook();
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Customers');
        sheet.columns = [
            { header: 'name', key: 'name', width: 24 },
            { header: 'phone', key: 'phone', width: 18 },
            { header: 'line_uid', key: 'lineUid', width: 24 },
            { header: 'gender', key: 'gender', width: 10 },
            { header: 'birthday', key: 'birthday', width: 14 },
            { header: 'total_spent', key: 'totalSpent', width: 14 },
            { header: 'purchase_count', key: 'purchaseCount', width: 14 },
            { header: 'last_purchase_date', key: 'lastPurchaseDate', width: 18 },
        ];
        for (const c of customers) {
            sheet.addRow({
                name: c.name ?? '',
                phone: c.phone ?? '',
                lineUid: c.lineUid ?? '',
                gender: c.gender ?? '',
                birthday: c.birthday ? c.birthday.toISOString().slice(0, 10) : '',
                totalSpent: c.totalSpent,
                purchaseCount: c.purchaseCount,
                lastPurchaseDate: c.lastPurchaseDate ? c.lastPurchaseDate.toISOString().slice(0, 10) : '',
            });
        }
        applyHeaderStyle(sheet);

        const buf = await workbook.xlsx.writeBuffer();
        return Buffer.from(buf);
    }

    static async exportOrders(from?: string, to?: string): Promise<Buffer> {
        requireTenantId();
        const where: { createdAt?: { gte?: Date; lte?: Date } } = {};
        if (from || to) {
            where.createdAt = {};
            if (from) where.createdAt.gte = new Date(from);
            if (to) where.createdAt.lte = new Date(to);
        }

        const orders = await prisma.order.findMany({
            where,
            include: {
                customer: { select: { name: true, phone: true } },
                items: { include: { product: { select: { sku: true, name: true } } } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const workbook = new ExcelJS.Workbook();
        workbook.created = new Date();

        const ordersSheet = workbook.addWorksheet('Orders');
        ordersSheet.columns = [
            { header: 'order_id', key: 'id', width: 38 },
            { header: 'order_number', key: 'orderNumber', width: 20 },
            { header: 'customer_name', key: 'customerName', width: 22 },
            { header: 'customer_phone', key: 'customerPhone', width: 16 },
            { header: 'status', key: 'status', width: 12 },
            { header: 'payment_status', key: 'paymentStatus', width: 14 },
            { header: 'payment_method', key: 'paymentMethod', width: 14 },
            { header: 'total_amount', key: 'totalAmount', width: 14 },
            { header: 'discount_amount', key: 'discountAmount', width: 14 },
            { header: 'created_at', key: 'createdAt', width: 22 },
        ];
        for (const o of orders) {
            ordersSheet.addRow({
                id: o.id,
                orderNumber: o.orderNumber ?? '',
                customerName: o.customer?.name ?? '',
                customerPhone: o.customer?.phone ?? '',
                status: o.status,
                paymentStatus: o.paymentStatus,
                paymentMethod: o.paymentMethod,
                totalAmount: o.totalAmount,
                discountAmount: o.discountAmount,
                createdAt: o.createdAt.toISOString(),
            });
        }
        applyHeaderStyle(ordersSheet);

        const itemsSheet = workbook.addWorksheet('OrderItems');
        itemsSheet.columns = [
            { header: 'order_id', key: 'orderId', width: 38 },
            { header: 'product_sku', key: 'sku', width: 18 },
            { header: 'product_name', key: 'name', width: 28 },
            { header: 'quantity', key: 'quantity', width: 10 },
            { header: 'unit_price', key: 'unitPrice', width: 12 },
            { header: 'final_unit_price', key: 'finalUnitPrice', width: 14 },
            { header: 'discount_rate', key: 'discountRate', width: 12 },
        ];
        for (const o of orders) {
            for (const item of o.items) {
                itemsSheet.addRow({
                    orderId: o.id,
                    sku: item.product?.sku ?? '',
                    name: item.product?.name ?? '',
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    finalUnitPrice: item.finalUnitPrice ?? '',
                    discountRate: item.discountRate,
                });
            }
        }
        applyHeaderStyle(itemsSheet);

        const buf = await workbook.xlsx.writeBuffer();
        return Buffer.from(buf);
    }

    static async exportInventory(): Promise<Buffer> {
        requireTenantId();
        const products = await prisma.product.findMany({
            include: { supplier: true, category: true },
            orderBy: { name: 'asc' },
        });

        const workbook = new ExcelJS.Workbook();
        workbook.created = new Date();

        const sheet = workbook.addWorksheet('Inventory');
        sheet.columns = [
            { header: 'sku', key: 'sku', width: 18 },
            { header: 'name', key: 'name', width: 28 },
            { header: 'category', key: 'category', width: 18 },
            { header: 'supplier', key: 'supplier', width: 22 },
            { header: 'stock_quantity', key: 'stockQuantity', width: 14 },
            { header: 'safety_stock', key: 'safetyStock', width: 12 },
            { header: 'is_low_stock', key: 'isLowStock', width: 12 },
            { header: 'cost_price', key: 'costPrice', width: 12 },
            { header: 'retail_price', key: 'retailPrice', width: 12 },
        ];
        for (const p of products) {
            const isLow = p.stockQuantity <= p.safetyStock;
            const row = sheet.addRow({
                sku: p.sku,
                name: p.name,
                category: p.category?.name ?? '',
                supplier: p.supplier?.name ?? '',
                stockQuantity: p.stockQuantity,
                safetyStock: p.safetyStock,
                isLowStock: isLow ? 'YES' : 'NO',
                costPrice: p.costPrice,
                retailPrice: p.retailPrice,
            });
            if (isLow) {
                row.eachCell((cell) => {
                    cell.fill = SHEET_FILL_LOW_STOCK;
                });
            }
        }
        applyHeaderStyle(sheet);

        const buf = await workbook.xlsx.writeBuffer();
        return Buffer.from(buf);
    }

    // ─── Imports ────────────────────────────────────────────
    private static async parseProductBuffer(buffer: Buffer): Promise<ParsedProductRow[]> {
        const workbook = new ExcelJS.Workbook();
        try {
            // exceljs' ambient typings predate the @types/node Buffer<TArrayBuffer>
            // generic; xlsx.load accepts our runtime Buffer fine, but TS's
            // [Symbol.toStringTag] check trips. Safe to suppress.
            // @ts-expect-error -- exceljs Buffer type lag (see comment above)
            await workbook.xlsx.load(buffer);
        } catch {
            throw new AppError(400, 'Invalid xlsx file');
        }

        const sheet = workbook.getWorksheet('Products') ?? workbook.worksheets[0];
        if (!sheet) {
            throw new AppError(400, 'Workbook contains no sheets');
        }

        const headerRow = sheet.getRow(1);
        const headers: string[] = [];
        headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const text = toCellString(cell.value) ?? '';
            headers[colNumber] = text.toLowerCase();
        });

        const out: ParsedProductRow[] = [];
        for (let rowNum = 2; rowNum <= sheet.rowCount; rowNum++) {
            const row = sheet.getRow(rowNum);
            if (!row.hasValues) continue;

            const raw: Record<string, unknown> = {};
            row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                const key = headers[colNumber];
                if (!key) return;
                raw[key] = cell.value;
            });

            const skuStr = toCellString(raw['sku']);
            const nameStr = toCellString(raw['name']);
            if (!skuStr && !nameStr) continue;

            const candidate = {
                sku: skuStr ?? '',
                name: nameStr ?? '',
                description: toCellString(raw['description']) ?? null,
                costPrice: toCellNumber(raw['cost_price']) ?? toCellNumber(raw['costprice']) ?? 0,
                retailPrice: toCellNumber(raw['retail_price']) ?? toCellNumber(raw['retailprice']) ?? 0,
                stockQuantity: toCellNumber(raw['stock_quantity']) ?? toCellNumber(raw['stockquantity']) ?? 0,
                safetyStock: toCellNumber(raw['safety_stock']) ?? toCellNumber(raw['safetystock']) ?? 0,
            };

            const result = productImportSchema.safeParse(candidate);
            if (result.success) {
                out.push({ rowNumber: rowNum, raw, parsed: result.data });
            } else {
                const msg = result.error.issues
                    .map((iss) => `${iss.path.join('.') || 'field'}: ${iss.message}`)
                    .join('; ');
                out.push({ rowNumber: rowNum, raw, error: msg });
            }
        }
        return out;
    }

    static async previewImport(buffer: Buffer): Promise<ImportSummary> {
        requireTenantId();
        const rows = await ExcelService.parseProductBuffer(buffer);

        const errors: ImportError[] = [];
        const validRows: ParsedProductRow[] = [];
        for (const r of rows) {
            if (r.error) {
                errors.push({ row: r.rowNumber, message: r.error });
            } else {
                validRows.push(r);
            }
        }

        const skus = validRows.map((r) => r.parsed!.sku);
        const existing = skus.length
            ? await prisma.product.findMany({
                where: { sku: { in: skus } },
                select: { sku: true },
            })
            : [];
        const existingSkus = new Set(existing.map((p) => p.sku));

        let created = 0;
        let updated = 0;
        for (const r of validRows) {
            if (existingSkus.has(r.parsed!.sku)) updated++;
            else created++;
        }

        return { created, updated, errors };
    }

    static async importProducts(buffer: Buffer): Promise<ImportSummary> {
        requireTenantId();
        const rows = await ExcelService.parseProductBuffer(buffer);

        const errors: ImportError[] = [];
        let created = 0;
        let updated = 0;

        for (const r of rows) {
            if (r.error || !r.parsed) {
                errors.push({ row: r.rowNumber, message: r.error ?? 'Unknown parse error' });
                continue;
            }
            const data = r.parsed;
            try {
                const existing = await prisma.product.findFirst({
                    where: { sku: data.sku },
                    select: { id: true },
                });
                if (existing) {
                    await prisma.product.update({
                        where: { id: existing.id },
                        data: {
                            name: data.name,
                            description: data.description ?? null,
                            costPrice: data.costPrice,
                            retailPrice: data.retailPrice,
                            stockQuantity: data.stockQuantity,
                            safetyStock: data.safetyStock,
                        },
                    });
                    updated++;
                } else {
                    // tenantId is auto-injected by the Prisma extension at runtime;
                    // cast matches the pattern in inventory.service.ts.
                    const createData = {
                        sku: data.sku,
                        name: data.name,
                        description: data.description ?? null,
                        costPrice: data.costPrice,
                        retailPrice: data.retailPrice,
                        stockQuantity: data.stockQuantity,
                        safetyStock: data.safetyStock,
                    } as Prisma.ProductUncheckedCreateInput;
                    await prisma.product.create({ data: createData });
                    created++;
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown DB error';
                errors.push({ row: r.rowNumber, message });
            }
        }

        return { created, updated, errors };
    }
}
