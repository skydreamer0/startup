import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { assertBrowserQuietBeforeOwnedDrop } from './receiving-browser-cleanup.mjs';

const quiet = { processes: { quiescent: true }, http: { drained: true, activeHandlers: 0 }, server: { closed: true },
  afterSnapshot: { status: 'saved-after-quiescence' }, database: { disconnected: true }, credentials: { removed: true } };

test('owned DB drop requires explicit complete browser, API, snapshot and database quiescence', () => {
  assert.equal(assertBrowserQuietBeforeOwnedDrop(quiet), true);
});

test('missing browser evidence and unverified after-snapshot both refuse the owned DB drop', () => {
  assert.throws(() => assertBrowserQuietBeforeOwnedDrop(null), /teardown evidence is required/);
  assert.throws(() => assertBrowserQuietBeforeOwnedDrop({ ...quiet, afterSnapshot: { status: 'unverified', reason: 'deadline' } }), /unverified after-snapshot forbids/);
});

test('active handlers or an attached snapshot DB client refuse the owned DB drop', () => {
  assert.throws(() => assertBrowserQuietBeforeOwnedDrop({ ...quiet, http: { drained: false, activeHandlers: 1 } }), /handler Promise and transport must settle/);
  assert.throws(() => assertBrowserQuietBeforeOwnedDrop({ ...quiet, database: { disconnected: false } }), /database client must disconnect/);
});

test('a failed browser cleanup receipt cannot authorize the owned DB drop', () => {
  assert.throws(() => assertBrowserQuietBeforeOwnedDrop({ ...quiet, server: { closed: false } }), /server must be closed/);
});

test('original owned cleanup checks real quiescence before counts and DB drop, then retains test-result checks', () => {
  const backend = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
  const source = fs.readFileSync(path.join(backend, 'receiving-drafts-ci.mjs'), 'utf8');
  const cleanup = source.slice(source.indexOf("if (mode === 'cleanup')"));
  assert.ok(cleanup.indexOf('assertBrowserQuietBeforeOwnedDrop(browserCleanup)') < cleanup.indexOf('const remaining = counts()'));
  assert.ok(cleanup.indexOf('const remaining = counts()') < cleanup.indexOf('DROP DATABASE'));
  assert.ok(cleanup.indexOf('DROP DATABASE') < cleanup.indexOf("const tests = read('tests.json')"));
});
