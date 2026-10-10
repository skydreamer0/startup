// Actions-only, synthetic-only acceptance: unchanged SKU/category cases plus separately reported inventory provenance SQL cases.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

export const databaseName = 'checkout_http_recovery_pos_lookup_ci';
export const databaseUrl = `postgresql://test@127.0.0.1:55435/${databaseName}`;
const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(backend, '../../..');
const nativeFile = 'src/__tests__/pos-product-lookup.integration.test.ts';
const categoryFile = 'src/__tests__/pos-categories.integration.test.ts';
const provenanceFile = 'src/__tests__/inventory-provenance.integration.test.ts';
const provenanceSql = 'prisma/diagnostics/preflight-inventory-provenance.sql';
export const testFiles = { native: nativeFile, categories: categoryFile, provenance: provenanceFile };
export const expectedCases = {
  provenance: [
    'returns no invented inventory rows for an empty tenant',
    'flags order quantity mismatch even when OUT and its allocation are balanced',
    'reports two linked receipt lots, a split sale and unchanged stock after a money-only refund state',
    'retains legacy product 9 versus batch 4 as difference 5 and unknown receipt source',
    'never calls equal source-less balances historically reconciled',
    'includes released, quarantined, blocked, expired and zero-quantity lots in physical totals',
    'keeps identical SKUs and malformed legacy links isolated by tenant',
    'preaggregates multiple receipts and multiple sales without join multiplication',
    'shows zero products, stock without batches, unlinked IN, old OUT and old order items',
    'reports missing or excess allocation quantity 1 against OUT and order quantity 2',
    'reports missing or excess allocation quantity 3 against OUT and order quantity 2',
    'excludes allocations with invalid IN provenance from linked batch evidence',
    'excludes allocations with invalid OUT provenance from linked batch evidence',
    'retains unsupported types including ADJUSTMENT without assigning a direction',
    'reports negative balances and nonpositive legacy movements without hiding them',
    'uses exact numeric sums and subtraction beyond signed 32-bit limits',
    'keeps every stored row unchanged and report ordering stable across repeated runs',
    'enforces READ ONLY at the engine boundary',
    'native only: holds one repeatable-read snapshot while another connection commits',
    'native only: reports actual receipt, two-lot checkout and money-only refund service writes',
  ],
  native: [
    'finds the exact zero-stock SKU beyond 100 fuzzy matches and isolates concurrent tenants',
    'does not normalize or fuzzy match 123',
    'does not normalize or fuzzy match 001',
    'does not normalize or fuzzy match a00123-1',
    'does not normalize or fuzzy match  00123',
  ],
  categories: [
    'isolates concurrent category service reads for same-name categories in different tenants',
    'returns ordered id-name-only categories through real JWT tenant and permission middleware',
    'keeps empty and zero-stock categories independent of capped or filtered product results',
    'returns a successful empty list only for the authenticated tenant without categories',
    'rejects missing and invalid authentication without returning category data',
    'rejects a real active user token without the existing manage-pos permission',
    'rejects a suspended user and a token used against a different tenant header',
    'does not leak a prior tenant when authenticated requests alternate A-B-A',
    'fails closed when category service has no tenant context',
  ],
};

export function assertOwnership(saved, identity) {
  assert.deepEqual(saved, { ...identity, initialPublicTables: [], syntheticOnly: true });
}
export function assertZeroRows(counts) {
  assert.ok(Object.values(counts).every(count => Number.isSafeInteger(count) && count === 0),
    'All business tables must contain zero rows');
}

