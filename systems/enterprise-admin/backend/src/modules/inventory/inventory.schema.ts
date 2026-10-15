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

const medicineText = (max: number) => z.string().trim().min(1).max(max)
    .refine(value => [...value].every(char => char.charCodeAt(0) > 31 && char.charCodeAt(0) !== 127), 'Single-line text is required');

export const createProductSchema = z.object({
    body: z.object({
        sku: z.string().min(1, 'SKU is required'),
        name: z.string().min(1, 'Name is required'),
        description: z.string().optional(),
        strength: medicineText(40).optional(),
        dosageForm: medicineText(40).optional(),
        genericName: medicineText(120).optional(),
        nhiCode: medicineText(40).optional(),
        licenseNumber: medicineText(120).optional(),
        categoryId: z.string().optional(),
        supplierId: z.string().optional(),
        costPrice: z.number().min(0),
        retailPrice: z.number().min(0),
        stockQuantity: z.literal(0).optional(),
        safetyStock: z.number().int().min(0).default(10),
    }),
});

export const updateProductSchema = z.object({
    body: z.object({
        sku: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        strength: medicineText(40).nullable().optional(),
        dosageForm: medicineText(40).nullable().optional(),
        genericName: medicineText(120).nullable().optional(),
        nhiCode: medicineText(40).nullable().optional(),
        licenseNumber: medicineText(120).nullable().optional(),
        categoryId: z.string().optional(),
        supplierId: z.string().optional(),
        costPrice: z.number().min(0).optional(),
        retailPrice: z.number().min(0).optional(),
        stockQuantity: z.never().optional(),
        safetyStock: z.number().int().min(0).optional(),
    }),
});
