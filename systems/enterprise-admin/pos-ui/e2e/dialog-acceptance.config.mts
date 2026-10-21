import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
if (!process.env.DIALOG_UI_OUTPUT || !process.env.DIALOG_CAMERA_Y4M) throw new Error('Use the owned exact-head runner');
const output = process.env.DIALOG_UI_OUTPUT;
if (resolve(process.env.DIALOG_CAMERA_Y4M) !== resolve(output, 'synthetic-camera.y4m')) throw new Error('Only the owned generated camera fixture is allowed');
export default defineConfig({
  testDir: './dialog-acceptance', testMatch: ['dialog.spec.ts', 'manual.spec.ts', 'camera.spec.ts'],
  outputDir: resolve(output, 'tests'), fullyParallel: false, workers: 1,
  retries: 0, forbidOnly: true, timeout: 30_000, expect: { timeout: 5_000 },
  reporter: [['list'], ['json', { outputFile: resolve(output, 'report.json') }]],
  use: { browserName: 'chromium', channel: 'chrome', launchOptions: { chromiumSandbox: true, args: ['--use-fake-device-for-media-stream', '--use-file-for-fake-video-capture=' + process.env.DIALOG_CAMERA_Y4M] }, viewport: { width: 1366, height: 768 },
    serviceWorkers: 'block', screenshot: 'only-on-failure', trace: 'retain-on-failure', video: 'off' },
  webServer: { cwd: fileURLToPath(new URL('..', import.meta.url)), command: 'node node_modules/vite/bin/vite.js preview --config e2e/dialog-acceptance/vite.config.mts',
    url: 'http://127.0.0.1:4288', reuseExistingServer: false, timeout: 30_000,
    stdout: 'pipe', stderr: 'pipe' },
});
