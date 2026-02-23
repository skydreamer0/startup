import { Request, Response, NextFunction } from 'express';

/**
 * RBAC Permission Guard
 * Usage: router.get('/users', authMiddleware, requirePermission('users:read'), handler)
 *
 * Checks if req.user.permissions includes the required permission string.
 * Must be placed AFTER authMiddleware in the chain.
 */
export function requirePermission(permission: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
            });
        }

        if (!req.user.permissions.includes(permission)) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'FORBIDDEN',
                    message: `Missing required permission: ${permission}`,
                },
            });
        }

        next();
    };
}
