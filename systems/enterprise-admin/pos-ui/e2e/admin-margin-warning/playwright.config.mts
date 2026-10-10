import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!process.env.MARGIN_UI_OUTPUT || !process.env.MARGIN_UI_BUILD) throw new Error('Use the owned margin-warning runner');
export default defineConfig({
  testDir: '.', testMatch: 'warning.spec.ts', outputDir: resolve(process.env.MARGIN_UI_OUTPUT, 'tests'),
  fullyParallel: false, workers: 1, retries: 0, forbidOnly: true,
  timeout: 30_000, expect: { timeout: 7_000 },
  reporter: [['list'], ['json', { outputFile: resolve(process.env.MARGIN_UI_OUTPUT, 'report.json') }]],
  use: { browserName: 'chromium', channel: 'chrome', serviceWorkers: 'block', colorScheme: 'light',
    launchOptions: { chromiumSandbox: true },
    screenshot: 'only-on-failure', trace: 'retain-on-failure', video: 'off' },
  webServer: { cwd: fileURLToPath(new URL('../../../admin-ui/', import.meta.url)),
    command: 'node node_modules/vite/bin/vite.js preview --config ../pos-ui/e2e/admin-margin-warning/vite.config.mts',
    url: 'http://127.0.0.1:4287', reuseExistingServer: false, timeout: 30_000, stdout: 'pipe', stderr: 'pipe' },
});
