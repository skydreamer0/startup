import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';

/**
 * JWT Authentication Middleware
 * Extracts Bearer token, verifies it, and injects user + permissions into req.user
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
            });
        }

        const token = authHeader.split(' ')[1];
        const payload = verifyAccessToken(token);

        // Load user permissions from DB
        const user = await prisma.user.findUnique({
            where: { id: payload.userId, deletedAt: null },
            include: {
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

        if (!user || user.status !== 'active') {
            return res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'User not found or inactive' },
            });
        }

        // Flatten permissions: "action:resource" format
        const permissions = user.userRoles.flatMap((ur) =>
            ur.role.rolePermissions.map((rp) => `${rp.permission.action}:${rp.permission.resource}`),
        );

        req.user = {
            userId: user.id,
            email: user.email,
            permissions: [...new Set(permissions)], // deduplicate
        };

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: { code: 'TOKEN_INVALID', message: 'Invalid or expired token' },
        });
    }
}
