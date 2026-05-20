import { Router } from 'express';
import multer from 'multer';
import { InventoryController } from './inventory.controller';
import { CsvController } from './csv.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
    createSupplierSchema,
    updateSupplierSchema,
    createProductSchema,
    updateProductSchema
} from './inventory.schema';

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

const router = Router();

// Protect all inventory routes
router.use(authMiddleware);

// --- Suppliers ---
router.get('/suppliers', requirePermission('read:suppliers'), InventoryController.getSuppliers);
router.get('/suppliers/:id', requirePermission('read:suppliers'), InventoryController.getSupplierById);
router.post('/suppliers', requirePermission('create:suppliers'), validate({ body: createSupplierSchema }), InventoryController.createSupplier);
router.put('/suppliers/:id', requirePermission('update:suppliers'), validate({ body: updateSupplierSchema }), InventoryController.updateSupplier);

// --- Products ---
router.get('/products', requirePermission('read:products'), InventoryController.getProducts);
router.get('/products/:id', requirePermission('read:products'), InventoryController.getProductById);
router.post('/products', requirePermission('create:products'), validate({ body: createProductSchema }), InventoryController.createProduct);
router.put('/products/:id', requirePermission('update:products'), validate({ body: updateProductSchema }), InventoryController.updateProduct);

// CSV Export/Import
router.get('/products/export/csv', requirePermission('read:products'), CsvController.exportProducts);
router.post('/products/import/csv', requirePermission('create:products'), upload.single('file'), CsvController.importProducts);

export default router;
