import { Router } from 'express';
import { AnalyticsController } from './analytics.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { requirePlan } from '../../middleware/plan.middleware';
import { analyticsRateLimit } from '../../middleware/rate-limit.middleware';

const router = Router();

router.use(analyticsRateLimit);

// Protect all analytics routes with authentication and the specific read permission
router.use(authMiddleware);
router.use(requirePermission('read:analytics'));

// The KPI dashboard requires at least the 'starter' plan to view advanced metrics
router.get('/kpis', requirePlan('starter'), AnalyticsController.getKpis);
router.get('/trends', requirePlan('starter'), AnalyticsController.getTrends);

// Phase 7: CRM Analytics
router.get('/rfm', requirePlan('starter'), AnalyticsController.getRfm);
router.get('/churn-risk', requirePlan('starter'), AnalyticsController.getChurnRisk);

// Phase 7: Product & Supplier Analytics
router.get('/product-abc', requirePlan('starter'), AnalyticsController.getProductAbc);
router.get('/supplier-ranking', requirePlan('starter'), AnalyticsController.getSupplierRanking);

// Phase 7: Operational Metrics
router.get('/heatmap', requirePlan('starter'), AnalyticsController.getHeatmap);
router.get('/bonus-gate', requirePlan('starter'), AnalyticsController.getBonusGate);

export default router;

