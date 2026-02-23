import { Request, Response, NextFunction } from 'express';
import { DashboardService } from './dashboard.service';

export class DashboardController {
    static async getKPIs(_req: Request, res: Response, next: NextFunction) {
        try {
            const kpis = await DashboardService.getKPIs();
            res.status(200).json({ success: true, data: kpis });
        } catch (err) {
            next(err);
        }
    }
}
