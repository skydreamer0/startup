import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestUse = vi.fn();
const responseUse = vi.fn();
const createdClient = Object.assign(vi.fn(), {
    interceptors: {
        request: { use: requestUse },
        response: { use: responseUse },
    },
});
const axiosPost = vi.fn();

vi.mock('axios', () => ({
    default: {
        create: vi.fn(() => createdClient),
        post: axiosPost,
    },
}));

describe('admin api client', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        localStorage.clear();
        window.history.pushState({}, '', '/');
    });

    it('creates the admin API client with JSON defaults', async () => {
        const axios = (await import('axios')).default;

        await import('../api/client');

        expect(axios.create).toHaveBeenCalledWith({
            baseURL: '/api/v1/admin',
            headers: { 'Content-Type': 'application/json' },
        });
    });

    it('adds Authorization header from admin token storage', async () => {
        localStorage.setItem('accessToken', 'admin-token');
        await import('../api/client');
        const onRequest = requestUse.mock.calls[0][0] as (config: { headers: Record<string, string> }) => unknown;
        const config: { headers: Record<string, string> } = { headers: {} };

        expect(onRequest(config)).toBe(config);
        expect(config.headers.Authorization).toBe('Bearer admin-token');
    });

    it('refreshes an expired access token and retries the original request', async () => {
        localStorage.setItem('refreshToken', 'refresh-token');
        axiosPost.mockResolvedValue({ data: { data: { accessToken: 'new-token' } } });
        await import('../api/client');
        const onRejected = responseUse.mock.calls[0][1] as (error: {
            config: { headers: Record<string, string>; _retry?: boolean };
            response?: { status: number };
        }) => Promise<unknown>;
        const originalRequest: { headers: Record<string, string>; _retry?: boolean } = { headers: {} };

        await onRejected({ config: originalRequest, response: { status: 401 } });

        expect(axiosPost).toHaveBeenCalledWith('/api/v1/admin/auth/refresh', { refreshToken: 'refresh-token' });
        expect(localStorage.getItem('accessToken')).toBe('new-token');
        expect(originalRequest.headers.Authorization).toBe('Bearer new-token');
        expect(createdClient).toHaveBeenCalledWith(originalRequest);
    });

    it('dispatches plan upgrade events for gated 403 responses', async () => {
        const listener = vi.fn();
        window.addEventListener('plan-upgrade-required', listener);
        await import('../api/client');
        const onRejected = responseUse.mock.calls[0][1] as (error: unknown) => Promise<never>;
        const error = {
            response: {
                status: 403,
                data: { error: { code: 'PLAN_UPGRADE_REQUIRED', message: 'Upgrade to Pro' } },
            },
        };

        await expect(onRejected(error)).rejects.toEqual(error);

        expect(listener).toHaveBeenCalledOnce();
        expect((listener.mock.calls[0][0] as CustomEvent).detail).toEqual({ message: 'Upgrade to Pro' });
        window.removeEventListener('plan-upgrade-required', listener);
    });
});
