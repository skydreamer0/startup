import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPacer, createDispatch, createState, endEntry } from './network.mjs';
import { cases } from './contract.mjs';
import { capture, writeJson } from '../recovery-native/evidence.mjs';
const pace = createPacer();
export const test = base.extend<{ guard: ReturnType<typeof createState> }>({
  guard: [async ({ context, page }, use, info) => {
    const scenario = cases.find(row => row.title === info.title)!; expect(scenario).toBeDefined();
    const fixture = JSON.parse(readFileSync(join(process.env.STAFF_ENTRY_UI_OUTPUT!, '.bootstrap.json'), 'utf8'));
    expect(fixture.nonce).toBe(process.env.CATEGORY_UI_NONCE);
    const state = createState(fixture, scenario), active = new Set<Promise<void>>();
    context.on('requestfailed', request => { state.cancelled.add(request); state.controllers.get(request)?.abort(); });
    const observe = (observed: Page) => observed.on('pageerror', error => state.pageErrors.push(error.name));
    context.pages().forEach(observe); context.on('page', observe);
    // No token injection, no storage seeding. Only passive trusted-key observation.
    await context.addInitScript(() => {
      Object.assign(window, { __staffEntryKeys: [] });
      document.addEventListener('keydown', event => (window as unknown as { __staffEntryKeys: unknown[] }).__staffEntryKeys.push({ key: event.key, trusted: event.isTrusted }), true);
    });
    await context.routeWebSocket('**/*', socket => { state.errors.push('Unexpected WebSocket'); void socket.close(); });
    const dispatch = createDispatch(state, { pace });
    await context.route('**/*', async route => {
      const task = dispatch(route); active.add(task);
      try { await task; } catch (error) { state.errors.push(`Route failed at ${state.stage}: ${error instanceof Error ? error.name : 'UnknownError'}`); try { await route.abort(); } catch { /* closed context */ } }
      finally { active.delete(task); }
    });
    let primary: unknown = null, contextClosed = false; let keys: unknown[] = [];
    try { await use(state); }
    catch (error) { primary = error; }
    finally {
      try {
        if (!page.isClosed()) {
          keys = await page.evaluate(() => (window as unknown as { __staffEntryKeys: unknown[] }).__staffEntryKeys);
          if (primary || state.errors.length || info.status !== info.expectedStatus) await capture(page, info.outputDir, `failed-${state.stage}`, { caseId: scenario.id, nonce: fixture.nonce });
        }
      } catch (error) { primary ??= error; }
      endEntry(state);
      try { await context.close(); contextClosed = true; } catch (error) { primary ??= error; }
      try { await Promise.allSettled([...active]); expect(active.size).toBe(0); } catch (error) { primary ??= error; }
      try {
        writeJson(info.outputDir, 'network.json', { test: info.title, caseId: scenario.id, nonce: fixture.nonce, contextClosed, pending: active.size, keys,
          requests: state.requests, errors: state.errors, pageErrors: state.pageErrors, verifiedBrand: state.verifiedBrand, journey: state.journey });
        expect(contextClosed).toBe(true); expect(state.errors).toEqual([]); expect(state.pageErrors).toEqual([]);
      } catch (error) { primary ??= error; }
    }
    if (primary) throw primary;
  }, { auto: true }],
});
export { expect };
