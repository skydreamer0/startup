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

    // If no explicit header, try extracting from Authorization Bearer token
    if (!tenantId && req.headers.authorization?.startsWith('Bearer ')) {
        try {
            const token = req.headers.authorization.split(' ')[1];
            const payload = verifyAccessToken(token);
            // In a full implementation, the JWT might contain the tenantId directly
            // For now, we look up the user's tenantId. We use basePrisma to avoid auto-injection loops here.
            const user = await basePrisma.user.findUnique({
                where: { id: payload.userId },
                select: { tenantId: true }
            }) as any;
            if (user?.tenantId) {
                tenantId = user.tenantId;
            }
        } catch (e) {
            // Ignore token verification errors here; auth.middleware will catch them later
        }
    }

    // Fallback logic (Dev only) or graceful failure
    if (!tenantId) {
        // For development MVP, if no tenant is provided, route to "System Default"
        const defaultTenant = await basePrisma.tenant.findUnique({ where: { slug: 'default' } });
        if (defaultTenant) {
            tenantId = defaultTenant.id;
        } else {
            return res.status(400).json({
                success: false,
                error: { code: 'TENANT_REQUIRED', message: 'A valid tenant context is required.' }
            });
        }
    }

    // Fetch tenant plan for caching/gating
    const tenant = await basePrisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true }
    });

    if (!tenant) {
        return res.status(404).json({
            success: false,
            error: { code: 'TENANT_NOT_FOUND', message: 'The specified tenant does not exist.' }
        });
    }

    // Run the rest of the middleware chain inside the tenant context
    tenantContext.run({ tenantId, plan: tenant.plan }, () => {
        next();
    });
}
