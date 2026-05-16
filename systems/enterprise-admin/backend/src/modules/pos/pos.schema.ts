import { z } from 'zod';

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
    orderDiscountAmount: z.number().min(0).optional().default(0),
    orderDiscountNote: z.string().optional(),
    customerId: z.string().uuid().optional(),
    shiftId: z.string().uuid(),
    salesStaffId: z.string().uuid().optional(),
  }),
};

export const posProductsSchema = {
  query: z.object({
    q: z.string().optional(),
    categoryId: z.string().uuid().optional(),
    inStockOnly: z.enum(['true', 'false']).optional(),
  }),
};

export type CheckoutDto = z.infer<typeof checkoutSchema.body>;
