import { Request, Response, NextFunction } from 'express';
import { tenantContext } from '../lib/tenant.context';

const PLAN_HIERARCHY = {
    free: 0,
    starter: 1,
    pro: 2,
};

type PlanLevel = keyof typeof PLAN_HIERARCHY;

/**
 * Feature Gating Middleware
 * Restricts route access based on the tenant's current subscription plan.
 * Must be used AFTER `setTenantContext`.
 */
export function requirePlan(requiredPlan: PlanLevel) {
    return (req: Request, res: Response, next: NextFunction) => {
        const context = tenantContext.getStore();

        if (!context || !context.plan) {
            return res.status(500).json({
                success: false,
                error: { code: 'SERVER_ERROR', message: 'Tenant context is missing for plan verification.' }
            });
        }

        const currentPlanLevel = PLAN_HIERARCHY[context.plan as PlanLevel] ?? -1;
        const requiredPlanLevel = PLAN_HIERARCHY[requiredPlan] ?? 99;

        if (currentPlanLevel < requiredPlanLevel) {
            return res.status(403).json({
                success: false,
                error: {
                    code: 'PLAN_UPGRADE_REQUIRED',
                    message: `This feature requires the '${requiredPlan}' plan or higher. Your current plan is '${context.plan}'.`
                }
            });
        }

        next();
    };
}
