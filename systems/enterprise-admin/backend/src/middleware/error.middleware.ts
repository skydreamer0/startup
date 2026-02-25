import { Request, Response, NextFunction } from 'express';
import { AppError } from '../lib/errors';

/**
 * Global Error Handler
 * Catches all unhandled errors and returns a standardized JSend error response.
 * Properly maps AppError.statusCode and AppError.errorCode.
 * In production, stack traces are hidden.
 */
export function errorMiddleware(err: Error, _req: Request, res: Response, _next: NextFunction) {
    console.error('❌ Unhandled Error:', err);

    const isAppError = err instanceof AppError;
    const statusCode = isAppError ? err.statusCode : 500;
    const errorCode = isAppError ? err.errorCode : 'INTERNAL_ERROR';

    res.status(statusCode).json({
        success: false,
        error: {
            code: errorCode,
            message: process.env.NODE_ENV === 'production' && statusCode === 500
                ? 'Internal server error'
                : err.message,
        },
    });
}
