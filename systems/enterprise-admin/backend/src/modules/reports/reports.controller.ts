import { Request, Response, NextFunction } from 'express';
import { MarginService } from './margin.service';
import { CashFlowService } from './cashflow.service';
import { SalesRankingService } from './sales-ranking.service';
import { AppError } from '../../lib/errors';

export class ReportsController {
    // ─── Margin Reports ──────────────────────────────────────
    static async getMarginAnalysis(req: Request, res: Response, next: NextFunction) {
        try {
            const period = req.query.period as string;
            if (!period) throw new AppError(400, 'Period query parameter required (YYYY-MM)');

            const result = await MarginService.getMarginByProduct(period);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    static async getMarginTrend(req: Request, res: Response, next: NextFunction) {
        try {
            const to = req.query.to as string;
            if (!to) throw new AppError(400, 'To query parameter required (YYYY-MM)');

            const result = await MarginService.getMarginTrend(to);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    // ─── Cash Flow Reports ───────────────────────────────────
    static async getCashFlowStatement(req: Request, res: Response, next: NextFunction) {
        try {
            const period = req.query.period as string;
            if (!period) throw new AppError(400, 'Period query parameter required (YYYY-MM)');

            const result = await CashFlowService.getCashFlowStatement(period);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    static async getCashFlowTrend(req: Request, res: Response, next: NextFunction) {
        try {
            const to = req.query.to as string;
            if (!to) throw new AppError(400, 'To query parameter required (YYYY-MM)');

            const result = await CashFlowService.getCashFlowTrend(to);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    // ─── Sales Ranking Reports ───────────────────────────────
    static async getSalesRanking(req: Request, res: Response, next: NextFunction) {
        try {
            const period = req.query.period as string;
            const sortBy = (req.query.sort as string) || 'revenue';
            const limit = parseInt((req.query.limit as string) || '10');

            if (!period) throw new AppError(400, 'Period query parameter required (YYYY-MM)');
            if (sortBy !== 'revenue' && sortBy !== 'quantity') {
                throw new AppError(400, 'Sort parameter must be "revenue" or "quantity"');
            }

            const products = await SalesRankingService.getTopProducts(period, limit, sortBy as any);
            const categories = await SalesRankingService.getCategoryBreakdown(period);

            res.json({
                success: true,
                data: {
                    period,
                    topProducts: products,
                    categories
                }
            });
        } catch (error) {
            next(error);
        }
    }
}
