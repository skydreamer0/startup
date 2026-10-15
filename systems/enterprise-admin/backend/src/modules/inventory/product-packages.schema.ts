import { z } from 'zod';
import { productIdentifierSchema } from '../pos/product-identifier.schema';

const text = z.string().trim().min(1).max(1000);
export const packageIdentifierSchema = productIdentifierSchema.refine(
  item => item.namespace !== 'SKU' && item.value.length <= 256 && !item.value.includes('\u0000'),
  'Package identifiers must be manufacturer codes or GTINs of at most 256 characters',
);
export const packageRevisionBody = z.object({
  label: text,
  contents: text,
  stockUnitLabel: z.string().trim().min(1).max(80),
  unitsPerPackage: z.number().int().min(1).max(2147483647).nullable(),
  source: text,
  reason: text,
  validFrom: z.string().datetime({ offset: true }),
  validUntil: z.string().datetime({ offset: true }).nullable(),
  identifiers: z.array(packageIdentifierSchema).min(1).max(50),
}).strict().superRefine((data, context) => {
  if (data.validUntil && Date.parse(data.validUntil) <= Date.parse(data.validFrom)) {
    context.addIssue({ code: 'custom', path: ['validUntil'], message: 'End must be later than start' });
  }
  const keys = data.identifiers.map(item => JSON.stringify([item.namespace, item.value]));
  if (new Set(keys).size !== keys.length) {
    context.addIssue({ code: 'custom', path: ['identifiers'], message: 'Duplicate identifier in one package revision' });
  }
});
export const packageLookupSchema = { query: packageIdentifierSchema };
export const packageProductParams = z.object({ productId: z.string().uuid() }).strict();
export const packageParams = z.object({ productId: z.string().uuid(), packageId: z.string().uuid() }).strict();
export const packageRevisionSchema = { params: packageParams, body: z.object({
  expectedRevision: z.number().int().min(1), data: packageRevisionBody,
}).strict() };
export const packageRetireSchema = { params: packageParams, body: z.object({
  expectedRevision: z.number().int().min(1), reason: text,
}).strict() };
export const packageResolveSchema = { body: z.object({
  identifier: packageIdentifierSchema,
  packageId: z.string().uuid(), revision: z.number().int().min(1),
}).strict() };
export type PackageRevisionInput = z.infer<typeof packageRevisionBody>;
