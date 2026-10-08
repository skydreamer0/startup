// Actions service only. Never accept a caller-supplied database URL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function guardService(info, container, network) {
    assert.match(container, /^[a-f0-9]{64}$/);
    assert.match(network, /^github_network_[a-f0-9]+$/);
    assert.equal(info.Id, container);
    assert.equal(info.Config.Image, 'postgres:15-alpine');
    assert.equal(info.State.Running, true);
    assert.equal(info.HostConfig.Privileged, false);
    assert.equal(info.HostConfig.NetworkMode, network);
    assert.deepEqual(Object.keys(info.NetworkSettings.Networks), [network]);
    assert.ok(info.NetworkSettings.Networks[network].Aliases.includes('postgres'));
    assert.equal(info.Mounts.some(mount => mount.Type === 'bind'), false);
    for (const value of ['POSTGRES_USER=test', 'POSTGRES_PASSWORD=test', 'POSTGRES_DB=test_db']) {
        assert.ok(info.Config.Env.includes(value));
    }
    assert.equal(info.Config.Env.some(value => value.startsWith('POSTGRES_HOST_AUTH_METHOD=')), false);
}

function main(mode) {
    assert.ok(['run', 'cleanup'].includes(mode));
    assert.equal(process.env.GITHUB_ACTIONS, 'true');
    assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
    for (const key of ['GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT']) assert.match(process.env[key] || '', /^\d+$/);
    for (const key of ['GITHUB_SHA', 'HEALTH_SOURCE_SHA']) assert.match(process.env[key] || '', /^[a-f0-9]{40}$/);
    const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
    const root = path.resolve(backend, '../../..');
    const evidence = path.join(process.env.RUNNER_TEMP, `health-readiness-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
    fs.mkdirSync(evidence, { recursive: true });
    const save = (name, value) => fs.writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2) + '\n');
    const run = (command, args, timeout = 30000) => {
        const result = spawnSync(command, args, { cwd: backend, encoding: 'utf8', timeout, maxBuffer: 4 * 1024 * 1024 });
        // Never print command arguments, stdout or stderr on failure: URLs may be present.
        assert.equal(result.error, undefined, 'Subprocess did not finish');
        assert.equal(result.signal, null, 'Subprocess interrupted');
        assert.equal(result.status, 0, 'Subprocess failed');
        return result.stdout.trim();
    };
    const container = process.env.HEALTH_POSTGRES_CONTAINER;
    const network = process.env.HEALTH_POSTGRES_NETWORK;
    const service = JSON.parse(run('docker', ['inspect', container]))[0];
    guardService(service, container, network);
    const sql = (statement) => run('docker', ['exec', container, 'psql', '-X', '-w', '-v', 'ON_ERROR_STOP=1', '-At',
        '-U', 'test', '-d', 'postgres', '-c', statement]);
    const database = `health_readiness_ci_${process.env.GITHUB_RUN_ID}_${process.env.GITHUB_RUN_ATTEMPT}`;
    assert.match(database, /^health_readiness_ci_\d+_\d+$/);
    assert.ok(database.length < 63);
    const runner = `health-readiness-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
    const ownership = { container, network, database, runner, source: process.env.GITHUB_SHA };
    const ownershipFile = path.join(evidence, 'ownership.json');
    if (mode === 'cleanup') {
        if (!fs.existsSync(ownershipFile)) {
            save('cleanup.json', { status: 'not_created' });
            return;
        }
        assert.deepEqual(JSON.parse(fs.readFileSync(ownershipFile, 'utf8')), ownership);
        const leftover = run('docker', ['ps', '-aq', '--filter', `name=^/${runner}$`]);
        if (leftover) {
            const owned = JSON.parse(run('docker', ['inspect', leftover]))[0];
            assert.equal(owned.Name, `/${runner}`);
            assert.equal(owned.Config.Labels['health-readiness-source'], process.env.GITHUB_SHA);
            assert.equal(owned.HostConfig.NetworkMode, network);
            run('docker', ['rm', '-f', leftover]);
        }
        sql(`DROP DATABASE "${database}" WITH (FORCE)`);
        assert.equal(sql(`SELECT count(*) FROM pg_database WHERE datname = '${database}'`), '0');
        save('cleanup.json', { status: 'passed', databaseAbsent: true });
        return;
    }
    const net = JSON.parse(run('docker', ['network', 'inspect', network]))[0];
    assert.equal(net.Driver, 'bridge');
    assert.deepEqual(Object.keys(net.Containers), [container]);
    assert.equal(run('docker', ['ps', '-aq', '--filter', `name=^/${runner}$`]), '');
    assert.equal(run('git', ['-C', root, 'rev-parse', 'HEAD']), process.env.GITHUB_SHA);
    assert.equal(run('git', ['-C', root, 'status', '--porcelain']), '');
    assert.equal(fs.existsSync(path.join(backend, '.env')), false);
    assert.equal(fs.existsSync(ownershipFile), false);
    assert.equal(sql(`SELECT count(*) FROM pg_database WHERE datname = '${database}'`), '0', 'Never reuse a database');
    const image = run('docker', ['image', 'inspect', 'pharmasaas-backend:ci', '--format', '{{.Id}}']);
    assert.match(image, /^sha256:[a-f0-9]{64}$/);
    save('identity.json', { sourceHead: process.env.HEALTH_SOURCE_SHA, executionHead: process.env.GITHUB_SHA,
        tree: run('git', ['-C', root, 'rev-parse', 'HEAD^{tree}']), image, container, network, database,
        sourceMode: process.env.GITHUB_EVENT_NAME === 'pull_request' ? 'pr-merge' : 'head' });
    sql(`CREATE DATABASE "${database}"`);
    save('ownership.json', ownership);
    const result = spawnSync('docker', ['run', '--rm', '--name', runner,
        '--label', `health-readiness-source=${process.env.GITHUB_SHA}`, '--network', network,
        '--mount', `type=bind,src=${backend}/scripts/health-readiness,dst=/qa,readonly`,
        '--env', `HEALTH_FIXTURE_DATABASE=${database}`, '--env', 'HEALTH_SYNTHETIC=owned-actions-service',
        '--workdir', '/app', '--entrypoint', 'node', image, '/qa/verify.cjs'],
        { cwd: backend, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
    assert.equal(result.error, undefined, 'Container harness deadline failed');
    const output = result.stdout.trim();
    // The harness emits only a structured, secret-checked result, including failures.
    assert.equal(result.stderr, '');
    const report = JSON.parse(output);
    assert.equal(output.includes('SYNTHETIC-HEALTH-SECRET-CANARY'), false);
    assert.equal(output.includes('postgresql://'), false);
    save('acceptance.json', report);
    assert.equal(result.status, 0);
    assert.equal(report.status, 'passed');
    assert.equal(report.cleanup, 'passed');
    assert.equal(report.checks.length, 10);
    assert.ok(report.checks.every(check => check.status === 'passed'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try { main(process.argv[2]); console.log('Health readiness stage passed'); }
    catch { console.error('HEALTH_READINESS_STAGE_FAILED'); process.exitCode = 1; }
}
