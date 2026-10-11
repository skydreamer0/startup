import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { processOwner } from '../ui-evidence/owned-process.mjs';
import { createRunScope, cleanupRunProcesses } from './owned-run.mjs';
import { assertEnvironment, assertReport, assertNetwork, assertDatabase, assertFonts, completionOutcome, caseStages, stableCases, lifecycleCases, emptyCase, expectedCases, databaseUrl } from './contract.mjs';
import { assertOwnership, assertService, databaseName } from '../../../backend/scripts/pos-product-lookup-ci.mjs';
import { assertNativeReceipt } from './native-browser.mjs';
import { validatePng } from '../admin-margin-warning/png.mjs';
import { assertBrandSources } from '../dialog-acceptance/brand-assets.mjs';

export async function runOwnedPhase(owner, command, args, options, state, cleanup) {
  state.quiescent = false;
  const result = await owner.run(command, args, options);
  const receipt = await cleanup(); state.quiescent = result.quiescent === true && receipt.quiescent === true;
  assert.equal(state.quiescent, true, 'Owned processes must be quiescent');
  return { ...result, cleanup: receipt };
}
export function publishEvidence(state, output, githubOutput) {
  if (!state.quiescent) return false;
  assert.ok(path.isAbsolute(output)); assert.equal(/[\r\n]/.test(output), false);
  assert.equal(fs.existsSync(path.join(output, '.bootstrap.json')), false, 'Ephemeral token must be removed');
  fs.appendFileSync(githubOutput, `evidence_dir=${output}\n`); return true;
}
async function main() {
  assertEnvironment(process.env, process.version);
  const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const backend = path.resolve(app, '../backend'), root = path.resolve(app, '../../..');
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10000 }).trim();
  const assertSource = () => {
    assert.equal(git('rev-parse', 'HEAD'), process.env.SKU_QA_HEAD);
    assert.equal(git('status', '--porcelain'), '');
    assert.equal(git('ls-files', '-v').split('\n').some(line => /^[a-zS]/.test(line)), false);
    for (const directory of ['backend', 'pos-ui']) {
      assert.equal(git('ls-files', '--others', '--ignored', '--exclude-standard', '--', `systems/enterprise-admin/${directory}/.env*`), '');
      assert.equal(fs.existsSync(path.join(app, '..', directory, '.env')), false);
    }
    assertBrandSources(app);
  };
  assertSource();
  const container = process.env.SKU_QA_CONTAINER, networkName = process.env.SKU_QA_NETWORK;
  const docker = (...args) => JSON.parse(execFileSync('docker', args, { encoding: 'utf8', timeout: 10000 }));
  const service = assertService(docker('inspect', container)[0], networkName, container);
  const network = docker('network', 'inspect', networkName)[0];
  assert.equal(network.Driver, 'bridge'); assert.deepEqual(Object.keys(network.Containers), [container]);
  const identity = { head: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), workflowSha: process.env.GITHUB_SHA,
    event: process.env.GITHUB_EVENT_NAME, runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT,
    service, database: databaseName, node: process.version };
  const existing = path.join(process.env.RUNNER_TEMP, `sku-qa-${identity.runId}-${identity.attempt}`);
  assertOwnership(JSON.parse(fs.readFileSync(path.join(existing, 'ownership.json'), 'utf8')), identity);
  assert.equal(JSON.parse(fs.readFileSync(path.join(existing, 'tests.json'), 'utf8')).status, 'passed');
  const chrome = execFileSync('google-chrome', ['--version'], { encoding: 'utf8', timeout: 10000 }).trim(); assert.match(chrome, /^Google Chrome /);
  const output = path.join(process.env.RUNNER_TEMP, `category-native-${identity.runId}-${identity.attempt}`);
  fs.mkdirSync(output, { recursive: false });
  const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const read = name => JSON.parse(fs.readFileSync(path.join(output, name), 'utf8'));
  const nonce = randomUUID();
  write('source.json', { ...identity, nonce, chrome, sandbox: true, headed: true, display: 'fresh run-owned Xvfb; TCP disabled; ambient DISPLAY rejected', scope: 'Issue49 category stable/loading/empty/injected 403/500/stale/manual retry/slow response: built POS -> real successful API -> owned isolated PostgreSQL',
    faults: 'Test-only outer middleware injects category errors/delays; injected 403 is UI presentation, not a real authorization test',
    staleExpiry: 'Real 61000ms wall-clock wait and native tab visibility; no fake timers/cache hooks',
    login: 'fixture-issued synthetic JWT for real active synthetic user; login UI not under test', externalCss: 'blocked; installed Noto CJK',
    brandAssets: assertBrandSources(app) });
  const inputs = ['systems/enterprise-admin/pos-ui', 'systems/enterprise-admin/backend', 'systems/enterprise-admin/packages',
    'systems/enterprise-admin/package.json', 'systems/enterprise-admin/pnpm-lock.yaml', 'systems/enterprise-admin/pnpm-workspace.yaml', '.github/workflows/ci.yml'];
  const sourceFiles = git('ls-files', '-z', '--', ...inputs).split('\0').filter(Boolean);
  write('source-hashes.json', Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])));
  // Captured before ANY child gets this nonce. Baseline environment contents are never read.
  const scope = await createRunScope(nonce);
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'RUNNER_TEMP', 'CI'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  for (const key of ['GITHUB_ACTIONS', 'RUNNER_ENVIRONMENT', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'SKU_QA_HEAD', 'SKU_QA_CONTAINER', 'SKU_QA_NETWORK']) env[key] = process.env[key];
  Object.assign(env, { CATEGORY_UI_OUTPUT: output, CATEGORY_UI_NONCE: nonce, CATEGORY_QA_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl, POS_PRODUCT_LOOKUP_DATABASE_URL: databaseUrl, NODE_ENV: 'test', BROWSER: 'none',
    CORS_ORIGIN: 'http://127.0.0.1:4290', JWT_ACCESS_SECRET: 'category-ci-synthetic-access-key-not-for-real-accounts',
    JWT_REFRESH_SECRET: 'category-ci-synthetic-refresh-key-not-for-real-accounts' });
  const owner = processOwner(), state = { quiescent: true }, phases = {};
  const log = fs.openSync(path.join(output, 'raw.log'), 'wx');
  let error = null, accepted = null;
  try {
    const commands = [
      ['browser-types', app, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.category-native.json']],
      ['fixture-types', backend, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.category-native.json']],
      ['collection', app, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'e2e/category-native.config.mts', '--list']],
      ['build', app, ['node_modules/vite/bin/vite.js', 'build', '--config', 'e2e/category-native/vite.config.mts']],
      ['real-api-browser', backend, ['node_modules/tsx/dist/cli.mjs', 'scripts/category-browser-fixture.ts']],
    ];
    for (const [name, cwd, args] of commands) {
      phases[name] = await runOwnedPhase(owner, process.execPath, args, { cwd, env: name === 'build' ? { ...env, NODE_ENV: 'production' } : env, stdio: ['ignore', log, log] }, state, () => cleanupRunProcesses(scope));
      assert.equal(phases[name].exitCode, 0, `${name} must pass`); assert.equal(phases[name].signal, null); assert.equal(phases[name].error, null); assert.equal(owner.cancelled, null);
    }
    assertSource();
    const cases = assertReport(read('report.json'));
    const files = fs.readdirSync(path.join(output, 'tests'), { recursive: true });
    const ledgers = files.filter(file => file.endsWith('/network.json')).map(file => read(path.join('tests', file)));
    assert.deepEqual(ledgers.map(row => row.test).sort(), [...expectedCases].sort()); ledgers.forEach(row => assert.equal(row.nonce, nonce));
    const nativeBrowsers = files.filter(file => file.endsWith('/native-browser.json')).map(file => read(path.join('tests', file)));
    assert.deepEqual(nativeBrowsers.map(row => row.test).sort(), [...expectedCases].sort());
    assert.equal(new Set(nativeBrowsers.map(row => row.profile)).size, expectedCases.length);
    assert.equal(new Set(nativeBrowsers.map(row => row.caseNonce)).size, expectedCases.length);
    nativeBrowsers.forEach(row => { assert.equal(row.nonce, nonce); assertNativeReceipt(row); });
    const api = read('api-ledger.json'), database = read('database-receipt.json');
    const networkReads = assertNetwork(ledgers, api); const databaseProof = assertDatabase(database, api);
    const captures = files.filter(file => file.endsWith('.png')).map(file => {
      const stage = path.basename(file, '.png');
      const receipt = read(path.join('tests', file.replace(/\.png$/, '.json')));
      assert.equal(receipt.nonce, nonce); assert.ok(expectedCases.includes(receipt.test)); assert.equal(receipt.stage, stage);
      assert.ok(caseStages(receipt.test).includes(stage));
      assert.equal(receipt.cartUnchanged, true); assert.equal(receipt.checkoutModalAbsent, true);
      assert.equal(receipt.glyphs.length, receipt.test === emptyCase || ['initial-loading', 'initial-error', 'retry-pending'].includes(stage) ? 1 : 4); receipt.glyphs.forEach(row => assertFonts(row.fonts));
      const bytes = fs.readFileSync(path.join(output, 'tests', file)); const png = validatePng(bytes);
      assert.equal(png.width, receipt.geometry.viewport.width); assert.equal(png.height, receipt.geometry.viewport.height);
      return { file, sha256: createHash('sha256').update(bytes).digest('hex'), ...png, test: receipt.test, stage, geometry: receipt.geometry };
    });
    assert.equal(captures.length, expectedCases.reduce((total, title) => total + caseStages(title).length, 0));
    for (const test of expectedCases) assert.deepEqual(captures.filter(row => row.test === test).map(row => row.stage).sort(), [...caseStages(test)].sort());
    const reachability = files.filter(file => file.endsWith('/reachability.json')).map(file => read(path.join('tests', file)));
    assert.deepEqual(reachability.map(row => row.test).sort(), [...stableCases].sort());
    for (const row of reachability) {
      assert.equal(row.nonce, nonce); assert.deepEqual(row.cartBefore, row.cartAfter); assert.equal(row.reachability.length, 8);
      for (const mode of ['pointer', 'keyboard']) assert.deepEqual(row.reachability.filter(entry => entry.mode === mode).map(entry => entry.name).sort(), [...row.expectedNames].sort());
      row.reachability.forEach(entry => { assert.equal(entry.hit, true); assert.equal(entry.centerInViewport, true); assert.ok(entry.width >= 44 && entry.height >= 44); });
    }
    const lifecycle = files.filter(file => file.endsWith('/lifecycle.json')).map(file => read(path.join('tests', file)));
    assert.deepEqual(lifecycle.map(row => row.test).sort(), [...lifecycleCases].sort());
    for (const row of lifecycle) {
      assert.equal(row.nonce, nonce); assert.equal(row.realStaleWaitMs, 61000); assert.ok(row.realStaleElapsedMs >= 61000);
      assert.equal(row.focusEmulationDisabled, true); assert.equal(row.backgroundVisibility, 'hidden'); assert.equal(row.foregroundVisibility, 'visible');
      assert.equal(row.afterWaitVisibility, 'hidden'); assert.equal(row.focusEmulationMode, 'never-enabled-noDefaults-default-context');
      assert.deepEqual(row.visibilityEvents.map(event => event.state), ['hidden', 'visible']);
      assert.ok(row.visibilityEvents.every(event => event.trusted === true));
      assert.ok(row.visibilityEvents[1].epochMs - row.visibilityEvents[0].epochMs >= 61000);
      assert.deepEqual(row.cartBefore, row.cartAfter); assert.equal(row.search, '合成');
      assert.equal(row.selectedCategory, database.expected.categories[1].id);
      assert.deepEqual(row.latestProductIds, [database.expected.products.find(product => product.sku === 'CATEGORY-ONLY-2').id]);
      assert.equal(row.initialStatus, row.width === 1024 ? 403 : 500);
      assert.equal(row.reachability.length, 2);
      row.reachability.forEach(entry => { assert.equal(entry.hit, true); assert.equal(entry.centerInViewport, true); assert.ok(entry.width >= 44 && entry.height >= 44); });
    }
    write('captures.json', captures);
    accepted = { ...identity, nonce, status: 'passed', cases, networkReads, databaseProof, captures: captures.length,
      checkoutRequests: 0, writesFromBrowser: 0, cartUnchanged: true, nativeBrowsers, phases,
      databaseRemoval: 'Require the subsequent unchanged SKU cleanup receipt with ownedDatabaseAbsent=true; this runner only removes its exact fixture rows',
      visualReview: 'Actual screenshots still require independent Chinese readability, reachability and focus review',
      notRun: ['checkout/refund confirmed quantity', 'whole POS responsive layout', 'hardware/iPad/Safari', 'production DB or deployment'] };
  } catch (problem) { error = problem; }
  finally {
    try { const cleanup = await cleanupRunProcesses(scope); write('run-cleanup.json', cleanup); state.quiescent = state.quiescent && cleanup.quiescent === true; }
    catch (problem) { state.quiescent = false; error ??= problem; }
    if (state.quiescent) fs.rmSync(path.join(output, '.owned-chrome-profiles'), { recursive: true, force: true });
    // A cancelled fixture may not get to its finally block. Never publish its JWT.
    fs.rmSync(path.join(output, '.bootstrap.json'), { force: true });
    const terminal = completionOutcome(error, owner.cancelled); error = terminal.error;
    fs.closeSync(log); owner.dispose(); process.stdout.write(fs.readFileSync(path.join(output, 'raw.log'), 'utf8'));
    write('completion.json', { ...identity, phases, quiescent: state.quiescent, status: terminal.status, error: error?.message ?? null });
    if (state.quiescent && !error && accepted) write('accepted.json', accepted);
    publishEvidence(state, output, process.env.GITHUB_OUTPUT);
  }
  if (error) throw error;
  console.log('CATEGORY_NATIVE_ACCEPTED ' + fs.readFileSync(path.join(output, 'accepted.json'), 'utf8'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });
