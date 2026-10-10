import config from '../../vite.config.mts';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
if (!process.env.CATEGORY_UI_OUTPUT) throw new Error('Use the owned category runner');
// Actual POS build; the sole API target is the fixture's real production app on loopback.
export default { ...config, root: fileURLToPath(new URL('../../', import.meta.url)), envDir: false,
  build: { ...config.build, outDir: resolve(process.env.CATEGORY_UI_OUTPUT, 'build'), emptyOutDir: false },
  server: { host: '127.0.0.1', port: 4290, strictPort: true, hmr: false, proxy: {} },
  preview: { host: '127.0.0.1', port: 4290, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:4291', changeOrigin: false } } } };
