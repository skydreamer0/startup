import { Router } from 'express';
import multer from 'multer';
import { ExcelController } from './excel.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { requirePlan } from '../../middleware/plan.middleware';

const router = Router();

// In-memory upload — files are processed and discarded per request.
// 10 MB cap is plenty for product imports (~30k SKU rows).
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(authMiddleware);

// ─── Exports ─────────────────────────────────────────────
router.get(
    '/export/products',
    requirePlan('starter'),
    requirePermission('read:products'),
    ExcelController.exportProducts,
);
router.get(
    '/export/customers',
    requirePlan('starter'),
    requirePermission('read:crm'),
    ExcelController.exportCustomers,
);
router.get(
    '/export/orders',
    requirePlan('starter'),
    requirePermission('read:orders'),
    ExcelController.exportOrders,
);
router.get(
    '/export/inventory',
    requirePlan('starter'),
    requirePermission('read:products'),
    ExcelController.exportInventory,
);

// ─── Imports ─────────────────────────────────────────────
router.post(
    '/import/products/preview',
    requirePlan('starter'),
    requirePermission('create:products'),
    upload.single('file'),
    ExcelController.previewImportProducts,
);
router.post(
    '/import/products/confirm',
    requirePlan('starter'),
    requirePermission('create:products'),
    upload.single('file'),
    ExcelController.confirmImportProducts,
);

export default router;
