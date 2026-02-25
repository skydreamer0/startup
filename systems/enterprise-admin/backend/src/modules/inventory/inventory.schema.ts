import { z } from 'zod';

export const createSupplierSchema = z.object({
    body: z.object({
        name: z.string().min(1, 'Name is required'),
        contactName: z.string().optional(),
        email: z.string().email('Invalid email').optional().or(z.literal('')),
        phone: z.string().optional(),
        address: z.string().optional(),
    }),
});

export const updateSupplierSchema = z.object({
    body: z.object({
        name: z.string().min(1).optional(),
        contactName: z.string().optional(),
        email: z.string().email().optional().or(z.literal('')),
        phone: z.string().optional(),
        address: z.string().optional(),
        rating: z.number().min(0).max(100).optional(),
        deliveryReliability: z.number().min(0).max(100).optional(),
        defectRate: z.number().min(0).max(100).optional(),
    }),
});

export const createProductSchema = z.object({
    body: z.object({
        sku: z.string().min(1, 'SKU is required'),
        name: z.string().min(1, 'Name is required'),
        description: z.string().optional(),
        categoryId: z.string().optional(),
        supplierId: z.string().optional(),
        costPrice: z.number().min(0),
        retailPrice: z.number().min(0),
        stockQuantity: z.number().int().min(0).default(0),
        safetyStock: z.number().int().min(0).default(10),
    }),
});

export const updateProductSchema = z.object({
    body: z.object({
        sku: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        categoryId: z.string().optional(),
        supplierId: z.string().optional(),
        costPrice: z.number().min(0).optional(),
        retailPrice: z.number().min(0).optional(),
        stockQuantity: z.number().int().min(0).optional(),
        safetyStock: z.number().int().min(0).optional(),
    }),
});
