import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { errorMiddleware } from './middleware/error.middleware';

// Route imports
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import rolesRoutes from './modules/roles/roles.routes';
import auditLogsRoutes from './modules/audit-logs/audit-logs.routes';
import crmRoutes from './modules/crm/crm.routes';

const app = express();

// ─── Security & Parsing ──────────────────────────────────
app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes (Base: /api/v1/admin) ────────────────────
const apiRouter = express.Router();
apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', usersRoutes);
apiRouter.use('/roles', rolesRoutes);
apiRouter.use('/audit-logs', auditLogsRoutes);
apiRouter.use('/crm', crmRoutes);

app.use('/api/v1/admin', apiRouter);

// ─── 404 Handler ─────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
});

// ─── Global Error Handler ────────────────────────────────
app.use(errorMiddleware);

export default app;
