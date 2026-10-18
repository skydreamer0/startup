import { z } from 'zod';

/** GS1 modulo-10 validation only; this does not prove allocation or ownership.
 * https://www.gs1.org/services/how-calculate-check-digit-manually
 * Keep the supplied representation: never pad, trim or convert it to a number.
 */
function isValidGtin(value: string): boolean {
  if (![8, 12, 13, 14].includes(value.length) || /[^0-9]/.test(value)) return false;
  let sum = 0;
  for (let index = value.length - 2, weight = 3; index >= 0; index--, weight = 4 - weight) {
    sum += Number(value[index]) * weight;
  }
  return (10 - sum % 10) % 10 === Number(value[value.length - 1]);
}

// The caller must select a namespace. A numeric manufacturer code is not
// implicitly a GTIN, and an unknown/unsupported namespace must never become SKU.
export const productIdentifierSchema = z.discriminatedUnion('namespace', [
  z.object({ namespace: z.literal('SKU'), value: z.string().min(1) }).strict(),
  z.object({ namespace: z.literal('MANUFACTURER'), value: z.string().min(1) }).strict(),
  z.object({ namespace: z.literal('GTIN'), value: z.string().refine(isValidGtin, 'Invalid GTIN length or check digit') }).strict(),
]);

export type ProductIdentifier = z.infer<typeof productIdentifierSchema>;
