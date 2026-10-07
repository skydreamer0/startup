import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './ui-evidence',
  testMatch: '*.spec.ts',
  globalSetup: './ui-evidence/setup.mjs',
  outputDir: '../test-results-ui-evidence/tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results-ui-evidence/report.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
  },
});
