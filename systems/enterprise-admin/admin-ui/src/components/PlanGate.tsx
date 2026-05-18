import { ReactNode } from 'react';
import { usePlan, planMeets, PlanName } from '../hooks/usePlan';

interface PlanGateProps {
    plan: PlanName;
    children: ReactNode;
    /** Optional fallback shown when the gate is closed. Defaults to a small upgrade hint. */
    fallback?: ReactNode;
}

/**
 * Render `children` only when the current tenant plan meets the required tier.
 * Otherwise render a small "Upgrade required" placeholder (or the provided fallback).
 */
export default function PlanGate({ plan, children, fallback }: PlanGateProps) {
    const { data, isLoading } = usePlan();

    if (isLoading) return null;

    if (planMeets(data?.plan, plan)) {
        return <>{children}</>;
    }

    if (fallback !== undefined) return <>{fallback}</>;

    return (
        <div
            className="plan-gate-upgrade"
            style={{
                padding: '0.75rem 1rem',
                border: '1px dashed var(--border, #ccc)',
                borderRadius: 6,
                color: 'var(--text-muted, #888)',
                fontSize: '0.875rem',
            }}
        >
            Upgrade required — this feature needs the <strong>{plan}</strong> plan or higher.
        </div>
    );
}
