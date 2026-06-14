import { Router } from 'express';
import { LineController } from './line.controller';
import { routePolicy } from '../../lib/admin-route-policy';

const router = Router();

// Webhook from LINE — no auth, no plan check (LINE servers call this).
// Signature is validated inside the controller using LINE_CHANNEL_SECRET.
router.post('/webhook', LineController.webhook);

// All other LINE routes require auth + pro plan + manage:marketing permission
router.use(...routePolicy({ plan: 'pro' }));

router.post('/broadcast', ...routePolicy({ auth: false, permission: 'manage:marketing' }), LineController.broadcast);
router.post('/push/:customerId', ...routePolicy({ auth: false, permission: 'manage:marketing' }), LineController.push);
router.get('/broadcasts', ...routePolicy({ auth: false, permission: 'manage:marketing' }), LineController.listBroadcasts);

export default router;
