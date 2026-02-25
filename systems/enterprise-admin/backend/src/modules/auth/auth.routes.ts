import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { loginSchema, refreshSchema } from './auth.schema';

const router = Router();
const controller = new AuthController();

// Public routes
router.post('/login', validate({ body: loginSchema }), controller.login.bind(controller));
router.post('/refresh', validate({ body: refreshSchema }), controller.refresh.bind(controller));

// Protected routes
router.post('/logout', authMiddleware, controller.logout.bind(controller));
router.get('/me', authMiddleware, controller.me.bind(controller));

export default router;
