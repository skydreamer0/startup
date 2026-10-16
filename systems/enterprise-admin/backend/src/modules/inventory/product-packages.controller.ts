import type { Request, Response, NextFunction } from 'express';
import { ProductPackagesService } from './product-packages.service';
import { packageParams, packageProductParams } from './product-packages.schema';

export const ProductPackagesController = {
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId } = packageProductParams.parse(req.params);
      res.json({ success: true, data: await ProductPackagesService.list(productId) });
    } catch (error) { next(error); }
  },
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId } = packageProductParams.parse(req.params);
      res.status(201).json({ success: true, data: await ProductPackagesService.save(productId, req.body, req.user!.userId) });
    } catch (error) { next(error); }
  },
  async revise(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId, packageId } = packageParams.parse(req.params);
      res.status(201).json({ success: true, data: await ProductPackagesService.save(
        productId, req.body.data, req.user!.userId, { packageId, expectedRevision: req.body.expectedRevision, expectedRetired: req.body.expectedRetired },
      ) });
    } catch (error) { next(error); }
  },
  async retire(req: Request, res: Response, next: NextFunction) {
    try {
      const { productId, packageId } = packageParams.parse(req.params);
      res.json({ success: true, data: await ProductPackagesService.retire(
        productId, packageId, req.body.expectedRevision, req.body.reason, req.user!.userId,
      ) });
    } catch (error) { next(error); }
  },
  async lookup(req: Request, res: Response, next: NextFunction) {
    try {
      const query = (req as unknown as { validatedQuery: unknown }).validatedQuery;
      res.json({ success: true, data: await ProductPackagesService.lookup(query) });
    } catch (error) { next(error); }
  },
  async resolve(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: await ProductPackagesService.resolve(req.body.identifier, req.body.packageId, req.body.revision) });
    } catch (error) { next(error); }
  },
};
