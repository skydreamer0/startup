/**
 * Shared Application Error class.
 * All services should throw this instead of raw Errors.
 * The global error middleware will correctly map statusCode and errorCode.
 */
export class AppError extends Error {
    public readonly statusCode: number;
    public readonly errorCode: string;

    constructor(statusCode: number, message: string, errorCode?: string) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode || AppError.inferCode(statusCode);
        Object.setPrototypeOf(this, AppError.prototype);
    }

    private static inferCode(statusCode: number): string {
        switch (statusCode) {
            case 400: return 'BAD_REQUEST';
            case 401: return 'UNAUTHORIZED';
            case 403: return 'FORBIDDEN';
            case 404: return 'NOT_FOUND';
            case 409: return 'CONFLICT';
            case 422: return 'VALIDATION_FAILED';
            case 429: return 'RATE_LIMIT';
            default: return 'INTERNAL_ERROR';
        }
    }
}
