// Inside the already-built final Alpine image. One owned synthetic database only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { setTimeout: delay } = require('node:timers/promises');
const requireBackend = createRequire('/app/package.json');
const checks = [];
const children = new Set();
const sockets = new Set();
const canary = 'SYNTHETIC-HEALTH-SECRET-CANARY-2026-123456789';
let proxy, db, stage = 'guard', fixtureUrl, proxyUrl;
let proxyPort, apiPort, appChild;
const subject = '/tmp/health-readiness-subject';
const report = { status: 'failed', cleanup: 'not_run', checks };
const safe = (value) => {
    const text = String(value);
    for (const secret of [canary, fixtureUrl, proxyUrl].filter(Boolean)) assert.equal(text.includes(secret), false, 'Sensitive output');
};
function launch(env, port) {
    const child = spawn(process.execPath, ['dist/server.js'], { cwd: subject, env: {
        PATH: process.env.PATH, NODE_ENV: 'test', PORT: String(port), DATABASE_URL: proxyUrl,
        JWT_ACCESS_SECRET: canary, JWT_REFRESH_SECRET: canary, ...env,
    }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.add(child);
    child.output = '';
    child.done = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal })));
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
        child.output += chunk;
        if (child.output.length > 1024 * 1024) child.kill('SIGKILL');
    });
    return child;
}
async function stop(child) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
    const result = await Promise.race([child.done, delay(3000).then(() => null)]);
    if (!result) { child.kill('SIGKILL'); await child.done; }
    safe(child.output);
    children.delete(child);
}
async function freePort() {
    const server = net.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}
