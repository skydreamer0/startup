import { Request } from 'express';

export interface AuthenticatedUser {
    userId: string;
    email: string;
    permissions: string[];
}

declare global {
    namespace Express {
        interface Request {
            user?: AuthenticatedUser;
            validatedQuery?: Record<string, unknown>;
        }
    }
}
