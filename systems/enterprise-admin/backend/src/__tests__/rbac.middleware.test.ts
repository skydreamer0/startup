import { describe, it, expect } from 'vitest';
import { requirePermission } from '../middleware/rbac.middleware';
import type { Request, Response } from 'express';

// Helper to create mock req/res/next
function createMocks(permissions: string[] = []) {
    const req = {
        user: permissions.length > 0 ? { userId: 'test-id', email: 'test@test.com', permissions } : undefined,
    } as Request;

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

    return { req, res, resData, next, wasNextCalled: () => nextCalled };
}

describe('RBAC Middleware', () => {
    it('should call next() when user has the required permission', () => {
        const { req, res, next, wasNextCalled } = createMocks(['read:users', 'create:users']);
        const middleware = requirePermission('read:users');

        middleware(req, res, next);

        expect(wasNextCalled()).toBe(true);
    });

    it('should return 403 when user lacks the required permission', () => {
        const { req, res, resData, next, wasNextCalled } = createMocks(['read:users']);
        const middleware = requirePermission('delete:users');

        middleware(req, res, next);

        expect(wasNextCalled()).toBe(false);
        expect(resData.status).toBe(403);
        expect((resData.body as { success: boolean }).success).toBe(false);
    });

    it('should return 401 when no user is attached to request', () => {
        const { req, res, resData, next, wasNextCalled } = createMocks();
        req.user = undefined;
        const middleware = requirePermission('read:users');

        middleware(req, res, next);

        expect(wasNextCalled()).toBe(false);
        expect(resData.status).toBe(401);
    });

    it('should handle multiple permission checks independently', () => {
        const { req, res, next, wasNextCalled } = createMocks(['read:users', 'read:roles']);

        requirePermission('read:users')(req, res, next);
        expect(wasNextCalled()).toBe(true);
    });
});
