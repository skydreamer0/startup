import { prisma } from '../../lib/prisma';
import { verifyPassword } from '../../lib/password';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt';

export class AuthService {
    /**
     * Authenticate user with email/password, return token pair.
     */
    async login(email: string, password: string) {
        const user = await prisma.user.findUnique({
            where: { email, deletedAt: null },
        });

        if (!user || user.status !== 'active') {
            throw new AuthError('Invalid credentials', 401);
        }

        const validPassword = await verifyPassword(user.passwordHash, password);

        if (!validPassword) {
            // Increment failed login attempts
            await prisma.user.update({
                where: { id: user.id },
                data: { failedLoginAttempts: { increment: 1 } },
            });
            throw new AuthError('Invalid credentials', 401);
        }

        // Reset failed attempts and update last login
        await prisma.user.update({
            where: { id: user.id },
            data: {
                failedLoginAttempts: 0,
                lastLoginAt: new Date(),
            },
        });

        // 載入 tenant plan
        const tenant = await prisma.tenant.findUnique({
            where: { id: user.tenantId! },
            select: { plan: true },
        });

        // 載入 permissions（含角色 join）
        const userWithRoles = await prisma.user.findUnique({
            where: { id: user.id },
            include: {
                userRoles: {
                    include: {
                        role: { include: { rolePermissions: { include: { permission: true } } } },
                    },
                },
            },
        });
        const permissions = [
            ...new Set(
                userWithRoles?.userRoles.flatMap((ur) =>
                    ur.role.rolePermissions.map((rp) => `${rp.permission.action}:${rp.permission.resource}`),
                ) ?? [],
            ),
        ];

        const accessToken = signAccessToken({
            userId: user.id,
            email: user.email,
            tenantId: user.tenantId ?? undefined,
            plan: tenant?.plan ?? 'free',
            permissions,
        });
        const refreshToken = signRefreshToken({ userId: user.id, type: 'refresh' });

        return { accessToken, refreshToken, user: { id: user.id, email: user.email, fullName: user.fullName } };
    }

    /**
     * Exchange refresh token for a new access token.
     */
    async refresh(refreshToken: string) {
        try {
            const payload = verifyRefreshToken(refreshToken);

            const user = await prisma.user.findUnique({
                where: { id: payload.userId, deletedAt: null },
            });

            if (!user || user.status !== 'active') {
                throw new AuthError('User not found or inactive', 401);
            }

            // 載入 tenant plan
            const tenant = await prisma.tenant.findUnique({
                where: { id: user.tenantId! },
                select: { plan: true },
            });

            // 載入 permissions（含角色 join）
            const userWithRoles = await prisma.user.findUnique({
                where: { id: user.id },
                include: {
                    userRoles: {
                        include: {
                            role: { include: { rolePermissions: { include: { permission: true } } } },
                        },
                    },
                },
            });
            const permissions = [
                ...new Set(
                    userWithRoles?.userRoles.flatMap((ur) =>
                        ur.role.rolePermissions.map((rp) => `${rp.permission.action}:${rp.permission.resource}`),
                    ) ?? [],
                ),
            ];

            const newAccessToken = signAccessToken({
                userId: user.id,
                email: user.email,
                tenantId: user.tenantId ?? undefined,
                plan: tenant?.plan ?? 'free',
                permissions,
            });
            return { accessToken: newAccessToken };
        } catch (error) {
            if (error instanceof AuthError) throw error;
            throw new AuthError('Invalid refresh token', 401);
        }
    }

    /**
     * Get current user profile with permissions.
     */
    async getProfile(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId, deletedAt: null },
            select: {
                id: true,
                email: true,
                fullName: true,
                status: true,
                lastLoginAt: true,
                createdAt: true,
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

        if (!user) {
            throw new AuthError('User not found', 404);
        }

        const roles = user.userRoles.map((ur) => ur.role.name);
        const permissions = [
            ...new Set(
                user.userRoles.flatMap((ur) =>
                    ur.role.rolePermissions.map((rp) => `${rp.permission.action}:${rp.permission.resource}`),
                ),
            ),
        ];

        return {
            id: user.id,
            email: user.email,
            fullName: user.fullName,
            status: user.status,
            lastLoginAt: user.lastLoginAt,
            createdAt: user.createdAt,
            roles,
            permissions,
        };
    }
}

export class AuthError extends Error {
    statusCode: number;
    constructor(message: string, statusCode: number) {
        super(message);
        this.name = 'AuthError';
        this.statusCode = statusCode;
    }
}
