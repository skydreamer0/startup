import { z } from 'zod';

export const createRoleSchema = z.object({
    name: z.string().min(1).max(50).toUpperCase(),
    description: z.string().max(255).optional(),
    permissionIds: z.array(z.string().uuid()).optional(),
});

export const updateRolePermissionsSchema = z.object({
    permissionIds: z.array(z.string().uuid()),
});

export const roleIdParamSchema = z.object({
    id: z.string().uuid('Invalid role ID format'),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;
