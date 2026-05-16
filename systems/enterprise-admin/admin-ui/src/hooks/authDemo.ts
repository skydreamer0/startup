export interface DemoUser {
    id: string;
    email: string;
    fullName: string;
    roles: string[];
    permissions: string[];
}

export function createDemoUser(): DemoUser {
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
