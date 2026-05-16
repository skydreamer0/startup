import { Request, Response, NextFunction } from 'express';
import { CheckoutService } from './checkout.service';
import { ReceiptService } from './receipt.service';
import { prisma } from '../../lib/prisma';
import { signAccessToken } from '../../lib/jwt';
import { AppError } from '../../lib/errors';

export class PosController {
  // No auth required — POS kiosk login by employee barcode
  static async staffLogin(req: Request, res: Response, next: NextFunction) {
    try {
      const { employeeCode } = req.body as { employeeCode?: string };
      if (!employeeCode?.trim()) throw new AppError(400, 'employeeCode is required');

      const user = await prisma.user.findFirst({
        where: { employeeCode: employeeCode.trim(), status: 'active', deletedAt: null },
      });
      if (!user) throw new AppError(401, '找不到員工或帳號已停用');

      const accessToken = signAccessToken({ userId: user.id, email: user.email });
      res.json({ success: true, data: { accessToken, user: { id: user.id, fullName: user.fullName } } });
    } catch (err) { next(err); }
  }

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
