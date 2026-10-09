import config from '../../vite.config.mts';
import { fileURLToPath } from 'node:url';
// Real application and build plugins; no API proxy and no ambient Vite env files.
export default { ...config, root: fileURLToPath(new URL('../../', import.meta.url)), envDir: false,
  server: { host: '127.0.0.1', port: 4281, strictPort: true, proxy: {}, hmr: false },
  preview: { host: '127.0.0.1', port: 4281, strictPort: true, proxy: {} } };
