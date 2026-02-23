import { Router } from 'express';
import { AuditLogsController } from './audit-logs.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { listAuditLogsQuerySchema } from './audit-logs.schema';

const router = Router();
const controller = new AuditLogsController();

// All routes require authentication + read:audit_logs permission
router.use(authMiddleware, requirePermission('read:audit_logs'));

router.get(
    '/',
    validate({ query: listAuditLogsQuerySchema }),
    controller.list.bind(controller),
);

export default router;
