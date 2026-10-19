import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveProvenance } from './provenance.mjs';

let cwd, env, api, execution;
const previousFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = () => { throw new Error('Live network is forbidden in this diagnostic'); };
  cwd = mkdtempSync(join(tmpdir(), 'provenance-diagnostic-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Synthetic QA'); git('config', 'user.email', 'qa@example.invalid');
  writeFileSync(join(cwd, 'base.txt'), 'base\n'); git('add', '.'); git('commit', '-qm', 'test: base');
  const base = git('rev-parse', 'HEAD');
  writeFileSync(join(cwd, 'head.txt'), 'head\n'); git('add', '.'); git('commit', '-qm', 'test: head');
  const head = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
  execution = git('commit-tree', tree, '-p', base, '-p', head, '-m', 'test: fixed merge');
  git('checkout', '-q', '--detach', execution);
  env = { UI_QA_SOURCE_SHA: head, UI_QA_EXECUTION_SHA: execution, UI_QA_EXECUTION_MODE: 'pr-merge',
    UI_QA_EVENT_BASE_SHA: base, GITHUB_REPOSITORY: 'owner/repo', UI_QA_METADATA_TOKEN: 'synthetic-readonly-token' };
  api = { sha: execution, commit: { tree: { sha: tree } }, parents: [base, head].map(sha => ({ sha })) };
});
after(() => { globalThis.fetch = previousFetch; rmSync(cwd, { recursive: true, force: true }); });
async function failure(response) {
  let calls = 0, thrown;
  try {
    await resolveProvenance({ cwd, env, fetchCommit: async (url, options) => {
      calls++;
      assert.equal(url, `https://api.github.com/repos/owner/repo/commits/${execution}`);
      assert.deepEqual(Object.keys(options.headers).sort(), ['Accept', 'Authorization', 'X-GitHub-Api-Version']);
      assert.ok(options.signal instanceof AbortSignal);
      return response;
    } });
  } catch (error) { thrown = error; }
  assert.equal(calls, 1, 'exactly one immutable request; no retry or fallback');
  assert.ok(thrown instanceof Error, 'rejection must remain closed');
  assert.match(thrown.message, /^Fixed execution commit API failed: HTTP /);
  return thrown.message;
}
function response(status, message, headers = {}) {
  return new Response(JSON.stringify({ message }), { status, headers });
}

test('403 retains numeric rate headers and recognized message, dropping sensitive suffixes', async () => {
  const message = await failure(response(403, 'API rate limit exceeded for IP_PRIVATE https://host/?token=SECRET_TOKEN', {
    'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1792196000',
    'x-github-request-id': 'AB12:CD34:EF56', authorization: 'Bearer SECRET_AUTH', 'set-cookie': 'SECRET_COOKIE',
  }));
  assert.match(message, /"x-ratelimit-remaining":"0"/);
  assert.match(message, /"x-ratelimit-reset":"1792196000"/);
  assert.match(message, /"x-github-request-id":"AB12:CD34:EF56"/);
  assert.match(message, /"message":"API rate limit exceeded"/);
  assert.doesNotMatch(message, /SECRET|IP_PRIVATE|https:|authorization|cookie/i);
});

test('429 retains bounded retry-after and secondary rate message without extra fields', async () => {
  const message = await failure(response(429, 'You have exceeded a secondary rate limit. secret=NO_PRINT', { 'retry-after': '60' }));
  assert.match(message, /HTTP 429/);
  assert.match(message, /"retry-after":"60"/);
  assert.match(message, /"message":"You have exceeded a secondary rate limit"/);
  assert.doesNotMatch(message, /NO_PRINT/);
});

test('403 permission-like message is distinguishable without asserting the actual incident cause', async () => {
  const message = await failure(response(403, 'Resource not accessible by integration'));
  assert.match(message, /"message":"Resource not accessible by integration"/);
  assert.doesNotMatch(message, /rate limit/);
});

