import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect, type BrowserContext } from '@playwright/test';

// A second CDP session cannot release the capturer held by Playwright's first
// session. Connect without creating that override in the first place. launchServer
// owns Chrome's temporary profile/process and retains Playwright's sandboxed args.
export async function withNativeContext(use: (context: BrowserContext, close: () => Promise<void>) => Promise<void>) {
  const server = await chromium.launchServer({ channel: 'chrome', headless: false,
    chromiumSandbox: true, args: ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'] });
  let closing: Promise<void> | undefined;
  const close = () => closing ??= server.close();
  try {
    const profileArg = server.process().spawnargs.find(arg => arg.startsWith('--user-data-dir='));
    if (!profileArg) throw new Error('Owned Chrome did not expose its temporary profile argument');
    const activePort = join(profileArg.slice('--user-data-dir='.length), 'DevToolsActivePort');
    let endpoint = '';
    await expect.poll(async () => {
      try {
        const [port, path] = (await readFile(activePort, 'utf8')).trim().split('\n');
        if (!/^\d+$/.test(port) || !/^\/devtools\/browser\/[\w-]+$/.test(path)) throw new Error('Invalid owned CDP endpoint');
        endpoint = `ws://127.0.0.1:${port}${path}`;
        return true;
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
        throw error;
      }
    }, { timeout: 10_000 }).toBe(true);
    const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
    try {
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
    } finally {
      try { await close(); } finally { await browser.close(); }
    }
  } finally { await close(); }
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
