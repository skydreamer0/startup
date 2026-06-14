import { Router } from 'express';
import multer from 'multer';
import { ExcelController } from './excel.controller';
import { routePolicy } from '../../lib/admin-route-policy';

const router = Router();

// In-memory upload — files are processed and discarded per request.
// 10 MB cap is plenty for product imports (~30k SKU rows).
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
});

// ─── Exports ─────────────────────────────────────────────
router.get(
    '/export/products',
    ...routePolicy({ plan: 'starter', permission: 'read:products' }),
    ExcelController.exportProducts,
);
router.get(
    '/export/customers',
    ...routePolicy({ plan: 'starter', permission: 'read:crm' }),
    ExcelController.exportCustomers,
);
router.get(
    '/export/orders',
    ...routePolicy({ plan: 'starter', permission: 'read:orders' }),
    ExcelController.exportOrders,
);
router.get(
    '/export/inventory',
    ...routePolicy({ plan: 'starter', permission: 'read:products' }),
    ExcelController.exportInventory,
);

// ─── Imports ─────────────────────────────────────────────
router.post(
    '/import/products/preview',
    ...routePolicy({ plan: 'starter', permission: 'create:products', beforeValidation: [upload.single('file')] }),
    ExcelController.previewImportProducts,
);
router.post(
    '/import/products/confirm',
    ...routePolicy({ plan: 'starter', permission: 'create:products', beforeValidation: [upload.single('file')] }),
    ExcelController.confirmImportProducts,
);

export default router;
