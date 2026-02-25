import { Router } from 'express';
import { RolesController } from './roles.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createRoleSchema, updateRolePermissionsSchema, roleIdParamSchema } from './roles.schema';

const router = Router();
const controller = new RolesController();

// All role routes require authentication
router.use(authMiddleware);

router.get('/', requirePermission('read:roles'), controller.list.bind(controller));

router.post(
    '/',
    requirePermission('create:roles'),
    validate({ body: createRoleSchema }),
    controller.create.bind(controller),
);

router.put(
    '/:id/permissions',
    requirePermission('update:roles'),
    validate({ params: roleIdParamSchema, body: updateRolePermissionsSchema }),
    controller.updatePermissions.bind(controller),
);

// Permission listing
router.get(
    '/permissions',
    requirePermission('read:roles'),
    controller.listPermissions.bind(controller),
);

export default router;
