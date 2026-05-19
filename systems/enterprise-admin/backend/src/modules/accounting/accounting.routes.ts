import { Router } from 'express';
import { AccountingController } from './accounting.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { requirePlan } from '../../middleware/plan.middleware';

const router = Router();

// Authentication for all routes.
router.use(authMiddleware);

// All accounting integration endpoints require the `pro` plan tier.
router.use(requirePlan('pro'));

// Inspect the currently configured provider (used by the UI to render
// a "not configured" prompt or the provider name badge).
router.get('/provider', requirePermission('read:accounting'), AccountingController.getProviderInfo);

// List sync history.
router.get('/sync/status', requirePermission('read:accounting'), AccountingController.getSyncStatus);

// Trigger a sync for a specific order or expense.
router.post(
    '/sync/orders/:orderId',
    requirePermission('manage:accounting'),
    AccountingController.syncOrder,
);
router.post(
    '/sync/expenses/:expenseId',
    requirePermission('manage:accounting'),
    AccountingController.syncExpense,
);

export default router;
