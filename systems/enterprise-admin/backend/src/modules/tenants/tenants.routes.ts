import { Router } from 'express';
import { TenantsController } from './tenants.controller';
import { authMiddleware } from '../../middleware/auth.middleware';

const router = Router();

router.use(authMiddleware);

// Current tenant's plan & unlocked features
router.get('/me/plan', TenantsController.getMyPlan);

export default router;
