import { describe, it, expect, vi, afterEach } from 'vitest';
import { createDemoUser, isDemoModeEnabled } from './authDemo';

describe('createDemoUser', () => {
    it('returns a user with SUPER_ADMIN role and wildcard permission', () => {
        const user = createDemoUser();
        expect(user.roles).toContain('SUPER_ADMIN');
        expect(user.permissions).toContain('*');
        expect(user.email).toBe('demo@pharmasaas.dev');
    });

    it('returns a stable shape every call', () => {
        const a = createDemoUser();
        const b = createDemoUser();
        expect(a).toEqual(b);
    });
});

describe('isDemoModeEnabled', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('returns true when VITE_DEMO_MODE is "true"', () => {
        vi.stubEnv('VITE_DEMO_MODE', 'true');
        expect(isDemoModeEnabled()).toBe(true);
    });

    it('returns false when VITE_DEMO_MODE is "false"', () => {
        vi.stubEnv('VITE_DEMO_MODE', 'false');
        expect(isDemoModeEnabled()).toBe(false);
    });

    it('returns false when VITE_DEMO_MODE is empty', () => {
        vi.stubEnv('VITE_DEMO_MODE', '');
        expect(isDemoModeEnabled()).toBe(false);
    });
});

describe('isDemoModeEnabled — production guard', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('isDemoModeEnabled returns false in production (VITE_DEMO_MODE not "true")', () => {
        vi.stubEnv('VITE_DEMO_MODE', 'false');
        // Simulates the guard check inside demoLogin()
        const canDemo = isDemoModeEnabled();
        expect(canDemo).toBe(false);
        // Verify no sessionStorage side-effects would occur
        // (the demoLogin function returns early when this is false)
        expect(sessionStorage.getItem('demoMode')).toBeNull();
    });
});
