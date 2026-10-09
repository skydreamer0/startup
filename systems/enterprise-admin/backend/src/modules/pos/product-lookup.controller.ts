import type { Request, Response, NextFunction } from 'express';
import { ProductLookupService } from './product-lookup.service';

export async function lookupProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { code } = (req as unknown as { validatedQuery: { code: string } }).validatedQuery;
    const data = await ProductLookupService.lookup(code);
    res.json({ success: true, data });
  } catch (error) { next(error); }
}
