import { Router } from 'express';
import { UsersController } from './users.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import {
    createUserSchema,
    updateUserSchema,
    listUsersQuerySchema,
    userIdParamSchema,
} from './users.schema';

const router = Router();
const controller = new UsersController();

// All user routes require authentication
router.use(authMiddleware);

router.get(
    '/',
    requirePermission('read:users'),
    validate({ query: listUsersQuerySchema }),
    controller.list.bind(controller),
);

router.get(
    '/:id',
    requirePermission('read:users'),
    validate({ params: userIdParamSchema }),
    controller.getById.bind(controller),
);

router.post(
    '/',
    requirePermission('create:users'),
    validate({ body: createUserSchema }),
    controller.create.bind(controller),
);

router.put(
    '/:id',
    requirePermission('update:users'),
    validate({ params: userIdParamSchema, body: updateUserSchema }),
    controller.update.bind(controller),
);

router.delete(
    '/:id',
    requirePermission('delete:users'),
    validate({ params: userIdParamSchema }),
    controller.delete.bind(controller),
);

export default router;
