import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

if (!process.env.RECEIVING_BROWSER_OUTPUT || !process.env.RECEIVING_BROWSER_CREDENTIAL_FILE) throw new Error('Use the owned receiving browser runner');
export default defineConfig({
  testDir: '.', testMatch: 'receiving.spec.ts', outputDir: resolve(process.env.RECEIVING_BROWSER_OUTPUT, 'tests'),
  fullyParallel: false, workers: 1, retries: 0, forbidOnly: true,
  timeout: 60_000, expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: resolve(process.env.RECEIVING_BROWSER_OUTPUT, 'report.json') }]],
  use: { browserName: 'chromium', channel: 'chrome', viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', colorScheme: 'light',
    launchOptions: { chromiumSandbox: true }, screenshot: 'only-on-failure', trace: 'retain-on-failure', video: 'off' },
});
