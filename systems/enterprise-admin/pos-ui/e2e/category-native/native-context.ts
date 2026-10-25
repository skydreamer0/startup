import { access, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect, type BrowserContext } from '@playwright/test';
import { recordNativeLifecycle, validateNativeLifecycleReceipt } from './native-context.lifecycle.mjs';

// A second CDP session cannot release the capturer held by Playwright's first
// session. Connect without creating that override in the first place. launchServer
// owns Chrome's temporary profile/process and retains Playwright's sandboxed args.
async function readProcessStartTime(pid: number | undefined) {
  if (!pid) return null;
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19] ?? null;
  } catch { return null; }
}

export async function withNativeContext(
  use: (context: BrowserContext, close: () => Promise<void>) => Promise<void>,
  lifecycle?: { identity: { runNonce: string; testNonce: string; test: string }; onReceipt: (receipt: unknown) => void },
) {
  const identity = lifecycle?.identity ?? {
    runNonce: process.env.CATEGORY_UI_NONCE ?? '', testNonce: randomUUID(), test: 'native-focus-preflight',
  };
  const server = await chromium.launchServer({ channel: 'chrome', headless: false,
    chromiumSandbox: true, args: ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'] });
  const child = server.process();
  const profileArg = child.spawnargs.find(arg => arg.startsWith('--user-data-dir='));
  const profilePath = profileArg?.slice('--user-data-dir='.length) ?? null;
  const activePort = profilePath ? join(profilePath, 'DevToolsActivePort') : null;
  let endpoint = '';
  let browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> | null = null;
  const exited = new Promise<{ exitCode: number | null; signal: string | null }>(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) resolve({ exitCode: child.exitCode, signal: child.signalCode });
    else child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }));
  });
  const closed = new Promise<boolean>(resolve => child.once('close', () => resolve(true)));
  const lifecycleResult = await recordNativeLifecycle({
    identity: { ...identity, pid: child.pid, uid: process.getuid?.() ?? null, startTime: await readProcessStartTime(child.pid) },
    profilePath,
    use: async (close: () => Promise<void>) => {
      if (!activePort) throw new Error('Owned Chrome did not expose its temporary profile argument');
      await expect.poll(async () => {
        try {
          // Chrome creates this file before both lines are necessarily written.
          // Keep polling within the existing deadline; never connect to a partial
          // or malformed endpoint, or leave the owned temporary profile.
          const lines = (await readFile(activePort, 'utf8')).trim().split(/\r?\n/);
          const [port, path] = lines;
          if (lines.length !== 2 || !/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535
            || !/^\/devtools\/browser\/[\w-]+$/.test(path)) return false;
          endpoint = `ws://127.0.0.1:${port}${path}`;
          return true;
        } catch (error) {
          if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
          throw error;
        }
      }, { timeout: 10_000 }).toBe(true);
      browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
      const contexts = browser.contexts();
      expect(contexts).toHaveLength(1);
      // Only the default context honors noDefaults. Never call newContext here.
      // Preserve serviceWorkers:'block' in this existing default context using
      // the same registration interception as Playwright's context initializer.
      await contexts[0].addInitScript(() => {
        if (self.ServiceWorkerContainer) Object.defineProperty(ServiceWorkerContainer.prototype, 'register', {
          configurable: true, writable: true,
          value: async () => { console.warn('Service Worker registration blocked by category acceptance'); },
        });
      });
      await use(contexts[0], close);
    },
    closeServer: () => server.close(),
    closeClient: async () => { if (browser) await browser.close(); },
    waitForProcessClose: async () => ({ ...(await exited), closeEvent: await closed }),
    profileExists: async () => {
      if (!profilePath) return false;
      try { await access(profilePath); return true; }
      catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false; throw error; }
    },
    onReceipt: lifecycle?.onReceipt,
  });
  if (lifecycleResult.callbackFailed) throw lifecycleResult.callbackError;
  const verified = validateNativeLifecycleReceipt(lifecycleResult.receipt, identity);
  if (!verified.ok) throw new Error(`Native browser lifecycle is not a normal close: ${verified.errors.join('; ')}`);
}

export async function assertNativeFocus(context: BrowserContext) {
  const page = await context.newPage();
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
  await page.evaluate(() => {
    const events: { state: string; trusted: boolean }[] = [];
    Object.assign(window, { __nativeFocusEvents: events });
    document.addEventListener('visibilitychange', event => events.push({ state: document.visibilityState, trusted: event.isTrusted }));
  });
  const session = await context.newCDPSession(page);
  const background = await context.newPage();
  const backgroundSession = await context.newCDPSession(background);
  try {
    const mainWindow = await session.send('Browser.getWindowForTarget');
    const otherWindow = await backgroundSession.send('Browser.getWindowForTarget');
    expect(otherWindow.windowId).toBe(mainWindow.windowId);
    await background.bringToFront();
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('hidden');
    await delay(100); // Node wall clock; no timer, focus or visibility emulation.
    await page.bringToFront();
    await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
    const events = await page.evaluate(() => Reflect.get(window, '__nativeFocusEvents') as { state: string; trusted: boolean }[]);
    expect(events).toEqual([{ state: 'hidden', trusted: true }, { state: 'visible', trusted: true }]);
    return { noDefaults: true, sameWindow: true, events };
  } finally {
    await backgroundSession.detach(); await session.detach(); await background.close();
  }
}
