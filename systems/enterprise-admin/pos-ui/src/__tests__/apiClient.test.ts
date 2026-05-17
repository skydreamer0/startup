import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestUse = vi.fn();
const responseUse = vi.fn();
const createdClient = {
  interceptors: {
    request: { use: requestUse },
    response: { use: responseUse },
  },
};

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => createdClient),
  },
}));

describe('api client', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('creates the POS admin API client with JSON defaults', async () => {
    const axios = (await import('axios')).default;

    await import('../api/client');

    expect(axios.create).toHaveBeenCalledWith({
      baseURL: '/api/v1/admin',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('adds Authorization header when a POS token exists', async () => {
    localStorage.setItem('pos_accessToken', 'token-1');
    await import('../api/client');
    const onRequest = requestUse.mock.calls[0][0] as (config: { headers: Record<string, string> }) => unknown;
    const config: { headers: Record<string, string> } = { headers: {} };

    expect(onRequest(config)).toBe(config);
    expect(config.headers.Authorization).toBe('Bearer token-1');
  });

  it('does not add Authorization header when token is missing', async () => {
    await import('../api/client');
    const onRequest = requestUse.mock.calls[0][0] as (config: { headers: Record<string, string> }) => unknown;
    const config: { headers: Record<string, string> } = { headers: {} };

    onRequest(config);

    expect(config.headers.Authorization).toBeUndefined();
  });

  it('clears token and redirects to login on 401 responses', async () => {
    localStorage.setItem('pos_accessToken', 'token-1');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await import('../api/client');
    const onRejected = responseUse.mock.calls[0][1] as (error: { response?: { status: number } }) => Promise<never>;

    await expect(onRejected({ response: { status: 401 } })).rejects.toEqual({ response: { status: 401 } });

    expect(localStorage.getItem('pos_accessToken')).toBeNull();
  });
});
