import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../lib/password';

describe('Password Utilities', () => {
    it('should hash a password and verify it correctly', async () => {
        const password = 'MySecurePassword123!';
        const hash = await hashPassword(password);

        expect(hash).toBeDefined();
        expect(hash).not.toBe(password);

        const isValid = await verifyPassword(hash, password);
        expect(isValid).toBe(true);
    });

    it('should reject an incorrect password', async () => {
        const hash = await hashPassword('CorrectPassword');
        const isValid = await verifyPassword(hash, 'WrongPassword');

        expect(isValid).toBe(false);
    });

    it('should generate different hashes for the same password (salted)', async () => {
        const password = 'SamePassword';
        const hash1 = await hashPassword(password);
        const hash2 = await hashPassword(password);

        expect(hash1).not.toBe(hash2); // Argon2 uses random salt
    });
});
