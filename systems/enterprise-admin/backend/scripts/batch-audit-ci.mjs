// Actions-only synthetic acceptance for #46; append-only rows live until owned DB DROP.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

export const databaseName = 'checkout_http_recovery_batch_audit_ci';
export const databaseUrl = `postgresql://test@127.0.0.1:55437/${databaseName}`;
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(backend, '../../..');
const nativeFile = 'src/__tests__/batch-audit.integration.test.ts';
export const expectedCases = [
  'requires independent authority reason and a trusted tenant actor for initial release',
  'rolls back the whole initial receipt when audit persistence fails',
  'rolls back the whole initial receipt when movement persistence fails',
  'does not release expiry-day stock across the Taipei midnight boundary',
  'rejects an expiry extension after an actual lock wait crosses Taipei midnight',
  "rejects ordinary PATCH of expiry status cost and quantity without mutation",
  "requires independent release permission and persists actor before after reason and time",
  "rejects cross tenant operations history and actor spoofing",
  "rolls back the batch update when the audit insert fails",
  "retains append only history and rejects direct update delete and referenced lot deletion",
  "rejects expiry extension bypass and keeps corrected quarantined stock unsaleable",
  "rechecks Taipei midnight after waiting for the actual product row lock",
  "serializes concurrent sale and release without invented quantity or movements",
  "does not rewrite existing order items allocations or product cost on a batch cost correction",
  "paginates all history without permitting another tenant cursor"
];

export function assertConnection(env) {
  // Narrower harness guard: no ambient URL, parameters, password, or alternate DB.
  assert.equal(env.BATCH_AUDIT_DATABASE_URL, databaseUrl);
  assert.equal(env.DATABASE_URL, databaseUrl);
}

