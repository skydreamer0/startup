import { Request, Response, NextFunction } from 'express';
import { AccountingService } from './accounting.service';

export class AccountingController {
    static async syncOrder(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AccountingService.syncOrder(req.params.orderId as string);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    static async syncExpense(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AccountingService.syncExpense(req.params.expenseId as string);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    static async getSyncStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AccountingService.getSyncStatus({
                entityType: req.query.entityType as 'order' | 'expense' | undefined,
                status: req.query.status as 'pending' | 'synced' | 'failed' | undefined,
                page: req.query.page as string | undefined,
                limit: req.query.limit as string | undefined,
            });
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    static async getProviderInfo(_req: Request, res: Response, next: NextFunction) {
        try {
            const result = await AccountingService.getProviderInfo();
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }
}
