import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for POS UI.
 * The dev server runs on port 5174 (see vite.config.ts).
 * Tests are in the e2e/ directory.
 *
 * To run:
 *   npm run test:e2e
 *
 * Prerequisites:
 *   1. Backend running: cd ../backend && npm run dev   (port 3000)
 *   2. POS UI running:  npm run dev                   (port 5174)
 *
 * Or let Playwright start the dev server automatically via `webServer` below.
 */

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],

  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  /* Uncomment to auto-start the POS dev server before running tests.
   * This requires the backend to already be running on port 3000.
   *
   * webServer: {
   *   command: 'npm run dev',
   *   url: 'http://localhost:5174',
   *   reuseExistingServer: !process.env.CI,
   *   timeout: 30_000,
   * },
   */
});
