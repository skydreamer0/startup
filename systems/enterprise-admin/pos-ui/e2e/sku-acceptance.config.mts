import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (!process.env.SKU_UI_OUTPUT) throw new Error('Use the owned exact-head runner');
const output = process.env.SKU_UI_OUTPUT;
export default defineConfig({
  testDir: './sku-acceptance', testMatch: 'sku.spec.ts',
  outputDir: resolve(output, 'tests'), fullyParallel: false, workers: 1,
  retries: 0, forbidOnly: true, timeout: 30_000, expect: { timeout: 5_000 },
  reporter: [['list'], ['json', { outputFile: resolve(output, 'report.json') }]],
  use: { browserName: 'chromium', viewport: { width: 1366, height: 768 },
    serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure', video: 'off' },
  webServer: { cwd: fileURLToPath(new URL('..', import.meta.url)), command: 'node node_modules/vite/bin/vite.js preview --config e2e/sku-acceptance/vite.config.mts',
    url: 'http://127.0.0.1:4276', reuseExistingServer: false, timeout: 30_000,
    stdout: 'pipe', stderr: 'pipe' },
});
