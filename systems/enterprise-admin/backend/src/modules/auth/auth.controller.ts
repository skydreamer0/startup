import { Request, Response, NextFunction } from 'express';
import { AuthService, AuthError } from './auth.service';

const authService = new AuthService();

export class AuthController {
    /**
     * POST /auth/login
     */
    async login(req: Request, res: Response, next: NextFunction) {
        try {
            const { email, password } = req.body;
            const result = await authService.login(email, password);

            // Log audit
            const { prisma } = await import('../../lib/prisma');
            await prisma.auditLog.create({
                data: {
                    userId: result.user.id,
                    action: 'LOGIN',
                    resourceType: 'users',
                    resourceId: result.user.id,
                    ipAddress: req.ip || null,
                    userAgent: req.headers['user-agent'] || null,
                },
            });

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            if (error instanceof AuthError) {
                return res.status(error.statusCode).json({
                    success: false,
                    error: { code: 'AUTH_FAILED', message: error.message },
                });
            }
            next(error);
        }
    }

    /**
     * POST /auth/refresh
     */
    async refresh(req: Request, res: Response, next: NextFunction) {
        try {
            const { refreshToken } = req.body;
            const result = await authService.refresh(refreshToken);

            res.json({
                success: true,
                data: result,
            });
        } catch (error) {
            if (error instanceof AuthError) {
                return res.status(error.statusCode).json({
                    success: false,
                    error: { code: 'TOKEN_INVALID', message: error.message },
                });
            }
            next(error);
        }
    }

    /**
     * POST /auth/logout
     */
    async logout(req: Request, res: Response) {
        // For stateless JWT, logout is primarily a client-side action.
        // In production, add the token to a Redis blacklist here.
        if (req.user) {
            const { prisma } = await import('../../lib/prisma');
            await prisma.auditLog.create({
                data: {
                    userId: req.user.userId,
                    action: 'LOGOUT',
                    resourceType: 'users',
                    resourceId: req.user.userId,
                    ipAddress: req.ip || null,
                    userAgent: req.headers['user-agent'] || null,
                },
            });
        }

        res.json({
            success: true,
            data: { message: 'Logged out successfully' },
        });
    }

    /**
     * GET /auth/me
     */
    async me(req: Request, res: Response, next: NextFunction) {
        try {
            const profile = await authService.getProfile(req.user!.userId);

            res.json({
                success: true,
                data: profile,
            });
        } catch (error) {
            if (error instanceof AuthError) {
                return res.status(error.statusCode).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: error.message },
                });
            }
            next(error);
        }
    }
}
