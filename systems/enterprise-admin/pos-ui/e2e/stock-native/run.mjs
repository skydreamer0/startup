import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { processOwner } from '../ui-evidence/owned-process.mjs';
import { createRunScope, cleanupRunProcesses } from '../category-native/owned-run.mjs';
import { assertEnvironment, assertReport, assertEvidence, stages, widths, expectedCases, databaseUrl } from './contract.mjs';
import { assertFonts, completionOutcome } from '../category-native/contract.mjs';
import { runOwnedPhase, publishEvidence } from '../category-native/run.mjs';
import { assertOwnership, assertService, databaseName } from '../../../backend/scripts/pos-product-lookup-ci.mjs';
import { validatePng } from '../admin-margin-warning/png.mjs';
import { assertBrandSources } from '../dialog-acceptance/brand-assets.mjs';

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
  const output = path.join(process.env.RUNNER_TEMP, `stock-native-${identity.runId}-${identity.attempt}`);
  fs.mkdirSync(output, { recursive: false });
  const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const read = name => JSON.parse(fs.readFileSync(path.join(output, name), 'utf8'));
  const nonce = randomUUID();
  write('source.json', { ...identity, nonce, chrome, sandbox: true, scope: 'Issue49 AC1/AC2: confirmed checkout/refund quantity, injected product-read failure and manual retry',
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
  Object.assign(env, { STOCK_UI_OUTPUT: output, CATEGORY_UI_NONCE: nonce, CATEGORY_QA_DATABASE_URL: databaseUrl, STOCK_QA_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl, POS_PRODUCT_LOOKUP_DATABASE_URL: databaseUrl, NODE_ENV: 'test', BROWSER: 'none',
    CORS_ORIGIN: 'http://127.0.0.1:4290', JWT_ACCESS_SECRET: 'stock-ci-synthetic-access-key-not-for-real-accounts',
    JWT_REFRESH_SECRET: 'stock-ci-synthetic-refresh-key-not-for-real-accounts' });
  const owner = processOwner(), state = { quiescent: true }, phases = {};
  const log = fs.openSync(path.join(output, 'raw.log'), 'wx');
  let error = null, accepted = null;
  try {
    const commands = [
      ['browser-types', app, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.stock-native.json']],
      ['fixture-types', backend, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.stock-native.json']],
      ['collection', app, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'e2e/stock-native.config.mts', '--list']],
      ['build', app, ['node_modules/vite/bin/vite.js', 'build', '--config', 'e2e/stock-native/vite.config.mts']],
      ['real-api-browser', backend, ['node_modules/tsx/dist/cli.mjs', 'scripts/stock-browser-fixture.ts']],
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
    const api = read('api-ledger.json'), database = read('database-receipt.json');
    const databaseProof = assertEvidence(database, ledgers, api);
    const captures = files.filter(file => file.endsWith('.png')).map(file => {
      const stage = path.basename(file, '.png'); assert.ok(stages.includes(stage));
      const receipt = read(path.join('tests', file.replace(/\.png$/, '.json')));
      assert.equal(receipt.nonce, nonce); assert.ok(expectedCases.includes(receipt.test)); assert.equal(receipt.stage, stage);
      assertFonts(receipt.fonts);
      assert.ok(receipt.geometry.x >= 0 && receipt.geometry.y >= 0);
      assert.ok(receipt.geometry.x + receipt.geometry.width <= receipt.geometry.viewportWidth);
      assert.ok(receipt.geometry.y + receipt.geometry.height <= receipt.geometry.viewportHeight);
      assert.ok(receipt.stock.includes(stage === 'checkout-stale' ? '✓ 5 件' : '✓ 4 件'));
      if (stage.endsWith('-stale')) assert.ok(receipt.text.includes('顯示資訊可能已過期'));
      const bytes = fs.readFileSync(path.join(output, 'tests', file)); const png = validatePng(bytes);
      assert.equal(png.width, receipt.geometry.viewportWidth); assert.equal(png.height, receipt.geometry.viewportHeight);
      return { file, sha256: createHash('sha256').update(bytes).digest('hex'), ...png, test: receipt.test, stage, geometry: receipt.geometry };
    });
    assert.equal(captures.length, stages.length * widths.length);
    for (const test of expectedCases) assert.deepEqual(captures.filter(row => row.test === test).map(row => row.stage).sort(), [...stages].sort());
    const journeys = files.filter(file => file.endsWith('/journey.json')).map(file => read(path.join('tests', file)));
    assert.deepEqual(journeys.map(row => row.test).sort(), [...expectedCases].sort());
    for (const row of journeys) {
      assert.equal(row.nonce, nonce); assert.deepEqual(row.draftBeforeRetry, row.draftAfterRefund);
      assert.deepEqual(row.stock, [5, 4, 4]); assert.deepEqual(row.retryInputs, ['keyboard Enter', 'pointer']);
      for (const key of ['staleSeenAfterCheckout', 'staleSeenAfterRefund', 'receiptConfirmed', 'refundConfirmed']) assert.equal(row[key], true);
    }
    write('captures.json', captures);
    accepted = { ...identity, nonce, status: 'passed', cases, databaseProof, captures: captures.length,
      checkoutRequests: widths.length, refundRequests: widths.length, noWriteRetries: true, newDraftPreserved: true, phases,
      databaseRemoval: 'Require the subsequent unchanged SKU cleanup receipt with ownedDatabaseAbsent=true; this runner only removes its exact fixture rows',
      visualReview: 'Actual screenshots still require independent Chinese readability, reachability and focus review',
      notRun: ['staff login UI', 'unknown/conflict native recovery', '390px refund modal', 'whole POS responsive layout', 'hardware/iPad/Safari', 'production DB or deployment'] };
  } catch (problem) { error = problem; }
  finally {
    try { const cleanup = await cleanupRunProcesses(scope); write('run-cleanup.json', cleanup); state.quiescent = state.quiescent && cleanup.quiescent === true; }
    catch (problem) { state.quiescent = false; error ??= problem; }
    // A cancelled fixture may not get to its finally block. Never publish its JWT.
    fs.rmSync(path.join(output, '.bootstrap.json'), { force: true });
    const terminal = completionOutcome(error, owner.cancelled); error = terminal.error;
    fs.closeSync(log); owner.dispose(); process.stdout.write(fs.readFileSync(path.join(output, 'raw.log'), 'utf8'));
    write('completion.json', { ...identity, phases, quiescent: state.quiescent, status: terminal.status, error: error?.message ?? null });
    if (state.quiescent && !error && accepted) write('accepted.json', accepted);
    publishEvidence(state, output, process.env.GITHUB_OUTPUT);
  }
  if (error) throw error;
  console.log('STOCK_NATIVE_ACCEPTED ' + fs.readFileSync(path.join(output, 'accepted.json'), 'utf8'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });
