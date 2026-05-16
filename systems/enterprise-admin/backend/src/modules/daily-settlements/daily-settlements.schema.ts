import { z } from 'zod';

export const createDailySettlementSchema = {
  body: z.object({
    shiftId: z.string().min(1, 'shiftId is required'),
    date: z.string().datetime({ message: 'date must be a valid ISO 8601 datetime string' }),
    totalSales: z.number().min(0).optional().default(0),
    totalOrders: z.number().int().min(0).optional().default(0),
    cashAmount: z.number().min(0).optional().default(0),
    cardAmount: z.number().min(0).optional().default(0),
    linePayAmount: z.number().min(0).optional().default(0),
    otherAmount: z.number().min(0).optional().default(0),
    notes: z.string().optional(),
  }),
};

export const calculateSettlementSchema = {
  body: z.object({
    shiftId: z.string().min(1, 'shiftId is required'),
  }),
};

export const getDailySettlementsSchema = {
  query: z.object({
    shiftId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  }),
};
