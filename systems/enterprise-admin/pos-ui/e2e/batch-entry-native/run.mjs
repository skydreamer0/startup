import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { processOwner } from '../ui-evidence/owned-process.mjs';
import { createRunScope, cleanupRunProcesses } from '../category-native/owned-run.mjs';
import { assertEnvironment, assertReport, assertEvidence, cases, databaseUrl, rawTables } from './contract.mjs';
import { assertFonts, completionOutcome } from '../category-native/contract.mjs';
import { runOwnedPhase, publishEvidence } from '../category-native/run.mjs';
import { assertOwnership, assertService, databaseName } from '../../../backend/scripts/pos-product-lookup-ci.mjs';
import { assertReachable } from '../layout-native/evidence.mjs';
import { validateExactViewportPng } from '../admin-margin-warning/png.mjs';
import { assertBrandSources } from '../dialog-acceptance/brand-assets.mjs';

export function assertPriorPackage(source, report, counts, identity, hashes, readSource) {
  for (const key of ['head','tree','runId','attempt','database','node']) assert.equal(source[key], identity[key]);
  assert.deepEqual(source.service, identity.service); assert.equal(report.status, 'passed'); assert.equal(report.failure, null); assert.equal(report.cleanup.quiescent, true);
  assert.deepEqual(Object.keys(counts).sort(), rawTables); Object.values(counts).forEach(value => assert.equal(value, 0));
  assert.ok(Object.keys(hashes).some(file => file.startsWith('systems/enterprise-admin/admin-ui/src/')));
  for (const [file, hash] of Object.entries(hashes)) { assert.ok(!file.startsWith('/') && !file.split('/').includes('..')); assert.equal(createHash('sha256').update(readSource(file)).digest('hex'), hash); }
  return { head: source.head, tree: source.tree, runId: source.runId, attempt: source.attempt, sourceFiles: Object.keys(hashes).length, sameJobBuiltAdmin: true };
}
export function inspectEvidence(output, nonce) {
  const read = name => JSON.parse(fs.readFileSync(path.join(output,name),'utf8'));
  const reportCases = assertReport(read('report.json'));
  const files = fs.readdirSync(path.join(output,'tests'), {recursive:true});
  const ledgers = files.filter(file=>file.endsWith('/network.json')).map(file=>read(path.join('tests',file)));
  ledgers.forEach(row=>assert.equal(row.nonce,nonce));
  const databaseProof = assertEvidence(read('database-receipt.json'), ledgers, read('api-ledger.json'));
  const captures = files.filter(file=>file.endsWith('.png')).map(file=>{
    const receipt=read(path.join('tests',file.replace(/\.png$/,'.json'))), scenario=cases.find(row=>row.id===receipt.caseId);
    assert.ok(scenario); assert.equal(receipt.nonce,nonce); assert.equal(receipt.stage,path.basename(file,'.png')); assert.ok(scenario.stages.includes(receipt.stage));
    assert.deepEqual(receipt.viewport,{width:scenario.width,height:scenario.height}); assertFonts(receipt.fonts);
    const bytes=fs.readFileSync(path.join(output,'tests',file)), png=validateExactViewportPng(bytes,receipt.viewport);
    assert.equal(receipt.sha256,createHash('sha256').update(bytes).digest('hex'));
    return {file,...receipt,...png};
  });
  for(const scenario of cases)assert.deepEqual(captures.filter(row=>row.caseId===scenario.id).map(row=>row.stage).sort(),[...scenario.stages].sort());
  const geometry=files.filter(file=>file.endsWith('/batch-geometry.json')).map(file=>{
    const receipt=read(path.join('tests',file)),scenario=cases.find(row=>row.id===receipt.caseId);assert.ok(scenario);assert.equal(receipt.nonce,nonce);
    assert.deepEqual(receipt.viewport,{width:scenario.width,height:scenario.height});
    const names = scenario.kind==='full' ? ['entry-initial','product-loading','cancel-selected','entry-http500-loading','retry-http500','product-read-error','cancel-read-recovered','entry-malformed-loading','retry-malformed','product-shape-error','cancel-shape-recovered'] : scenario.kind==='cold' ? ['entry-initial','product-loading','cancel-selected'] : scenario.kind==='empty' ? ['entry-initial','cancel-empty'] : [];
    assert.deepEqual(receipt.controls.map(row=>row.name),names);
    for(const row of receipt.controls){assert.ok(row.samples.length>=2);row.samples.slice(-2).forEach(value=>{assertReachable(value);assert.equal(value.viewportWidth,scenario.width);assert.equal(value.viewportHeight,scenario.height);});assert.deepEqual(row.samples.at(-1),row.samples.at(-2));assert.deepEqual(row.final,row.samples.at(-1));}
    return {file,...receipt};
  });
  assert.deepEqual(geometry.map(row=>row.caseId).sort(),cases.map(row=>row.id).sort());
  return {reportCases,databaseProof,captures,geometry};
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
    for (const directory of ['backend', 'pos-ui', 'admin-ui']) {
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
  const packageOutput=path.join(process.env.RUNNER_TEMP, `package-native-${identity.runId}-${identity.attempt}`);
  const packageRead=name=>JSON.parse(fs.readFileSync(path.join(packageOutput,name),'utf8'));
  const priorPackage=assertPriorPackage(packageRead('source.json'),packageRead('report.json'),packageRead('after-counts.json'),identity,packageRead('source-hashes.json'),file=>fs.readFileSync(path.join(root,file)));
  const chrome = execFileSync('google-chrome', ['--version'], { encoding: 'utf8', timeout: 10000 }).trim(); assert.match(chrome, /^Google Chrome /);
  const output = path.join(process.env.RUNNER_TEMP, `batch-entry-native-${identity.runId}-${identity.attempt}`);
  fs.mkdirSync(output, { recursive: false });
  const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const read = name => JSON.parse(fs.readFileSync(path.join(output, name), 'utf8'));
  const nonce = randomUUID();
  write('source.json', { ...identity, nonce, chrome, sandbox: true, priorPackage, scope: 'Issue31 existing Admin batch form: paginated read, fault recovery, roles and cancel; read-only synthetic fixture',
    login: 'Fixture-issued short-lived synthetic JWT for owned active actors; login UI not under test', externalCss: 'blocked; installed Noto CJK',
    brandAssets: assertBrandSources(app) });
  const inputs = ['systems/enterprise-admin/admin-ui', 'systems/enterprise-admin/pos-ui', 'systems/enterprise-admin/backend', 'systems/enterprise-admin/packages',
    'systems/enterprise-admin/package.json', 'systems/enterprise-admin/pnpm-lock.yaml', 'systems/enterprise-admin/pnpm-workspace.yaml', '.github/workflows/ci.yml'];
  const sourceFiles = git('ls-files', '-z', '--', ...inputs).split('\0').filter(Boolean);
  write('source-hashes.json', Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])));
  const dist=path.resolve(app,'../admin-ui/dist');
  const distFiles=fs.readdirSync(dist,{recursive:true}).filter(file=>fs.statSync(path.join(dist,file)).isFile()); assert.ok(distFiles.includes('index.html'));
  write('served-dist-hashes.json',Object.fromEntries(distFiles.map(file=>[file,createHash('sha256').update(fs.readFileSync(path.join(dist,file))).digest('hex')])));
  // Captured before ANY child gets this nonce. Baseline environment contents are never read.
  const scope = await createRunScope(nonce);
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'RUNNER_TEMP', 'CI'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]]));
  for (const key of ['GITHUB_ACTIONS', 'RUNNER_ENVIRONMENT', 'GITHUB_RUN_ID', 'GITHUB_RUN_ATTEMPT', 'SKU_QA_HEAD', 'SKU_QA_CONTAINER', 'SKU_QA_NETWORK']) env[key] = process.env[key];
  Object.assign(env, { BATCH_ENTRY_UI_OUTPUT: output, CATEGORY_UI_NONCE: nonce, CATEGORY_QA_DATABASE_URL: databaseUrl, BATCH_ENTRY_QA_DATABASE_URL: databaseUrl,
    DATABASE_URL: databaseUrl, POS_PRODUCT_LOOKUP_DATABASE_URL: databaseUrl, NODE_ENV: 'test', BROWSER: 'none',
    CORS_ORIGIN: 'http://127.0.0.1:4290', JWT_ACCESS_SECRET: 'stock-ci-synthetic-access-key-not-for-real-accounts',
    JWT_REFRESH_SECRET: 'stock-ci-synthetic-refresh-key-not-for-real-accounts' });
  const owner = processOwner(), state = { quiescent: true }, phases = {};
  const log = fs.openSync(path.join(output, 'raw.log'), 'wx');
  let error = null, accepted = null;
  try {
    const commands = [
      ['browser-types', app, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.batch-entry-native.json']],
      ['fixture-types', backend, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.batch-entry-native.json']],
      ['collection', app, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'e2e/batch-entry-native.config.mts', '--list', '--reporter=list']],
      ['real-api-browser', backend, ['node_modules/tsx/dist/cli.mjs', 'scripts/admin-batch-entry-browser-fixture.ts']],
    ];
    for (const [name, cwd, args] of commands) {
      phases[name] = await runOwnedPhase(owner, process.execPath, args, { cwd, env: name === 'build' ? { ...env, NODE_ENV: 'production' } : env, stdio: ['ignore', log, log] }, state, () => cleanupRunProcesses(scope));
      assert.equal(phases[name].exitCode, 0, `${name} must pass`); assert.equal(phases[name].signal, null); assert.equal(phases[name].error, null); assert.equal(owner.cancelled, null);
    }
    assertSource();
    const {reportCases,databaseProof,captures,geometry} = inspectEvidence(output,nonce);
    write('geometry-receipts.json', geometry);
    write('captures.json', captures);
    accepted = { ...identity, nonce, status: 'passed', cases: reportCases, databaseProof, captures: captures.length, geometry: geometry.length, phases,
      databaseRemoval: 'Require the subsequent unchanged SKU cleanup receipt with ownedDatabaseAbsent=true; only exact synthetic fixture rows are removed here',
      visualReview: 'Original screenshots still require independent Chinese readability, reachability and focus review',
      notRun: ['tenant selection UI or changed authentication policy', '200% browser zoom or soft keyboard', 'other Admin/POS viewports or visible focus-ring certification', 'hardware/iPad/Safari', 'paper/BLE/Windows printing', 'production DB or deployment'] };
  } catch (problem) { error = problem; }
  finally {
    try { const cleanup = await cleanupRunProcesses(scope); write('run-cleanup.json', cleanup); state.quiescent = state.quiescent && cleanup.quiescent === true; }
    catch (problem) { state.quiescent = false; error ??= problem; }
    // A cancelled fixture may not get to its finally block. Never publish a real response token; bootstrap contains only ephemeral synthetic JWTs.
    fs.rmSync(path.join(output, '.bootstrap.json'), { force: true });
    const terminal = completionOutcome(error, owner.cancelled); error = terminal.error;
    fs.closeSync(log); owner.dispose(); process.stdout.write(fs.readFileSync(path.join(output, 'raw.log'), 'utf8'));
    write('completion.json', { ...identity, phases, quiescent: state.quiescent, status: terminal.status, error: error?.message ?? null });
    if (state.quiescent && !error && accepted) write('accepted.json', accepted);
    publishEvidence(state, output, process.env.GITHUB_OUTPUT);
  }
  if (error) throw error;
  console.log('BATCH_ENTRY_NATIVE_ACCEPTED ' + fs.readFileSync(path.join(output, 'accepted.json'), 'utf8'));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error); process.exitCode = 1; });
