import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

export interface Ownership {
  nonce: string; dataDirectory: string; port: number; database: string;
  systemIdentifier: string; output: string; sourceHead: string;
}

/** Validate all local ownership facts before constructing any database client. */
export function ownedConnection(value: unknown, env: NodeJS.ProcessEnv, cwd: string) {
  assert.equal(env.NODE_ENV, 'test');
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  const owned = value as Ownership;
  assert.match(owned.nonce, /^[a-f0-9]{32}$/);
  assert.equal(owned.database, `general_trace_${owned.nonce}`);
  assert.ok(Number.isSafeInteger(owned.port) && owned.port > 1024 && owned.port <= 65535);
  assert.match(owned.systemIdentifier, /^\d+$/);
  assert.match(owned.sourceHead, /^[a-f0-9]{40}$/);
  assert.ok(path.isAbsolute(owned.output) && path.isAbsolute(owned.dataDirectory));
  assert.equal(fs.realpathSync(owned.output), owned.output);
  assert.equal(owned.dataDirectory, path.join(owned.output, `owned-${owned.nonce}`, 'data'));
  assert.equal(fs.realpathSync(owned.dataDirectory), owned.dataDirectory);
  assert.equal(fs.readFileSync(path.join(owned.dataDirectory, '..', 'owner'), 'utf8'), owned.nonce);
  const url = `postgresql://test@127.0.0.1:${owned.port}/${owned.database}`;
  assert.equal(env.GENERAL_TRACE_DATABASE_URL, url);
  assert.equal(env.DATABASE_URL, url);
  assert.ok(!fs.existsSync(path.join(cwd, '.env')), 'No dotenv file may be loaded');
  return { owned, url };
}
