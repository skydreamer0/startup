import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

export class InventoryService {
    // --- Suppliers ---
    static async getSuppliers() {
        return await prisma.supplier.findMany({
            orderBy: { name: 'asc' },
        });
    }

    static async getSupplierById(id: string) {
        const supplier = await prisma.supplier.findUnique({
            where: { id },
            include: { products: true },
        });
        if (!supplier) throw new AppError(404, 'Supplier not found');
        return supplier;
    }

    static async createSupplier(data: {
        name: string;
        contactName?: string;
        phone?: string;
        email?: string;
        deliveryReliability?: number;
        defectRate?: number;
        rating?: number;
    }) {
        return await prisma.supplier.create({ data: data as Prisma.SupplierUncheckedCreateInput });
    }

    static async updateSupplier(id: string, data: {
        name?: string;
        contactName?: string;
        phone?: string;
        email?: string;
        deliveryReliability?: number;
        defectRate?: number;
        rating?: number;
    }) {
        return await prisma.supplier.update({
            where: { id },
            data,
        });
    }

    // --- Products ---
    static async getProducts(query: {
        page?: string;
        limit?: string;
        lowStock?: string;
    }) {
        const page = parseInt(query.page || '1');
        const limit = parseInt(query.limit || '50');
        const skip = (page - 1) * limit;

        const [total, products] = await Promise.all([
            prisma.product.count(),
            prisma.product.findMany({
                skip,
                take: limit,
                include: { supplier: true, category: true },
                orderBy: { name: 'asc' },
            }),
        ]);

        const processedProducts = products.map((p) => ({
            ...p,
            isLowStock: p.stockQuantity <= p.safetyStock,
        }));

        if (query.lowStock === 'true') {
            const lowStockProducts = processedProducts.filter((p) => p.isLowStock);
            return { total: lowStockProducts.length, page, limit, data: lowStockProducts };
        }

        return { total, page, limit, data: processedProducts };
    }

    static async getProductById(id: string) {
        const product = await prisma.product.findUnique({
            where: { id },
            include: { supplier: true, category: true },
        });
        if (!product) throw new AppError(404, 'Product not found');
        return product;
    }

    static async createProduct(data: {
        sku: string;
        name: string;
        costPrice: number;
        retailPrice: number;
        stockQuantity?: number;
        safetyStock?: number;
        categoryId?: string;
        supplierId?: string;
    }) {
        return await prisma.product.create({ data: data as Prisma.ProductUncheckedCreateInput });
    }

    static async updateProduct(id: string, data: {
        name?: string;
        costPrice?: number;
        retailPrice?: number;
        stockQuantity?: number;
        safetyStock?: number;
        categoryId?: string;
        supplierId?: string;
    }) {
        return await prisma.product.update({
            where: { id },
            data,
        });
    }
}
