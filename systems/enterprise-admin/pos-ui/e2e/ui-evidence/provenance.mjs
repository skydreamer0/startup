import { execFileSync } from 'node:child_process';

const sha = (value, label) => {
  if (!/^[a-f0-9]{40}$/.test(value ?? '')) throw new Error(`Explicit ${label} SHA is required`);
  return value;
};

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
  if (!response.ok) throw new Error(`Fixed execution commit API failed: HTTP ${response.status}`);
  const remote = await response.json();
  if (remote.sha !== executionHead || remote.commit?.tree?.sha !== checkoutTree ||
      !Array.isArray(remote.parents) || remote.parents.length !== 2 ||
      remote.parents.some((parent, index) => parent.sha !== record.executionParents[index])) {
    throw new Error('Fixed execution commit API disagrees with local git');
  }
  record.commitApiVerified = true;
  return record;
}
