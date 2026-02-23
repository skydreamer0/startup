import app from './app';
import { env } from './config/env';

const PORT = env.PORT;

app.listen(PORT, () => {
    console.log(`
  ┌──────────────────────────────────────────┐
  │                                          │
  │   🚀 Server running on port ${PORT}        │
  │   📊 Health: http://localhost:${PORT}/health │
  │   🔑 API:    http://localhost:${PORT}/api/v1/admin  │
  │   🌍 Env:    ${env.NODE_ENV}                  │
  │                                          │
  └──────────────────────────────────────────┘
  `);
});
