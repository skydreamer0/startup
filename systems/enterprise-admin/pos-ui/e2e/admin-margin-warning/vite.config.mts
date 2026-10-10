import config from '../../../admin-ui/vite.config.mts';
import { fileURLToPath } from 'node:url';

if (!process.env.MARGIN_UI_BUILD) throw new Error('Use the owned margin-warning runner build directory');

// The production Admin application and plugins; no API proxy or ambient Vite env.
export default { ...config, root: fileURLToPath(new URL('../../../admin-ui/', import.meta.url)),
  envDir: false,
  build: { ...config.build, outDir: process.env.MARGIN_UI_BUILD, emptyOutDir: true },
  server: { host: '127.0.0.1', port: 4287, strictPort: true, proxy: {}, hmr: false },
  preview: { host: '127.0.0.1', port: 4287, strictPort: true, proxy: {} },
};
