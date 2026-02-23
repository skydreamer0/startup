import { Request, Response, NextFunction } from 'express';
import { RolesService } from './roles.service';
import { ServiceError } from '../users/users.service';

const rolesService = new RolesService();

export class RolesController {
    /**
     * GET /roles
     */
    async list(_req: Request, res: Response, next: NextFunction) {
        try {
            const roles = await rolesService.list();
            res.json({ success: true, data: roles });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /roles
     */
    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const role = await rolesService.create(req.body);
            res.status(201).json({ success: true, data: role });
        } catch (error) {
            if (error instanceof ServiceError) {
                return res.status(error.statusCode).json({
                    success: false,
                    error: { code: 'CONFLICT', message: error.message },
                });
            }
            next(error);
        }
    }

    /**
     * PUT /roles/:id/permissions
     */
    async updatePermissions(req: Request, res: Response, next: NextFunction) {
        try {
            const role = await rolesService.updatePermissions(req.params.id as string, req.body);
            res.json({ success: true, data: role });
        } catch (error) {
            if (error instanceof ServiceError) {
                return res.status(error.statusCode).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: error.message },
                });
            }
            next(error);
        }
    }

    /**
     * GET /permissions
     */
    async listPermissions(_req: Request, res: Response, next: NextFunction) {
        try {
            const permissions = await rolesService.listPermissions();
            res.json({ success: true, data: permissions });
        } catch (error) {
            next(error);
        }
    }
}
