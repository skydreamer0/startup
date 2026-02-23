import { Request, Response, NextFunction } from 'express';
import { CrmService } from './crm.service';

export class CrmController {
    static async getCustomers(req: Request, res: Response, next: NextFunction) {
        try {
            const queryParams = {
                type: req.query.type as 'new' | 'repeat' | undefined,
                hasLine: req.query.hasLine as 'true' | 'false' | undefined,
                page: req.query.page as string | undefined,
                limit: req.query.limit as string | undefined,
            };
            const result = await CrmService.getCustomers(queryParams);
            res.status(200).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }

    static async getCustomerById(req: Request, res: Response, next: NextFunction) {
        try {
            const customer = await CrmService.getCustomerById(req.params.id as string);
            res.status(200).json({ success: true, data: customer });
        } catch (err) {
            next(err);
        }
    }

    static async createCustomer(req: Request, res: Response, next: NextFunction) {
        try {
            const customer = await CrmService.createCustomer(req.body);
            res.status(201).json({ success: true, data: customer });
        } catch (err) {
            next(err);
        }
    }

    static async updateCustomer(req: Request, res: Response, next: NextFunction) {
        try {
            const customer = await CrmService.updateCustomer(req.params.id as string, req.body);
            res.status(200).json({ success: true, data: customer });
        } catch (err) {
            next(err);
        }
    }

    static async addInteraction(req: Request, res: Response, next: NextFunction) {
        try {
            const interaction = await CrmService.addInteraction(req.params.id as string, req.body);
            res.status(201).json({ success: true, data: interaction });
        } catch (err) {
            next(err);
        }
    }

    static async getMetrics(_req: Request, res: Response, next: NextFunction) {
        try {
            const metrics = await CrmService.getRetentionMetrics();
            res.status(200).json({ success: true, data: metrics });
        } catch (err) {
            next(err);
        }
    }
}
