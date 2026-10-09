import { z } from 'zod';
import { BatchStockStatus } from '@prisma/client';

export const createProductBatchSchema = {
  body: z.object({
    productId: z.string().min(1, 'productId is required'),
    batchNumber: z.string().min(1, 'batchNumber is required'),
    expiryDate: z.string().datetime({ message: 'expiryDate must be a valid ISO 8601 datetime string' }),
    quantity: z.number().int().positive('quantity must be a positive integer').max(2_147_483_647),
    costPrice: z.number().positive('costPrice must be a positive number'),
    status: z.nativeEnum(BatchStockStatus).optional(),
  }),
};

export const updateProductBatchSchema = {
  body: z.object({
    quantity: z.never().optional(),
    costPrice: z.never().optional(),
    expiryDate: z.never().optional(),
    status: z.never().optional(),
  }).strict(),
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

const reason = z.string().trim().min(1, '請填寫更正原因').max(1000);
export const changeBatchStatusSchema = { body: z.object({
  status: z.nativeEnum(BatchStockStatus), reason,
}).strict() };
export const correctBatchExpirySchema = { body: z.object({
  expiryDate: z.string().datetime(), reason,
}).strict() };
export const correctBatchCostSchema = { body: z.object({
  costPrice: z.number().finite().positive().lt(100_000_000), reason,
}).strict() };
export const batchHistorySchema = { query: z.object({ cursor: z.string().min(1).optional() }).strict() };
