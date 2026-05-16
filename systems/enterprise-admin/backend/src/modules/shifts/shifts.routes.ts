import { Router } from 'express';
import { ShiftController } from './shifts.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createShiftSchema, closeShiftSchema, getShiftsSchema } from './shifts.schema';

const router = Router();

router.use(authMiddleware);

router.get('/', requirePermission('read:shifts'), validate(getShiftsSchema), ShiftController.getAll);
router.get('/:id', requirePermission('read:shifts'), ShiftController.getById);
router.post('/', requirePermission('manage:shifts'), validate(createShiftSchema), ShiftController.create);
router.patch('/:id/close', requirePermission('manage:shifts'), validate(closeShiftSchema), ShiftController.close);
router.delete('/:id', requirePermission('manage:shifts'), ShiftController.delete);

export default router;
