import type { User } from './useAuth';

export function createDemoUser(): User {
    return {
        id: 'demo-user-local',
        email: 'demo@pharmasaas.dev',
        fullName: 'Demo Admin',
        roles: ['SUPER_ADMIN'],
        permissions: ['*'],
    };
}

export function isDemoModeEnabled(): boolean {
    return import.meta.env.VITE_DEMO_MODE === 'true';
}
