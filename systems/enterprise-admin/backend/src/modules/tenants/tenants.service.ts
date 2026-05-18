import { basePrisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';
import { getFeaturesForPlan, normalizePlan, PlanName } from '../../lib/plan-features';

export interface CurrentPlanInfo {
    plan: PlanName;
    features: string[];
}

export class TenantsService {
    /**
     * Resolve the current tenant's plan info (plan name + unlocked feature keys).
     * Reads tenantId from AsyncLocalStorage to enforce multi-tenant safety.
     */
    static async getCurrentPlan(): Promise<CurrentPlanInfo> {
        const tenantId = requireTenantId();

        const tenant = await basePrisma.tenant.findUnique({
            where: { id: tenantId },
            select: { plan: true },
        });

        const plan = normalizePlan(tenant?.plan);
        return {
            plan,
            features: getFeaturesForPlan(plan),
        };
    }
}
