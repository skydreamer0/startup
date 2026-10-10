import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (!process.env.CATEGORY_UI_OUTPUT) throw new Error('Use the owned category runner');
export default defineConfig({
  testDir: './category-native', testMatch: ['category.spec.ts', 'lifecycle.spec.ts'],
  outputDir: resolve(process.env.CATEGORY_UI_OUTPUT, 'tests'), fullyParallel: false, workers: 1,
  retries: 0, forbidOnly: true, timeout: 150_000, expect: { timeout: 20_000 },
  reporter: [['list'], ['json', { outputFile: resolve(process.env.CATEGORY_UI_OUTPUT, 'report.json') }]],
  use: { browserName: 'chromium', channel: 'chrome', headless: false, launchOptions: { chromiumSandbox: true },
    serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'off', video: 'off' },
  webServer: { cwd: fileURLToPath(new URL('..', import.meta.url)),
    command: 'node node_modules/vite/bin/vite.js preview --config e2e/category-native/vite.config.mts',
    url: 'http://127.0.0.1:4290', reuseExistingServer: false, timeout: 30_000, stdout: 'pipe', stderr: 'pipe' },
});
