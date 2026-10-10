import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertReport } from '../sku-acceptance/run.mjs';
import { expectedCloseShiftCases } from './cases.mjs';

test('close-shift browser acceptance requires all eleven exact cases without skip, retry or swallowed failure', () => {
  const report = { errors: [], suites: [{ specs: expectedCloseShiftCases.map(title => ({ title, ok: true,
    tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', errors: [], duration: 1 }] }],
  })) }] };
  assert.equal(assertReport(report, expectedCloseShiftCases).length, 11);
  for (const mutate of [
    value => value.suites[0].specs.pop(),
    value => { value.suites[0].specs[0].title = 'substitute'; },
    value => { value.suites[0].specs.push(value.suites[0].specs[0]); },
    value => { value.suites[0].specs[0].tests[0].results[0].status = 'skipped'; },
    value => { value.suites[0].specs[0].tests[0].expectedStatus = 'failed'; },
    value => { value.suites[0].specs[0].tests[0].status = 'unexpected'; },
    value => { value.suites[0].specs[0].tests[0].results[0].errors.push({ message: 'hidden error' }); },
    value => { value.suites[0].specs[0].tests[0].results.push({ status: 'passed' }); },
    value => { value.errors.push({ message: 'swallowed failure' }); },
    value => { value.suites[0].specs[0].ok = false; },
  ]) {
    const invalid = structuredClone(report); mutate(invalid);
    assert.throws(() => assertReport(invalid, expectedCloseShiftCases));
  }
});
