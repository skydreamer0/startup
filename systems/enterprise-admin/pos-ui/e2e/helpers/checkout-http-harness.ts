import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { cp, mkdtemp, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createRecoveryDatabase, seedRecoveryFixture, syntheticDatabaseUrl, recoverySnapshot } from '../../../backend/src/__tests__/helpers/checkout-http-fixture';

async function freePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No loopback port');
  const port = address.port;
  await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
  return port;
}

export async function checkoutHttpHarness(scenario: string, output: (name: string) => string) {
  const source = process.env.POS_HTTP_RECOVERY_DATABASE_URL;
  if (!source) throw new Error('Set POS_HTTP_RECOVERY_DATABASE_URL to an isolated checkout_http_recovery_* loopback database');
  syntheticDatabaseUrl(source);
  const backend = resolve('../backend');
  const pos = resolve('.');
  const cwd = await mkdtemp(join(tmpdir(), 'checkout-http-recovery-'));
  const databaseName = `checkout_http_recovery_${scenario}_${randomUUID().replaceAll('-', '')}`;
  const databaseUrl = await createRecoveryDatabase(source, databaseName);
  const apiPort = await freePort(); const uiPort = await freePort();
  const apiOrigin = `http://127.0.0.1:${apiPort}`;
  const uiOrigin = `http://127.0.0.1:${uiPort}`;
  // Allowlist only. Empty cwd prevents dotenv from loading the checkout's .env.
  const env = { PATH: process.env.PATH, NODE_ENV: 'test', DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: randomBytes(32).toString('hex'), JWT_REFRESH_SECRET: randomBytes(32).toString('hex'),
    JWT_ACCESS_EXPIRES_IN: '1h', PORT: String(apiPort), CORS_ORIGIN: uiOrigin };
  const events: object[] = [];
  const children: ChildProcess[] = [];
  const logs: Record<string, string> = {};

  async function command(label: string, args: string[]) {
    const child = spawn(process.execPath, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    logs[label] = '';
    child.stdout!.on('data', (data) => { logs[label] += data.toString(); });
    child.stderr!.on('data', (data) => { logs[label] += data.toString(); });
    const [code] = await once(child, 'exit');
    if (code !== 0) throw new Error(`${label} failed (${code}): ${logs[label]}`);
  }

  async function start(label: string, args: string[], origin: string, marker: string, childEnv: NodeJS.ProcessEnv = env) {
    const child = spawn(process.execPath, args, { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child); logs[label] = '';
    events.push({ event: 'spawn', label, pid: child.pid, executable: process.execPath, args, cwd,
      NODE_ENV: childEnv.NODE_ENV, database: { host: '127.0.0.1', name: databaseName, user: 'test', port: Number(new URL(databaseUrl).port) },
      origin, jwtSecrets: 'ephemeral, same across API restart; values omitted', at: new Date().toISOString() });
    child.stdout!.on('data', (data) => { logs[label] += data.toString(); });
    child.stderr!.on('data', (data) => { logs[label] += data.toString(); });
    child.on('error', (error) => { logs[label] += error.message; });
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(`${label} exited: ${logs[label]}`);
      if (logs[label].includes(marker)) {
        try { if ((await fetch(origin + (label.startsWith('api') ? '/health' : '/'))).ok) {
          events.push({ event: 'ready', label, pid: child.pid, at: new Date().toISOString() }); return child;
        } } catch { /* bounded readiness polling, never a crash synchronization point */ }
      }
      await new Promise((done) => setTimeout(done, 50));
    }
    throw new Error(`${label} did not become ready: ${logs[label]}`);
  }

  async function stop(child: ChildProcess, signal: NodeJS.Signals) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    if (!child.kill(signal)) throw new Error(`Could not signal owned PID ${child.pid}`);
    const [code, actualSignal] = await exited;
    events.push({ event: 'exit', pid: child.pid, requestedSignal: signal, code, signal: actualSignal, at: new Date().toISOString() });
  }

  async function close() {
    for (const child of [...children].reverse()) await stop(child, 'SIGTERM');
    await writeFile(output('owned-processes.json'), JSON.stringify(events, null, 2));
    for (const [label, log] of Object.entries(logs)) await writeFile(output(`${label}.txt`), log);
  }

  try {
    await cp(join(backend, 'prisma'), join(cwd, 'prisma'), { recursive: true });
    await command('migrations', [join(backend, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', join(cwd, 'prisma/schema.prisma')]);
    const fixture = await seedRecoveryFixture(databaseUrl, scenario);
    let api = await start('api-first', [join(backend, 'dist/server.js')], apiOrigin, `Server running on port ${apiPort}`);
    await start('pos', [join(pos, 'node_modules/vite/bin/vite.js'), '--config', join(pos, 'e2e/http-recovery.vite.config.mts'), '--host', '127.0.0.1', '--port', String(uiPort), '--strictPort'], uiOrigin, uiOrigin,
      { ...env, POS_HTTP_RECOVERY_API_ORIGIN: apiOrigin });
    return {
      fixture, uiOrigin, databaseName,
      snapshot: () => recoverySnapshot(databaseUrl, fixture),
      restartApi: async () => {
        const oldPid = api.pid;
        if (api.exitCode !== null || api.signalCode !== null) throw new Error('API exited before the controlled restart');
        await stop(api, 'SIGKILL');
        if (api.signalCode !== 'SIGKILL') throw new Error('Owned API process was not killed with SIGKILL');
        // Require a real unavailable interval before starting a new HTTP process.
        let unavailable = false;
        try { await fetch(apiOrigin + '/health'); } catch { unavailable = true; }
        if (!unavailable) throw new Error('API still reachable after owned process termination');
        events.push({ event: 'api-unavailable', pid: oldPid, at: new Date().toISOString() });
        api = await start('api-restarted', [join(backend, 'dist/server.js')], apiOrigin, `Server running on port ${apiPort}`);
        if (api.pid === oldPid) throw new Error('HTTP API PID did not change');
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
