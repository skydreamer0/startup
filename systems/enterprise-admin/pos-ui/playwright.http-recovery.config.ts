import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', testMatch: 'checkout-http-recovery.spec.ts',
  fullyParallel: false, forbidOnly: true, retries: 0, workers: 1, timeout: 90_000,
  outputDir: './test-results-http-recovery', reporter: 'list',
  use: { ...devices['Desktop Chrome'], trace: 'off', screenshot: 'only-on-failure', video: 'off' },
});
