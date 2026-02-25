import { Router } from 'express';
import { AnalyticsController } from './analytics.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { requirePlan } from '../../middleware/plan.middleware';

const router = Router();

// Protect all analytics routes with authentication and the specific read permission
router.use(authMiddleware);
router.use(requirePermission('read:analytics'));

// The KPI dashboard requires at least the 'starter' plan to view advanced metrics
router.get('/kpis', requirePlan('starter'), AnalyticsController.getKpis);
router.get('/trends', requirePlan('starter'), AnalyticsController.getTrends);

export default router;
