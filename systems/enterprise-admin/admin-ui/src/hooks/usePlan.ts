import { useQuery } from '@tanstack/react-query';
import api from '../api/client';

export type PlanName = 'free' | 'starter' | 'pro';

export interface PlanInfo {
    plan: PlanName;
    features: string[];
}

const PLAN_HIERARCHY: Record<PlanName, number> = {
    free: 0,
    starter: 1,
    pro: 2,
};

async function fetchPlan(): Promise<PlanInfo> {
    const res = await api.get<{ success: boolean; data: PlanInfo }>('/tenants/me/plan');
    return res.data.data;
}

/**
 * TanStack Query hook returning the current tenant's plan info.
 * Cached for the session — plan rarely changes during a session.
 */
export function usePlan() {
    return useQuery<PlanInfo>({
        queryKey: ['tenant', 'plan'],
        queryFn: fetchPlan,
        staleTime: 5 * 60 * 1000,
    });
}

/**
 * Compare two plans. Returns true if `current` is at least `required`.
 */
export function planMeets(current: PlanName | undefined, required: PlanName): boolean {
    if (!current) return false;
    return PLAN_HIERARCHY[current] >= PLAN_HIERARCHY[required];
}
