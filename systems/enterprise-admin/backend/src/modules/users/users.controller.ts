import { Request, Response, NextFunction } from 'express';
import { UsersService, ServiceError } from './users.service';
import type { ListUsersQuery } from './users.schema';

const usersService = new UsersService();

export class UsersController {
    /**
     * GET /users
     */
    async list(req: Request, res: Response, next: NextFunction) {
        try {
            const query = (req.validatedQuery || req.query) as unknown as ListUsersQuery;
            const result = await usersService.list(query);

            res.json({
                success: true,
                data: result.users,
                meta: result.meta,
            });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /users/:id
     */
    async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const user = await usersService.getById(req.params.id as string);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: { code: 'NOT_FOUND', message: 'User not found' },
                });
            }

            res.json({ success: true, data: user });
        } catch (error) {
            next(error);
        }
    }

    /**
     * POST /users
     */
    async create(req: Request, res: Response, next: NextFunction) {
        try {
            const user = await usersService.create(req.body, req.user!.userId);

            res.status(201).json({ success: true, data: user });
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
     * PUT /users/:id
     */
    async update(req: Request, res: Response, next: NextFunction) {
        try {
            const user = await usersService.update(req.params.id as string, req.body, req.user!.userId);

            res.json({ success: true, data: user });
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
     * DELETE /users/:id
     */
    async delete(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await usersService.delete(req.params.id as string, req.user!.userId);

            res.json({ success: true, data: result });
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
}
