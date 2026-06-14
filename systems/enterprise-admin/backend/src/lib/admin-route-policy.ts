import { authMiddleware } from '../middleware/auth.middleware';
import { requirePlan } from '../middleware/plan.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import { validate } from '../middleware/validate.middleware';
import { createRoutePolicyFactory } from './route-policy';

export const routePolicy = createRoutePolicyFactory({
  auth: authMiddleware,
  requirePlan,
  requirePermission,
  validate,
});
