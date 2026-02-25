import { describe, it, expect, vi } from 'vitest';

// Mock env before importing jwt
vi.mock('../config/env', () => ({
    env: {
        JWT_ACCESS_SECRET: 'test-access-secret-that-is-at-least-32-chars-long',
        JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-at-least-32-chars-long',
        JWT_ACCESS_EXPIRES_IN: '15m',
        JWT_REFRESH_EXPIRES_IN: '7d',
    },
}));

import {
    signAccessToken,
    signRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
} from '../lib/jwt';

describe('JWT Utilities', () => {
    const accessPayload = { userId: 'test-user-id', email: 'test@example.com' };
    const refreshPayload = { userId: 'test-user-id', type: 'refresh' as const };

    describe('Access Tokens', () => {
        it('should sign and verify an access token', () => {
            const token = signAccessToken(accessPayload);
            expect(token).toBeDefined();
            expect(typeof token).toBe('string');

            const decoded = verifyAccessToken(token);
            expect(decoded.userId).toBe(accessPayload.userId);
            expect(decoded.email).toBe(accessPayload.email);
        });

        it('should reject an invalid access token', () => {
            expect(() => verifyAccessToken('invalid-token')).toThrow();
        });

        it('should reject a refresh token verified as access token', () => {
            const refreshToken = signRefreshToken(refreshPayload);
            expect(() => verifyAccessToken(refreshToken)).toThrow();
        });
    });

    describe('Refresh Tokens', () => {
        it('should sign and verify a refresh token', () => {
            const token = signRefreshToken(refreshPayload);
            expect(token).toBeDefined();

            const decoded = verifyRefreshToken(token);
            expect(decoded.userId).toBe(refreshPayload.userId);
            expect(decoded.type).toBe('refresh');
        });

        it('should reject an access token verified as refresh token', () => {
            const accessToken = signAccessToken(accessPayload);
            expect(() => verifyRefreshToken(accessToken)).toThrow();
        });
    });
});
