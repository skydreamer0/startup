import { prisma } from '../../lib/prisma';
import { hashPassword } from '../../lib/password';
import type { CreateUserInput, UpdateUserInput, ListUsersQuery } from './users.schema';

export class UsersService {
    /**
     * List users with pagination, search, and status filtering.
     * Excludes soft-deleted users by default.
     */
    async list(query: ListUsersQuery) {
        const { page, limit, search, status } = query;
        const skip = (page - 1) * limit;

        const where = {
            deletedAt: null,
            ...(status && { status }),
            ...(search && {
                OR: [
                    { email: { contains: search } },
                    { fullName: { contains: search } },
                ],
            }),
        };

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                    status: true,
                    lastLoginAt: true,
                    createdAt: true,
                    userRoles: {
                        include: {
                            role: { select: { id: true, name: true } },
                        },
                    },
                },
            }),
            prisma.user.count({ where }),
        ]);

        return {
            users: users.map((u) => ({
                ...u,
                roles: u.userRoles.map((ur) => ur.role),
                userRoles: undefined,
            })),
            meta: { page, limit, total },
        };
    }

    /**
     * Get a single user by ID.
     */
    async getById(id: string) {
        const user = await prisma.user.findUnique({
            where: { id, deletedAt: null },
            select: {
                id: true,
                email: true,
                fullName: true,
                status: true,
                lastLoginAt: true,
                failedLoginAttempts: true,
                createdAt: true,
                updatedAt: true,
                userRoles: {
                    include: {
                        role: {
                            include: {
                                rolePermissions: {
                                    include: { permission: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!user) return null;

        return {
            ...user,
            roles: user.userRoles.map((ur) => ({
                id: ur.role.id,
                name: ur.role.name,
                permissions: ur.role.rolePermissions.map((rp) => ({
                    action: rp.permission.action,
                    resource: rp.permission.resource,
                })),
            })),
            userRoles: undefined,
        };
    }

    /**
     * Create a new user.
     */
    async create(data: CreateUserInput, createdBy: string) {
        const existing = await prisma.user.findUnique({ where: { email: data.email } });
        if (existing) {
            throw new ServiceError('Email already exists', 409);
        }

        const passwordHash = await hashPassword(data.password);

        const user = await prisma.user.create({
            data: {
                email: data.email,
                passwordHash,
                fullName: data.fullName,
                ...(data.roleIds && {
                    userRoles: {
                        create: data.roleIds.map((roleId: string) => ({ roleId })),
                    },
                }),
            },
            select: { id: true, email: true, fullName: true, status: true, createdAt: true },
        });

        // Audit log
        await prisma.auditLog.create({
            data: {
                userId: createdBy,
                action: 'CREATE_USER',
                resourceType: 'users',
                resourceId: user.id,
                newValue: JSON.stringify({ email: data.email, fullName: data.fullName }),
            },
        });

        return user;
    }

    /**
     * Update a user.
     */
    async update(id: string, data: UpdateUserInput, updatedBy: string) {
        const user = await prisma.user.findUnique({ where: { id, deletedAt: null } });
        if (!user) throw new ServiceError('User not found', 404);

        const oldValue = { email: user.email, fullName: user.fullName, status: user.status };

        const updated = await prisma.user.update({
            where: { id },
            data: {
                ...(data.email && { email: data.email }),
                ...(data.fullName && { fullName: data.fullName }),
                ...(data.status && { status: data.status }),
            },
            select: { id: true, email: true, fullName: true, status: true, updatedAt: true },
        });

        // Update roles if provided
        if (data.roleIds) {
            await prisma.userRole.deleteMany({ where: { userId: id } });
            await prisma.userRole.createMany({
                data: data.roleIds.map((roleId: string) => ({ userId: id, roleId })),
            });
        }

        // Audit log
        await prisma.auditLog.create({
            data: {
                userId: updatedBy,
                action: 'UPDATE_USER',
                resourceType: 'users',
                resourceId: id,
                oldValue: JSON.stringify(oldValue),
                newValue: JSON.stringify(data),
            },
        });

        return updated;
    }

    /**
     * Soft delete a user.
     */
    async delete(id: string, deletedBy: string) {
        const user = await prisma.user.findUnique({ where: { id, deletedAt: null } });
        if (!user) throw new ServiceError('User not found', 404);

        await prisma.user.update({
            where: { id },
            data: { deletedAt: new Date() },
        });

        // Audit log
        await prisma.auditLog.create({
            data: {
                userId: deletedBy,
                action: 'DELETE_USER',
                resourceType: 'users',
                resourceId: id,
                oldValue: JSON.stringify({ email: user.email, status: user.status }),
            },
        });

        return { message: 'User deactivated successfully' };
    }
}

export class ServiceError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
        super(message);
        this.name = 'ServiceError';
        this.statusCode = statusCode;
    }
}
