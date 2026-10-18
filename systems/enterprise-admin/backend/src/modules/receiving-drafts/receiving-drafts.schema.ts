import { z } from 'zod';

const literal = z.string().max(256);
const fields = z.object({
  productId: z.union([z.uuid(), z.literal('')]), baseUnit: literal,
  batchNumber: literal, expiryDate: literal, quantity: literal, note: z.string().max(1000),
  orderedQuantity: literal.optional(), quarantineQuantity: literal.optional(), rejectedQuantity: literal.optional(),
  packageDescription: literal.optional(), unitCost: literal.optional(), sourceReference: literal.optional(),
}).strict();
export const receivingPayloadSchema = z.object({
  title: z.string().trim().min(1).max(120),
  lines: z.array(z.object({ id: z.uuid(), fields, reviewed: z.boolean() }).strict()).max(100),
}).strict().superRefine((payload, ctx) => {
  const ids = new Set<string>();
  for (const [index, line] of payload.lines.entries()) {
    if (ids.has(line.id)) ctx.addIssue({ code: 'custom', path: ['lines', index, 'id'], message: 'Duplicate line' });
    ids.add(line.id);
    if (!line.reviewed) continue;
    const f = line.fields;
    for (const field of ['orderedQuantity', 'quarantineQuantity', 'rejectedQuantity', 'unitCost'] as const) {
      const value = f[field];
      if (value && value.match(/^\d+(?:\.\d+)?$/)?.[0] !== value) {
        ctx.addIssue({ code: 'custom', path: ['lines', index, 'fields', field], message: 'Invalid decimal text' });
      }
    }
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(f.expiryDate);
    const year = Number(date?.[1]), month = Number(date?.[2]), day = Number(date?.[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
    if (!f.productId || !f.baseUnit.trim() || !f.batchNumber.trim()
      || !date || date[0] !== f.expiryDate || year < 1 || !days || day < 1 || day > days
      || f.quantity.match(/^\d+(?:\.\d+)?$/)?.[0] !== f.quantity || !/[1-9]/.test(f.quantity)) {
      ctx.addIssue({ code: 'custom', path: ['lines', index, 'reviewed'], message: 'Incomplete data cannot be marked checked' });
    }
  }
});
export const saveReceivingDraftSchema = z.object({
  expectedRevision: z.number().int().min(0).max(2147483646), payload: receivingPayloadSchema,
}).strict();
export type ReceivingPayload = z.infer<typeof receivingPayloadSchema>;
