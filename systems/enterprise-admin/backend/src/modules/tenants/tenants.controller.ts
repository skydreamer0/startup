import { Request, Response, NextFunction } from 'express';
import { TenantsService } from './tenants.service';

export class TenantsController {
    /**
     * GET /tenants/me/plan
     * Returns the current tenant's plan and unlocked feature keys.
     */
    static async getMyPlan(_req: Request, res: Response, next: NextFunction) {
        try {
            const data = await TenantsService.getCurrentPlan();
            res.json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }
}
