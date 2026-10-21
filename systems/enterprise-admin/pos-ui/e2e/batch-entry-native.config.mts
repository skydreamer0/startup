import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
if (!process.env.BATCH_ENTRY_UI_OUTPUT) throw new Error('Use the exclusive owned batch-entry runner');
export default defineConfig({ testDir: './batch-entry-native', testMatch: 'batch.spec.ts', outputDir: resolve(process.env.BATCH_ENTRY_UI_OUTPUT, 'tests'), fullyParallel: false, workers: 1, retries: 0, forbidOnly: true, timeout: 60_000, globalTimeout: 90_000, expect: { timeout: 15_000 }, reporter: [['list'], ['json', { outputFile: resolve(process.env.BATCH_ENTRY_UI_OUTPUT, 'report.json') }]], use: { browserName: 'chromium', channel: 'chrome', launchOptions: { chromiumSandbox: true }, serviceWorkers: 'block', screenshot: 'off', trace: 'off', video: 'off' } });
