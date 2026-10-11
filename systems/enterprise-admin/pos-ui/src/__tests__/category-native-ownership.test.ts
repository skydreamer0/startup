import { beforeEach, expect, it, vi } from 'vitest';
import { withNativeContext } from '../../e2e/category-native/native-context';

// Resource/API regression only; these doubles do not establish native visibility.
const state = vi.hoisted(() => ({ scenario: 'success', calls: [] as string[] }));
vi.mock('node:fs/promises', () => ({ readFile: vi.fn(async () => '12345\n/devtools/browser/unit-id\n') }));
vi.mock('@playwright/test', async () => {
  const { expect: check } = await import('vitest');
  const assertion = Object.assign((value: unknown) => check(value), {
    poll: (read: () => Promise<unknown>) => ({ toBe: async (value: unknown) => check(await read()).toBe(value) }),
  });
  const context = { addInitScript: async (script: () => void) => {
    state.calls.push('block-service-workers'); check(script.toString()).toContain('ServiceWorkerContainer');
  } };
  return { expect: assertion, chromium: {
    launchServer: async (options: unknown) => {
      check(options).toEqual({ channel: 'chrome', headless: false, chromiumSandbox: true,
        args: ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'] });
      state.calls.push('launch');
      return {
        process: () => ({ spawnargs: state.scenario === 'missing-profile' ? [] : ['--user-data-dir=/unit-owned-profile'] }),
        close: async () => {
          state.calls.push('close-owned-server');
          if (state.scenario === 'close-failure') throw new Error('unit-close');
        },
      };
    },
    connectOverCDP: async (endpoint: string, options: unknown) => {
      check(endpoint).toBe('ws://127.0.0.1:12345/devtools/browser/unit-id');
      check(options).toEqual({ noDefaults: true });
      state.calls.push('connect');
      if (state.scenario === 'connect-failure') throw new Error('unit-connect');
      return {
        contexts: () => state.scenario === 'wrong-context-count' ? [context, context] : [context],
        close: async () => { state.calls.push('disconnect-client'); },
      };
    },
  } };
});

beforeEach(() => { state.scenario = 'success'; state.calls = []; });
it.each(['success', 'callback-failure', 'connect-failure', 'missing-profile', 'wrong-context-count', 'close-failure'])(
  'owns Chrome and closes it before disconnect: %s', async scenario => {
    state.scenario = scenario;
    const run = () => withNativeContext(async (_context, close) => {
      state.calls.push('use');
      if (scenario === 'callback-failure') throw new Error('unit-callback');
      await close(); await close();
    });
    if (scenario === 'success') await run();
    else await expect(run()).rejects.toThrow();
    expect(state.calls.filter(call => call === 'close-owned-server')).toHaveLength(1);
    if (state.calls.includes('disconnect-client')) {
      expect(state.calls.indexOf('close-owned-server')).toBeLessThan(state.calls.indexOf('disconnect-client'));
    }
    if (state.calls.includes('use')) {
      expect(state.calls.indexOf('block-service-workers')).toBeLessThan(state.calls.indexOf('use'));
    }
  },
);
