import { StockReconciliationController } from './stock-reconciliation.controller';
import { Router } from 'express';
import multer from 'multer';
import { InventoryController } from './inventory.controller';
import { CsvController } from './csv.controller';
import { ProductPackagesController } from './product-packages.controller';
import { packageProductParams, packageRevisionBody, packageRevisionSchema, packageRetireSchema } from './product-packages.schema';
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

// Read-only physical reconciliation uses the existing product/batch read permission.
router.get('/stock-reconciliation', requirePermission('read:products'), StockReconciliationController.list);

// --- Products ---
router.get('/products/:productId/packages', requirePermission('read:products'), validate({ params: packageProductParams }), ProductPackagesController.list);
router.post('/products/:productId/packages', requirePermission('update:products'), validate({ params: packageProductParams, body: packageRevisionBody }), ProductPackagesController.create);
router.post('/products/:productId/packages/:packageId/revisions', requirePermission('update:products'), validate(packageRevisionSchema), ProductPackagesController.revise);
router.post('/products/:productId/packages/:packageId/retire', requirePermission('update:products'), validate(packageRetireSchema), ProductPackagesController.retire);
router.get('/products', requirePermission('read:products'), InventoryController.getProducts);
router.get('/products/:id', requirePermission('read:products'), InventoryController.getProductById);
router.post('/products', requirePermission('create:products'), validate({ body: createProductSchema.shape.body }), InventoryController.createProduct);
router.put('/products/:id', requirePermission('update:products'), validate({ body: updateProductSchema.shape.body }), InventoryController.updateProduct);

// CSV Export/Import
router.get('/products/export/csv', requirePermission('read:products'), CsvController.exportProducts);
router.post('/products/import/csv', requirePermission('create:products'), upload.single('file'), CsvController.importProducts);

export default router;
