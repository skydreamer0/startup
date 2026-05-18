/**
 * Plan → feature key mapping.
 *
 * Source of truth: infrastructure/standards/plan_matrix.md.
 * Plans are additive: each plan inherits the features of all lower tiers.
 */

export type PlanName = 'free' | 'starter' | 'pro';

export const PLAN_HIERARCHY: Readonly<Record<PlanName, number>> = {
    free: 0,
    starter: 1,
    pro: 2,
};

const FREE_FEATURES: readonly string[] = [
    'auth',
    'users:crud',
    'roles',
    'products:crud',
    'suppliers',
    'customers',
    'orders',
    'pos:basic_checkout',
    'audit_logs',
];

const STARTER_FEATURES: readonly string[] = [
    'analytics:kpis',
    'analytics:trends',
    'reports:margin',
    'reports:cashflow',
    'reports:sales_ranking',
    'inventory:batches',
    'inventory:shifts',
];

const PRO_FEATURES: readonly string[] = [
    'analytics:rfm',
    'analytics:churn_risk',
    'analytics:product_abc',
    'analytics:supplier_ranking',
    'analytics:heatmap',
    'analytics:bonus_gate',
];

/**
 * Return the full list of feature keys unlocked at the given plan.
 * Unknown plans fall back to `free`.
 */
export function getFeaturesForPlan(plan: string): string[] {
    const normalized: PlanName = (PLAN_HIERARCHY[plan as PlanName] === undefined
        ? 'free'
        : (plan as PlanName));

    const features: string[] = [...FREE_FEATURES];
    if (PLAN_HIERARCHY[normalized] >= PLAN_HIERARCHY.starter) {
        features.push(...STARTER_FEATURES);
    }
    if (PLAN_HIERARCHY[normalized] >= PLAN_HIERARCHY.pro) {
        features.push(...PRO_FEATURES);
    }
    return features;
}

/**
 * Normalize an arbitrary string into a known plan name. Falls back to `free`.
 */
export function normalizePlan(plan: string | null | undefined): PlanName {
    if (plan && (plan === 'free' || plan === 'starter' || plan === 'pro')) {
        return plan;
    }
    return 'free';
}
