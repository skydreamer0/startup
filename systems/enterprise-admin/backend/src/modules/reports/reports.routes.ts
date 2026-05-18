import { Router } from 'express';
import { ReportsController } from './reports.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { requirePlan } from '../../middleware/plan.middleware';

const router = Router();

// Protect all report routes
router.use(authMiddleware);
router.use(requirePermission('read:reports'));
// Financial reports require at least the 'starter' plan
router.use(requirePlan('starter'));

// Margin Endpoints
router.get('/margin', ReportsController.getMarginAnalysis);
router.get('/margin/trend', ReportsController.getMarginTrend);

// Cash Flow Endpoints
router.get('/cashflow', ReportsController.getCashFlowStatement);
router.get('/cashflow/trend', ReportsController.getCashFlowTrend);

// Sales Ranking Endpoints
router.get('/sales-ranking', ReportsController.getSalesRanking);

export default router;
