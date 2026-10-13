import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { assertConnection, assertReport, assertService, databaseName, databaseUrl, expectedCases, schemaCases, probeOriginalGuard,
  acceptanceSuites, assertAcceptanceResults, metadataCases, metadataFile, probeMetadataGuard, runAcceptanceSuites, sourceFiles } from './batch-audit-ci.mjs';

function passingReport({ file, names }) {
  return { success: true, numTotalTests: names.length, numPassedTests: names.length,
    numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    testResults: [{ status: 'passed', name: `/synthetic/${file}`,
      assertionResults: names.map(title => ({ title, status: 'passed', duration: 1 })) }] };
}

function passingResults() {
  return { ...Object.fromEntries(acceptanceSuites.map(({ kind, names }) =>
    [kind, names.map(title => ({ title, status: 'passed', duration: 1 }))])), status: 'passed', errors: [] };
}

test('audit harness accepts only its exact isolated URL in both variables', () => {
  assertConnection({ DATABASE_URL: databaseUrl, BATCH_AUDIT_DATABASE_URL: databaseUrl });
  for (const url of [undefined, databaseUrl.replace('127.0.0.1', 'localhost'), `${databaseUrl}?schema=public`, databaseUrl.replace(':55437', ':5432')]) {
    assert.throws(() => assertConnection({ DATABASE_URL: url, BATCH_AUDIT_DATABASE_URL: url }));
  }
  assert.throws(() => assertConnection({ DATABASE_URL: databaseUrl, BATCH_AUDIT_DATABASE_URL: `${databaseUrl}_other` }));
});

test('schema acceptance requires all six database contract cases', () => {
  const file = 'src/__tests__/batch-change-schema.integration.test.ts';
  const report = { success: true, numTotalTests: schemaCases.length, numPassedTests: schemaCases.length, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    testResults: [{ status: 'passed', name: `/synthetic/${file}`, assertionResults: schemaCases.map(title => ({ title, status: 'passed' })) }] };
  assert.equal(assertReport(report, schemaCases, file).length, 6);
  const missing = structuredClone(report); missing.testResults[0].assertionResults.pop();
  assert.throws(() => assertReport(missing, schemaCases, file));
  const skipped = structuredClone(report); skipped.numPendingTests = 1;
  assert.throws(() => assertReport(skipped, schemaCases, file));
});

test('original native URL guard rejects alternate hosts credentials ports and parameters', () => {
  const source = fs.readFileSync(new URL('../src/__tests__/batch-audit.integration.test.ts', import.meta.url), 'utf8');
  const probes = probeOriginalGuard(source);
  assert.equal(probes.length, 11);
  assert.ok(probes.every(probe => probe.status === 'passed'));
});

