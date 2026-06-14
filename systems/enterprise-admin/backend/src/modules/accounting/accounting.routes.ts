import { Router } from 'express';
import { AccountingController } from './accounting.controller';
import { routePolicy } from '../../lib/admin-route-policy';

const router = Router();

router.use(...routePolicy({ plan: 'pro' }));

// Inspect the currently configured provider (used by the UI to render
// a "not configured" prompt or the provider name badge).
router.get('/provider', ...routePolicy({ auth: false, permission: 'read:accounting' }), AccountingController.getProviderInfo);

// List sync history.
router.get('/sync/status', ...routePolicy({ auth: false, permission: 'read:accounting' }), AccountingController.getSyncStatus);

// Trigger a sync for a specific order or expense.
router.post(
    '/sync/orders/:orderId',
    ...routePolicy({ auth: false, permission: 'manage:accounting' }),
    AccountingController.syncOrder,
);
router.post(
    '/sync/expenses/:expenseId',
    ...routePolicy({ auth: false, permission: 'manage:accounting' }),
    AccountingController.syncExpense,
);

export default router;
