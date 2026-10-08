import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const backend = path.resolve(__dirname, '../..');
const marker = 'synthetic-secret-do-not-log-1234567890';

describe('Startup uses the existing required configuration schema', () => {
    it.each(['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'])('exits nonzero without %s', (missing) => {
        const cwd = mkdtempSync(path.join(os.tmpdir(), 'readiness-config-'));
        const env: NodeJS.ProcessEnv = {
            ...process.env, DATABASE_URL: `postgresql://test:${marker}@127.0.0.1:1/test`,
            JWT_ACCESS_SECRET: marker, JWT_REFRESH_SECRET: marker, NODE_ENV: 'test',
        };
        delete env[missing];
        try {
            // An empty cwd prevents a checkout .env from masking absent values.
            const child = spawnSync(process.execPath, [path.join(backend, 'node_modules/tsx/dist/cli.mjs'),
                path.join(backend, 'src/server.ts')], { cwd, env, encoding: 'utf8', timeout: 10000 });
            expect(child.error).toBeUndefined();
            expect(child.status).toBe(1);
            expect(child.stderr).toContain('INVALID_CONFIGURATION');
            expect(child.stderr).toContain(missing);
            expect(child.stdout + child.stderr).not.toContain(marker);
            expect(child.stdout).not.toContain('Server running');
        } finally { rmSync(cwd, { recursive: true, force: true }); }
    });
    it.each(['', '   '])('rejects blank DATABASE_URL %j', (value) => {
        const cwd = mkdtempSync(path.join(os.tmpdir(), 'readiness-config-'));
        try {
            const child = spawnSync(process.execPath, [path.join(backend, 'node_modules/tsx/dist/cli.mjs'),
                path.join(backend, 'src/server.ts')], { cwd, env: { ...process.env, DATABASE_URL: value,
                JWT_ACCESS_SECRET: marker, JWT_REFRESH_SECRET: marker, NODE_ENV: 'test' }, encoding: 'utf8', timeout: 10000 });
            expect(child.status).toBe(1);
            expect(child.stderr).toContain('INVALID_CONFIGURATION');
            expect(child.stdout + child.stderr).not.toContain(marker);
        } finally { rmSync(cwd, { recursive: true, force: true }); }
    });
});
