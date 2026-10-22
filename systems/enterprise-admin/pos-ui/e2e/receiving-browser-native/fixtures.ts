import { test as base, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { origin, receivingRequestAllowed } from './fixture.mjs';
// @ts-expect-error Reuse the existing native screenshot/geometry helpers; its legacy JavaScript surface has no declaration file.
import { capture as captureNative, controlGeometry } from '../recovery-native/evidence.mjs';
// @ts-expect-error Reuse the batch-entry installed-font file/hash/charset verifier.
import { readInstalledFontSources } from '../batch-entry-native/font-sources.mjs';

async function bounded<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([work, new Promise<T>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]);
  } finally { clearTimeout(timer!); }
}

type Credentials = { email: string; password: string; secondEmail: string; secondPassword: string; productId: string };
type Entry = { method: string; url: string; api: boolean; allowed: boolean; status?: number };
type Harness = { requests: Entry[]; unexpected: string[]; forbidden: Entry[]; saveCalls: number; viewport: number };
const headingSelector = 'main.receipt-draft-editor > h1';
const headingText = '人工收貨草稿';

async function platformFontEvidence(page: Page, target: Locator) {
  const targetText = await target.innerText();
  expect(targetText).toBe(headingText);
  const session = await page.context().newCDPSession(page);
  let primaryError: unknown;
  try {
    await session.send('DOM.enable'); await session.send('CSS.enable');
    const { root } = await session.send('DOM.getDocument');
    const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: headingSelector });
    expect(nodeId).toBeGreaterThan(0);
    const { fonts } = await session.send('CSS.getPlatformFontsForNode', { nodeId });
    const fontSources = readInstalledFontSources(fonts, targetText);
    return { platformFonts: fonts, fontSources, targetText, selector: headingSelector };
  } catch (error) { primaryError = error; throw error; }
  finally { try { await session.detach(); } catch (error) { if (!primaryError) throw error; } }
}

export const test = base.extend<{ harness: Harness }>({
  harness: [async ({ page, context }, use, info) => {
    const credentials = JSON.parse(await readFile(process.env.RECEIVING_BROWSER_CREDENTIAL_FILE!, 'utf8')) as Credentials;
    const state: Harness = { requests: [], unexpected: [], forbidden: [], saveCalls: 0, viewport: page.viewportSize()!.width };
    context.on('request', request => {
      const url = new URL(request.url());
      const api = url.pathname.startsWith('/api/');
      const fontStub = url.hostname === 'fonts.googleapis.com' && request.method() === 'GET' && request.resourceType() === 'stylesheet';
      const allowed = fontStub || (api ? receivingRequestAllowed(request.method(), request.url())
        : url.origin === origin && request.method() === 'GET');
      const entry = { method: request.method(), url: request.url(), api, allowed, fontStub };
      state.requests.push(entry);
      if (!allowed) { state.forbidden.push(entry); state.unexpected.push(`${entry.method} ${url.origin}${url.pathname}`); }
      if (request.method() === 'PUT' && url.pathname.startsWith('/api/v1/admin/receiving-drafts/')) state.saveCalls++;
    });
    context.on('response', response => {
      const entry = [...state.requests].reverse().find(row => row.url === response.url() && row.status === undefined);
      if (entry) entry.status = response.status();
    });
    let activeRoutes = 0;
    await context.route('**/*', async route => {
      activeRoutes++;
      try {
        const url = new URL(route.request().url());
        if (url.hostname === 'fonts.googleapis.com' && route.request().method() === 'GET' && route.request().resourceType() === 'stylesheet') {
          await route.fulfill({ status: 200, contentType: 'text/css', body: '' }); return;
        }
        if (url.origin !== origin) { await route.abort(); return; }
        if (url.pathname.startsWith('/api/')) {
          if (!receivingRequestAllowed(route.request().method(), route.request().url())) { await route.abort(); return; }
          await route.fallback(); return;
        }
        await route.fallback();
      } finally { activeRoutes--; }
    });
    await page.addInitScript(() => localStorage.setItem('admin-ui-theme', 'light'));
    let primaryError: unknown, cleanupError: unknown;
    try { await use(state); } catch (error) { primaryError = error; }
    try {
      await bounded(context.close(), 10_000, 'Browser context close timed out');
      const deadline = Date.now() + 5_000;
      while (activeRoutes !== 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      if (activeRoutes !== 0) throw new Error(`Browser context closed with ${activeRoutes} in-flight route handlers`);
      expect(state.unexpected, 'Browser network is limited to this built app and receiving API allowlist').toEqual([]);
      const ledgerPath = info.outputPath('receiving-browser-ledger.json');
      await writeFile(ledgerPath, JSON.stringify({ requests: state.requests, unexpected: state.unexpected, forbidden: state.forbidden,
        viewport: state.viewport, title: info.title, titlePath: info.titlePath, retry: info.retry, saveCalls: state.saveCalls }), { flag: 'wx' });
      await info.attach('receiving-browser-ledger.json', { path: ledgerPath, contentType: 'application/json' });
    } catch (error) { cleanupError = error; }
    if (primaryError) throw primaryError;
    if (cleanupError) throw cleanupError;
  }, { auto: true }],
});

export async function browserFixture(): Promise<Credentials> {
  return JSON.parse(await readFile(process.env.RECEIVING_BROWSER_CREDENTIAL_FILE!, 'utf8')) as Credentials;
}

export async function login(page: Page, actor: 'primary' | 'secondary' = 'primary') {
  const credentials = await browserFixture();
  await page.goto(`${origin}/receiving`);
  if (await page.locator('#login-email').isVisible().catch(() => false)) {
    await page.locator('#login-email').fill(actor === 'primary' ? credentials.email : credentials.secondEmail);
    await page.locator('#login-password').fill(actor === 'primary' ? credentials.password : credentials.secondPassword);
    await page.locator('#login-submit').click();
  }
  await expect(page.getByRole('button', { name: '新增私人草稿', exact: true })).toBeVisible();
}

export async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  const heading = page.locator(headingSelector);
  await expect(heading).toHaveText(headingText);
  const fontEvidence = await platformFontEvidence(page, heading);
  const focusSelector = await page.evaluate(() => document.activeElement?.tagName === 'BODY' ? 'body' : ':focus');
  const focusGeometry = await controlGeometry(page.locator(focusSelector));
  const directory = dirname(info.outputPath(`${name}.png`));
  await captureNative(page, directory, name, { subject: 'receiving-draft', ...fontEvidence, focusGeometry, actualApi: true });
  await info.attach(`${name}.png`, { path: join(directory, `${name}.png`), contentType: 'image/png' });
  await info.attach(`${name}.json`, { path: join(directory, `${name}.json`), contentType: 'application/json' });
}

export { expect };
