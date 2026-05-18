import { Request, Response, NextFunction } from 'express';
import { startOfMonth, endOfMonth, parseISO, isValid } from 'date-fns';
import { CrmAnalyticsService } from './crm-analytics.service';
import { ProductAnalyticsService } from './product-analytics.service';
import { OperationsAnalyticsService } from './operations-analytics.service';
import { parsePeriodFromRequest } from './analytics.shared';

/**
 * Analytics HTTP entry point.
 *
 * Per C-04 the service layer is split into three sub-services
 * (CRM / Product / Operations). The controller stays as the single
 * entry point so route paths and response shapes remain stable for
 * the admin-ui consumer.
 */
export class AnalyticsController {
    // ─── Operations: KPIs ────────────────────────────────────

    static async getKpis(req: Request, res: Response, next: NextFunction) {
        try {
            const period = req.query.period as string;

            let startDate: Date;
            let endDate: Date;

            if (period && isValid(parseISO(period))) {
                const date = parseISO(period);
                startDate = startOfMonth(date);
                endDate = endOfMonth(date);
            } else {
                // Default to current month
                const now = new Date();
                startDate = startOfMonth(now);
                endDate = endOfMonth(now);
            }

            const kpis = await OperationsAnalyticsService.getKpiSnapshot(startDate, endDate);

            res.json({
                success: true,
                data: kpis
            });
        } catch (err) { next(err); }
    }

    static async getTrends(req: Request, res: Response, next: NextFunction) {
        try {
            const to = req.query.to as string;
            const period = to || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

            const trends = await OperationsAnalyticsService.getKpiTrend(period);

            res.json({
                success: true,
                data: trends
            });
        } catch (err) { next(err); }
    }

    // ─── CRM: RFM Segmentation ──────────────────────────────

    static async getRfm(_req: Request, res: Response, next: NextFunction) {
        try {
            const result = await CrmAnalyticsService.getRfmSegmentation();

            res.json({
                success: true,
                data: result
            });
        } catch (err) { next(err); }
    }

    // ─── CRM: Churn Risk ────────────────────────────────────

    static async getChurnRisk(_req: Request, res: Response, next: NextFunction) {
        try {
            const result = await CrmAnalyticsService.getChurnRisk();

            res.json({
                success: true,
                data: result
            });
        } catch (err) { next(err); }
    }

    // ─── Product: ABC Analysis ──────────────────────────────

    static async getProductAbc(req: Request, res: Response, next: NextFunction) {
        try {
            const { startDate, endDate } = parsePeriodFromRequest(req);
            const result = await ProductAnalyticsService.getProductAbcAnalysis(startDate, endDate);

            res.json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    // ─── Product: Supplier Ranking ──────────────────────────

    static async getSupplierRanking(req: Request, res: Response, next: NextFunction) {
        try {
            const { startDate, endDate } = parsePeriodFromRequest(req);
            const result = await ProductAnalyticsService.getSupplierRanking(startDate, endDate);

            res.json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    // ─── Operations: Sales Heatmap ──────────────────────────

    static async getHeatmap(req: Request, res: Response, next: NextFunction) {
        try {
            const { startDate, endDate } = parsePeriodFromRequest(req);
            const result = await OperationsAnalyticsService.getSalesHeatmap(startDate, endDate);

            res.json({ success: true, data: result });
        } catch (err) { next(err); }
    }

    // ─── Operations: Bonus Gate Status ──────────────────────

    static async getBonusGate(req: Request, res: Response, next: NextFunction) {
        try {
            const period = req.query.period as string | undefined;
            const result = await OperationsAnalyticsService.getBonusGateStatus(period);

            res.json({ success: true, data: result });
        } catch (err) { next(err); }
    }
}