export function assertConnection(env) {
  // Narrower harness guard: no ambient URL, parameters, password, or alternate DB.
  assert.equal(env.POS_PRODUCT_LOOKUP_DATABASE_URL, databaseUrl);
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
  const bindings = { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55435' }] };
  assert.deepEqual(info.HostConfig.PortBindings, bindings);
  assert.deepEqual(info.NetworkSettings.Ports, bindings);
  assert.ok(info.Config.Env.includes('POSTGRES_USER=test'));
  assert.ok(info.Config.Env.includes(`POSTGRES_DB=${databaseName}`));
  assert.ok(info.Config.Env.includes('POSTGRES_HOST_AUTH_METHOD=trust'));
  assert.equal(info.Config.Env.some(value => /^POSTGRES_PASSWORD=.+/.test(value)), false);
  assert.equal(info.Mounts.some(mount => mount.Type === 'bind'), false);
  return { container, image: info.Image, network, bindings, authentication: 'trust in disposable service only' };
}

export function assertReport(report, kind) {
  const names = expectedCases[kind];
  assert.ok(names && testFiles[kind], 'Unknown acceptance suite');
  assert.equal(report.success, true);
  assert.equal(report.numTotalTests, names.length);
  assert.equal(report.numPassedTests, names.length);
  for (const key of ['numFailedTests', 'numPendingTests', 'numTodoTests']) assert.equal(report[key], 0);
  assert.equal(report.testResults.length, 1);
  const suite = report.testResults[0];
  assert.equal(suite.status, 'passed');
  assert.ok(suite.name.endsWith(testFiles[kind]));
  assert.deepEqual(suite.assertionResults.map(test => test.title).sort(), [...names].sort());
  assert.ok(suite.assertionResults.every(test => test.status === 'passed'));
  return suite.assertionResults.map(({ title, status, duration }) => ({ title, status, duration }));
}

export function probeOriginalGuard(source) {
  const start = source.indexOf('// Never fall back to ambient');
  const end = source.indexOf('describe.skipIf(!databaseUrl)');
  assert.ok(start >= 0 && end > start, 'The original guard must remain identifiable');
  const guard = source.slice(start, end);
  const cases = [
    ['valid exact URL', databaseUrl, databaseUrl, true],
    ...[
      ['localhost rejected', databaseUrl.replace('127.0.0.1', 'localhost')],
      ['password rejected', databaseUrl.replace('test@', 'test:test@')],
      ['missing port rejected', databaseUrl.replace(':55435', '')],
      ['wrong user rejected', databaseUrl.replace('test@', 'postgres@')],
      ['wrong prefix rejected', databaseUrl.replace(databaseName, 'test_db')],
      ['wrong protocol rejected', databaseUrl.replace('postgresql:', 'postgres:')],
    ].map(([name, url]) => [name, url, url, false]),
    ['different URL envs rejected', databaseUrl, `${databaseUrl}_other`, false],
  ];
  return cases.map(([name, optIn, ambient, expected]) => {
    let accepted = true;
    try {
      vm.runInNewContext(guard, { URL, process: { env: {
        POS_PRODUCT_LOOKUP_DATABASE_URL: optIn, DATABASE_URL: ambient,
      } } }, { timeout: 1000 });
    } catch { accepted = false; }
    assert.equal(accepted, expected, name);
    return { name, accepted, status: 'passed', scope: 'static original guard; no database connection' };
  });
}

export function probeCategoryGuard(source) {
  const start = source.indexOf('// Never fall back to ambient');
  const end = source.indexOf('describe.skipIf(!databaseUrl)');
  assert.ok(start >= 0 && end > start, 'The category guard must remain identifiable');
  const guard = source.slice(start, end);
  const base = { NODE_ENV: 'test', POS_CATEGORIES_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl, POS_PRODUCT_LOOKUP_DATABASE_URL: databaseUrl };
  const cases = [
    ['valid owned URL', base, true],
    ['absent opt-in never enables fixture', { ...base, POS_CATEGORIES_DATABASE_URL: undefined }, true],
    ...[
      ['localhost', databaseUrl.replace('127.0.0.1', 'localhost')],
      ['password', databaseUrl.replace('test@', 'test:test@')],
      ['missing port', databaseUrl.replace(':55435', '')],
      ['wrong port', databaseUrl.replace(':55435', ':5432')],
      ['wrong user', databaseUrl.replace('test@', 'postgres@')],
      ['wrong DB', databaseUrl.replace(databaseName, 'store_db')],
      ['schema query', `${databaseUrl}?schema=other`],
      ['URL fragment', `${databaseUrl}#other`],
      ['wrong protocol', databaseUrl.replace('postgresql:', 'postgres:')],
    ].map(([name, url]) => [name, { ...base, POS_CATEGORIES_DATABASE_URL: url, DATABASE_URL: url, POS_PRODUCT_LOOKUP_DATABASE_URL: url }, false]),
    ['different ambient URL', { ...base, DATABASE_URL: `${databaseUrl}_other` }, false],
    ['missing SKU opt-in', { ...base, POS_PRODUCT_LOOKUP_DATABASE_URL: undefined }, false],
    ['non-test environment', { ...base, NODE_ENV: 'production' }, false],
  ];
  return cases.map(([name, env, expected]) => {
    let accepted = true;
    try { vm.runInNewContext(guard, { process: { env } }, { timeout: 1000 }); }
    catch { accepted = false; }
    assert.equal(accepted, expected, name);
    return { name, accepted, optIn: !!env.POS_CATEGORIES_DATABASE_URL, status: 'passed', scope: 'static category guard; no database connection' };
  });
}

export function probeProvenanceGuard(source) {
  const start = source.indexOf('// BEGIN inventory provenance opt-in guard.');
  const end = source.indexOf('// END inventory provenance opt-in guard.');
  assert.ok(start >= 0 && end > start, 'The provenance guard must remain identifiable');
  const guard = source.slice(start, end).replace('env.RUNNER_TEMP!', 'env.RUNNER_TEMP').replace('(ref: string)', '(ref)');
  const head = 'a'.repeat(40), tree = 'b'.repeat(40), container = 'c'.repeat(64);
  const base = { NODE_ENV: 'test', GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted',
    RUNNER_TEMP: '/synthetic-runner', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1',
    SKU_QA_HEAD: head, SKU_QA_CONTAINER: container, SKU_QA_NETWORK: 'github_network_abc123',
    DATABASE_URL: databaseUrl, POS_PRODUCT_LOOKUP_DATABASE_URL: databaseUrl,
    INVENTORY_PROVENANCE_DATABASE_URL: databaseUrl, INVENTORY_PROVENANCE_ALLOW_SYNTHETIC: '1',
    INVENTORY_PROVENANCE_OWNERSHIP_FILE: '/synthetic-runner/sku-qa-123-1/ownership.json' };
  const proof = { head, tree, runId: '123', attempt: '1', database: databaseName, node: process.version,
    syntheticOnly: true, initialPublicTables: [], service: { container, network: base.SKU_QA_NETWORK,
      bindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55435' }] } } };
  const cases = [
    ['exact owned fixture', base, proof, true],
    ['ambient-only stays disabled', { ...base, INVENTORY_PROVENANCE_DATABASE_URL: undefined }, proof, true],
    ...[
      ['host', databaseUrl.replace('127.0.0.1', 'localhost')],
      ['external host', databaseUrl.replace('127.0.0.1', 'example.invalid')],
      ['port', databaseUrl.replace(':55435', ':55434')],
      ['missing port', databaseUrl.replace(':55435', '')],
      ['database', `${databaseUrl}_other`], ['user', databaseUrl.replace('test@', 'postgres@')],
      ['password', databaseUrl.replace('test@', 'test:test@')],
      ['options', `${databaseUrl}?schema=other`], ['fragment', `${databaseUrl}#other`],
    ].map(([name, url]) => [name, { ...base, INVENTORY_PROVENANCE_DATABASE_URL: url, DATABASE_URL: url, POS_PRODUCT_LOOKUP_DATABASE_URL: url }, proof, false]),
    ...['POS_PRODUCT_LOOKUP_DATABASE_URL', 'INVENTORY_PROVENANCE_ALLOW_SYNTHETIC', 'GITHUB_ACTIONS',
      'RUNNER_ENVIRONMENT', 'SKU_QA_HEAD', 'SKU_QA_CONTAINER', 'SKU_QA_NETWORK',
      'INVENTORY_PROVENANCE_OWNERSHIP_FILE', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'RUNNER_TEMP'].map(key => [`missing ${key}`, { ...base, [key]: undefined }, proof, false]),
    ['non-test environment', { ...base, NODE_ENV: 'production' }, proof, false],
    ['ambient mismatch', { ...base, DATABASE_URL: `${databaseUrl}_other` }, proof, false],
    ['both engines', { ...base, INVENTORY_PROVENANCE_PGLITE_PATH: '/existing/module' }, proof, false],
    ['proof path mismatch', { ...base, INVENTORY_PROVENANCE_OWNERSHIP_FILE: '/somewhere/ownership.json' }, proof, false],
    ...['head', 'tree', 'runId', 'attempt', 'database', 'node'].map(key => [`proof ${key} mismatch`, base, { ...proof, [key]: 'unowned' }, false]),
    ['claimed head differs from checkout', { ...base, SKU_QA_HEAD: 'd'.repeat(40) }, { ...proof, head: 'd'.repeat(40) }, false],
    ['nonempty proof', base, { ...proof, initialPublicTables: ['products'] }, false],
    ['nonsynthetic proof', base, { ...proof, syntheticOnly: false }, false],
    ['other container', base, { ...proof, service: { ...proof.service, container: 'd'.repeat(64) } }, false],
    ['other network', base, { ...proof, service: { ...proof.service, network: 'github_network_other' } }, false],
    ['wildcard binding', base, { ...proof, service: { ...proof.service, bindings: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '55435' }] } } }, false],
    ['missing proof', base, null, false],
  ];
  return cases.map(([name, env, saved, expected]) => {
    let accepted = true, proofRead = false;
    try {
      vm.runInNewContext(guard, { process: { env, version: process.version }, URL, path, __dirname: '/repo/backend/src/__tests__',
        readFileSync: file => { assert.equal(file, base.INVENTORY_PROVENANCE_OWNERSHIP_FILE); proofRead = true; if (!saved) throw new Error('Missing ownership'); return JSON.stringify(saved); },
        execFileSync: (_command, args) => args[1] === 'HEAD' ? head : tree,
      }, { timeout: 1000 });
    } catch { accepted = false; }
    assert.equal(accepted, expected, name);
    if (name === 'ambient-only stays disabled') assert.equal(proofRead, false);
    return { name, accepted, optIn: !!env.INVENTORY_PROVENANCE_DATABASE_URL, status: 'passed', scope: 'guard control only; no SQL or connection' };
  });
}

