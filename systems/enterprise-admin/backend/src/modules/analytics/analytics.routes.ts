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

// Basic KPI dashboard — starter plan
router.get('/kpis', requirePlan('starter'), AnalyticsController.getKpis);
router.get('/trends', requirePlan('starter'), AnalyticsController.getTrends);

// CRM Analytics — pro plan
router.get('/rfm', requirePlan('pro'), AnalyticsController.getRfm);
router.get('/churn-risk', requirePlan('pro'), AnalyticsController.getChurnRisk);

// Product & Supplier Analytics — pro plan
router.get('/product-abc', requirePlan('pro'), AnalyticsController.getProductAbc);
router.get('/supplier-ranking', requirePlan('pro'), AnalyticsController.getSupplierRanking);
router.get('/reorder-forecast', requirePlan('pro'), AnalyticsController.getReorderForecast);

// Operational Metrics — pro plan
router.get('/heatmap', requirePlan('pro'), AnalyticsController.getHeatmap);
router.get('/bonus-gate', requirePlan('pro'), AnalyticsController.getBonusGate);

export default router;
