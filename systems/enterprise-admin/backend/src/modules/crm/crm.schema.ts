import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional(),
  lineUid: z.string().optional(),
  gender: z.string().optional(),
  birthday: z.string().optional().transform((val: string | undefined) => val ? new Date(val).toISOString() : undefined),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const createInteractionSchema = z.object({
  type: z.enum(['LINE_MESSAGE', 'STORE_VISIT', 'PHONE_CALL', 'SYSTEM_NOTICE']),
  content: z.string().optional(),
});
