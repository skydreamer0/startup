import config from '../../vite.config.mts';
import { fileURLToPath } from 'node:url';
// The actual app/plugins, but no API proxy or HMR socket can reach another service.
export default { ...config, root: fileURLToPath(new URL('../../', import.meta.url)),
  server: { host: '127.0.0.1', port: 4276, strictPort: true, proxy: {}, hmr: false },
  preview: { host: '127.0.0.1', port: 4276, strictPort: true, proxy: {} } };
