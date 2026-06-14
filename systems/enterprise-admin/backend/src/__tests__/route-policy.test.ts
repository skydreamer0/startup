import { describe, expect, it, vi } from 'vitest';
import type { RequestHandler } from 'express';
import { createRoutePolicy } from '../lib/route-policy';

function namedMiddleware(name: string): RequestHandler {
  const middleware: RequestHandler = (_req, _res, next) => next();
  Object.defineProperty(middleware, 'name', { value: name });
  return middleware;
}

describe('createRoutePolicy', () => {
  it('assembles route middleware in the standard policy order', () => {
    const auth = namedMiddleware('auth');
    const plan = vi.fn(() => namedMiddleware('plan'));
    const permission = vi.fn(() => namedMiddleware('permission'));
    const validate = vi.fn(() => namedMiddleware('validate'));
    const upload = namedMiddleware('upload');

    const middleware = createRoutePolicy(
      {
        auth,
        requirePlan: plan,
        requirePermission: permission,
        validate,
      },
      {
        plan: 'starter',
        permission: 'read:products',
        validation: { body: {} },
        beforeValidation: [upload],
      },
    );

    expect(middleware.map((handler) => handler.name)).toEqual([
      'auth',
      'plan',
      'permission',
      'upload',
      'validate',
    ]);
    expect(plan).toHaveBeenCalledWith('starter');
    expect(permission).toHaveBeenCalledWith('read:products');
    expect(validate).toHaveBeenCalledWith({ body: {} });
  });

  it('keeps public route exceptions free of auth and policy middleware', () => {
    const auth = namedMiddleware('auth');
    const middleware = createRoutePolicy(
      {
        auth,
        requirePlan: vi.fn(() => namedMiddleware('plan')),
        requirePermission: vi.fn(() => namedMiddleware('permission')),
        validate: vi.fn(() => namedMiddleware('validate')),
      },
      { public: true, permission: 'manage:marketing', plan: 'pro' },
    );

    expect(middleware).toEqual([]);
  });

  it('allows nested route policy to reuse an outer auth seam', () => {
    const auth = namedMiddleware('auth');
    const permission = vi.fn(() => namedMiddleware('permission'));

    const middleware = createRoutePolicy(
      {
        auth,
        requirePlan: vi.fn(() => namedMiddleware('plan')),
        requirePermission: permission,
        validate: vi.fn(() => namedMiddleware('validate')),
      },
      { auth: false, permission: 'read:accounting' },
    );

    expect(middleware.map((handler) => handler.name)).toEqual(['permission']);
    expect(permission).toHaveBeenCalledWith('read:accounting');
  });
});