export function assertService(info, network, container) {
  assert.equal(info.Id, container);
  assert.equal(info.Config.Image, 'postgres:15-alpine');
  assert.equal(info.State.Running, true);
  assert.equal(info.HostConfig.Privileged, false);
  assert.equal(info.HostConfig.NetworkMode, network);
  assert.match(network, /^github_network_[a-f0-9]+$/);
  assert.deepEqual(Object.keys(info.NetworkSettings.Networks), [network]);
  const bindings = { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55437' }] };
  assert.deepEqual(info.HostConfig.PortBindings, bindings);
  assert.deepEqual(info.NetworkSettings.Ports, bindings);
  assert.ok(info.Config.Env.includes('POSTGRES_USER=test'));
  assert.ok(info.Config.Env.includes(`POSTGRES_DB=${databaseName}`));
  assert.ok(info.Config.Env.includes('POSTGRES_HOST_AUTH_METHOD=trust'));
  assert.equal(info.Config.Env.some(value => /^POSTGRES_PASSWORD=.+/.test(value)), false);
  assert.equal(info.Mounts.some(mount => mount.Type === 'bind'), false);
  return { container, image: info.Image, network, bindings, authentication: 'trust in disposable service only' };
}

export function assertReport(report) {
  const names = expectedCases;
  assert.equal(report.success, true);
  assert.equal(report.numTotalTests, names.length);
  assert.equal(report.numPassedTests, names.length);
  for (const key of ['numFailedTests', 'numPendingTests', 'numTodoTests']) assert.equal(report[key], 0);
  assert.equal(report.testResults.length, 1);
  const suite = report.testResults[0];
  assert.equal(suite.status, 'passed');
  assert.ok(suite.name.endsWith(nativeFile));
  assert.deepEqual(suite.assertionResults.map(test => test.title).sort(), [...names].sort());
  assert.ok(suite.assertionResults.every(test => test.status === 'passed'));
  return suite.assertionResults.map(({ title, status, duration }) => ({ title, status, duration }));
}

export function probeOriginalGuard(source) {
  const start = source.indexOf('// Opt in explicitly:');
  const end = source.indexOf('// End isolated database guard.');
  assert.ok(start >= 0 && end > start, 'The original guard must remain identifiable');
  const guard = source.slice(start, end);
  const cases = [
    ['valid exact URL', databaseUrl, databaseUrl, true],
    ...[
      ['localhost rejected', databaseUrl.replace('127.0.0.1', 'localhost')],
      ['password rejected', databaseUrl.replace('test@', 'test:test@')],
      ['missing port rejected', databaseUrl.replace(':55437', '')],
      ['wrong user rejected', databaseUrl.replace('test@', 'postgres@')],
      ['wrong prefix rejected', databaseUrl.replace(databaseName, 'test_db')],
      ['query rejected', `${databaseUrl}?schema=other`],
      ['fragment rejected', `${databaseUrl}#other`],
      ['wrong port rejected', databaseUrl.replace(':55437', ':55438')],
      ['wrong protocol rejected', databaseUrl.replace('postgresql:', 'postgres:')],
    ].map(([name, url]) => [name, url, url, false]),
    ['different URL envs rejected', databaseUrl, `${databaseUrl}_other`, false],
  ];
  return cases.map(([name, optIn, ambient, expected]) => {
    let accepted = true;
    try {
      vm.runInNewContext(guard, { URL, process: { env: {
        BATCH_AUDIT_DATABASE_URL: optIn, DATABASE_URL: ambient,
      } } }, { timeout: 1000 });
    } catch { accepted = false; }
    assert.equal(accepted, expected, name);
    return { name, accepted, status: 'passed', scope: 'static original guard; no database connection' };
  });
}

async function main(mode) {
  assert.ok(['preflight', 'run', 'cleanup'].includes(mode));
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.match(process.version, /^v22\./);
  assert.match(process.env.BATCH_AUDIT_QA_HEAD || '', /^[a-f0-9]{40}$/);
  assert.match(process.env.BATCH_AUDIT_QA_CONTAINER || '', /^[a-f0-9]{64}$/);
  for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']) assert.match(process.env[key] || '', /^\d+$/);
  assertConnection(process.env);
  assert.equal(fs.existsSync(path.join(backend, '.env')), false, 'No ambient backend .env');
  const evidence = path.join(process.env.RUNNER_TEMP, `batch-audit-qa-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
  fs.mkdirSync(evidence, { recursive: true });
  const save = (name, value) => fs.writeFileSync(path.join(evidence, name), `${JSON.stringify(value, null, 2)}\n`);
  const read = name => JSON.parse(fs.readFileSync(path.join(evidence, name), 'utf8'));
  const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, { cwd: backend, env: process.env, encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024, ...options });
    assert.equal(result.error, undefined, `${command} failed to finish`);
    assert.equal(result.signal, null, `${command} was interrupted`);
    assert.equal(result.status, 0, `${command} failed: ${result.stderr}`);
    return result.stdout.trim();
  };
  const git = (...args) => run('git', ['-C', root, ...args]);
  assert.equal(git('rev-parse', 'HEAD'), process.env.BATCH_AUDIT_QA_HEAD);
  assert.equal(git('status', '--porcelain'), '', 'Exact-head checkout must remain clean');
  const container = process.env.BATCH_AUDIT_QA_CONTAINER;
  const info = JSON.parse(run('docker', ['inspect', container]))[0];
  const service = assertService(info, process.env.BATCH_AUDIT_QA_NETWORK, container);
  const network = JSON.parse(run('docker', ['network', 'inspect', service.network]))[0];
  assert.equal(network.Driver, 'bridge');
  assert.deepEqual(Object.keys(network.Containers), [container], 'Dedicated job network must contain only its service');
  const identity = {
    head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'),
    workflowSha: process.env.GITHUB_SHA, event: process.env.GITHUB_EVENT_NAME,
    runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT,
    service, database: databaseName, node: process.version,
  };
  // The maintenance connection is a local socket inside this verified service only.
  const sql = (database, statement) => run('docker', ['exec', container, 'psql', '-X', '-w', '-v', 'ON_ERROR_STOP=1', '-At', '-U', 'test', '-d', database, '-c', statement]);
  const tables = () => sql(databaseName, "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename").split('\n').filter(Boolean);
  const counts = () => Object.fromEntries(tables().filter(name => name !== '_prisma_migrations').map(name => {
    assert.match(name, /^[a-z_]+$/);
    return [name, Number(sql(databaseName, `SELECT count(*) FROM public."${name}"`))];
  }));
  const requireZero = value => assert.ok(Object.values(value).every(count => count === 0), 'All business tables must contain zero rows');

  if (mode === 'preflight') {
    assert.equal(fs.existsSync(path.join(evidence, 'ownership.json')), false, 'Never reuse a prior fixture');
    save('source.json', { ...identity, parents: git('cat-file', '-p', 'HEAD').split('\n').filter(line => line.startsWith('parent ')).map(line => line.slice(7)) });
    save('network.json', { service, members: Object.keys(network.Containers), driver: network.Driver });
    const files = ['.github/workflows/ci.yml', ...[nativeFile, 'src/modules/product-batches/batch-audit.service.ts', 'src/modules/product-batches/product-batches.routes.ts', 'src/lib/prisma.ts', 'prisma/schema.prisma', 'package.json', 'package-lock.json', 'scripts/batch-audit-ci.mjs'].map(file => `systems/enterprise-admin/backend/${file}`)];
    save('source-hashes.json', Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])));
    save('guard.json', { url: databaseUrl, equalEnvironmentUrls: true, probes: probeOriginalGuard(fs.readFileSync(path.join(backend, nativeFile), 'utf8')) });
    assert.deepEqual(tables(), [], 'Refuse a previously used service database; never reset it');
    save('ownership.json', { ...identity, initialPublicTables: [], syntheticOnly: true });
    console.log('Preflight passed: exact head/tree, loopback-only service, original guard, empty owned DB');
    return;
  }

  assert.deepEqual(read('ownership.json'), { ...identity, initialPublicTables: [], syntheticOnly: true });
  if (mode === 'cleanup') {
    // Audits deliberately cannot be deleted. Record remaining synthetic rows,
    // then remove only the exact disposable DB whose empty ownership we proved.
    try { save('cleanup-counts.json', counts()); }
    finally {
      sql('postgres', `DROP DATABASE "${databaseName}" WITH (FORCE)`);
      assert.equal(sql('postgres', `SELECT count(*) FROM pg_database WHERE datname = '${databaseName}'`), '0');
      save('cleanup.json', { ...identity, appendOnlyFixturesRetainedUntilDrop: true, ownedDatabaseAbsent: true });
    }
    const tests = read('tests.json');
    assert.equal(tests.status, 'passed');
    assert.equal(tests.native.length, expectedCases.length);
    save('accepted.json', { ...identity, status: 'passed', tests, cleanup: read('cleanup.json'), productionDataUsed: false });
    console.log('Acceptance passed: all named real PostgreSQL cases; owned audit fixture DB removed');
    return;
  }

  const requireBackend = createRequire(path.join(backend, 'package.json'));
  const childEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'RUNNER_TEMP', 'CI'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  Object.assign(childEnv, { NODE_ENV: 'test', DATABASE_URL: databaseUrl, BATCH_AUDIT_DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: 'synthetic-audit-access-not-a-real-secret-0000',
    JWT_REFRESH_SECRET: 'synthetic-audit-refresh-not-a-real-secret-0000',
  });
  function recorded(name, args) {
    const result = spawnSync(process.execPath, args, { cwd: backend, env: childEnv, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
    fs.writeFileSync(path.join(evidence, `${name}.log`), (result.stdout || '') + (result.stderr || ''));
    save(`${name}-command.json`, { executable: process.execPath, args, status: result.status, signal: result.signal, error: result.error?.message ?? null });
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    return result;
  }
  const { PrismaClient } = requireBackend('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const rows = await db.$queryRaw`SELECT current_database() AS name, current_user AS username, host(inet_server_addr()) AS host, inet_server_port() AS port, version() AS version`;
    save('database-identity.json', rows);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, databaseName);
    assert.equal(rows[0].username, 'test');
    assert.equal(rows[0].host, info.NetworkSettings.Networks[service.network].IPAddress);
    assert.equal(rows[0].port, 5432);
    assert.match(rows[0].version, /^PostgreSQL 15\./);
    assert.deepEqual(tables(), [], 'The fixture must still be empty before migration');
    const migration = recorded('migrations', [requireBackend.resolve('prisma/build/index.js'), 'migrate', 'deploy']);
    assert.equal(migration.status, 0, 'Existing migrations must pass');
    const before = counts();
    assert.ok(Object.keys(before).length > 0);
    save('before-test-counts.json', before);
    requireZero(before);
    // No broad seed, API server, build, HTTP, or other suite is run here.
    const results = {};
    const errors = [];
    for (const [kind, file] of [['native', nativeFile]]) {
      const outcome = recorded(kind, [path.join(backend, 'node_modules/vitest/vitest.mjs'), 'run', file, '--maxWorkers=1', '--no-file-parallelism', '--reporter=verbose', '--reporter=json', `--outputFile.json=${path.join(evidence, `${kind}.json`)}`]);
      try {
        assert.equal(outcome.status, 0, `${kind} tests must exit successfully`);
        results[kind] = assertReport(read(`${kind}.json`));
      } catch (error) { errors.push(`${kind}: ${error.message}`); }
    }
    save('tests.json', { ...results, status: errors.length ? 'failed' : 'passed', errors });
    assert.deepEqual(errors, [], 'Require every original case to pass; skipped is not acceptance');
  } finally { await db.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
}
