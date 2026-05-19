import { Router } from 'express';
import { LineController } from './line.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { requirePlan } from '../../middleware/plan.middleware';

const router = Router();

// Webhook from LINE — no auth, no plan check (LINE servers call this).
// Signature is validated inside the controller using LINE_CHANNEL_SECRET.
router.post('/webhook', LineController.webhook);

// All other LINE routes require auth + pro plan + manage:marketing permission
router.use(authMiddleware);
router.use(requirePlan('pro'));

router.post('/broadcast', requirePermission('manage:marketing'), LineController.broadcast);
router.post('/push/:customerId', requirePermission('manage:marketing'), LineController.push);
router.get('/broadcasts', requirePermission('manage:marketing'), LineController.listBroadcasts);

export default router;
