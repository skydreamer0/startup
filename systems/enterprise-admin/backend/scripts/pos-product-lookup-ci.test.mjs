// Pure harness controls only. These tests never import Prisma or connect to a DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { assertConnection, assertReport, assertService, assertOwnership, assertZeroRows, databaseName, databaseUrl, expectedCases, probeOriginalGuard, probeCategoryGuard, testFiles } from './pos-product-lookup-ci.mjs';

test('harness accepts only equal, exact synthetic URLs', () => {
  const env = { DATABASE_URL: databaseUrl, POS_PRODUCT_LOOKUP_DATABASE_URL: databaseUrl };
  assertConnection(env);
  for (const other of [undefined, `${databaseUrl}?schema=other`, databaseUrl.replace('127.0.0.1', 'localhost'), databaseUrl.replace('test@', 'test:test@'), databaseUrl.replace(':55435', ''), databaseUrl.replace(databaseName, 'test_db')]) {
    assert.throws(() => assertConnection({ ...env, DATABASE_URL: other }));
    assert.throws(() => assertConnection({ DATABASE_URL: other, POS_PRODUCT_LOOKUP_DATABASE_URL: other }));
  }
});

test('original unchanged source guard rejects unsafe connection variants', () => {
  const source = fs.readFileSync(new URL('../src/__tests__/pos-product-lookup.integration.test.ts', import.meta.url), 'utf8');
  assert.equal(probeOriginalGuard(source).length, 8);
});

test('service guard rejects wildcard ports, other networks and external mounts', () => {
  const container = 'a'.repeat(64);
  const network = 'github_network_abc123';
  const info = {
    Id: container, Image: `sha256:${'b'.repeat(64)}`, State: { Running: true },
    Config: { Image: 'postgres:15-alpine', Env: ['POSTGRES_USER=test', `POSTGRES_DB=${databaseName}`, 'POSTGRES_HOST_AUTH_METHOD=trust'] },
    HostConfig: { Privileged: false, NetworkMode: network, PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55435' }] } },
    NetworkSettings: { Networks: { [network]: {} }, Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55435' }] } },
    Mounts: [],
  };
  assertService(info, network, container);
  for (const mutate of [
    value => { value.HostConfig.PortBindings['5432/tcp'][0].HostIp = '0.0.0.0'; },
    value => { value.NetworkSettings.Ports['5432/tcp'][0].HostIp = '::'; },
    value => { value.HostConfig.PortBindings['5432/tcp'][0].HostPort = '5432'; },
    value => { value.NetworkSettings.Networks.other = {}; },
    value => { value.HostConfig.NetworkMode = 'host'; },
    value => { value.HostConfig.Privileged = true; },
    value => { value.Config.Env.push('POSTGRES_PASSWORD=unexpected'); },
    value => { value.Mounts.push({ Type: 'bind' }); },
    value => { value.Id = 'c'.repeat(64); },
  ]) {
    const unsafe = structuredClone(info);
    mutate(unsafe);
    assert.throws(() => assertService(unsafe, network, container));
  }
});

for (const kind of ['native', 'categories']) test(`${kind} report cannot accept skipped, omitted, failed or substituted cases`, () => {
  const names = expectedCases[kind];
  const report = {
    success: true, numTotalTests: names.length, numPassedTests: names.length,
    numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    testResults: [{ status: 'passed', name: `/repo/${testFiles[kind]}`, assertionResults: names.map(title => ({ title, status: 'passed', duration: 1 })) }],
  };
  assert.equal(assertReport(report, kind).length, names.length);
  for (const mutate of [
    value => { value.numPendingTests = 1; },
    value => { value.numTodoTests = 1; },
    value => { value.testResults[0].assertionResults.pop(); },
    value => { value.testResults[0].assertionResults[0].status = 'failed'; },
    value => { value.testResults[0].assertionResults[0].title = 'a different case'; },
    value => { value.numTotalTests += 1; },
    value => { value.testResults[0].name = '/some/other.test.ts'; },
  ]) {
    const invalid = structuredClone(report);
    mutate(invalid);
    assert.throws(() => assertReport(invalid, kind));
  }
});

// Ownership is checked again immediately before cleanup: never drop an ambient DB.
test('ownership rejects another source, invocation, database or service', () => {
  const identity = { head: 'a'.repeat(40), tree: 'b'.repeat(40), runId: '1', attempt: '1',
    database: databaseName, service: { container: 'c'.repeat(64), network: 'github_network_abc' } };
  const saved = { ...identity, initialPublicTables: [], syntheticOnly: true };
  assertOwnership(saved, identity);
  for (const key of ['head', 'tree', 'runId', 'attempt', 'database', 'service']) {
    assert.throws(() => assertOwnership({ ...saved, [key]: 'unowned' }, identity));
  }
  assert.throws(() => assertOwnership({ ...saved, initialPublicTables: ['products'] }, identity));
  assert.throws(() => assertOwnership({ ...saved, syntheticOnly: false }, identity));
});
test('cleanup cannot accept residual or invalid row counts', () => {
  assertZeroRows({ products: 0, tenants: 0 });
  for (const count of [1, -1, NaN, '0', null]) assert.throws(() => assertZeroRows({ products: count }));
});

// Category opt-in remains separate; an ambient DATABASE_URL cannot enable writes.
test('category source guard rejects every non-owned connection and environment', () => {
  const source = fs.readFileSync(new URL('../src/__tests__/pos-categories.integration.test.ts', import.meta.url), 'utf8');
  const results = probeCategoryGuard(source);
  assert.ok(results.length >= 12);
  assert.equal(results.filter(result => result.accepted && result.optIn).length, 1);
});
