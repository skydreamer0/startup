import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertRetryReport, retryCases } from './checkout-retry-ci.mjs';

test('retry acceptance requires all exact native cases and zero skips', () => {
  const report = {
    success: true, numTotalTests: 7, numPassedTests: 7, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    testResults: [{ status: 'passed', name: '/repo/src/__tests__/checkout-command-retry.integration.test.ts',
      assertionResults: retryCases.map(title => ({ title, status: 'passed', duration: 1 })) }],
  };
  assert.equal(assertRetryReport(report).length, 7);
  for (const mutate of [
    value => { value.numPendingTests = 1; },
    value => { value.numPassedTests = 6; },
    value => { value.testResults[0].assertionResults.pop(); },
    value => { value.testResults[0].assertionResults[0].status = 'failed'; },
    value => { value.testResults[0].assertionResults[0].title = 'substituted case'; },
    value => { value.testResults[0].name = '/repo/other.test.ts'; },
  ]) {
    const unsafe = structuredClone(report); mutate(unsafe);
    assert.throws(() => assertRetryReport(unsafe));
  }
});
