import { Request, Response, NextFunction } from 'express';
import { CheckoutService } from './checkout.service';
import { ReceiptService } from './receipt.service';

export class PosController {
  static async checkout(req: Request, res: Response, next: NextFunction) {
    try {
      const order = await CheckoutService.checkout(req.body);
      res.status(201).json({ success: true, data: order });
    } catch (err) { next(err); }
  }

  static async getProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const query = (req as unknown as Record<string, unknown>).validatedQuery as {
        q?: string; categoryId?: string; inStockOnly?: string;
      } ?? {};
      const data = await CheckoutService.getProducts(query);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  static async getStaff(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await CheckoutService.getStaff();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  static async getActiveShift(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await CheckoutService.getActiveShift();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  static async getReceipt(req: Request, res: Response, next: NextFunction) {
    try {
      const orderId = Array.isArray(req.params.orderId)
        ? req.params.orderId[0]
        : req.params.orderId;
      const buffer = await ReceiptService.generateBuffer(orderId);
      res.json({ success: true, data: { buffer } });
    } catch (err) { next(err); }
  }
}
