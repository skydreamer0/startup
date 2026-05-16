import { Router } from 'express';
import { PosController } from './pos.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { checkoutSchema, posProductsSchema } from './pos.schema';

const router = Router();

// Public: employee barcode login — no token required for POS kiosk
router.post('/staff-login', PosController.staffLogin);

router.use(authMiddleware);
router.use(requirePermission('manage:pos'));

router.post('/checkout', validate(checkoutSchema), PosController.checkout);
router.get('/products', validate(posProductsSchema), PosController.getProducts);
router.get('/staff', PosController.getStaff);
router.get('/shift/active', PosController.getActiveShift);
router.get('/receipt/:orderId', PosController.getReceipt);

export default router;
