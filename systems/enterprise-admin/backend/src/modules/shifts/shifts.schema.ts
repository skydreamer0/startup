import { z } from 'zod';

export const createShiftSchema = {
  body: z.object({
    staffId: z.string().uuid(),
    openingCash: z.number().min(0).optional(),
    notes: z.string().optional(),
  }),
};

export const closeShiftSchema = {
  body: z.object({
    closingCash: z.number().min(0),
    notes: z.string().optional(),
  }),
};

export const getShiftsSchema = {
  query: z.object({
    status: z.enum(['OPEN', 'CLOSED']).optional(),
  }),
};
