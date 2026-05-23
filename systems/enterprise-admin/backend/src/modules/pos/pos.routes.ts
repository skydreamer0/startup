import { Router } from 'express';
import { PosController } from './pos.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { requirePlan } from '../../middleware/plan.middleware';
import { validate } from '../../middleware/validate.middleware';
import { checkoutSchema, createPosCustomerSchema, customerLookupSchema, customerRecommendationsSchema, posProductsSchema } from './pos.schema';
import { posRateLimit } from '../../middleware/rate-limit.middleware';

const router = Router();

router.use(posRateLimit);

// Public: employee barcode login — no token required for POS kiosk
router.post('/staff-login', PosController.staffLogin);

router.use(authMiddleware);
router.use(requirePermission('manage:pos'));

router.post('/checkout', validate(checkoutSchema), PosController.checkout);
router.get('/products', validate(posProductsSchema), PosController.getProducts);
router.get('/customer-lookup', validate(customerLookupSchema), PosController.lookupCustomer);
router.post('/customers', validate(createPosCustomerSchema), PosController.createCustomer);
router.get('/reorder-forecast', requirePlan('pro'), PosController.getReorderForecast);
router.get('/recommendations', PosController.getHotRecommendations);
router.get('/recommendations/:customerId', validate(customerRecommendationsSchema), PosController.getRecommendations);
router.get('/staff', PosController.getStaff);
router.get('/shift/active', PosController.getActiveShift);
router.get('/receipt/:orderId', PosController.getReceipt);
router.get('/orders/today', PosController.getTodayOrders);
router.get('/orders/:orderId', PosController.getOrderById);
router.post('/orders/:orderId/refund', PosController.refundOrder);

export default router;
