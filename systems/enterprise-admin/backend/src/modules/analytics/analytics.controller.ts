import { Request, Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { startOfMonth, endOfMonth, parseISO, isValid } from 'date-fns';

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
}
