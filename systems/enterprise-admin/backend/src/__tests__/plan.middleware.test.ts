import { describe, it, expect } from 'vitest';
import { requirePlan } from '../middleware/plan.middleware';
import { tenantContext } from '../lib/tenant.context';
import type { Request, Response } from 'express';

type PlanName = 'free' | 'starter' | 'pro';

function createMocks() {
    const resData: { status?: number; body?: unknown } = {};
    const res = {
        status(code: number) {
            resData.status = code;
            return this;
        },
        json(data: unknown) {
            resData.body = data;
            return this;
        },
    } as unknown as Response;

    let nextCalled = false;
    const next = () => { nextCalled = true; };

    return { req: {} as Request, res, resData, next, wasNextCalled: () => nextCalled };
}

function runWithPlan(plan: PlanName, fn: () => void) {
    tenantContext.run({ tenantId: 'tenant-test', plan }, fn);
}

describe('Plan Middleware — requirePlan() (3×3 matrix)', () => {
    const plans: PlanName[] = ['free', 'starter', 'pro'];
    const required: PlanName[] = ['free', 'starter', 'pro'];
    const hierarchy: Record<PlanName, number> = { free: 0, starter: 1, pro: 2 };

    for (const current of plans) {
        for (const need of required) {
            const expectAllow = hierarchy[current] >= hierarchy[need];
            it(`current='${current}' need='${need}' should ${expectAllow ? 'allow (next)' : 'block 403'}`, () => {
                const { req, res, resData, next, wasNextCalled } = createMocks();
                runWithPlan(current, () => {
                    requirePlan(need)(req, res, next);
                });

                if (expectAllow) {
                    expect(wasNextCalled()).toBe(true);
                    expect(resData.status).toBeUndefined();
                } else {
                    expect(wasNextCalled()).toBe(false);
                    expect(resData.status).toBe(403);
                    const body = resData.body as { success: boolean; error: { code: string } };
                    expect(body.success).toBe(false);
                    expect(body.error.code).toBe('PLAN_UPGRADE_REQUIRED');
                }
            });
        }
    }

    it('returns 500 when tenant context is missing', () => {
        const { req, res, resData, next, wasNextCalled } = createMocks();
        // Call outside tenantContext.run on purpose
        requirePlan('starter')(req, res, next);

        expect(wasNextCalled()).toBe(false);
        expect(resData.status).toBe(500);
        const body = resData.body as { error: { code: string } };
        expect(body.error.code).toBe('SERVER_ERROR');
    });
});
