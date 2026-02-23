import { Router } from 'express';
import { OrderController } from './order.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';

const router = Router();

router.use(authMiddleware);

router.post('/', requirePermission('create:orders'), OrderController.create);
router.get('/', requirePermission('read:orders'), OrderController.list);
router.get('/:id', requirePermission('read:orders'), OrderController.getById);
router.patch('/:id/status', requirePermission('update:orders'), OrderController.updateStatus);

export default router;
