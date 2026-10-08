import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guardService } from './ci.mjs';
const container = 'a'.repeat(64);
const network = 'github_network_' + 'b'.repeat(32);
const good = () => ({ Id: container, Config: { Image: 'postgres:15-alpine', Env: [
    'POSTGRES_USER=test', 'POSTGRES_PASSWORD=test', 'POSTGRES_DB=test_db',
] }, State: { Running: true }, HostConfig: { Privileged: false, NetworkMode: network },
NetworkSettings: { Networks: { [network]: { Aliases: ['postgres'] } } }, Mounts: [] });
test('accepts only the identified disposable Actions PostgreSQL service', () => guardService(good(), container, network));
for (const [name, mutate] of [
    ['different container', info => { info.Id = 'c'.repeat(64); }],
    ['different database', info => { info.Config.Env[2] = 'POSTGRES_DB=production'; }],
    ['host networking', info => { info.HostConfig.NetworkMode = 'host'; }],
    ['privileged container', info => { info.HostConfig.Privileged = true; }],
    ['bind-mounted data', info => { info.Mounts = [{ Type: 'bind' }]; }],
    ['unexpected trust authentication', info => { info.Config.Env.push('POSTGRES_HOST_AUTH_METHOD=trust'); }],
    ['different image', info => { info.Config.Image = 'postgres:latest'; }],
]) test(`rejects ${name}`, () => { const info = good(); mutate(info); assert.throws(() => guardService(info, container, network)); });
