import { z } from 'zod';

export const listAuditLogsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    userId: z.string().uuid().optional(),
    action: z.string().optional(),
    resourceType: z.string().optional(),
});

export type ListAuditLogsQuery = z.infer<typeof listAuditLogsQuerySchema>;
