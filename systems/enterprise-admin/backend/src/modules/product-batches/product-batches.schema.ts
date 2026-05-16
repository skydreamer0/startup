import { z } from 'zod';

export const createProductBatchSchema = {
  body: z.object({
    productId: z.string().min(1, 'productId is required'),
    batchNumber: z.string().min(1, 'batchNumber is required'),
    expiryDate: z.string().datetime({ message: 'expiryDate must be a valid ISO 8601 datetime string' }),
    quantity: z.number().int().positive('quantity must be a positive integer'),
    costPrice: z.number().positive('costPrice must be a positive number'),
  }),
};

export const updateProductBatchSchema = {
  body: z.object({
    quantity: z.number().int().min(0).optional(),
    costPrice: z.number().positive().optional(),
    expiryDate: z.string().datetime().optional(),
  }),
};

export const getProductBatchesSchema = {
  query: z.object({
    productId: z.string().optional(),
    expiringSoon: z
      .string()
      .optional()
      .transform((v) => v === 'true'),
  }),
};
