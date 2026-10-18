import { Request, Response, NextFunction } from 'express';
import { StockReconciliationService } from './stock-reconciliation.service';

export class StockReconciliationController {
    static async list(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await StockReconciliationService.list(req.query.page);
            res.status(200).json({ success: true, data });
        } catch (error) { next(error); }
    }
}
