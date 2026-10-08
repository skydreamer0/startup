import { Prisma, PrismaClient } from '@prisma/client';
import { readdir, access } from 'node:fs/promises';
import path from 'node:path';

export type ReadinessResult = { status: 'ready' } | { status: 'not_ready'; code:
    'DATABASE_UNAVAILABLE' | 'MIGRATION_HISTORY_UNAVAILABLE' | 'MIGRATIONS_PENDING'
    | 'MIGRATION_FAILED' | 'MIGRATION_FILES_UNAVAILABLE' | 'READINESS_TIMEOUT' };
type QueryClient = Pick<Prisma.TransactionClient, '$queryRaw'>;
type Migration = { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null };

// Separate, silent client: Prisma's normal application error logger must not leak
// connection details when a public probe or startup dependency check fails.
const healthDatabase = new PrismaClient({ log: [] });
const migrationsDirectory = path.resolve(__dirname, '../../prisma/migrations');
const unavailable = (code: Extract<ReadinessResult, { status: 'not_ready' }>['code']): ReadinessResult =>
    ({ status: 'not_ready', code });

export async function inspectReadiness(db: QueryClient, expected: readonly string[]): Promise<ReadinessResult> {
    try {
        await db.$queryRaw`SELECT 1 AS connected`;
    } catch {
        return unavailable('DATABASE_UNAVAILABLE');
    }
    let rows: Migration[];
    try {
        rows = await db.$queryRaw<Migration[]>`SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations"`;
    } catch {
        return unavailable('MIGRATION_HISTORY_UNAVAILABLE');
    }
    if (rows.some((row) => !row.finished_at && !row.rolled_back_at)) return unavailable('MIGRATION_FAILED');
    const applied = new Set(rows.filter((row) => row.finished_at && !row.rolled_back_at).map((row) => row.migration_name));
    if (expected.some((name) => !applied.has(name))) return unavailable('MIGRATIONS_PENDING');
    return { status: 'ready' };
}

let active: Promise<ReadinessResult> | undefined;
async function probe(): Promise<ReadinessResult> {
    let expected: string[];
    try {
        expected = (await readdir(migrationsDirectory, { withFileTypes: true }))
            .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
        if (!expected.length) return unavailable('MIGRATION_FILES_UNAVAILABLE');
        await Promise.all(expected.map((name) => access(path.join(migrationsDirectory, name, 'migration.sql'))));
    } catch {
        return unavailable('MIGRATION_FILES_UNAVAILABLE');
    }
    try {
        return await healthDatabase.$transaction(async (db) => {
            await db.$executeRaw`SET TRANSACTION READ ONLY`;
            return inspectReadiness(db, expected);
        }, { maxWait: 3000, timeout: 3000 });
    } catch {
        return unavailable('DATABASE_UNAVAILABLE');
    }
}

export async function checkReadiness(): Promise<ReadinessResult> {
    // Keep one underlying probe until it actually settles, even after the HTTP
    // deadline. Repeated requests cannot accumulate unbounded database work.
    if (!active) active = probe().finally(() => { active = undefined; });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            active,
            new Promise<ReadinessResult>((resolve) => {
                timer = setTimeout(() => resolve(unavailable('READINESS_TIMEOUT')), 5000);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}
