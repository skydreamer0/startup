import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testPath = 'systems/enterprise-admin/backend/src/__tests__/inventory-fefo-trace.integration.test.ts';
export function verifyEvidence(report, lifecycle, snapshots, acceptance, source) {
  assert.equal(report.success, true);
  const cases = report.testResults.flatMap(suite => suite.assertionResults);
  assert.equal(cases.length, 1);
  assert.equal(cases[0].status, 'passed');
  assert.equal(report.numFailedTests, 0);
  assert.equal(report.numPendingTests, 0);
  assert.equal(lifecycle.event, 'afterAll-complete');
  for (const key of ['serverClosed', 'prismaDisconnected', 'appPrismaDisconnected']) assert.equal(lifecycle[key], true);
  assert.equal(lifecycle.cleanupErrorCount, 0);
  for (const [key, value] of Object.entries(source)) {
    assert.equal(lifecycle[key], value);
    assert.equal(acceptance[key], value);
  }
  assert.equal(acceptance.acceptance, 'passed');
  assert.deepEqual(acceptance.tracePagination, { total: 131, returned: 100, order: 'createdAt desc, id desc' });
  assert.ok(snapshots.businessTableCount >= 28);
  for (const phase of ['initialDetailReads', 'paginationAndAuthorizationReads']) {
    assert.equal(Object.keys(snapshots[phase].before).length, snapshots.businessTableCount);
    assert.deepEqual(snapshots[phase].before, snapshots[phase].after);
  }
}

