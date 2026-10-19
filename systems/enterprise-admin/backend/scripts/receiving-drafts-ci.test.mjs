import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { assertConnection, assertReport, assertService, databaseName, databaseUrl, expectedCases, probeOriginalGuard } from './receiving-drafts-ci.mjs';
const network = `github_network_${'a'.repeat(16)}`, container = 'b'.repeat(64);
const service = () => ({ Id: container, Config: { Image: 'postgres:15-alpine', Env: ['POSTGRES_USER=test', `POSTGRES_DB=${databaseName}`, 'POSTGRES_HOST_AUTH_METHOD=trust'] },
  State: { Running: true }, HostConfig: { Privileged: false, NetworkMode: network, PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55438' }] } },
  NetworkSettings: { Networks: { [network]: {} }, Ports: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55438' }] } }, Mounts: [], Image: 'sha256:synthetic' });
const report = () => ({ success: true, numTotalTests: 10, numPassedTests: 10, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
  testResults: [{ name: '/src/__tests__/receiving-drafts.integration.test.ts', status: 'passed', assertionResults: expectedCases.native.map(title => ({ title, status: 'passed', duration: 1 })) }] });
test('accepts only the exact dedicated loopback URL pair', () => {
  assert.doesNotThrow(() => assertConnection({ DATABASE_URL: databaseUrl, RECEIVING_DRAFT_DATABASE_URL: databaseUrl }));
  for (const url of [undefined, databaseUrl+'?sslmode=require', databaseUrl.replace('127.0.0.1','localhost'), databaseUrl.replace('test@','test:secret@'), databaseUrl.replace('55438','5432')]) {
    assert.throws(() => assertConnection({ DATABASE_URL: url, RECEIVING_DRAFT_DATABASE_URL: url }));
  }
  assert.throws(() => assertConnection({ DATABASE_URL: databaseUrl+'other', RECEIVING_DRAFT_DATABASE_URL: databaseUrl }));
});
test('accepts only the owned unprivileged loopback-only disposable service', () => {
  assert.doesNotThrow(() => assertService(service(), network, container));
  for (const mutate of [s => s.Id='other', s => s.Config.Image='postgres:latest', s => s.State.Running=false,
    s => s.HostConfig.Privileged=true, s => s.HostConfig.PortBindings['5432/tcp'][0].HostIp='0.0.0.0',
    s => s.NetworkSettings.Networks.other={}, s => s.Mounts.push({ Type: 'bind' }), s => s.Config.Env.push('POSTGRES_PASSWORD=secret')]) {
    const s=service(); mutate(s); assert.throws(() => assertService(s,network,container));
  }
});
test('requires exactly ten named passed native cases without skips or duplicates', () => {
  assert.equal(assertReport(report(),'native').length,10);
  for (const mutate of [r => r.success=false, r => r.numPendingTests=1, r => r.numPassedTests=9,
    r => r.testResults[0].assertionResults[0].status='pending', r => r.testResults[0].assertionResults[0].title='unknown',
    r => r.testResults[0].assertionResults[0]=r.testResults[0].assertionResults[1]]) {
    const r=report(); mutate(r); assert.throws(() => assertReport(r,'native'));
  }
});
test('actual native file guard rejects unsafe URLs before importing Prisma', () => {
  const source=fs.readFileSync(new URL('../src/__tests__/receiving-drafts.integration.test.ts',import.meta.url),'utf8');
  const probes=probeOriginalGuard(source); assert.ok(probes.every(p=>p.status==='passed'));
  assert.ok(probes.length>=9);
});
test('cleanup retains append-only snapshots and only drops its owned literal database', () => {
  const source=fs.readFileSync(new URL('./receiving-drafts-ci.mjs',import.meta.url),'utf8');
  assert.ok(source.includes("assert.deepEqual(read('ownership.json')"));
  assert.ok(source.includes('DROP DATABASE "${databaseName}" WITH (FORCE)'));
  assert.ok(source.includes('retainedSyntheticCounts: remaining'));
  assert.doesNotMatch(source,/TRUNCATE|DISABLE TRIGGER|DELETE FROM/);
});