async function main(mode) {
  assert.ok(['preflight', 'run', 'cleanup'].includes(mode));
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.match(process.version, /^v22\./);
  assert.match(process.env.SKU_QA_HEAD || '', /^[a-f0-9]{40}$/);
  assert.match(process.env.SKU_QA_CONTAINER || '', /^[a-f0-9]{64}$/);
  for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']) assert.match(process.env[key] || '', /^\d+$/);
  assertConnection(process.env);
  assert.equal(fs.existsSync(path.join(backend, '.env')), false, 'No ambient backend .env');
  const evidence = path.join(process.env.RUNNER_TEMP, `sku-qa-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
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
  assert.equal(git('rev-parse', 'HEAD'), process.env.SKU_QA_HEAD);
  assert.equal(git('status', '--porcelain'), '', 'Exact-head checkout must remain clean');
  const container = process.env.SKU_QA_CONTAINER;
  const info = JSON.parse(run('docker', ['inspect', container]))[0];
  const service = assertService(info, process.env.SKU_QA_NETWORK, container);
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
  const requireZero = assertZeroRows;

  if (mode === 'preflight') {
    assert.equal(fs.existsSync(path.join(evidence, 'ownership.json')), false, 'Never reuse a prior fixture');
    save('source.json', { ...identity, parents: git('cat-file', '-p', 'HEAD').split('\n').filter(line => line.startsWith('parent ')).map(line => line.slice(7)) });
    save('network.json', { service, members: Object.keys(network.Containers), driver: network.Driver });
    const files = ['.github/workflows/ci.yml', ...[nativeFile, categoryFile, provenanceFile, provenanceSql, 'src/modules/pos/checkout.service.ts', 'src/modules/pos/pos.routes.ts', 'src/modules/pos/pos.controller.ts', 'src/middleware/tenant.middleware.ts', 'src/middleware/rate-limit.middleware.ts', 'src/middleware/auth.middleware.ts', 'src/lib/jwt.ts', 'src/modules/pos/product-lookup.service.ts', 'src/lib/prisma.ts', 'prisma/schema.prisma', 'package.json', 'package-lock.json', 'scripts/pos-product-lookup-ci.mjs'].map(file => `systems/enterprise-admin/backend/${file}`)];
    save('source-hashes.json', Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])));
    save('guard.json', { url: databaseUrl, equalEnvironmentUrls: true, probes: probeOriginalGuard(fs.readFileSync(path.join(backend, nativeFile), 'utf8')) });
    save('category-guard.json', { probes: probeCategoryGuard(fs.readFileSync(path.join(backend, categoryFile), 'utf8')) });
    save('provenance-guard.json', { probes: probeProvenanceGuard(fs.readFileSync(path.join(backend, provenanceFile), 'utf8')) });
    assert.deepEqual(tables(), [], 'Refuse a previously used service database; never reset it');
    save('ownership.json', { ...identity, initialPublicTables: [], syntheticOnly: true });
    console.log('Preflight passed: exact head/tree, loopback-only service, original guard, empty owned DB');
    return;
  }

  assertOwnership(read('ownership.json'), identity);
  if (mode === 'cleanup') {
    let zero = false;
    try {
      const remaining = counts();
      save('cleanup-counts.json', remaining);
      requireZero(remaining);
      zero = true;
    } finally {
      // Never name an ambient DB: only the empty fixture registered by preflight.
      sql('postgres', `DROP DATABASE "${databaseName}" WITH (FORCE)`);
      assert.equal(sql('postgres', `SELECT count(*) FROM pg_database WHERE datname = '${databaseName}'`), '0');
      save('cleanup.json', { ...identity, businessRowsZero: zero, ownedDatabaseAbsent: true });
    }
    assert.ok(zero);
    const tests = read('tests.json');
    assert.equal(tests.status, 'passed');
    for (const kind of Object.keys(testFiles)) assert.equal(tests[kind].length, expectedCases[kind].length);
    save('accepted.json', { ...identity, status: 'passed', tests, cleanup: read('cleanup.json'), productionDataUsed: false });
    console.log('Acceptance passed: 5 original SKU + 9 category + 20 native provenance cases, zero skips; fixture rows zero; owned DB removed');
    return;
  }

  const requireBackend = createRequire(path.join(backend, 'package.json'));
  const childEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'RUNNER_TEMP', 'CI'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  Object.assign(childEnv, { NODE_ENV: 'test', DATABASE_URL: databaseUrl, POS_PRODUCT_LOOKUP_DATABASE_URL: databaseUrl,
    POS_CATEGORIES_DATABASE_URL: databaseUrl,
    // Public synthetic-only signing values; never read, use or print account credentials.
    JWT_ACCESS_SECRET: 'category-ci-synthetic-access-key-not-for-real-accounts',
    JWT_REFRESH_SECRET: 'category-ci-synthetic-refresh-key-not-for-real-accounts',
  });
  function recorded(name, args, extraEnv = {}) {
    const result = spawnSync(process.execPath, args, { cwd: backend, env: { ...childEnv, ...extraEnv }, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
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
    // No broad seed or external API server. Categories use in-process HTTP with real middleware and this DB.
    const results = {};
    const errors = [];
    for (const [kind, file] of Object.entries(testFiles)) {
      const suiteBefore = counts();
      save(`${kind}-before-counts.json`, suiteBefore);
      requireZero(suiteBefore);
      // Only this suite receives its explicit opt-in and immutable ownership proof.
      // Previous original SKU/category suites retain their exact existing environment.
      const provenanceEnv = kind === 'provenance' ? {
        INVENTORY_PROVENANCE_DATABASE_URL: databaseUrl, INVENTORY_PROVENANCE_ALLOW_SYNTHETIC: '1',
        INVENTORY_PROVENANCE_OWNERSHIP_FILE: path.join(evidence, 'ownership.json'),
        GITHUB_ACTIONS: 'true', RUNNER_ENVIRONMENT: 'github-hosted',
        GITHUB_RUN_ID: identity.runId, GITHUB_RUN_ATTEMPT: identity.attempt,
        SKU_QA_HEAD: identity.head, SKU_QA_CONTAINER: container, SKU_QA_NETWORK: service.network,
      } : {};
      const outcome = recorded(kind, [path.join(backend, 'node_modules/vitest/vitest.mjs'), 'run', file, '--maxWorkers=1', '--no-file-parallelism', '--reporter=verbose', '--reporter=json', `--outputFile.json=${path.join(evidence, `${kind}.json`)}`], provenanceEnv);
      try {
        assert.equal(outcome.status, 0, `${kind} tests must exit successfully`);
        results[kind] = assertReport(read(`${kind}.json`), kind);
      } catch (error) { errors.push(`${kind}: ${error.message}`); }
      const suiteAfter = counts();
      save(`${kind}-after-counts.json`, suiteAfter);
      try { requireZero(suiteAfter); } catch (error) { errors.push(`${kind} cleanup: ${error.message}`); }
      if (errors.length) break; // Do not run another suite on contaminated fixtures.
    }
    save('tests.json', { ...results, status: errors.length ? 'failed' : 'passed', errors });
    assert.deepEqual(errors, [], 'Require every original SKU/category and all 20 native provenance cases to pass; skipped is not acceptance');
  } finally { await db.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });
}
