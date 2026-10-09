import { env } from './config/env';

async function start() {
    try {
        const { checkReadiness } = await import('./lib/readiness');
        const readiness = await checkReadiness();
        if (readiness.status !== 'ready') {
            console.error('STARTUP_NOT_READY', readiness.code);
            process.exit(1);
        }
        const { default: app } = await import('./app');
        const server = app.listen(env.PORT, () => {
            console.log(`Server running on port ${env.PORT}; liveness /health; readiness /ready`);
        });
        server.on('error', () => {
            console.error('STARTUP_LISTEN_FAILED');
            process.exit(1);
        });
    } catch {
        console.error('STARTUP_FAILED');
        process.exit(1);
    }
}

void start();
