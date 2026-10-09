import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/env', () => ({ env: { CORS_ORIGIN: 'http://localhost:5173' } }));
vi.mock('../lib/readiness', () => ({ checkReadiness: vi.fn() }));
import app from '../app';
import { checkReadiness } from '../lib/readiness';

describe('Public process and dependency probes', () => {
    it('keeps liveness independent of a broken database', async () => {
        vi.mocked(checkReadiness).mockResolvedValue({ status: 'not_ready', code: 'DATABASE_UNAVAILABLE' });
        const live = await request(app).get('/health');
        expect(live.status).toBe(200);
        expect(live.body.status).toBe('ok');
        const ready = await request(app).get('/ready');
        expect(ready.status).toBe(503);
        expect(ready.body).toEqual({ status: 'not_ready', code: 'DATABASE_UNAVAILABLE' });
        expect(ready.headers['cache-control']).toBe('no-store');
    });
    it('returns 200 only when dependencies are ready', async () => {
        vi.mocked(checkReadiness).mockResolvedValue({ status: 'ready' });
        const response = await request(app).get('/ready');
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ status: 'ready' });
    });
    it.each(['MIGRATIONS_PENDING', 'MIGRATION_FAILED', 'MIGRATION_HISTORY_UNAVAILABLE',
        'MIGRATION_FILES_UNAVAILABLE', 'READINESS_TIMEOUT'] as const)('returns 503 for %s', async (code) => {
        vi.mocked(checkReadiness).mockResolvedValue({ status: 'not_ready', code });
        const response = await request(app).get('/ready');
        expect(response.status).toBe(503);
        expect(response.body).toEqual({ status: 'not_ready', code });
    });
});
