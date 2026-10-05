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
  requirePermission('read:products'),
  validate(getProductBatchesSchema),
  ProductBatchController.getAll,
);
router.get('/:id', requirePermission('read:products'), ProductBatchController.getById);
router.post(
  '/',
  requirePermission('create:products'),
  validate(createProductBatchSchema),
  ProductBatchController.create,
);
router.patch(
  '/:id',
  requirePermission('update:products'),
  validate(updateProductBatchSchema),
  ProductBatchController.update,
);
router.delete('/:id', requirePermission('update:products'), ProductBatchController.delete);

export default router;
