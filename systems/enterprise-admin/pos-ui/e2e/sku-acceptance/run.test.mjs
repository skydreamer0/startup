import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertReport } from './run.mjs';
import { expectedCases } from './cases.mjs';

test('browser evidence requires every exact case without retries or skips', () => {
  const report = { errors: [], suites: [{ specs: expectedCases.map(title => ({ title, ok: true,
    tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', errors: [], duration: 1 }] }],
  })) }] };
  assert.equal(assertReport(report).length, expectedCases.length);
  for (const mutate of [
    value => value.suites[0].specs.pop(),
    value => { value.suites[0].specs[0].title = 'substitute'; },
    value => { value.suites[0].specs[0].tests[0].results[0].status = 'skipped'; },
    value => { value.suites[0].specs[0].tests[0].expectedStatus = 'failed'; },
    value => { value.suites[0].specs[0].tests[0].results.push({ status: 'passed' }); },
    value => { value.errors.push({ message: 'swallowed failure' }); },
    value => { value.suites[0].specs[0].ok = false; },
  ]) {
    const invalid = structuredClone(report); mutate(invalid);
    assert.throws(() => assertReport(invalid));
  }
});
