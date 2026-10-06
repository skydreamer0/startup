import { defineConfig, mergeConfig } from 'vite';
import { fileURLToPath } from 'node:url';
// Type augmentation for the existing Vite config's Vitest-only options.
import type {} from 'vitest/config';
import base from '../vite.config.mts';

const origin = process.env.POS_HTTP_RECOVERY_API_ORIGIN;
if (!origin || !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error('Owned loopback API origin required');

// Dedicated test config; application proxy/defaults stay unchanged.
export default mergeConfig(base, defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)), envDir: process.cwd(),
  server: { proxy: { '/api': { target: origin } } },
}));
