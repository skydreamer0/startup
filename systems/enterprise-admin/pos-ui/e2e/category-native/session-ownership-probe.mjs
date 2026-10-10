// Successor to A15: public raw CDP only, fresh blank tabs, no application or DB.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { processOwner } from '../ui-evidence/owned-process.mjs';
import { createRunScope, cleanupRunProcesses } from './owned-run.mjs';

const script = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(script), '../../../../..');
const parent = '1fd906b1c383e7f800e10e9c26da5432232d5c78';
const branch = 'refs/heads/chore/pos-category-visibility-probe-20261010';
const expectedChrome = /^Google Chrome 154\.0\.8037\.97\b/;
class ObservationMismatch extends Error {}
export function checkObservation(sample, expectedA, expectedB) {
  if (sample.A.url !== 'about:blank' || sample.B.url !== 'about:blank') throw new Error('Unexpected navigation');
  if (sample.A.visibilityState !== expectedA || sample.B.visibilityState !== expectedB)
    throw new ObservationMismatch(`${sample.phase}: expected ${expectedA}/${expectedB}, observed ${sample.A.visibilityState}/${sample.B.visibilityState}`);
  if (!sample.A.hasFocus && (sample.phase.includes('A-front') || sample.phase.includes('A-return'))) throw new ObservationMismatch('A is not the focused native page');
  if (!sample.B.hasFocus && sample.phase.includes('B-front')) throw new ObservationMismatch('B is not the focused native page');
}
export function observationMatches(sample, expectedA, expectedB) {
  try { checkObservation(sample, expectedA, expectedB); return true; }
  catch (error) { if (error instanceof ObservationMismatch) return false; throw error; }
}
export function checkArguments(args, profile) {
  assert.ok(Array.isArray(args));
  for (const arg of args) assert.doesNotMatch(arg, /^--(?:no-sandbox|disable.*sandbox|disable-web-security|ignore-certificate-errors)(?:=|$)/);
  assert.ok(args.includes(`--user-data-dir=${profile}`));
  assert.ok(args.includes('--remote-debugging-address=127.0.0.1'));
  assert.ok(args.includes('--remote-debugging-port=0'));
}
export function trustedTransition(events, state, after = 0) {
  return events.slice(after).some(event => event.trusted === true && event.visibilityState === state);
}
export function passed(result, cleanup) {
  return result.runHealth === 'completed' && result.verdict === 'session-ownership-supported' && cleanup.quiescent === true;
}
async function connect(endpoint) {
  const url = new URL(endpoint);
  assert.equal(url.protocol, 'ws:'); assert.equal(url.hostname, '127.0.0.1');
  assert.match(url.pathname, /^\/devtools\/browser\/[a-zA-Z0-9-]+$/);
  const socket = new WebSocket(endpoint), pending = new Map(); let nextId = 1;
  const rejectAll = error => { for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error); } pending.clear(); };
  await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data));
    const entry = pending.get(message.id); if (!entry) return;
    clearTimeout(entry.timer); pending.delete(message.id);
    if (message.error) entry.reject(new Error(JSON.stringify(message.error))); else entry.resolve(message.result);
  });
  socket.addEventListener('close', () => rejectAll(new Error('Owned CDP connection closed')));
  socket.addEventListener('error', () => rejectAll(new Error('Owned CDP transport error')));
  return {
    async send(method, params = {}, sessionId) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP command timed out: ${method}`)); }, 5000);
        pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    close() { rejectAll(new Error('Probe finished')); socket.close(); },
  };
}
const observer = `(() => { globalThis.__ownershipEvents = []; document.addEventListener('visibilitychange', event => globalThis.__ownershipEvents.push({ utc: new Date().toISOString(), epochMs: Date.now(), performanceMs: performance.now(), eventTimeStamp: event.timeStamp, trusted: event.isTrusted, visibilityState: document.visibilityState, hasFocus: document.hasFocus() })); })()`;
const snapshot = `({url:location.href, utc:new Date().toISOString(), epochMs:Date.now(), performanceMs:performance.now(), visibilityState:document.visibilityState, hasFocus:document.hasFocus(), events:globalThis.__ownershipEvents})`;
async function worker(output) {
  const result = { kind: 'session-ownership-successor', startedAt: new Date().toISOString(), scope: 'public raw CDP on two blank tabs; Chromium session mechanism only, not prior Playwright state or product acceptance', runHealth: 'starting', verdict: 'not-evaluated', stages: [], sessions: {}, emulationCommands: [], cleanup: {} };
  const profile = path.join(output, 'owned-session-profile');
  let chrome, cdp, closed = false, s1Enabled = false;
  const save = () => fs.writeFileSync(path.join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  let stage = 'preflight';
  try {
    assert.match(process.version, /^v22\./); assert.notEqual(process.getuid(), 0, 'Chrome sandbox needs non-root runner');
    assert.ok(process.env.DISPLAY); assert.match(process.env.CATEGORY_UI_NONCE ?? '', /^[a-f0-9-]{36}$/);
    const executable = '/opt/google/chrome/chrome';
    result.chrome = execFileSync(executable, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
    assert.match(result.chrome, expectedChrome);
    fs.mkdirSync(profile, { recursive: false });
    result.arguments = ['--enable-automation', '--disable-background-networking', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'];
    checkArguments(result.arguments, profile);
    const stderr = fs.openSync(path.join(output, 'chrome-stderr.log'), 'wx');
    chrome = spawn(executable, result.arguments, { stdio: ['ignore', 'ignore', stderr] }); fs.closeSync(stderr);
    let spawnError; chrome.once('error', error => { spawnError = error; }); chrome.once('close', () => { closed = true; });
    result.pid = chrome.pid;
    const portFile = path.join(profile, 'DevToolsActivePort'), deadline = Date.now() + 10000;
    while (!fs.existsSync(portFile) && Date.now() < deadline && !closed && !spawnError) await delay(50);
    if (spawnError) throw spawnError;
    assert.ok(fs.existsSync(portFile), 'Owned Chrome CDP startup failed');
    const [port, endpoint] = fs.readFileSync(portFile, 'utf8').trim().split('\n'); assert.match(port, /^\d+$/);
    cdp = await connect(`ws://127.0.0.1:${port}${endpoint}`);
    result.browserVersion = await cdp.send('Browser.getVersion');
    assert.equal(result.browserVersion.product, 'Chrome/154.0.8037.97');
    result.actualArguments = (await cdp.send('Browser.getBrowserCommandLine')).arguments; checkArguments(result.actualArguments, profile);
    const pages = (await cdp.send('Target.getTargets')).targetInfos.filter(target => target.type === 'page');
    assert.equal(pages.length, 1); assert.equal(pages[0].url, 'about:blank');
    const A = pages[0].targetId;
    const S1 = (await cdp.send('Target.attachToTarget', { targetId: A, flatten: true })).sessionId;
    result.sessions.S1 = S1;
    async function evaluate(session, expression) {
      const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true }, session);
      assert.equal(response.exceptionDetails, undefined); return response.result.value;
    }
    await evaluate(S1, observer);
    const B = (await cdp.send('Target.createTarget', { url: 'about:blank', newWindow: false, background: true })).targetId;
    const SB = (await cdp.send('Target.attachToTarget', { targetId: B, flatten: true })).sessionId;
    result.sessions.B = SB; await evaluate(SB, observer);
    result.targets = { A, B, AWindow: await cdp.send('Browser.getWindowForTarget', { targetId: A }), BWindow: await cdp.send('Browser.getWindowForTarget', { targetId: B }) };
    assert.equal(result.targets.AWindow.windowId, result.targets.BWindow.windowId, 'Both tabs must share one native window');
    const allPages = (await cdp.send('Target.getTargets')).targetInfos.filter(target => target.type === 'page'); assert.equal(allPages.length, 2);
    result.targetInfos = allPages;
    async function sample(phase) { return { phase, A: await evaluate(S1, snapshot), B: await evaluate(SB, snapshot) }; }
    async function waitFor(phase, a, b) {
      const deadline = Date.now() + 3000; let value;
      do {
        value = await sample(phase); result.stages.push(value); save();
        if (observationMatches(value, a, b)) break;
        await delay(50);
      } while (Date.now() < deadline);
      checkObservation(value, a, b); return value;
    }
    // Pinned Chromium154 Page.bringToFront activates AND focuses the native
    // WebContents; Target.activateTarget alone does not explicitly focus it.
    stage = 'baseline'; result.control = { rawCdpOnly: true, priorFocusEmulationCommands: result.emulationCommands.length }; assert.equal(result.control.priorFocusEmulationCommands, 0);
    await cdp.send('Page.bringToFront', {}, S1); const initial = await waitFor('baseline-A-front', 'visible', 'hidden');
    const startEvents = initial.A.events.length;
    await cdp.send('Page.bringToFront', {}, SB); await waitFor('baseline-B-front', 'hidden', 'visible');
    await cdp.send('Page.bringToFront', {}, S1); const baseline = await waitFor('baseline-A-return', 'visible', 'hidden');
    if (!trustedTransition(baseline.A.events, 'hidden', startEvents) || !trustedTransition(baseline.A.events, 'visible', startEvents)) throw new ObservationMismatch('Baseline lacks native trusted hidden/visible events');
    result.baseline = 'passed';
    stage = 'S1-enable'; result.emulationCommands.push({ session: 'S1', enabled: true, utc: new Date().toISOString() }); save(); await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }, S1); s1Enabled = true;
    await cdp.send('Page.bringToFront', {}, SB); await waitFor('S1-true-B-front', 'visible', 'visible');
    const S2 = (await cdp.send('Target.attachToTarget', { targetId: A, flatten: true })).sessionId;
    result.sessions.S2 = S2; assert.notEqual(S1, S2);
    stage = 'S2-disable'; result.emulationCommands.push({ session: 'S2', enabled: false, utc: new Date().toISOString() }); save(); await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }, S2);
    // Observe the unchanged native state over a short real interval, not a fake clock.
    const stableUntil = Date.now() + 500;
    do { const value = await sample('S2-false-B-front'); result.stages.push(value); save(); checkObservation(value, 'visible', 'visible'); await delay(50); } while (Date.now() < stableUntil);
    const second = await waitFor('S2-false-B-front', 'visible', 'visible');
    stage = 'S1-disable'; result.emulationCommands.push({ session: 'S1', enabled: false, utc: new Date().toISOString() }); save(); await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }, S1); s1Enabled = false;
    const released = await waitFor('S1-false-B-front', 'hidden', 'visible');
    if (!trustedTransition(released.A.events, 'hidden', second.A.events.length)) throw new ObservationMismatch('S1 release lacks native trusted hidden event');
    stage = 'return-A'; await cdp.send('Page.bringToFront', {}, S1);
    const final = await waitFor('final-A-front', 'visible', 'hidden');
    if (!trustedTransition(final.A.events, 'visible', released.A.events.length)) throw new ObservationMismatch('Final return lacks native trusted visible event');
    result.runHealth = 'completed'; result.verdict = 'session-ownership-supported';
  } catch (error) {
    result.failedStage = stage; result.error = String(error.stack ?? error);
    result.runHealth = error instanceof ObservationMismatch ? 'completed' : 'error';
    result.verdict = stage === 'baseline' ? 'baseline-failed' : error instanceof ObservationMismatch ? 'session-ownership-not-supported' : 'inconclusive';
  } finally {
    if (cdp) {
      if (s1Enabled) try { await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false }, result.sessions.S1); result.cleanup.s1Released = true; } catch (error) { result.cleanup.releaseError = String(error); }
      for (const sessionId of Object.values(result.sessions)) try { await cdp.send('Target.detachFromTarget', { sessionId }); } catch (error) { result.cleanup.detachError = String(error); }
      try { await cdp.send('Browser.close'); } catch (error) { result.cleanup.closeProtocolNote = String(error); }
      cdp.close();
    }
    const deadline = Date.now() + 3000; while (chrome && !closed && Date.now() < deadline) await delay(50);
    result.cleanup.chromeClosedBeforeCoordinator = closed;
    // Exact process group and nonce/PID-start-time cleanup belongs to the coordinator.
    if (chrome && !closed) chrome.unref();
    result.finishedAt = new Date().toISOString(); save();
  }
  if (result.verdict !== 'session-ownership-supported' || !closed) process.exitCode = 1;
}
async function coordinator() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true'); assert.equal(process.env.RUNNER_ENVIRONMENT, 'github-hosted');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'push'); assert.equal(process.env.GITHUB_REF, branch);
  assert.match(process.version, /^v22\./); assert.equal(process.env.DISPLAY, undefined); assert.equal(process.env.CATEGORY_UI_NONCE, undefined);
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', timeout: 10000 }).trim();
  const head = git('rev-parse', 'HEAD'); assert.equal(head, process.env.GITHUB_SHA); assert.equal(git('rev-parse', 'HEAD^'), parent);
  assert.equal(git('status', '--porcelain'), ''); assert.equal(git('ls-files', '-v').split('\n').some(line => /^[a-zS]/.test(line)), false);
  const output = path.join(process.env.RUNNER_TEMP, `category-session-ownership-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
  fs.mkdirSync(output, { recursive: false });
  const write = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  const nonce = randomUUID(), scope = await createRunScope(nonce), owner = processOwner();
  const files = [path.relative(root, script), path.relative(root, script.replace('.mjs', '.test.mjs')), '.github/workflows/category-visibility-probe.yml', 'systems/enterprise-admin/pos-ui/e2e/category-native/owned-run.mjs', 'systems/enterprise-admin/pos-ui/e2e/ui-evidence/owned-process.mjs'];
  write('source.json', { kind: 'session-ownership-successor', head, tree: git('rev-parse', 'HEAD^{tree}'), parent, originalSubject: '78c802ee7e2a01dc869bc757e6448bab1d32b99a', nonce, runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, node: process.version, hashes: Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')])) });
  const env = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'RUNNER_TEMP', 'CI'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]])); env.CATEGORY_UI_NONCE = nonce;
  const log = fs.openSync(path.join(output, 'raw.log'), 'wx'); let phase, error, cleanup, result;
  try {
    const preflight = { status: 'checking', node: process.version, uid: process.getuid() };
    try {
      assert.notEqual(process.getuid(), 0);
      preflight.chrome = execFileSync('/opt/google/chrome/chrome', ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
      assert.match(preflight.chrome, expectedChrome);
      preflight.tools = execFileSync('sh', ['-c', 'command -v xvfb-run && command -v Xvfb && command -v xauth && command -v timeout'], { encoding: 'utf8', timeout: 5000 }).trim().split('\n');
      preflight.status = 'passed';
    } catch (problem) { preflight.status = 'blocked'; preflight.error = String(problem.stack ?? problem); throw problem; }
    finally { write('preflight.json', preflight); }
    phase = await owner.run('timeout', ['--signal=TERM', '--kill-after=5s', '60s', 'xvfb-run', '--auto-servernum', '--server-args=-screen 0 1366x900x24 -nolisten tcp', process.execPath, script, '--worker', output], { cwd: root, env, stdio: ['ignore', log, log] });
    assert.equal(phase.exitCode, 0); assert.equal(phase.error, null); assert.equal(phase.signal, null); assert.equal(owner.cancelled, null);
    assert.equal(git('status', '--porcelain'), ''); assert.equal(git('rev-parse', 'HEAD'), head);
  } catch (problem) { error = String(problem.stack ?? problem); }
  finally {
    try {
      cleanup = await cleanupRunProcesses(scope); write('cleanup.json', cleanup);
      assert.equal(cleanup.quiescent, true, 'No evidence publication until owned processes are quiescent');
      const profile = path.join(output, 'owned-session-profile'); fs.rmSync(profile, { recursive: true, force: true });
      if (fs.existsSync(path.join(output, 'result.json'))) result = JSON.parse(fs.readFileSync(path.join(output, 'result.json'), 'utf8'));
      const success = !error && !owner.cancelled && result && passed(result, cleanup);
      write('completion.json', { status: success ? 'passed' : 'failed', phase, error: error ?? null, cancelled: owner.cancelled, runHealth: result?.runHealth ?? 'missing-result', verdict: result?.verdict ?? 'inconclusive', quiescent: cleanup.quiescent, ownedProfileRemoved: !fs.existsSync(profile), acceptance: 'No product, API, database or prior Playwright session acceptance' });
      assert.ok(path.isAbsolute(output)); assert.equal(/[\r\n]/.test(output), false); fs.appendFileSync(process.env.GITHUB_OUTPUT, `evidence_dir=${output}\n`);
      if (!success) process.exitCode = 1;
    } finally { owner.dispose(); fs.closeSync(log); }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === script) {
  if (process.argv[2] === '--worker') await worker(process.argv[3]); else await coordinator();
}
