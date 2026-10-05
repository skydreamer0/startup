import { z } from 'zod';

const paymentEntrySchema = z.object({
  method: z.enum(['CASH', 'CARD', 'LINE_PAY', 'TRANSFER', 'OTHER']),
  amount: z.number().min(0),
});

export const checkoutSchema = {
  body: z.object({
    cartItems: z.array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.number().int().min(1),
        discountRate: z.number().min(0).max(100).optional().default(0),
      }),
    ).min(1, 'Cart must have at least one item'),
    paymentMethod: z.enum(['CASH', 'CARD', 'LINE_PAY', 'TRANSFER', 'OTHER']),
    // Optional split payments — if provided, must sum to totalAmount
    payments: z.array(paymentEntrySchema).optional(),
    orderDiscountAmount: z.number().min(0).optional().default(0),
    orderDiscountNote: z.string().optional(),
    customerId: z.string().uuid().optional(),
    shiftId: z.string().uuid(),
    salesStaffId: z.string().uuid().optional(),
    adminPin: z.string().optional(),
  }),
};

export const posProductsSchema = {
  query: z.object({
    q: z.string().optional(),
    categoryId: z.string().uuid().optional(),
    inStockOnly: z.enum(['true', 'false']).optional(),
  }),
};

export const customerLookupSchema = {
  query: z.object({
    q: z.string().trim().min(1),
  }),
};

export const customerRecommendationsSchema = {
  params: z.object({
    customerId: z.string().uuid(),
  }),
};

export type CheckoutDto = z.infer<typeof checkoutSchema.body>;

export const refundOrderSchema = {
  params: z.object({ orderId: z.string().uuid() }),
  body: z.object({ reason: z.string().trim().max(1000).optional() }),
};

export const createPosCustomerSchema = {
  body: z.object({
    phone: z.string().trim().min(1),
    name: z.string().trim().optional(),
  }),
};

export type CreatePosCustomerDto = z.infer<typeof createPosCustomerSchema.body>;
