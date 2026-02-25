import { Router } from 'express';
import { ExpensesController } from './expenses.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';

const router = Router();

// Protect all expense routes
router.use(authMiddleware);

// Routes
router.get('/', requirePermission('read:reports'), ExpensesController.getExpenses);
router.post('/', requirePermission('manage:reports'), ExpensesController.createExpense);
router.put('/:id', requirePermission('manage:reports'), ExpensesController.updateExpense);
router.delete('/:id', requirePermission('manage:reports'), ExpensesController.deleteExpense);

export default router;
