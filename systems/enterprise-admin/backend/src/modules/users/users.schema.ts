import { z } from 'zod';

export const createUserSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    fullName: z.string().min(1, 'Full name is required').max(100),
    roleIds: z.array(z.string().uuid()).optional(),
});

export const updateUserSchema = z.object({
    email: z.string().email().optional(),
    fullName: z.string().min(1).max(100).optional(),
    status: z.enum(['active', 'suspended', 'pending_verification']).optional(),
    roleIds: z.array(z.string().uuid()).optional(),
});

export const listUsersQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    status: z.enum(['active', 'suspended', 'pending_verification']).optional(),
});

export const userIdParamSchema = z.object({
    id: z.string().uuid('Invalid user ID format'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
