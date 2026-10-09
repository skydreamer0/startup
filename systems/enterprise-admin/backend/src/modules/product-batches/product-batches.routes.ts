import { Router } from 'express';
import { ProductBatchController } from './product-batches.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
  changeBatchStatusSchema, correctBatchExpirySchema, correctBatchCostSchema, batchHistorySchema,
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
router.get('/:id/history', requirePermission('read:products'), validate(batchHistorySchema), ProductBatchController.history);
router.post('/:id/status', requirePermission('update:products'), validate(changeBatchStatusSchema), ProductBatchController.changeStatus);
router.post('/:id/expiry-corrections', requirePermission('update:products'), validate(correctBatchExpirySchema), ProductBatchController.correctExpiry);
router.post('/:id/cost-corrections', requirePermission('update:products'), validate(correctBatchCostSchema), ProductBatchController.correctCost);
router.delete('/:id', requirePermission('update:products'), ProductBatchController.delete);

export default router;
