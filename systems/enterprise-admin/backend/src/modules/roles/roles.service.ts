import { prisma } from '../../lib/prisma';
import { ServiceError } from '../users/users.service';
import type { CreateRoleInput, UpdateRolePermissionsInput } from './roles.schema';

export class RolesService {
    /**
     * List all roles with their permissions.
     */
    async list() {
        const roles = await prisma.role.findMany({
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
            include: {
                rolePermissions: {
                    include: { permission: true },
                },
            },
        });

        return roles.map((role) => ({
            id: role.id,
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
            permissions: role.rolePermissions.map((rp) => ({
                id: rp.permission.id,
                action: rp.permission.action,
                resource: rp.permission.resource,
            })),
            createdAt: role.createdAt,
        }));
    }

    /**
     * Create a new custom role.
     */
    async create(data: CreateRoleInput) {
        const existing = await prisma.role.findUnique({ where: { name: data.name } });
        if (existing) {
            throw new ServiceError('Role name already exists', 409);
        }

        const role = await prisma.role.create({
            data: {
                name: data.name,
                description: data.description,
                isSystem: false,
                ...(data.permissionIds && {
                    rolePermissions: {
                        create: data.permissionIds.map((permissionId: string) => ({ permissionId })),
                    },
                }),
            },
            include: {
                rolePermissions: { include: { permission: true } },
            },
        });

        return {
            id: role.id,
            name: role.name,
            description: role.description,
            permissions: role.rolePermissions.map((rp) => ({
                action: rp.permission.action,
                resource: rp.permission.resource,
            })),
        };
    }

    /**
     * Update (replace) permissions for a role.
     */
    async updatePermissions(roleId: string, data: UpdateRolePermissionsInput) {
        const role = await prisma.role.findUnique({ where: { id: roleId, deletedAt: null } });
        if (!role) throw new ServiceError('Role not found', 404);

        // Delete existing and re-create
        await prisma.rolePermission.deleteMany({ where: { roleId } });
        await prisma.rolePermission.createMany({
            data: data.permissionIds.map((permissionId: string) => ({ roleId, permissionId })),
        });

        return this.getById(roleId);
    }

    /**
     * List all system permissions.
     */
    async listPermissions() {
        return prisma.permission.findMany({
            orderBy: [{ resource: 'asc' }, { action: 'asc' }],
        });
    }

    private async getById(id: string) {
        const role = await prisma.role.findUnique({
            where: { id },
            include: {
                rolePermissions: { include: { permission: true } },
            },
        });
        if (!role) return null;

        return {
            id: role.id,
            name: role.name,
            description: role.description,
            isSystem: role.isSystem,
            permissions: role.rolePermissions.map((rp) => ({
                id: rp.permission.id,
                action: rp.permission.action,
                resource: rp.permission.resource,
            })),
        };
    }
}