async function startProxy() {
    proxy = net.createServer(client => {
        const upstream = net.connect(5432, 'postgres');
        for (const socket of [client, upstream]) {
            sockets.add(socket);
            socket.on('close', () => sockets.delete(socket));
            socket.on('error', () => { client.destroy(); upstream.destroy(); });
        }
        client.pipe(upstream); upstream.pipe(client);
    });
    await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(proxyPort || 0, '127.0.0.1', resolve); });
    proxyPort = proxy.address().port;
}
async function stopProxy() {
    if (!proxy) return;
    const current = proxy; proxy = undefined;
    const closing = new Promise(resolve => current.close(resolve));
    const socketClosures = [...sockets].map(socket => {
        if (socket.closed) return Promise.resolve();
        const closed = new Promise(resolve => socket.once('close', resolve));
        socket.destroy();
        return closed;
    });
    let timer;
    try {
        await Promise.race([
            Promise.all([closing, ...socketClosures]),
            new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Proxy close deadline')), 3000); }),
        ]);
    } finally { clearTimeout(timer); }
    assert.equal(sockets.size, 0);
}
async function response(route) {
    const res = await fetch(`http://127.0.0.1:${apiPort}${route}`, { signal: AbortSignal.timeout(8000) });
    const text = await res.text(); safe(text);
    return { status: res.status, body: JSON.parse(text) };
}
async function ready(status, code) {
    // Liveness stays good before and after every dependency fault check.
    assert.equal((await response('/health')).status, 200);
    const res = await response('/ready');
    assert.equal(res.status, status);
    assert.deepEqual(res.body, status === 200 ? { status: 'ready' } : { status: 'not_ready', code });
    assert.equal((await response('/health')).status, 200);
    safe(appChild.output);
}
async function check(name, fn) {
    stage = name; await fn(); checks.push({ name, status: 'passed' });
}
async function startupFailure(env, expected) {
    const port = await freePort();
    const child = launch(env, port);
    let observedListener = false;
    const poll = setInterval(() => {
        const socket = net.connect(port, '127.0.0.1');
        socket.once('connect', () => { observedListener = true; socket.destroy(); });
        socket.once('error', () => socket.destroy());
    }, 20);
    try {
        const result = await Promise.race([child.done, delay(10000).then(() => null)]);
        assert.ok(result, 'Startup failure timed out');
        assert.equal(result.code, 1);
        assert.equal(observedListener, false);
        assert.equal(child.output.includes('Server running'), false);
        assert.ok(child.output.includes(expected));
        safe(child.output);
    } finally { clearInterval(poll); await stop(child); }
}
async function main() {
    assert.match(process.version, /^v22\./);
    assert.ok(fs.existsSync('/etc/alpine-release'));
    assert.equal(process.env.HEALTH_SYNTHETIC, 'owned-actions-service');
    const name = process.env.HEALTH_FIXTURE_DATABASE;
    assert.match(name || '', /^health_readiness_ci_\d+_\d+$/);
    assert.equal(process.env.DATABASE_URL, undefined);
    assert.equal(fs.existsSync('/app/.env'), false);
    fixtureUrl = `postgresql://test:test@postgres:5432/${name}`;
    const { PrismaClient } = requireBackend('@prisma/client');
    db = new PrismaClient({ datasources: { db: { url: fixtureUrl } }, log: [] });
    const identity = await db.$queryRaw`SELECT current_database() AS name, current_user AS username`;
    assert.deepEqual(identity, [{ name, username: 'test' }]);
    const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    assert.equal(tables.length, 0, 'Never reset/reuse database');
    stage = 'migrate-owned-fixture';
    const migration = spawnSync(process.execPath, [requireBackend.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
        cwd: '/app', env: { ...process.env, DATABASE_URL: fixtureUrl }, encoding: 'utf8', timeout: 90000,
    });
    safe(migration.stdout); safe(migration.stderr);
    assert.equal(migration.status, 0);
    fs.mkdirSync(subject);
    fs.cpSync('/app/dist', path.join(subject, 'dist'), { recursive: true });
    fs.cpSync('/app/prisma', path.join(subject, 'prisma'), { recursive: true });
    fs.symlinkSync('/app/node_modules', path.join(subject, 'node_modules'));
    await startProxy();
    proxyUrl = `postgresql://test:test@127.0.0.1:${proxyPort}/${name}?connect_timeout=1&pool_timeout=1&application_name=${canary}`;
    apiPort = await freePort(); appChild = launch({}, apiPort);
    await check('final-alpine-startup-and-ready-200', async () => {
        let up = false;
        for (let attempt = 0; attempt < 100; attempt++) {
            safe(appChild.output);
            assert.equal(appChild.exitCode, null);
            try { up = (await response('/health')).status === 200; } catch { /* bounded startup wait */ }
            if (up) break;
            await delay(100);
        }
        assert.ok(up); await ready(200);
    });
    const migrations = path.join(subject, 'prisma/migrations');
    await check('packaged-pending-migration-http-503', async () => {
        const pending = path.join(migrations, '29990101000000_synthetic_pending');
        fs.mkdirSync(pending); fs.writeFileSync(path.join(pending, 'migration.sql'), '-- Synthetic pending fixture only\n');
        try { await ready(503, 'MIGRATIONS_PENDING'); } finally { fs.rmSync(pending, { recursive: true }); }
        await ready(200);
    });
    await check('committed-failed-migration-http-503', async () => {
        const [row] = await db.$queryRaw`SELECT id, finished_at FROM "_prisma_migrations" ORDER BY migration_name LIMIT 1`;
        assert.ok(row.finished_at);
        await db.$executeRaw`UPDATE "_prisma_migrations" SET finished_at = NULL WHERE id = ${row.id}`;
        try { await ready(503, 'MIGRATION_FAILED'); }
        finally { await db.$executeRaw`UPDATE "_prisma_migrations" SET finished_at = ${row.finished_at} WHERE id = ${row.id}`; }
        await ready(200);
    });
    await check('rolled-back-only-migration-http-503', async () => {
        const [row] = await db.$queryRaw`SELECT id, finished_at FROM "_prisma_migrations" ORDER BY migration_name LIMIT 1`;
        await db.$executeRaw`UPDATE "_prisma_migrations" SET finished_at = NULL, rolled_back_at = NOW() WHERE id = ${row.id}`;
        try { await ready(503, 'MIGRATIONS_PENDING'); }
        finally { await db.$executeRaw`UPDATE "_prisma_migrations" SET finished_at = ${row.finished_at}, rolled_back_at = NULL WHERE id = ${row.id}`; }
        await ready(200);
    });
    await check('missing-migration-files-http-503', async () => {
        fs.renameSync(migrations, migrations + '-held');
        try { await ready(503, 'MIGRATION_FILES_UNAVAILABLE'); }
        finally { fs.renameSync(migrations + '-held', migrations); }
        await ready(200);
    });
    await check('database-outage-http-503-live-200', async () => {
        await stopProxy();
        await ready(503, 'DATABASE_UNAVAILABLE');
    });
    await check('database-outage-startup-exit-1-no-listen', () => startupFailure({}, 'STARTUP_NOT_READY'));
    await check('database-recovery-http-200', async () => {
        await startProxy(); await ready(200);
    });
    await check('missing-configuration-startup-exit-1-no-listen', () => startupFailure({ JWT_ACCESS_SECRET: undefined }, 'INVALID_CONFIGURATION'));
    await check('secret-safe-process-and-http-output', async () => {
        safe(appChild.output); safe(JSON.stringify(checks));
        assert.equal(await db.tenant.count(), 0);
        assert.equal(await db.user.count(), 0);
    });
    report.status = 'passed';
}
main().catch(() => { report.failedStage = stage; }).finally(async () => {
    let clean = true;
    for (const child of children) { try { await stop(child); } catch { clean = false; } }
    try { await stopProxy(); } catch { clean = false; }
    try { if (db) await db.$disconnect(); } catch { clean = false; }
    try { fs.rmSync(subject, { recursive: true, force: true }); } catch { clean = false; }
    report.cleanup = clean ? 'passed' : 'failed';
    safe(JSON.stringify(report));
    process.stdout.write(JSON.stringify(report) + '\n');
    // The host stage independently validates both acceptance and cleanup status.
    process.exit(report.status === 'passed' && clean ? 0 : 1);
});
