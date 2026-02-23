import { Request, Response, NextFunction } from 'express';
import { ExpensesService } from './expenses.service';

export class ExpensesController {
    static async getExpenses(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await ExpensesService.getExpenses(req.query as any);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    static async createExpense(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await ExpensesService.createExpense(req.body);
            res.status(201).json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    static async updateExpense(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await ExpensesService.updateExpense(req.params.id as string, req.body);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }

    static async deleteExpense(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await ExpensesService.deleteExpense(req.params.id as string);
            res.json({ success: true, data: result });
        } catch (error) {
            next(error);
        }
    }
}