test('unknown message and invalid allowlisted header values cannot disclose arbitrary secrets', async () => {
  const message = await failure(response(403, 'Bearer SECRET_BODY https://example.invalid/?token=SECRET_QUERY', {
    'x-ratelimit-remaining': 'SECRET_REMAINING', 'x-ratelimit-reset': '1e20',
    'retry-after': 'Bearer SECRET_RETRY', 'x-github-request-id': 'ghp_SECRET_REQUEST',
  }));
  assert.match(message, /\[unrecognized message omitted\]/);
  assert.doesNotMatch(message, /SECRET|Bearer|https:|x-ratelimit|retry-after|x-github-request-id/);
});

test('only four allowlisted headers are accessed; failures in getters preserve HTTP rejection', async () => {
  const names = [];
  const message = await failure({ ok: false, status: 403, headers: { get(name) { names.push(name); throw new Error('SECRET_GETTER'); } } });
  assert.deepEqual(names, ['x-ratelimit-remaining', 'x-ratelimit-reset', 'retry-after', 'x-github-request-id']);
  assert.equal(message, 'Fixed execution commit API failed: HTTP 403');
});

test('oversized JSON is discarded and its owned response reader is cancelled', async () => {
  let cancelled = 0;
  const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode(JSON.stringify({ message: 'API rate limit exceeded ' + 'SECRET'.repeat(1000) }))); }, cancel() { cancelled++; } });
  const message = await failure(new Response(body, { status: 403 }));
  assert.equal(message, 'Fixed execution commit API failed: HTTP 403');
  assert.equal(cancelled, 1);
});

test('malformed JSON never echoes body bytes or parser diagnostics', async () => {
  const message = await failure(new Response('SECRET_INVALID_JSON', { status: 403 }));
  assert.equal(message, 'Fixed execution commit API failed: HTTP 403');
});

test('missing/non-string message, absent body and HTTP503 keep status-only failure', async () => {
  for (const body of ['{}', '{"message":123}', 'null']) {
    assert.equal(await failure(new Response(body, { status: 403 })), 'Fixed execution commit API failed: HTTP 403');
  }
  assert.equal(await failure({ ok: false, status: 503 }), 'Fixed execution commit API failed: HTTP 503');
});

test('hanging body has a bounded read deadline, is cancelled, and never becomes a pass', async () => {
  let cancelled = 0;
  const start = performance.now();
  const body = new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled++; } });
  const message = await failure(new Response(body, { status: 429, headers: { 'retry-after': '5' } }));
  assert.ok(performance.now() - start < 1500);
  assert.match(message, /HTTP 429/);
  assert.match(message, /"retry-after":"5"/);
  assert.equal(cancelled, 1);
});

test('empty chunks cannot starve the deadline or grow the chunk collection', async () => {
  let cancelled = 0, reads = 0;
  const message = await failure({ ok: false, status: 403, body: { getReader: () => ({
    read: async () => { reads++; return { done: false, value: new Uint8Array(0) }; },
    cancel: async () => { cancelled++; },
  }) } });
  assert.equal(message, 'Fixed execution commit API failed: HTTP 403');
  assert.equal(reads, 1); assert.equal(cancelled, 1);
});

test('body getter and cancellation errors cannot replace original status or leak details', async () => {
  assert.equal(await failure({ ok: false, status: 403, get body() { throw new Error('SECRET_BODY_GETTER'); } }), 'Fixed execution commit API failed: HTTP 403');
  assert.equal(await failure({ ok: false, status: 403, body: { getReader: () => ({
    read: async () => { throw new Error('SECRET_READ'); }, cancel: () => { throw new Error('SECRET_CANCEL'); },
  }) } }), 'Fixed execution commit API failed: HTTP 403');
});

test('recognized prefix must end at a boundary; newline header values are suppressed', async () => {
  const message = await failure({ ok: false, status: 403,
    headers: { get: name => name === 'retry-after' ? '12\n' : null },
    body: response(403, 'API rate limit exceededSECRET').body,
  });
  assert.match(message, /unrecognized message omitted/);
  assert.doesNotMatch(message, /retry-after|SECRET/);
});

test('successful immutable commit verification never reads failure headers or body', async () => {
  let calls = 0;
  const result = await resolveProvenance({ cwd, env, fetchCommit: async () => {
    calls++;
    return { ok: true, json: async () => api,
      get headers() { throw new Error('success headers must not be read'); },
      get body() { throw new Error('success body must not be read'); },
    };
  } });
  assert.equal(calls, 1); assert.equal(result.commitApiVerified, true);
});
