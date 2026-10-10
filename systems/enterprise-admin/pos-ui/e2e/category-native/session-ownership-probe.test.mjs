import test from 'node:test';
import assert from 'node:assert/strict';
import { checkObservation, observationMatches, checkArguments, trustedTransition, passed } from './session-ownership-probe.mjs';
const page = (visibilityState, hasFocus = false) => ({ url: 'about:blank', visibilityState, hasFocus });
const sample = (a = 'hidden', b = 'visible', focus = true) => ({ phase: 'S1-false-B-front', A: page(a), B: page(b, focus) });
test('required native states and focused background-switch target fail closed', () => {
  checkObservation(sample(), 'hidden', 'visible');
  assert.throws(() => checkObservation(sample('visible'), 'hidden', 'visible'));
  assert.throws(() => checkObservation(sample('hidden', 'hidden'), 'hidden', 'visible'));
  assert.throws(() => checkObservation(sample('hidden', 'visible', false), 'hidden', 'visible'));
  const unfocusedA = { phase: 'baseline-A-front', A: page('visible'), B: page('hidden') };
  assert.throws(() => checkObservation(unfocusedA, 'visible', 'hidden'));
  unfocusedA.A.hasFocus = true; checkObservation(unfocusedA, 'visible', 'hidden');
  const wrong = sample(); wrong.A.url = 'https://example.invalid'; assert.throws(() => checkObservation(wrong, 'hidden', 'visible'));
});
test('different session false must leave both pages visible while B focused', () => {
  checkObservation(sample('visible'), 'visible', 'visible');
  assert.throws(() => checkObservation(sample(), 'visible', 'visible'));
});
test('synthetic, stale and wrong-state events cannot establish native transition', () => {
  assert.equal(trustedTransition([{ trusted: false, visibilityState: 'hidden' }], 'hidden'), false);
  assert.equal(trustedTransition([{ trusted: true, visibilityState: 'visible' }], 'hidden'), false);
  assert.equal(trustedTransition([{ trusted: true, visibilityState: 'hidden' }], 'hidden', 1), false);
  assert.equal(trustedTransition([{ trusted: true, visibilityState: 'hidden' }], 'hidden'), true);
});
test('separate run, hypothesis and cleanup verdicts all required', () => {
  const result = { runHealth: 'completed', verdict: 'session-ownership-supported' };
  assert.equal(passed(result, { quiescent: true }), true);
  for (const verdict of ['baseline-failed', 'session-ownership-not-supported', 'inconclusive', 'not-evaluated']) assert.equal(passed({ ...result, verdict }, { quiescent: true }), false);
  assert.equal(passed({ ...result, runHealth: 'error' }, { quiescent: true }), false);
  assert.equal(passed(result, { quiescent: false }), false);
});
test('sandbox and loopback profile arguments reject bypasses and shared profiles', () => {
  const args = ['--user-data-dir=/tmp/owned', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'];
  checkArguments(args, '/tmp/owned');
  for (const flag of ['--no-sandbox', '--disable-setuid-sandbox', '--disable-seccomp-filter-sandbox', '--disable-web-security', '--ignore-certificate-errors']) assert.throws(() => checkArguments([...args, flag], '/tmp/owned'));
  assert.throws(() => checkArguments(args, '/tmp/someone-else'));
  assert.throws(() => checkArguments(args.slice(1), '/tmp/owned'));
});

test('waiting predicate requires native focus as well as visible/hidden states', () => {
  const value = { phase: 'baseline-A-front', A: page('visible'), B: page('hidden') };
  assert.equal(observationMatches(value, 'visible', 'hidden'), false);
  value.A.hasFocus = true; assert.equal(observationMatches(value, 'visible', 'hidden'), true);
  value.A.visibilityState = 'hidden'; assert.equal(observationMatches(value, 'visible', 'hidden'), false);
  assert.equal(observationMatches(sample('hidden', 'visible', false), 'hidden', 'visible'), false);
  assert.equal(observationMatches(sample(), 'hidden', 'visible'), true);
  value.A.url = 'https://example.invalid'; assert.throws(() => observationMatches(value, 'visible', 'hidden'));
});
