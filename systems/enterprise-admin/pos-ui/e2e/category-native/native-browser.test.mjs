import test from 'node:test';
import assert from 'node:assert/strict';
import { browserEnvironment, browserArguments, assertBrowserArguments, endpointFromPortFile, assertNativeReceipt } from './native-browser.mjs';
const profile = '/tmp/owned-run/.owned-chrome-profiles/case-test';
const receipt = () => ({ test: 'synthetic guard case', nonce: '00000000-0000-4000-8000-000000000002', caseNonce: '00000000-0000-4000-8000-000000000001', caseCleanup: { nonce: '00000000-0000-4000-8000-000000000002', caseNonce: '00000000-0000-4000-8000-000000000001', quiescent: true, signalCount: 0, signals: [] }, mode: 'noDefaults-existing-default-context', chrome: 'Google Chrome 154.0.8037.97', browserVersion: '154.0.8037.97', defaultContext: true, initialBlankPages: 1, profile, actualArguments: browserArguments(profile), quiescent: true, profileRemoved: true, forcedShutdown: false, serviceWorkers: [], phase: { exitCode: 0, signal: null, error: null } });
test('Chrome gets no DB, JWT, credential, proxy or browser override environment', () => {
  assert.deepEqual(browserEnvironment({ PATH: '/bin', HOME: '/owned', DISPLAY: ':99', XAUTHORITY: '/tmp/owned-xvfb/Xauthority', CATEGORY_UI_NONCE: 'synthetic', DATABASE_URL: 'secret', JWT_ACCESS_SECRET: 'secret', GITHUB_TOKEN: 'secret', HTTP_PROXY: 'secret', NODE_OPTIONS: 'override', CHROME_FLAGS: 'override' }), { PATH: '/bin', HOME: '/owned', DISPLAY: ':99', XAUTHORITY: '/tmp/owned-xvfb/Xauthority', CATEGORY_UI_NONCE: 'synthetic' });
});
test('browser arguments require owned profile, loopback CDP and intact sandbox', () => {
  assertBrowserArguments(browserArguments(profile), profile);
  for (const bypass of ['--no-sandbox', '--disable-setuid-sandbox', '--disable-seccomp-filter-sandbox', '--disable-web-security', '--ignore-certificate-errors']) assert.throws(() => assertBrowserArguments([...browserArguments(profile), bypass], profile));
  assert.throws(() => assertBrowserArguments(browserArguments('/tmp/unowned'), profile));
});
test('only locally discovered valid ephemeral CDP endpoints are accepted', () => {
  assert.equal(endpointFromPortFile('12345\n/devtools/browser/123-ab\n'), 'ws://127.0.0.1:12345/devtools/browser/123-ab');
  for (const value of ['0\n/devtools/browser/id', '65536\n/devtools/browser/id', 'text\n/devtools/browser/id', '123\nhttps://external.invalid', '123\n/devtools/browser/id?external=true']) assert.throws(() => endpointFromPortFile(value));
});
test('native acceptance requires official Chrome/default context/complete isolation cleanup', () => {
  assertNativeReceipt(receipt());
  for (const [key, value] of [['test', ''], ['mode', 'new-context'], ['chrome', 'Chromium 154.0.8037.97'], ['browserVersion', '153'], ['defaultContext', false], ['initialBlankPages', 2], ['quiescent', false], ['profileRemoved', false], ['forcedShutdown', true], ['caseCleanup', { quiescent: false, signalCount: 0 }], ['caseCleanup', { quiescent: true, signalCount: 1 }], ['serviceWorkers', ['unexpected']], ['phase', { exitCode: 1, signal: null, error: null }], ['phase', { exitCode: 0, signal: 'SIGTERM', error: null }]]) assert.throws(() => assertNativeReceipt({ ...receipt(), [key]: value }));
});
