import { Request, Response, NextFunction } from 'express';

/**
 * Global Error Handler
 * Catches all unhandled errors and returns a standardized JSend error response.
 * In production, stack traces are hidden.
 */
export function errorMiddleware(err: Error, _req: Request, res: Response, _next: NextFunction) {
    console.error('❌ Unhandled Error:', err);

    const statusCode = (err as { statusCode?: number }).statusCode || 500;

    res.status(statusCode).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
        },
    });
}
