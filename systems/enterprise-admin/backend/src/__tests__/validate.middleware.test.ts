import { describe, it, expect } from 'vitest';
import { validate } from '../middleware/validate.middleware';
import { z } from 'zod';
import type { Request, Response } from 'express';

function createMocks(body?: unknown, query?: Record<string, unknown>) {
    const req = {
        body: body || {},
        query: query || {},
        params: {},
    } as unknown as Request;

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
    const next = (err?: unknown) => {
        nextCalled = true;
    };

    return { req, res, resData, next, wasNextCalled: () => nextCalled };
}

describe('Validate Middleware', () => {
    const schema = z.object({
        email: z.string().email(),
        password: z.string().min(6),
    });

    it('should pass validation with valid body', () => {
        const { req, res, next, wasNextCalled } = createMocks({
            email: 'test@example.com',
            password: 'password123',
        });

        validate({ body: schema })(req, res, next);

        expect(wasNextCalled()).toBe(true);
        expect(req.body.email).toBe('test@example.com');
    });

    it('should return 400 for invalid body', () => {
        const { req, res, resData, next, wasNextCalled } = createMocks({
            email: 'not-an-email',
            password: '123',
        });

        validate({ body: schema })(req, res, next);

        expect(wasNextCalled()).toBe(false);
        expect(resData.status).toBe(400);
        expect((resData.body as { success: boolean }).success).toBe(false);
        expect((resData.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED');
    });

    it('should return 400 for missing required fields', () => {
        const { req, res, resData, next, wasNextCalled } = createMocks({});

        validate({ body: schema })(req, res, next);

        expect(wasNextCalled()).toBe(false);
        expect(resData.status).toBe(400);
    });

    it('should pass when no schemas are provided', () => {
        const { req, res, next, wasNextCalled } = createMocks({ anything: 'goes' });

        validate({})(req, res, next);

        expect(wasNextCalled()).toBe(true);
    });
});
