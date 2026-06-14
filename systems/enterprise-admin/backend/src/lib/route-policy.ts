import type { RequestHandler } from 'express';
import type { z } from 'zod';

type PlanLevel = 'free' | 'starter' | 'pro';

export interface RoutePolicyAdapters {
  auth: RequestHandler;
  requirePlan: (plan: PlanLevel) => RequestHandler;
  requirePermission: (permission: string) => RequestHandler;
  validate: (schemas: RouteValidationSchemas) => RequestHandler;
}

export interface RouteValidationSchemas {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}

export interface RoutePolicy {
  auth?: boolean;
  public?: boolean;
  plan?: PlanLevel;
  permission?: string;
  beforeValidation?: RequestHandler[];
  validation?: RouteValidationSchemas;
}

export function createRoutePolicy(adapters: RoutePolicyAdapters, policy: RoutePolicy = {}): RequestHandler[] {
  if (policy.public) return [];

  return [
    ...(policy.auth === false ? [] : [adapters.auth]),
    ...(policy.plan ? [adapters.requirePlan(policy.plan)] : []),
    ...(policy.permission ? [adapters.requirePermission(policy.permission)] : []),
    ...(policy.beforeValidation ?? []),
    ...(policy.validation ? [adapters.validate(policy.validation)] : []),
  ];
}

export function createRoutePolicyFactory(adapters: RoutePolicyAdapters) {
  return (policy: RoutePolicy = {}) => createRoutePolicy(adapters, policy);
}
