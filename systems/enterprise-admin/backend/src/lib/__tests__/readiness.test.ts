import { describe, expect, it, vi } from 'vitest';
import { inspectReadiness } from '../readiness';

const applied = (name: string) => ({ migration_name: name, finished_at: new Date(), rolled_back_at: null });
function database(rows: unknown[] = [], failure?: Error) {
    return { $queryRaw: vi.fn().mockResolvedValueOnce([{ connected: 1 }])
        .mockImplementationOnce(() => failure ? Promise.reject(failure) : Promise.resolve(rows)) };
}

describe('Readiness dependency contract', () => {
    it('accepts every packaged migration successfully applied', async () => {
        expect(await inspectReadiness(database([applied('one'), applied('two')]), ['one', 'two']))
            .toEqual({ status: 'ready' });
    });
    it('fails closed for an unapplied migration', async () => {
        expect(await inspectReadiness(database([applied('one')]), ['one', 'two']))
            .toEqual({ status: 'not_ready', code: 'MIGRATIONS_PENDING' });
    });
    it('does not treat rolled-back history as applied', async () => {
        expect(await inspectReadiness(database([{ ...applied('one'), rolled_back_at: new Date() }]), ['one']))
            .toEqual({ status: 'not_ready', code: 'MIGRATIONS_PENDING' });
    });
    it('allows a successful retry following an explicitly rolled-back attempt', async () => {
        expect(await inspectReadiness(database([
            { migration_name: 'one', finished_at: null, rolled_back_at: new Date() }, applied('one'),
        ]), ['one'])).toEqual({ status: 'ready' });
    });
    it('rejects unfinished migrations even if another row succeeded', async () => {
        expect(await inspectReadiness(database([applied('one'), {
            migration_name: 'one', finished_at: null, rolled_back_at: null,
        }]), ['one'])).toEqual({ status: 'not_ready', code: 'MIGRATION_FAILED' });
    });
    it('does not expose database errors or credentials', async () => {
        const db = { $queryRaw: vi.fn().mockRejectedValue(new Error('postgresql://secret:password@private/db')) };
        expect(await inspectReadiness(db, ['one']))
            .toEqual({ status: 'not_ready', code: 'DATABASE_UNAVAILABLE' });
    });
    it('fails closed when migration history cannot be read', async () => {
        expect(await inspectReadiness(database([], new Error('missing table')), ['one']))
            .toEqual({ status: 'not_ready', code: 'MIGRATION_HISTORY_UNAVAILABLE' });
    });
});
