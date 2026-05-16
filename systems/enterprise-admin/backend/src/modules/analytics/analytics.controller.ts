import { Request, Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { addMonths, startOfMonth, endOfMonth, parseISO, isValid } from 'date-fns';

export class AnalyticsController {
    static async getKpis(req: Request, res: Response) {
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

            const kpis = await AnalyticsService.getKpiSnapshot(startDate, endDate);

            res.json({
                success: true,
                data: kpis
            });
        } catch (error) {
            console.error('[AnalyticsController] getKpis Error:', error);
            res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to calculate KPIs' }
            });
        }
    }

    static async getTrends(req: Request, res: Response) {
        try {
            const to = req.query.to as string;
            const period = to || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

            const trends = await AnalyticsService.getKpiTrend(period);

            res.json({
                success: true,
                data: trends
            });
        } catch (error) {
            console.error('[AnalyticsController] getTrends Error:', error);
            res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to calculate KPI trends' }
            });
        }
    }

    // ─── Phase 7: RFM Segmentation ──────────────────────────

    static async getRfm(_req: Request, res: Response) {
        try {
            const result = await AnalyticsService.getRfmSegmentation();

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AnalyticsController] getRfm Error:', error);
            res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to generate RFM segmentation' }
            });
        }
    }

    // ─── Phase 7: Churn Risk ────────────────────────────────

    static async getChurnRisk(_req: Request, res: Response) {
        try {
            const result = await AnalyticsService.getChurnRisk();

            res.json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[AnalyticsController] getChurnRisk Error:', error);
            res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to calculate churn risk' }
            });
        }
    }

    // ─── Phase 7: ABC Product Analysis ──────────────────────

    static async getProductAbc(req: Request, res: Response) {
        try {
            const { startDate, endDate } = AnalyticsController.parsePeriod(req);
            const result = await AnalyticsService.getProductAbcAnalysis(startDate, endDate);

            res.json({ success: true, data: result });
        } catch (error) {
            console.error('[AnalyticsController] getProductAbc Error:', error);
            res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to generate product ABC analysis' }
            });
        }
    }

    // ─── Phase 7: Supplier Ranking ──────────────────────────

    static async getSupplierRanking(req: Request, res: Response) {
        try {
            const { startDate, endDate } = AnalyticsController.parsePeriod(req);
            const result = await AnalyticsService.getSupplierRanking(startDate, endDate);

            res.json({ success: true, data: result });
        } catch (error) {
            console.error('[AnalyticsController] getSupplierRanking Error:', error);
            res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to generate supplier ranking' }
            });
        }
    }

    // ─── Phase 7: Sales Heatmap ─────────────────────────────

    static async getHeatmap(req: Request, res: Response) {
        try {
            const { startDate, endDate } = AnalyticsController.parsePeriod(req);
            const result = await AnalyticsService.getSalesHeatmap(startDate, endDate);

            res.json({ success: true, data: result });
        } catch (error) {
            console.error('[AnalyticsController] getHeatmap Error:', error);
            res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to generate sales heatmap' }
            });
        }
    }

    // ─── Phase 7: Bonus Gate Status ─────────────────────────

    static async getBonusGate(req: Request, res: Response) {
        try {
            const period = req.query.period as string | undefined;
            const result = await AnalyticsService.getBonusGateStatus(period);

            res.json({ success: true, data: result });
        } catch (error) {
            console.error('[AnalyticsController] getBonusGate Error:', error);
            res.status(500).json({
                success: false,
                error: { code: 'INTERNAL_SERVER_ERROR', message: 'Failed to calculate bonus gate status' }
            });
        }
    }

    // ─── Shared Helper ──────────────────────────────────────

    private static parsePeriod(req: Request): { startDate: Date; endDate: Date } {
        const period = req.query.period as string;

        if (period && isValid(parseISO(period))) {
            const date = parseISO(period);
            const startDate = startOfMonth(date);
            return { startDate, endDate: addMonths(startDate, 1) };
        }

        const now = new Date();
        const startDate = startOfMonth(now);
        return { startDate, endDate: addMonths(startDate, 1) };
    }
}
