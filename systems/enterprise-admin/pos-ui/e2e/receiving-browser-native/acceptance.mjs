import assert from 'node:assert/strict';

export const expectedReceivingCases = Object.freeze([
  ...[1440, 390].flatMap(viewport => [
    { viewport, title: 'real login, ten-line save, reopen and immutable history' },
    { viewport, title: 'lost committed response resolves by GET without a second PUT' },
    { viewport, title: 'two real pages race the same revision and expose an explicit CAS choice' },
  ]),
  { viewport: 1440, title: 'unsaved close cancellation retains content; malformed URL and identity are isolated' },
]);
export const receivingBrowserScope = Object.freeze({
  verified: Object.freeze([
    '1440/390 create/save/reopen/history',
    'same-tenant second actor sees empty draft list',
    'two-page same-revision CAS returns one 200 and one 409; loser choice is displayed only',
    'lost committed response resolved by GET without retry PUT',
    'unsaved cancellation retains the current page content; malformed draft URL is rejected',
  ]),
  notVerified: Object.freeze([
    'save next revision after presenting CAS choice',
    'open another actor’s saved draft or history',
    'cross-tenant browser isolation',
    'pending/unknown-outcome navigation guard',
    'read-only actor attempted PUT rejection',
  ]),
});

function collectSpecs(suites, ancestors = [], result = []) {
  for (const suite of suites ?? []) {
    const path = [...ancestors, suite.title].filter(Boolean);
    for (const spec of suite.specs ?? []) result.push({ spec, path });
    collectSpecs(suite.suites, path, result);
  }
  return result;
}

export function assertPlaywrightReceivingReport(report, ledgers, appResponses = []) {
  assert.ok(report && Array.isArray(report.suites), 'Missing actual Playwright JSON report');
  for (const response of appResponses) {
    assert.equal(response.dispatchComplete, true, 'Express dispatch must reach a terminal handler before acceptance');
    assert.equal(response.applicationComplete, true, 'Every real API handler Promise must settle before acceptance');
    assert.equal(response.pendingHandlers, 0, 'No Express route or middleware Promise may remain active');
    assert.deepEqual(response.handlerFailures, [], 'No real API handler Promise may throw or reject');
  }
  assert.deepEqual(report.stats && { expected: report.stats.expected, unexpected: report.stats.unexpected,
    skipped: report.stats.skipped, flaky: report.stats.flaky }, { expected: 7, unexpected: 0, skipped: 0, flaky: 0 });
  const specs = collectSpecs(report.suites);
  const actual = [];
  for (const { spec, path } of specs) {
    const viewportSuite = path.find(title => /^receiving real API (1440|390)$/.test(title));
    const viewport = viewportSuite ? Number(viewportSuite.match(/(1440|390)$/)[1])
      : spec.title === expectedReceivingCases[6].title ? 1440 : null;
    assert.ok(viewport, `Unexpected browser suite/title: ${path.join(' > ')} > ${spec.title}`);
    assert.equal(spec.tests?.length, 1, `Expected one Playwright test for ${spec.title}`);
    const test = spec.tests[0];
    assert.equal(test.expectedStatus, 'passed');
    assert.equal(test.results?.length, 1, `Retries or missing results are forbidden for ${spec.title}`);
    const run = test.results[0];
    assert.equal(run.status, 'passed', `${spec.title} must pass`);
    assert.equal(run.retry, 0, `${spec.title} must not be retried`);
    assert.ok(Number.isFinite(run.duration) && run.duration > 0, `${spec.title} needs its actual duration`);
    assert.deepEqual(run.errors ?? [], [], `${spec.title} contains errors`);
    actual.push({ viewport, title: spec.title, durationMs: run.duration, status: run.status, retry: run.retry });
  }
  assert.deepEqual(actual.map(({ viewport, title }) => ({ viewport, title })).sort((a, b) => a.viewport - b.viewport || a.title.localeCompare(b.title)),
    [...expectedReceivingCases].sort((a, b) => a.viewport - b.viewport || a.title.localeCompare(b.title)), 'Exact seven-case receiving matrix required');
  assert.equal(ledgers.length, 7, 'Each browser case must retain its own network ledger');
  const ledgerKeys = ledgers.map(row => ({ viewport: row.viewport, title: row.title, retry: row.retry }));
  assert.deepEqual(ledgerKeys.sort((a, b) => a.viewport - b.viewport || a.title.localeCompare(b.title)),
    expectedReceivingCases.map(row => ({ ...row, retry: 0 })).sort((a, b) => a.viewport - b.viewport || a.title.localeCompare(b.title)),
    'Network ledgers must map one-to-one to the fixed viewport/title matrix');
  for (const ledger of ledgers) {
    const draftPuts = ledger.requests.filter(row => row.method === 'PUT' && new URL(row.url).pathname.includes('/receiving-drafts/'));
    if (ledger.title === expectedReceivingCases[0].title) assert.equal(draftPuts.length, 1, 'Each ten-line journey saves one draft once');
    if (ledger.title === expectedReceivingCases[1].title) {
      assert.equal(draftPuts.length, 1, 'Lost response journey must never retry PUT');
      const put = draftPuts[0];
      const putIndex = ledger.requests.indexOf(put);
      assert.ok(ledger.requests.some((row, index) => index > putIndex && row.method === 'GET'
        && row.url.endsWith(new URL(put.url).pathname) && row.status === 200),
        'Lost response must resolve with a successful GET readback');
      const apiPutCount = appResponses.filter(row => row.method === 'PUT' && row.url === put.url).length;
      assert.equal(apiPutCount, 1, 'The real API must receive exactly one PUT after response loss');
    }
    if (ledger.title === expectedReceivingCases[2].title) {
      assert.equal(draftPuts.length, 3, 'CAS journey has one initial save and two racing saves');
      const raceUrls = [...new Set(draftPuts.slice(1).map(row => row.url))];
      assert.equal(raceUrls.length, 1, 'Both CAS pages must save the same draft head');
      assert.deepEqual(draftPuts.slice(1).map(row => row.status).sort(), [200, 409]);
      const serverStatuses = appResponses.filter(row => row.method === 'PUT' && row.url === raceUrls[0]).map(row => row.status).sort();
      assert.deepEqual(serverStatuses, [200, 200, 409], 'Owned API must record the initial save and exactly one CAS winner/conflict pair');
    }
  }
  return actual;
}

export function assertAcceptanceAfterCleanup(primaryError, cleanup) {
  assert.equal(primaryError ?? null, null, 'A primary run failure prevents acceptance');
  assert.equal(cleanup?.status, 'passed', 'Acceptance requires successful owned cleanup');
  assert.equal(cleanup.processes?.quiescent, true, 'Owned browser descendants must be quiescent');
  assert.equal(cleanup.processes?.signalCount, 0, 'Forced process cleanup cannot count as native acceptance');
  assert.equal(cleanup.http?.drained, true, 'API requests must drain before acceptance');
  assert.equal(cleanup.server?.closed, true, 'API server must close before acceptance');
  assert.equal(cleanup.database?.disconnected, true, 'Owned database client must disconnect before acceptance');
  assert.equal(cleanup.credentials?.removed, true, 'Synthetic credentials must be removed before acceptance');
  return true;
}
