import { Request, Response, NextFunction } from 'express';
import { tenantContext } from '../lib/tenant.context';
import { basePrisma } from '../lib/prisma';
import { verifyAccessToken } from '../lib/jwt';

/**
 * Tenant Context Middleware
 * Intercepts the request to determine the current tenant and wraps the rest
 * of the request execution within an AsyncLocalStorage context.
 * 
 * Strategy:
 * 1. Read `x-tenant-id` header (useful for server-to-server or API keys).
 * 2. Fallback to `tenantId` inside the user's JWT payload.
 * 3. Fallback to a default tenant (for local dev single-tenant equivalence).
 */
export async function setTenantContext(req: Request, res: Response, next: NextFunction) {
    let tenantId = req.headers['x-tenant-id'] as string;
    let plan = '';

    // If no explicit header, try extracting from Authorization Bearer token
    if (!tenantId && req.headers.authorization?.startsWith('Bearer ')) {
        try {
            const token = req.headers.authorization.split(' ')[1];
            const payload = verifyAccessToken(token);

            if (payload.tenantId) {
                // 新 JWT：直接從 payload 讀取，零 DB 查詢
                tenantId = payload.tenantId;
                plan = payload.plan ?? 'free';
            } else {
                // 舊 JWT 向後相容：查 DB 取 tenantId 和 plan
                const user = await basePrisma.user.findUnique({
                    where: { id: payload.userId },
                    select: { tenantId: true },
                }) as { tenantId: string | null } | null;
                if (user?.tenantId) {
                    tenantId = user.tenantId;
                    const tenantRow = await basePrisma.tenant.findUnique({
                        where: { id: tenantId },
                        select: { plan: true },
                    });
                    plan = tenantRow?.plan ?? 'free';
                }
            }
        } catch (e) {
            // Ignore token verification errors here; auth.middleware will catch them later
        }
    }

    // Fallback: no tenantId resolved yet
    if (!tenantId) {
        try {
            // For development MVP, if no tenant is provided, route to "System Default"
            const defaultTenant = await basePrisma.tenant.findUnique({
                where: { slug: 'default' },
                select: { id: true, plan: true },
            });
            if (defaultTenant) {
                tenantId = defaultTenant.id;
                plan = defaultTenant.plan ?? 'free';
            } else {
                return res.status(400).json({
                    success: false,
                    error: { code: 'TENANT_REQUIRED', message: 'A valid tenant context is required.' },
                });
            }
        } catch {
            return res.status(400).json({
                success: false,
                error: { code: 'TENANT_REQUIRED', message: 'Tenant resolution unavailable.' },
            });
        }
    }

    // 若 plan 仍未取得（例如透過 x-tenant-id header 進來，或 defaultTenant 未帶 plan）
    if (!plan) {
        try {
            const tenantRow = await basePrisma.tenant.findUnique({
                where: { id: tenantId },
                select: { plan: true },
            });
            if (!tenantRow) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'TENANT_NOT_FOUND', message: 'The specified tenant does not exist.' },
                });
            }
            plan = tenantRow.plan;
        } catch {
            return res.status(400).json({
                success: false,
                error: { code: 'TENANT_REQUIRED', message: 'Tenant resolution unavailable.' },
            });
        }
    }

    // Run the rest of the middleware chain inside the tenant context
    tenantContext.run({ tenantId, plan }, () => {
        next();
    });
}
