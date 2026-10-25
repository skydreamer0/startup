// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { withNativeContext } from '../../e2e/category-native/native-context';

// Resource/API regression only; these doubles do not establish native visibility.
// The owned-process fixture is synthetic Linux data on every test host.
const originalUid = Object.getOwnPropertyDescriptor(process, 'getuid');
beforeAll(() => Object.defineProperty(process, 'getuid', { configurable: true, value: () => 1000 }));
afterAll(() => {
  if (originalUid) Object.defineProperty(process, 'getuid', originalUid);
  else Reflect.deleteProperty(process, 'getuid');
});
const state = vi.hoisted(() => ({ scenario: 'success', calls: [] as string[], endpointReads: 0 }));
vi.mock('node:fs/promises', () => {
  const fs = {
    readFile: vi.fn(async (path: string) => {
      if (path.startsWith('/proc/')) return `42 (unit-owned-chrome) ${['S', ...Array(18).fill('0'), '123'].join(' ')}`;
      state.endpointReads++;
      if (state.scenario === 'partial-endpoint' && state.endpointReads < 3)
        return state.endpointReads === 1 ? '' : '12345\n';
      if (state.scenario === 'invalid-endpoint') return '12345\nws://foreign.example/devtools/browser/unit-id';
      if (state.scenario === 'invalid-port') return '65536\n/devtools/browser/unit-id';
      return '12345\n/devtools/browser/unit-id\n';
    }),
    access: vi.fn(async () => { throw Object.assign(new Error('unit profile removed'), { code: 'ENOENT' }); }),
  };
  return { ...fs, default: fs }; // Support Vite's CJS default-import interop as well as named imports.
});
vi.mock('@playwright/test', async () => {
  const { expect: check } = await import('vitest');
  const { EventEmitter } = await import('node:events');
  const assertion = Object.assign((value: unknown) => check(value), {
    poll: (read: () => Promise<unknown>) => ({ toBe: async (value: unknown) => {
      let actual;
      for (let attempt = 0; attempt < 4; attempt++) {
        actual = await read();
        if (actual === value) return;
      }
      check(actual).toBe(value);
    } }),
  });
  const context = { addInitScript: async (script: () => void) => {
    state.calls.push('block-service-workers'); check(script.toString()).toContain('ServiceWorkerContainer');
  } };
  const api = { expect: assertion, chromium: {
    launchServer: async (options: unknown) => {
      check(options).toEqual({ channel: 'chrome', headless: false, chromiumSandbox: true,
        args: ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0'] });
      state.calls.push('launch');
      const child = Object.assign(new EventEmitter(), { pid: 42, exitCode: null, signalCode: null,
        spawnargs: state.scenario === 'missing-profile' ? [] : ['--user-data-dir=/unit-owned-profile'] });
      return {
        process: () => child,
        close: async () => {
          state.calls.push('close-owned-server');
          child.emit('exit', 0, null); child.emit('close', 0, null);
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
  return { ...api, default: api };
});

beforeEach(() => { state.scenario = 'success'; state.calls = []; state.endpointReads = 0; });
it.each(['success', 'partial-endpoint', 'invalid-endpoint', 'invalid-port', 'callback-failure', 'connect-failure', 'missing-profile', 'wrong-context-count', 'close-failure'])(
  'owns Chrome and closes it before disconnect: %s', async scenario => {
    state.scenario = scenario;
    const run = () => withNativeContext(async (_context, close) => {
      state.calls.push('use');
      if (scenario === 'callback-failure') throw new Error('unit-callback');
      await close(); await close();
    }, { identity: { runNonce: '00000000-0000-0000-0000-000000000001',
      testNonce: '00000000-0000-0000-0000-000000000002', test: scenario }, onReceipt: () => {} });
    if (scenario === 'success' || scenario === 'partial-endpoint') await run();
    else await expect(run()).rejects.toThrow();
    if (scenario === 'partial-endpoint') expect(state.endpointReads).toBe(3);
    if (scenario === 'invalid-endpoint' || scenario === 'invalid-port') expect(state.calls).not.toContain('connect');
    expect(state.calls.filter(call => call === 'close-owned-server')).toHaveLength(1);
    if (state.calls.includes('disconnect-client')) {
      expect(state.calls.indexOf('close-owned-server')).toBeLessThan(state.calls.indexOf('disconnect-client'));
    }
    if (state.calls.includes('use')) {
      expect(state.calls.indexOf('block-service-workers')).toBeLessThan(state.calls.indexOf('use'));
    }
  },
);