test('audit harness rejects public binding privileged or shared services', () => {
  const network = 'github_network_abc123'; const container = 'f'.repeat(64);
  const info = { Id: container, Image: 'sha256:synthetic', Config: { Image: 'postgres:15-alpine', Env: ['POSTGRES_USER=test', `POSTGRES_DB=${databaseName}`, 'POSTGRES_HOST_AUTH_METHOD=trust'] }, State: { Running: true },
    HostConfig: { Privileged: false, NetworkMode: network, PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55437' }] } },
    NetworkSettings: { Networks: { [network]: {} }, Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55437' }] } }, Mounts: [] };
  assertService(info, network, container);
  for (const mutate of [value => { value.HostConfig.Privileged = true; }, value => { value.HostConfig.PortBindings['5432/tcp'][0].HostIp = '0.0.0.0'; }, value => { value.NetworkSettings.Networks.other = {}; }, value => { value.Mounts.push({ Type: 'bind' }); }]) {
    const copy = structuredClone(info); mutate(copy); assert.throws(() => assertService(copy, network, container));
  }
});

test('audit acceptance cannot pass with skipped missing or renamed native cases', () => {
  const report = { success: true, numTotalTests: expectedCases.length, numPassedTests: expectedCases.length, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    testResults: [{ status: 'passed', name: '/synthetic/src/__tests__/batch-audit.integration.test.ts', assertionResults: expectedCases.map(title => ({ title, status: 'passed', duration: 1 })) }] };
  assert.equal(assertReport(report).length, expectedCases.length);
  for (const mutate of [value => { value.numPendingTests = 1; }, value => { value.testResults[0].assertionResults.pop(); }, value => { value.testResults[0].assertionResults[0].status = 'skipped'; }, value => { value.testResults[0].assertionResults[0].title = 'Different case'; }]) {
    const copy = structuredClone(report); mutate(copy); assert.throws(() => assertReport(copy));
  }
});

test('the ordered plan retains all 15 native and 6 schema cases then selects exactly 2 metadata cases', () => {
  assert.deepEqual(acceptanceSuites.map(({ kind, file, names }) => [kind, file, names.length]), [
    ['native', 'src/__tests__/batch-audit.integration.test.ts', 15],
    ['schema', 'src/__tests__/batch-change-schema.integration.test.ts', 6],
    ['metadata', 'src/__tests__/inventory-metadata-invariance.integration.test.ts', 2],
  ]);
  assert.deepEqual(acceptanceSuites[0].names, expectedCases);
  assert.deepEqual(acceptanceSuites[1].names, schemaCases);
  assert.deepEqual(acceptanceSuites[2].names, metadataCases);
  assert.throws(() => acceptanceSuites.push({}));
  assert.throws(() => acceptanceSuites[2].names.pop());
  const source = fs.readFileSync(new URL('../src/__tests__/inventory-metadata-invariance.integration.test.ts', import.meta.url), 'utf8');
  assert.deepEqual([...source.matchAll(/  it\('([^']+)'/g)].map(match => match[1]), metadataCases);
});

test('real suite orchestration selects every exact file and separate raw report without starting a process', () => {
  const calls = [];
  const results = runAcceptanceSuites((kind, args) => {
    calls.push({ kind, args }); return { status: 0, signal: null };
  }, filename => {
    const suite = acceptanceSuites.find(({ kind }) => filename === `${kind}.json`);
    assert.ok(suite);
    return passingReport(suite);
  }, '/synthetic/vitest.mjs', '/synthetic/evidence');
  assert.deepEqual(calls, acceptanceSuites.map(({ kind, file }) => ({ kind, args: [
    '/synthetic/vitest.mjs', 'run', file, '--maxWorkers=1', '--no-file-parallelism',
    '--reporter=verbose', '--reporter=json', `--outputFile.json=/synthetic/evidence/${kind}.json`,
  ] })));
  assertAcceptanceResults(results);
});

test('metadata report rejects skipped missing duplicate renamed extra failed and wrong-file results', () => {
  const suite = acceptanceSuites[2];
  assert.equal(assertReport(passingReport(suite), metadataCases, metadataFile).length, 2);
  for (const mutate of [
    value => { value.numPendingTests = 1; },
    value => { value.numTodoTests = 1; },
    value => { value.numFailedTests = 1; },
    value => { value.numPassedTests = 1; },
    value => { value.testResults[0].assertionResults.pop(); },
    value => { value.testResults[0].assertionResults[1].title = metadataCases[0]; },
    value => { value.testResults[0].assertionResults[0].title = 'Different case'; },
    value => { value.testResults[0].assertionResults.push({ title: 'Extra case', status: 'passed' }); },
    value => { value.testResults[0].assertionResults[0].status = 'skipped'; },
    value => { value.testResults[0].status = 'failed'; },
    value => { value.testResults[0].name = '/synthetic/other.test.ts'; },
    value => { value.success = false; },
  ]) {
    const report = passingReport(suite); mutate(report);
    assert.throws(() => assertReport(report, metadataCases, metadataFile));
  }
});

test('metadata execution cannot pass on nonzero exit signal process error or missing report', () => {
  for (const outcome of [{ status: 1, signal: null }, { status: null, signal: 'SIGTERM' },
    { status: 0, signal: 'SIGTERM' }, { status: 0, signal: null, error: new Error('synthetic timeout') }]) {
    const results = runAcceptanceSuites(kind => kind === 'metadata' ? outcome : { status: 0, signal: null },
      filename => passingReport(acceptanceSuites.find(({ kind }) => filename === `${kind}.json`)),
      '/synthetic/vitest.mjs', '/synthetic/evidence');
    assert.equal(results.status, 'failed');
    assert.equal(results.errors.length, 1);
    assert.match(results.errors[0], /^metadata:/);
    assert.equal(results.metadata, undefined);
    assert.throws(() => assertAcceptanceResults(results));
  }
  const missing = runAcceptanceSuites(() => ({ status: 0, signal: null }), filename => {
    if (filename === 'metadata.json') throw new Error('synthetic missing report');
    return passingReport(acceptanceSuites.find(({ kind }) => filename === `${kind}.json`));
  }, '/synthetic/vitest.mjs', '/synthetic/evidence');
  assert.equal(missing.status, 'failed');
  assert.match(missing.errors[0], /^metadata:/);
  assert.throws(() => assertAcceptanceResults(missing));
});

test('failure in an original suite is retained while the other original and metadata still run', () => {
  const calls = [];
  const results = runAcceptanceSuites(kind => {
    calls.push(kind); return { status: kind === 'native' ? 1 : 0, signal: null };
  }, filename => passingReport(acceptanceSuites.find(({ kind }) => filename === `${kind}.json`)),
  '/synthetic/vitest.mjs', '/synthetic/evidence');
  assert.deepEqual(calls, ['native', 'schema', 'metadata']);
  assert.equal(results.status, 'failed');
  assert.equal(results.schema.length, 6);
  assert.equal(results.metadata.length, 2);
  assert.throws(() => assertAcceptanceResults(results));
});

test('final acceptance rejects a missing or relabeled metadata result despite original 21 successes', () => {
  assertAcceptanceResults(passingResults());
  for (const mutate of [
    value => { delete value.metadata; },
    value => { value.metadata.pop(); },
    value => { value.metadata[1].title = metadataCases[0]; },
    value => { value.metadata[0].status = 'skipped'; },
    value => { value.metadata[0].title = 'Different case'; },
    value => { value.status = 'failed'; },
    value => { value.errors.push('metadata: failed'); },
    value => { delete value.native; },
    value => { delete value.schema; },
  ]) {
    const results = passingResults(); mutate(results);
    assert.throws(() => assertAcceptanceResults(results));
  }
});

test('the unchanged metadata guard disables missing opt-in and rejects alternate database destinations', () => {
  const source = fs.readFileSync(new URL('../src/__tests__/inventory-metadata-invariance.integration.test.ts', import.meta.url), 'utf8');
  const probes = probeMetadataGuard(source);
  assert.equal(probes.length, 12);
  assert.equal(probes[0].accepted, false);
  assert.ok(probes.every(probe => probe.status === 'passed'));
  assert.throws(() => probeMetadataGuard('unrelated source'));
});

test('source receipts retain original subjects and bind both frozen metadata files plus harness tests', () => {
  const originalBackend = [
    'src/__tests__/batch-audit.integration.test.ts', 'src/__tests__/batch-change-schema.integration.test.ts',
    'src/modules/product-batches/batch-audit.service.ts', 'src/modules/product-batches/product-batches.service.ts',
    'src/modules/product-batches/product-batches.routes.ts', 'src/lib/prisma.ts', 'src/lib/tenant-scoped-models.ts',
    'prisma/schema.prisma', 'prisma/migrations/20261009120000_product_batch_changes/migration.sql',
    'package.json', 'package-lock.json', 'scripts/batch-audit-ci.mjs',
  ];
  const addedBackend = ['src/__tests__/inventory-metadata-invariance.integration.test.ts',
    'src/__tests__/inventory-metadata-invariance.test.ts', 'scripts/batch-audit-ci.test.mjs'];
  assert.deepEqual([...sourceFiles].sort(), ['.github/workflows/ci.yml', ...[...originalBackend, ...addedBackend]
    .map(file => `systems/enterprise-admin/backend/${file}`)].sort());
  assert.throws(() => sourceFiles.pop());
});
