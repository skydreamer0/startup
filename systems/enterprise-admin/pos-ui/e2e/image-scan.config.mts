import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  testDir: './image-scan',
  workers: 1,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results-image-scan/report.json' }]],
  outputDir: 'test-results-image-scan/artifacts',
  use: {
    channel: 'chrome',
    baseURL: 'http://127.0.0.1:4293',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
  },
  webServer: {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    command: 'node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port 4293 --strictPort',
    url: 'http://127.0.0.1:4293',
    reuseExistingServer: false,
  },
});