export async function main() {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
  const output = mkdtempSync(path.join(process.env.RUNNER_TEMP || tmpdir(), 'inventory-fefo-trace-'));
  let sequence = 0;
  function run(command, args, options = {}) {
    const result = spawnSync(command, args, { cwd: repo, encoding: 'utf8', timeout: 300_000, maxBuffer: 32 * 1024 * 1024, ...options });
    writeFileSync(path.join(output, `${String(++sequence).padStart(2, '0')}-${path.basename(command)}.log`), `${result.stdout || ''}\n${result.stderr || ''}\nexit=${result.status}\n`);
    if (result.error || result.status !== 0) throw new Error(`${command} failed (${result.status}): ${result.error?.message || result.stderr || result.stdout}`);
    return result.stdout.trim();
  }
  const git = (...args) => run('git', args);
  const docker = (...args) => run('docker', args);
  const source = { sourceHead: git('rev-parse', 'HEAD'), sourceTree: git('rev-parse', 'HEAD^{tree}'), testBlob: git('rev-parse', `HEAD:${testPath}`) };
  if (process.env.FEFO_EXPECTED_HEAD) assert.equal(source.sourceHead, process.env.FEFO_EXPECTED_HEAD);
  assert.equal(git('status', '--porcelain', '--untracked-files=no'), '', 'Commit tracked changes before native acceptance');
  writeFileSync(path.join(output, 'source.json'), JSON.stringify(source, null, 2));
  console.log(`FEFO native evidence: ${output}`);
  const nonce = randomUUID().replaceAll('-', '');
  const database = `inventory_fefo_trace_${nonce}`;
  const containerName = `fefo-pg-${nonce}`;
  const workerName = `fefo-node-${nonce}`;
  const networkName = `fefo-net-${nonce}`;
  const sourceDir = path.join(output, 'source');
  mkdirSync(sourceDir);
  git('archive', '--format=tar', '-o', path.join(output, 'source.tar'), source.sourceHead);
  run('tar', ['-xf', path.join(output, 'source.tar'), '-C', sourceDir]);
  const backend = path.join(sourceDir, 'systems/enterprise-admin/backend');
  const databaseUrl = `postgresql://test@127.0.0.1:5432/${database}`;
  let containerId;
  let networkId;
  let failed;
  const cleanup = { databaseRemoved: false, containerRemoved: false, networkRemoved: false };
  const nodeImage = 'node:22-bookworm';
  const node = (args, network) => docker('run', '--rm', '--name', workerName, '--label', `fefo-run=${nonce}`,
    ...(network ? ['--network', `container:${containerId}`] : []),
    '--mount', `type=bind,source=${backend},target=/app`,
    '--mount', `type=bind,source=${output},target=/evidence`, '-w', '/app',
    '-e', 'NODE_ENV=test', '-e', `DATABASE_URL=${databaseUrl}`,
    '-e', 'JWT_ACCESS_SECRET=synthetic-fefo-access-secret-000000000000',
    '-e', 'JWT_REFRESH_SECRET=synthetic-fefo-refresh-secret-00000000000',
    '-e', `INVENTORY_FEFO_TRACE_DATABASE_URL=${databaseUrl}`,
    '-e', 'INVENTORY_FEFO_TRACE_ALLOW_SYNTHETIC=1',
    ...['OWNERSHIP:ownership', 'EVIDENCE:acceptance', 'SNAPSHOTS:snapshots', 'LIFECYCLE:lifecycle'].flatMap(pair => {
      const [key, file] = pair.split(':'); return ['-e', `INVENTORY_FEFO_TRACE_${key}_FILE=/evidence/${file}.json`];
    }), nodeImage, ...args);
  const sql = (query, db = database) => docker('exec', containerId, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-U', 'test', '-d', db, '-Atc', query);
  try {
    docker('info', '--format', '{{.ServerVersion}}');
    node(['npx', '--yes', 'npm@11.21.0', 'ci']);
    node(['node', 'node_modules/prisma/build/index.js', 'generate']);
    node(['node', 'node_modules/typescript/bin/tsc']);
    node(['node', 'node_modules/eslint/bin/eslint.js', 'src/']);
    networkId = docker('network', 'create', '--internal', networkName);
    containerId = docker('run', '-d', '--name', containerName, '--network', networkName,
      '-p', '127.0.0.1::5432', '-e', 'POSTGRES_USER=test', '-e', `POSTGRES_DB=${database}`,
      '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:15-alpine');
    assert.match(containerId, /^[a-f0-9]{64}$/);
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { sql('SELECT 1'); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
    }
    assert.ok(ready, 'New owned PostgreSQL did not become ready');
    const inspect = JSON.parse(docker('inspect', containerId))[0];
    assert.equal(inspect.Name, `/${containerName}`);
    const bindings = inspect.NetworkSettings.Ports['5432/tcp'];
    assert.equal(bindings.length, 1);
    assert.equal(bindings[0].HostIp, '127.0.0.1');
    assert.equal(sql("SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"), '0');
    const identity = JSON.parse(sql("SELECT json_build_object('database',current_database(),'host',host(inet_server_addr()),'port',inet_server_port(),'systemIdentifier',(SELECT system_identifier::text FROM pg_control_system()),'dataDirectory',current_setting('data_directory'))"));
    assert.equal(identity.database, database);
    assert.equal(identity.host, '127.0.0.1');
    assert.equal(identity.port, 5432);
    writeFileSync(path.join(output, 'ownership.json'), JSON.stringify({ ...identity, ...source, containerId, publishedAddress: bindings[0].HostIp, publishedPort: Number(bindings[0].HostPort), syntheticOnly: true }, null, 2));
    node(['node', 'node_modules/prisma/build/index.js', 'migrate', 'deploy'], true);
    node(['node', 'node_modules/vitest/vitest.mjs', 'run', 'src/__tests__/inventory-fefo-trace.integration.test.ts', '--reporter=default', '--reporter=json', '--outputFile=/evidence/vitest.json'], true);
    const read = name => JSON.parse(readFileSync(path.join(output, `${name}.json`), 'utf8'));
    verifyEvidence(read('vitest'), read('lifecycle'), read('snapshots'), read('acceptance'), source);
  } catch (error) { failed = error; }
  finally {
    // Only resources created by this invocation are eligible for removal.
    try {
      const workerId = docker('ps', '-aq', '--filter', `name=^/${workerName}$`, '--filter', `label=fefo-run=${nonce}`);
      if (workerId) docker('rm', '-f', workerId);
    } catch (error) { failed ||= error; }
    if (containerId) {
      try {
        const inspect = JSON.parse(docker('inspect', containerId))[0];
        assert.equal(inspect.Id, containerId);
        assert.equal(inspect.Name, `/${containerName}`);
        sql(`DROP DATABASE "${database}" WITH (FORCE)`, 'postgres');
        assert.equal(sql(`SELECT count(*) FROM pg_database WHERE datname='${database}'`, 'postgres'), '0');
        cleanup.databaseRemoved = true;
      } catch (error) { failed ||= error; }
      try { docker('rm', '-fv', containerId); cleanup.containerRemoved = true; } catch (error) { failed ||= error; }
    }
    if (networkId) {
      try { docker('network', 'rm', networkId); cleanup.networkRemoved = true; } catch (error) { failed ||= error; }
    }
    writeFileSync(path.join(output, 'cleanup.json'), JSON.stringify(cleanup, null, 2));
    writeFileSync(path.join(output, 'result.json'), JSON.stringify({ ...source, passed: !failed, cleanup, error: failed?.message }, null, 2));
  }
  if (failed) throw failed;
  console.log('FEFO native acceptance PASS: 1 test, zero skips, both Prisma clients closed, owned DB/container/network removed.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
