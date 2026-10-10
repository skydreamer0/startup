import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (!process.env.CLOSE_SHIFT_OUTPUT) throw new Error('Set CLOSE_SHIFT_OUTPUT to an isolated evidence directory');
export default defineConfig({
  testDir: '.', testMatch: 'close-shift.spec.ts',
  outputDir: resolve(process.env.CLOSE_SHIFT_OUTPUT, 'tests'),
  fullyParallel: false, workers: 1, retries: 0, forbidOnly: true,
  timeout: 30_000, expect: { timeout: 5_000 },
  reporter: [['list'], ['json', { outputFile: resolve(process.env.CLOSE_SHIFT_OUTPUT, 'report.json') }]],
  use: { browserName: 'chromium', viewport: { width: 1366, height: 768 },
    launchOptions: process.env.CLOSE_SHIFT_CHROMIUM ? { executablePath: process.env.CLOSE_SHIFT_CHROMIUM } : {},
    serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure', video: 'off' },
  webServer: { cwd: fileURLToPath(new URL('../..', import.meta.url)),
    command: 'node node_modules/vite/bin/vite.js preview --config e2e/close-shift-dialog/vite.config.mts',
    url: 'http://127.0.0.1:4281', reuseExistingServer: false, timeout: 30_000, stdout: 'pipe', stderr: 'pipe' },
});
