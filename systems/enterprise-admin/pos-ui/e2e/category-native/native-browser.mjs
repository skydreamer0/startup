import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createRunScope, cleanupRunProcesses } from './owned-run.mjs';

// Public Playwright 1.63 ConnectOverCDPOptions.noDefaults applies only to this
// existing default context. Each case gets its own external Chrome/profile.
// Preserve the already-owned xvfb-run authentication path, never its contents.
export function browserEnvironment(env) {
  return Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'DISPLAY', 'XAUTHORITY', 'CATEGORY_UI_NONCE', 'CATEGORY_BROWSER_CASE_NONCE'].filter(key => env[key] !== undefined).map(key => [key, env[key]]));
}
export function browserArguments(profile) {
  return ['--enable-automation', '--disable-background-networking', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'];
}
export function assertBrowserArguments(args, profile) {
  for (const arg of args) assert.doesNotMatch(arg, /^--(?:no-sandbox|disable.*sandbox|disable-web-security|ignore-certificate-errors)(?:=|$)/);
  for (const flag of [`--user-data-dir=${profile}`, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0']) assert.ok(args.includes(flag));
}
export function endpointFromPortFile(text) {
  const [port, endpoint] = text.trim().split('\n');
  assert.match(port, /^\d+$/); assert.ok(Number(port) > 0 && Number(port) <= 65535);
  assert.match(endpoint, /^\/devtools\/browser\/[a-zA-Z0-9-]+$/);
  return `ws://127.0.0.1:${port}${endpoint}`;
}
// Context.close may disconnect connectOverCDP without stopping externally
// launched Chrome. The separate public CDP connection owns only this endpoint.
async function closeChrome(endpoint) {
  const socket = new WebSocket(endpoint);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('Owned Chrome close timed out')); }, 3000);
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Browser.close' })), { once: true });
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.id !== 1) return;
      clearTimeout(timer); socket.close();
      if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(undefined);
    });
    socket.addEventListener('close', () => { clearTimeout(timer); resolve(undefined); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); socket.close(); reject(new Error('Owned Chrome close connection failed')); }, { once: true });
  });
}
export function assertNativeReceipt(receipt) {
  assert.equal(typeof receipt.test, 'string'); assert.ok(receipt.test.length > 0);
  assert.equal(receipt.mode, 'noDefaults-existing-default-context');
  assert.match(receipt.chrome, /^Google Chrome 154\.0\.8037\.97\b/);
  assert.equal(receipt.browserVersion, '154.0.8037.97');
  assert.equal(receipt.defaultContext, true); assert.equal(receipt.initialBlankPages, 1);
  assertBrowserArguments(receipt.actualArguments, receipt.profile);
  assert.match(receipt.caseNonce, /^[a-f0-9-]{36}$/);
  assert.equal(receipt.caseCleanup?.quiescent, true); assert.equal(receipt.caseCleanup?.signalCount, 0);
  assert.equal(receipt.caseCleanup?.caseNonce, receipt.caseNonce); assert.equal(receipt.caseCleanup?.nonce, receipt.nonce);
  assert.deepEqual(receipt.caseCleanup?.signals, []);
  assert.equal(receipt.quiescent, true); assert.equal(receipt.profileRemoved, true);
  assert.equal(receipt.forcedShutdown, false, 'A forced shutdown is safe cleanup, not passing acceptance');
  assert.deepEqual(receipt.serviceWorkers, []);
  assert.equal(receipt.phase?.exitCode, 0); assert.equal(receipt.phase?.signal, null); assert.equal(receipt.phase?.error, null);
}
export async function openNativeCase(chromium, output, env, title) {
  assert.equal(process.platform, 'linux'); assert.notEqual(process.getuid(), 0);
  assert.ok(env.DISPLAY); assert.match(env.CATEGORY_UI_NONCE ?? '', /^[a-f0-9-]{36}$/);
  assert.ok(path.isAbsolute(env.CATEGORY_UI_OUTPUT)); assert.ok(path.resolve(output).startsWith(path.resolve(env.CATEGORY_UI_OUTPUT) + path.sep));
  const executable = '/opt/google/chrome/chrome';
  const chrome = execFileSync(executable, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim(); assert.match(chrome, /^Google Chrome 154\.0\.8037\.97\b/);
  const profiles = path.join(env.CATEGORY_UI_OUTPUT, '.owned-chrome-profiles'); fs.mkdirSync(profiles, { recursive: true });
  const profile = fs.mkdtempSync(path.join(profiles, 'case-')); fs.mkdirSync(output, { recursive: true });
  const caseNonce = randomUUID();
  const scope = await createRunScope(env.CATEGORY_UI_NONCE, caseNonce);
  const receipt = { test: title, caseNonce, caseCleanup: null, mode: 'noDefaults-existing-default-context', nonce: env.CATEGORY_UI_NONCE, chrome, profile, defaultContext: false, initialBlankPages: 0, browserVersion: '', actualArguments: [], serviceWorkers: [], quiescent: false, profileRemoved: false, forcedShutdown: false, phase: null };
  const log = fs.openSync(path.join(output, 'chrome.log'), 'wx');
  let browser, context, endpoint, finished = false, cleanupDone = false;
  const phase = { exitCode: null, signal: null, error: null };
  const child = spawn(executable, browserArguments(profile), { env: browserEnvironment({ ...env, CATEGORY_BROWSER_CASE_NONCE: caseNonce }), stdio: ['ignore', log, log] });
  child.once('error', error => { phase.error = error.message; });
  child.once('close', (exitCode, signal) => { phase.exitCode = exitCode; phase.signal = signal; finished = true; });
  const close = async () => {
    if (cleanupDone) return;
    try {
      if (!finished && endpoint) try { await closeChrome(endpoint); } catch { /* bounded owned-process fallback below */ }
      const deadline = Date.now() + 3000; while (!finished && Date.now() < deadline) await delay(50);
      // Exact dual-nonce/PID-start-time ownership covers descendants even if
      // Chrome detached them from the original process group. This bounded
      // cleanup escalates TERM to KILL and cannot match sibling case processes.
      receipt.caseCleanup = await cleanupRunProcesses(scope);
      receipt.forcedShutdown = receipt.caseCleanup.signalCount > 0;
      receipt.quiescent = receipt.caseCleanup.quiescent === true;
      const closeDeadline = Date.now() + 1000; while (!finished && Date.now() < closeDeadline) await delay(25);
      receipt.phase = phase;
      assert.equal(finished, true, 'Owned Chrome close event missing after bounded cleanup');
      if (browser?.isConnected()) await browser.close();
      if (receipt.quiescent) { fs.rmSync(profile, { recursive: true, force: true }); receipt.profileRemoved = !fs.existsSync(profile); }
    } finally {
      cleanupDone = true; fs.closeSync(log);
      fs.writeFileSync(path.join(output, 'native-browser.json'), JSON.stringify({ ...receipt, phase }, null, 2) + '\n');
    }
    assertNativeReceipt(receipt);
  };
  try {
    const portFile = path.join(profile, 'DevToolsActivePort'), deadline = Date.now() + 10000;
    while (!fs.existsSync(portFile) && !finished && Date.now() < deadline) await delay(50);
    assert.ok(fs.existsSync(portFile), 'Owned Chrome did not expose loopback CDP'); endpoint = endpointFromPortFile(fs.readFileSync(portFile, 'utf8'));
    browser = await chromium.connectOverCDP(endpoint, { noDefaults: true, timeout: 10000 });
    receipt.browserVersion = browser.version();
    assert.equal(browser.contexts().length, 1); context = browser.contexts()[0]; receipt.defaultContext = true;
    receipt.initialBlankPages = context.pages().length; assert.equal(receipt.initialBlankPages, 1); assert.equal(context.pages()[0].url(), 'about:blank');
    const session = await browser.newBrowserCDPSession();
    try { receipt.actualArguments = (await session.send('Browser.getBrowserCommandLine')).arguments; assertBrowserArguments(receipt.actualArguments, profile); }
    finally { await session.detach(); }
    assert.deepEqual(context.serviceWorkers(), []);
    context.on('serviceworker', worker => { receipt.serviceWorkers.push(worker.url()); });
    // Same registration-blocking behavior as pinned Playwright1.63
    // browserContext.ts initialize(), via public API before application navigation.
    await context.addInitScript(() => {
      if (navigator.serviceWorker) navigator.serviceWorker.register = async () => { throw new Error('Service Worker registration blocked by category acceptance'); };
    });
    await context.pages()[0].bringToFront();
    return { browser, context, receipt, close };
  } catch (error) { try { await close(); } catch { /* original setup error is primary; cleanup receipt retained */ } throw error; }
}
