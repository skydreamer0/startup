import { Router } from 'express';
import { DailySettlementController } from './daily-settlements.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createDailySettlementSchema,
  calculateSettlementSchema,
  getDailySettlementsSchema,
} from './daily-settlements.schema';

const router = Router();

router.use(authMiddleware);

router.get(
  '/',
  requirePermission('read:shifts'),
  validate(getDailySettlementsSchema),
  DailySettlementController.getAll,
);
router.get('/:id', requirePermission('read:shifts'), DailySettlementController.getById);
router.post(
  '/calculate',
  requirePermission('manage:shifts'),
  validate(calculateSettlementSchema),
  DailySettlementController.calculate,
);
router.post(
  '/',
  requirePermission('manage:shifts'),
  validate(createDailySettlementSchema),
  DailySettlementController.create,
);
router.post('/:id/confirm', requirePermission('manage:shifts'), DailySettlementController.confirm);

export default router;
