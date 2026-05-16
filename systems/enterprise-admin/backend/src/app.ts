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
import inventoryRoutes from './modules/inventory/inventory.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import orderRoutes from './modules/orders/order.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import expensesRoutes from './modules/expenses/expenses.routes';
import reportsRoutes from './modules/reports/reports.routes';
import shiftsRoutes from './modules/shifts/shifts.routes';
import { setTenantContext } from './middleware/tenant.middleware';

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

// Establish tenant context for ALL API routes
apiRouter.use(setTenantContext);

apiRouter.use('/auth', authRoutes);
apiRouter.use('/users', usersRoutes);
apiRouter.use('/roles', rolesRoutes);
apiRouter.use('/audit-logs', auditLogsRoutes);
apiRouter.use('/crm', crmRoutes);
apiRouter.use('/inventory', inventoryRoutes);
apiRouter.use('/dashboard', dashboardRoutes);
apiRouter.use('/orders', orderRoutes);
apiRouter.use('/analytics', analyticsRoutes);
apiRouter.use('/expenses', expensesRoutes);
apiRouter.use('/reports', reportsRoutes);
apiRouter.use('/shifts', shiftsRoutes);

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
