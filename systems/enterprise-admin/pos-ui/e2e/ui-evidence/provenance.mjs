import { execFileSync } from 'node:child_process';

const sha = (value, label) => {
  if (!/^[a-f0-9]{40}$/.test(value ?? '')) throw new Error(`Explicit ${label} SHA is required`);
  return value;
};

// Diagnose the already-rejected response without changing authentication,
// retrying the request, or allowing arbitrary response text into CI logs.
async function rejectionDiagnostics(response) {
  const diagnostics = {};
  for (const [name, pattern] of [
    ['x-ratelimit-remaining', /^\d{1,12}$/],
    ['x-ratelimit-reset', /^\d{1,12}$/],
    ['retry-after', /^\d{1,12}$/],
    ['x-github-request-id', /^[a-f0-9]{1,16}(?::[a-f0-9]{1,16}){2,5}$/i],
  ]) {
    try {
      const value = response.headers?.get(name);
      if (typeof value === 'string' && !/[\r\n]/.test(value) && pattern.test(value)) diagnostics[name] = value;
    } catch { /* Optional diagnostics must not replace the original HTTP failure. */ }
  }
  let reader, timer;
  let accepting = true;
  const deadline = performance.now() + 250;
  const withinDeadline = () => accepting && performance.now() < deadline;
  const readMessage = async () => {
    reader = response.body?.getReader();
    if (!reader) return;
    const chunks = [];
    let bytes = 0;
    while (withinDeadline()) {
      const { done, value } = await reader.read();
      if (!withinDeadline()) return;
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength === 0 || (bytes += value.byteLength) > 4096) return;
      chunks.push(value);
    }
    if (!withinDeadline()) return;
    const body = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    const { message } = JSON.parse(new TextDecoder().decode(body));
    if (!withinDeadline() || typeof message !== 'string') return;
    // Known prefixes distinguish reported messages, not independently proven
    // causes. Their variable suffixes can contain IPs, URLs or credentials.
    const known = [
      'API rate limit exceeded', 'You have exceeded a secondary rate limit',
      'Resource not accessible by integration',
      'Resource not accessible by personal access token',
      'Requires authentication', 'Bad credentials',
    ];
    diagnostics.message = known.find(prefix => message === prefix
      || (message.startsWith(prefix) && /^[\s.:]/.test(message.slice(prefix.length))))
      ?? '[unrecognized message omitted]';
  };
  try {
    await Promise.race([readMessage(), new Promise(resolve => { timer = setTimeout(resolve, 250); })]);
  } catch { /* Malformed/unavailable bodies add no untrusted text. */ }
  finally {
    accepting = false;
    clearTimeout(timer);
    try { void Promise.resolve(reader?.cancel()).catch(() => {}); } catch { /* Best effort only. */ }
    try { reader?.releaseLock?.(); } catch { /* Never wait for cancellation to release our lock. */ }
  }
  return Object.keys(diagnostics).length ? `; diagnostics=${JSON.stringify(diagnostics)}` : '';
}

// Resolve only the immutable execution object. Never query a moving base ref.
// setup.mjs independently enforces the resolved base, QA input equality and clean sources.
export async function resolveProvenance({ cwd, env = process.env, fetchCommit = fetch }) {
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const qaHead = sha(env.UI_QA_SOURCE_SHA, 'QA source');
  const executionHead = sha(env.UI_QA_EXECUTION_SHA, 'QA execution');
  if (git('rev-parse', 'HEAD') !== executionHead) throw new Error('QA checkout is not the expected execution commit');
  const executionMode = env.UI_QA_EXECUTION_MODE;
  const checkoutTree = git('rev-parse', `${executionHead}^{tree}`);
  const record = { qaHead, executionHead, executionMode, checkoutTree, baseHead: null,
    executionParents: [], eventBaseHead: null, eventBaseMismatch: false, commitApiVerified: false };
  if (executionMode === 'head') {
    if (executionHead !== qaHead || checkoutTree !== git('rev-parse', `${qaHead}^{tree}`)) throw new Error('QA head checkout mismatch');
    if (env.UI_QA_BASE_SHA || env.UI_QA_EVENT_BASE_SHA) throw new Error('Unexpected QA base in head mode');
    return record;
  }
  if (executionMode !== 'pr-merge') throw new Error('Explicit QA execution mode must be head or pr-merge');
  record.eventBaseHead = sha(env.UI_QA_EVENT_BASE_SHA, 'QA event base');
  record.executionParents = git('show', '-s', '--format=%P', executionHead).split(' ').filter(Boolean);
  if (record.executionParents.length !== 2 || record.executionParents[1] !== qaHead) {
    throw new Error('QA execution commit is not a two-parent submitted-head merge');
  }
  record.baseHead = record.executionParents[0];
  if (env.UI_QA_BASE_SHA && env.UI_QA_BASE_SHA !== record.baseHead) throw new Error('Supplied QA base differs from the fixed execution parent');
  record.eventBaseMismatch = record.eventBaseHead !== record.baseHead;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY ?? '')) throw new Error('Explicit GitHub repository is required');
  // Public repo, existing contents:read permissions only; no credential is needed.
  const url = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/commits/${executionHead}`;
  const response = await fetchCommit(url, { headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Fixed execution commit API failed: HTTP ${response.status}${await rejectionDiagnostics(response)}`);
  const remote = await response.json();
  if (remote.sha !== executionHead || remote.commit?.tree?.sha !== checkoutTree ||
      !Array.isArray(remote.parents) || remote.parents.length !== 2 ||
      remote.parents.some((parent, index) => parent.sha !== record.executionParents[index])) {
    throw new Error('Fixed execution commit API disagrees with local git');
  }
  record.commitApiVerified = true;
  return record;
}
