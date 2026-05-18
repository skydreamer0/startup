import { describe, it, expect } from 'vitest';
import { getFeaturesForPlan, normalizePlan } from '../lib/plan-features';

describe('plan-features helper', () => {
    it('free plan returns only free features', () => {
        const features = getFeaturesForPlan('free');
        expect(features).toContain('auth');
        expect(features).toContain('users:crud');
        expect(features).toContain('pos:basic_checkout');
        expect(features).not.toContain('analytics:kpis');
        expect(features).not.toContain('analytics:rfm');
    });

    it('starter plan inherits free + adds starter features', () => {
        const features = getFeaturesForPlan('starter');
        expect(features).toContain('auth');
        expect(features).toContain('analytics:kpis');
        expect(features).toContain('analytics:trends');
        expect(features).toContain('reports:margin');
        expect(features).toContain('reports:cashflow');
        expect(features).toContain('reports:sales_ranking');
        expect(features).toContain('inventory:batches');
        expect(features).toContain('inventory:shifts');
        expect(features).not.toContain('analytics:rfm');
        expect(features).not.toContain('analytics:bonus_gate');
    });

    it('pro plan unlocks all features', () => {
        const features = getFeaturesForPlan('pro');
        expect(features).toContain('auth');
        expect(features).toContain('analytics:kpis');
        expect(features).toContain('analytics:rfm');
        expect(features).toContain('analytics:churn_risk');
        expect(features).toContain('analytics:product_abc');
        expect(features).toContain('analytics:supplier_ranking');
        expect(features).toContain('analytics:heatmap');
        expect(features).toContain('analytics:bonus_gate');
    });

    it('unknown plan name falls back to free', () => {
        const features = getFeaturesForPlan('enterprise');
        expect(features).toEqual(getFeaturesForPlan('free'));
    });

    it('normalizePlan handles null/undefined/unknown', () => {
        expect(normalizePlan(null)).toBe('free');
        expect(normalizePlan(undefined)).toBe('free');
        expect(normalizePlan('bogus')).toBe('free');
        expect(normalizePlan('starter')).toBe('starter');
        expect(normalizePlan('pro')).toBe('pro');
    });
});
