import { prisma } from '../../lib/prisma';
import type { ListAuditLogsQuery } from './audit-logs.schema';

export class AuditLogsService {
    async list(query: ListAuditLogsQuery) {
        const { page, limit, userId, action, resourceType } = query;
        const skip = (page - 1) * limit;

        const where: Record<string, unknown> = {};
        if (userId) where.userId = userId;
        if (action) where.action = action;
        if (resourceType) where.resourceType = resourceType;

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    user: { select: { id: true, email: true, fullName: true } },
                },
            }),
            prisma.auditLog.count({ where }),
        ]);

        return {
            logs: logs.map((log) => ({
                id: log.id,
                action: log.action,
                resourceType: log.resourceType,
                resourceId: log.resourceId,
                oldValue: log.oldValue,
                newValue: log.newValue,
                ipAddress: log.ipAddress,
                userAgent: log.userAgent,
                createdAt: log.createdAt,
                user: log.user ? {
                    id: log.user.id,
                    email: log.user.email,
                    fullName: log.user.fullName,
                } : null,
            })),
            meta: { page, limit, total },
        };
    }
}
