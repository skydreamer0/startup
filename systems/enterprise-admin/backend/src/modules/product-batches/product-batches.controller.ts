import { Request, Response, NextFunction } from 'express';
import { BatchAuditService } from './batch-audit.service';
import { ProductBatchService } from './product-batches.service';

export class ProductBatchController {
  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId, expiringSoon } = req.query as {
        productId?: string;
        expiringSoon?: string;
      };
      const data = await ProductBatchService.getAll({
        productId,
        expiringSoon: expiringSoon === 'true',
      });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ProductBatchService.getById(req.params.id as string);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ProductBatchService.create(req.body, req.user);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ProductBatchService.update(req.params.id as string, req.body);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async changeStatus(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await BatchAuditService.change(req.params.id as string, { ...req.body, operation: 'STATUS' }, req.user) }); }
    catch (err) { next(err); }
  }

  static async correctExpiry(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await BatchAuditService.change(req.params.id as string, { ...req.body, operation: 'EXPIRY' }, req.user) }); }
    catch (err) { next(err); }
  }

  static async correctCost(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await BatchAuditService.change(req.params.id as string, { ...req.body, operation: 'COST' }, req.user) }); }
    catch (err) { next(err); }
  }

  static async history(req: Request, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await BatchAuditService.history(req.params.id as string, req.validatedQuery?.cursor as string | undefined) }); }
    catch (err) { next(err); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await ProductBatchService.delete(req.params.id as string);
      res.json({ success: true, data: null });
    } catch (err) {
      next(err);
    }
  }
}
