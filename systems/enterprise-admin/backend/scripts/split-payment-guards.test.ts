import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ownedConnection, type Ownership } from './split-payment-guards';

function fixture(work: (owned: Ownership, env: NodeJS.ProcessEnv) => void) {
  const output = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'split-payment-guard-')));
  const nonce = '1'.repeat(32);
  const dataDirectory = path.join(output, `owned-${nonce}`, 'data');
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.writeFileSync(path.join(dataDirectory, '..', 'owner'), nonce);
  const owned = { nonce, dataDirectory, port: 55001, database: `split_payment_${nonce}`,
    systemIdentifier: '123456', output, sourceHead: 'a'.repeat(40) };
  const url = `postgresql://test@127.0.0.1:55001/${owned.database}`;
  try { work(owned, { NODE_ENV: 'test', SPLIT_PAYMENT_DATABASE_URL: url, DATABASE_URL: url }); }
  finally { fs.rmSync(output, { recursive: true }); }
}

test('accepts only complete matching local synthetic ownership', () => fixture((owned, env) => {
  assert.equal(ownedConnection(owned, env, owned.output).url, env.DATABASE_URL);
}));
for (const [name, patch] of Object.entries({
  'missing explicit opt-in': { SPLIT_PAYMENT_DATABASE_URL: undefined },
  'ambient production mode': { NODE_ENV: 'production' },
  'remote destination': { DATABASE_URL: 'postgresql://test@remote.example.test:5432/production' },
  'existing local database': { DATABASE_URL: 'postgresql://test@127.0.0.1:55001/postgres' },
  'mismatched opt-in': { SPLIT_PAYMENT_DATABASE_URL: 'postgresql://test@127.0.0.1:55001/preview' },
})) test(`rejects ${name} before a DB client exists`, () => fixture((owned, env) => {
  assert.throws(() => ownedConnection(owned, { ...env, ...patch }, owned.output));
}));
for (const [name, patch] of Object.entries({
  'malformed nonce': { nonce: '../unsafe' }, 'different DB name': { database: 'postgres' },
  'non-owned directory': { dataDirectory: '/tmp' }, 'invalid port': { port: 0 },
  'invalid source SHA': { sourceHead: 'unknown' }, 'invalid cluster identity': { systemIdentifier: 'unknown' },
})) test(`rejects ${name}`, () => fixture((owned, env) => {
  assert.throws(() => ownedConnection({ ...owned, ...patch }, env, owned.output));
}));
test('rejects altered ownership marker', () => fixture((owned, env) => {
  fs.writeFileSync(path.join(owned.dataDirectory, '..', 'owner'), 'other-owner');
  assert.throws(() => ownedConnection(owned, env, owned.output));
}));
test('rejects a dotenv file instead of reading it', () => fixture((owned, env) => {
  fs.writeFileSync(path.join(owned.output, '.env'), 'SYNTHETIC_DO_NOT_READ=1');
  assert.throws(() => ownedConnection(owned, env, owned.output));
}));
