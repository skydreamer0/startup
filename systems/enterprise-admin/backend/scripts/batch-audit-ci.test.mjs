import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { assertConnection, assertReport, assertService, databaseName, databaseUrl, expectedCases, probeOriginalGuard } from './batch-audit-ci.mjs';

test('audit harness accepts only its exact isolated URL in both variables', () => {
  assertConnection({ DATABASE_URL: databaseUrl, BATCH_AUDIT_DATABASE_URL: databaseUrl });
  for (const url of [undefined, databaseUrl.replace('127.0.0.1', 'localhost'), `${databaseUrl}?schema=public`, databaseUrl.replace(':55437', ':5432')]) {
    assert.throws(() => assertConnection({ DATABASE_URL: url, BATCH_AUDIT_DATABASE_URL: url }));
  }
  assert.throws(() => assertConnection({ DATABASE_URL: databaseUrl, BATCH_AUDIT_DATABASE_URL: `${databaseUrl}_other` }));
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
