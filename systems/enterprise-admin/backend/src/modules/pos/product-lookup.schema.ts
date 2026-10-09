import { z } from 'zod';

// Preserve the literal identifier, including case, whitespace and leading zeroes.
export const productLookupSchema = {
  query: z.object({ code: z.string().min(1) }).strict(),
};
