import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Zod Request Validation Middleware
 * Validates req.body, req.query, and/or req.params against provided schemas.
 * Note: In Express 5, req.query is read-only — parsed query is stored in req.validatedQuery.
 */
export function validate(schemas: {
    body?: z.ZodTypeAny;
    query?: z.ZodTypeAny;
    params?: z.ZodTypeAny;
}) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            if (schemas.body) {
                req.body = schemas.body.parse(req.body);
            }
            if (schemas.query) {
                // Express 5: req.query is read-only, store parsed result separately
                (req as unknown as Record<string, unknown>).validatedQuery = schemas.query.parse(req.query);
            }
            if (schemas.params) {
                schemas.params.parse(req.params);
            }
            next();
        } catch (error) {
            if (error instanceof z.ZodError) {
                return res.status(400).json({
                    success: false,
                    error: {
                        code: 'VALIDATION_FAILED',
                        message: 'Request validation failed',
                        details: (error as z.ZodError).issues,
                    },
                });
            }
            next(error);
        }
    };
}
