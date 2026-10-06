import { Request, Response, NextFunction } from 'express';
import { CheckoutService } from './checkout.service';
import { CheckoutCommandService } from './checkout-command.service';
import { ReceiptService } from './receipt.service';
import { prisma } from '../../lib/prisma';
import { signAccessToken } from '../../lib/jwt';
import { AppError } from '../../lib/errors';
import { requireTenantId } from '../../lib/tenant.context';

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

  static async getCheckoutCommand(req: Request, res: Response, next: NextFunction) {
    try {
      const commandId = Array.isArray(req.params.commandId) ? req.params.commandId[0] : req.params.commandId;
      const data = await CheckoutCommandService.getResult(commandId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  static async getCheckoutContext(req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: { tenantId: requireTenantId(), userId: req.user!.userId } });
    } catch (err) { next(err); }
  }

  static async getStaff(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await CheckoutService.getStaff();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  static async lookupCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const query = (req as unknown as Record<string, unknown>).validatedQuery as { q: string };
      const data = await CheckoutService.lookupCustomer(query.q);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  static async createCustomer(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await CheckoutService.createCustomer(req.body as { phone: string; name?: string });
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }

  static async getRecommendations(req: Request, res: Response, next: NextFunction) {
    try {
      const customerId = Array.isArray(req.params.customerId)
        ? req.params.customerId[0]
        : req.params.customerId;
      const data = await CheckoutService.getRecommendations(customerId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  static async getHotRecommendations(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await CheckoutService.getHotRecommendations();
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  static async getReorderForecast(req: Request, res: Response, next: NextFunction) {
    try {
      const rawLimit = Number(req.query.limit);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : undefined;
      const data = await CheckoutService.getReorderForecast(limit);
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

  static async getTodayOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const shiftId = typeof req.query.shiftId === 'string' ? req.query.shiftId : undefined;
      const data = await CheckoutService.getTodayOrders(shiftId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  static async getOrderById(req: Request, res: Response, next: NextFunction) {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
      const data = await CheckoutService.getOrderById(orderId);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  static async refundOrder(req: Request, res: Response, next: NextFunction) {
    try {
      const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
      const { reason } = req.body as { reason?: string };
      const data = await CheckoutService.refundOrder(orderId, reason);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
}
