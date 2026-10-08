import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { expectedCases } from './expected-cases.mjs';
import { validatePng } from './validate-png.mjs';

const require = (condition, message) => { if (!condition) throw new Error(message); };
const empty = (value) => Array.isArray(value) && value.length === 0;
export async function validateCases(output, context, entries) {
  const json = async path => JSON.parse(await readFile(resolve(output, path), 'utf8'));
  const report = await json('report.json');
  require(report.stats?.expected === expectedCases.length && report.stats?.unexpected === 0
    && report.stats?.skipped === 0 && report.stats?.flaky === 0 && empty(report.errors), 'Incomplete report totals');
  require(Array.isArray(report.suites), 'Missing report suites');
  const specs = [];
  function flatten(suites) {
    for (const suite of suites) {
      require(Array.isArray(suite.specs), 'Missing suite specs');
      specs.push(...suite.specs);
      if (suite.suites !== undefined) { require(Array.isArray(suite.suites), 'Malformed nested suites'); flatten(suite.suites); }
    }
  }
  flatten(report.suites);
  require(specs.length === expectedCases.length, 'Wrong case count');
  const key = (file, title) => `${file}\0${title}`;
  const expected = new Map(expectedCases.map(([file, title, screenshots]) => [key(file, title), screenshots]));
  const cases = new Map();
  const ids = new Set();
  for (const spec of specs) {
    const name = key(basename(spec.file ?? ''), spec.title);
    require(expected.has(name) && !cases.has(name), 'Unexpected or duplicated case');
    require(typeof spec.id === 'string' && spec.id.length > 0 && !ids.has(spec.id), 'Missing or duplicated test ID');
    require(spec.ok === true && Array.isArray(spec.tests) && spec.tests.length === 1, 'Case did not pass once');
    const test = spec.tests[0];
    require(test.expectedStatus === 'passed' && test.status === 'expected'
      && Array.isArray(test.results) && test.results.length === 1, 'Unexpected test outcome/retry');
    const result = test.results[0];
    require(result.status === 'passed' && result.retry === 0 && !result.error && empty(result.errors), 'Failed case result');
    ids.add(spec.id); cases.set(name, spec);
  }
  const last = await json('tests/.last-run.json');
  require(last.status === 'passed' && empty(last.failedTests), 'Last-run state is not passed');
  const networks = entries.filter(entry => basename(entry.path) === 'network-evidence.json');
  require(networks.length === expectedCases.length, 'Missing or duplicate per-case network evidence');
  const seen = new Set();
  const allowed = new Set(['tests/.last-run.json']);
  for (const entry of networks) {
    require(entry.path.startsWith('tests/'), 'Network evidence outside tests');
    const network = await json(entry.path);
    const name = key(network.file, network.test);
    const spec = cases.get(name);
    require(spec && !seen.has(name) && network.testId === spec.id && network.nonce === context.nonce,
      'Network evidence does not bind exactly one current case');
    require(network.viewport?.width === 1440 && network.viewport?.height === 900, 'Wrong network viewport');
    require(empty(network.writes) && empty(network.unexpected) && empty(network.pageErrors)
      && Array.isArray(network.requests) && Array.isArray(network.stubbedStylesheets)
      && Array.isArray(network.keyboardEvents), 'Incomplete or failed network assertions');
    seen.add(name); allowed.add(entry.path);
    for (const screenshot of expected.get(name)) {
      const relative = `${dirname(entry.path)}/${screenshot}`;
      const bytes = await readFile(resolve(output, relative));
      validatePng(bytes);
      allowed.add(relative);
    }
  }
  const actual = entries.filter(entry => entry.path.startsWith('tests/')).map(entry => entry.path);
  require(actual.length === allowed.size && actual.every(path => allowed.has(path)), 'Incomplete or unexpected per-case artifact set');
}
