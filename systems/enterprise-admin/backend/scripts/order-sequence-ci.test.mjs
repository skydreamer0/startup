// Pure harness controls only. These tests never import Prisma or connect to a DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { assertConnection, assertReport, assertService, databaseName, databaseUrl, suites, nativeCases, probeOriginalGuard } from './order-sequence-ci.mjs';

test('harness accepts only equal, exact synthetic URLs', () => {
  const env = { DATABASE_URL: databaseUrl, ORDER_SEQUENCE_DATABASE_URL: databaseUrl };
  assertConnection(env);
  for (const other of [undefined, `${databaseUrl}?schema=other`, databaseUrl.replace('127.0.0.1', 'localhost'), databaseUrl.replace('test@', 'test:test@'), databaseUrl.replace(':55436', ''), databaseUrl.replace(databaseName, 'test_db')]) {
    assert.throws(() => assertConnection({ ...env, DATABASE_URL: other }));
    assert.throws(() => assertConnection({ DATABASE_URL: other, ORDER_SEQUENCE_DATABASE_URL: other }));
  }
});

test('native source guard rejects unsafe connection variants', () => {
  const source = fs.readFileSync(new URL('../src/__tests__/order-sequence.integration.test.ts', import.meta.url), 'utf8');
  assert.equal(probeOriginalGuard(source).length, 8);
});

test('service guard rejects wildcard ports, other networks and external mounts', () => {
  const container = 'a'.repeat(64);
  const network = 'github_network_abc123';
  const info = {
    Id: container, Image: `sha256:${'b'.repeat(64)}`, State: { Running: true },
    Config: { Image: 'postgres:15-alpine', Env: ['POSTGRES_USER=test', `POSTGRES_DB=${databaseName}`, 'POSTGRES_HOST_AUTH_METHOD=trust'] },
    HostConfig: { Privileged: false, NetworkMode: network, PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55436' }] } },
    NetworkSettings: { Networks: { [network]: {} }, Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55436' }] } },
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

for (const kind of Object.keys(suites)) test(`${kind} report cannot accept skipped, omitted, failed or substituted cases`, () => {
  const names = kind === 'native' ? nativeCases : Array.from({ length: suites[kind].count }, (_, i) => `${kind}-${i}`);
  const report = {
    success: true, numTotalTests: names.length, numPassedTests: names.length,
    numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    testResults: [{ status: 'passed', name: `/repo/${suites[kind].file}`, assertionResults: names.map(title => ({ title, status: 'passed', duration: 1 })) }],
  };
  assert.equal(assertReport(report, kind).length, names.length);
  for (const mutate of [
    value => { value.numPendingTests = 1; },
    value => { value.numTodoTests = 1; },
    value => { value.testResults[0].assertionResults.pop(); },
    value => { value.testResults[0].assertionResults[0].status = 'failed'; },
    ...(kind === 'native' ? [value => { value.testResults[0].assertionResults[0].title = 'a different case'; }] : []),
    value => { value.numTotalTests += 1; },
    value => { value.testResults[0].name = '/some/other.test.ts'; },
  ]) {
    const invalid = structuredClone(report);
    mutate(invalid);
    assert.throws(() => assertReport(invalid, kind));
  }
});
