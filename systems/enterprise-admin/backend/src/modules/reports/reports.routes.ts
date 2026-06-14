import { Router } from 'express';
import { ReportsController } from './reports.controller';
import { routePolicy } from '../../lib/admin-route-policy';

const router = Router();

router.use(...routePolicy({ permission: 'read:reports', plan: 'starter' }));

// Margin Endpoints
router.get('/margin', ReportsController.getMarginAnalysis);
router.get('/margin/trend', ReportsController.getMarginTrend);

// Cash Flow Endpoints
router.get('/cashflow', ReportsController.getCashFlowStatement);
router.get('/cashflow/trend', ReportsController.getCashFlowTrend);

// Sales Ranking Endpoints
router.get('/sales-ranking', ReportsController.getSalesRanking);

export default router;
