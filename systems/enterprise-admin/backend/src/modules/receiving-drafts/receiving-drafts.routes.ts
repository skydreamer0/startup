import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { ReceivingDraftService } from './receiving-drafts.service';
import { AppError } from '../../lib/errors';
const router = Router();
router.use(authMiddleware);
router.use(requirePermission('read:products'));
function id(raw: unknown) {
  const value = z.uuid().safeParse(raw);
  if (!value.success) throw new AppError(400, 'Invalid draft identifier');
  return value.data;
}
function page(raw: unknown) {
  if (raw === undefined) return 1;
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw) || Number(raw) > 1000000) throw new AppError(400, 'Invalid page');
  return Number(raw);
}
router.get('/', async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json({ success: true, data: await ReceivingDraftService.list(req.user!.userId, page(req.query.page)) }); }
  catch (error) { next(error); }
});
router.get('/:id', async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json({ success: true, data: await ReceivingDraftService.get(id(req.params.id), req.user!.userId) }); }
  catch (error) { next(error); }
});
router.get('/:id/history', async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json({ success: true, data: await ReceivingDraftService.history(id(req.params.id), req.user!.userId, page(req.query.page)) }); }
  catch (error) { next(error); }
});
router.get('/:id/history/:revision', async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json({ success: true, data: await ReceivingDraftService.version(id(req.params.id), req.user!.userId, page(req.params.revision)) }); }
  catch (error) { next(error); }
});
router.put('/:id', requirePermission('create:products'), async (req, res, next) => {
  try { res.set('Cache-Control', 'no-store').json({ success: true, data: await ReceivingDraftService.save(id(req.params.id), req.user!.userId, req.body) }); }
  catch (error) { next(error); }
});
export default router;
