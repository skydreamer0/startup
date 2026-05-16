import { Router } from 'express';
import { ProductBatchController } from './product-batches.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  createProductBatchSchema,
  updateProductBatchSchema,
  getProductBatchesSchema,
} from './product-batches.schema';

const router = Router();

router.use(authMiddleware);

router.get(
  '/',
  requirePermission('read:inventory'),
  validate(getProductBatchesSchema),
  ProductBatchController.getAll,
);
router.get('/:id', requirePermission('read:inventory'), ProductBatchController.getById);
router.post(
  '/',
  requirePermission('manage:inventory'),
  validate(createProductBatchSchema),
  ProductBatchController.create,
);
router.patch(
  '/:id',
  requirePermission('manage:inventory'),
  validate(updateProductBatchSchema),
  ProductBatchController.update,
);
router.delete('/:id', requirePermission('manage:inventory'), ProductBatchController.delete);

export default router;
