import { Request, Response, NextFunction } from 'express';
import { DailySettlementService } from './daily-settlements.service';

export class DailySettlementController {
  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { shiftId, startDate, endDate } = req.query as {
        shiftId?: string;
        startDate?: string;
        endDate?: string;
      };
      const data = await DailySettlementService.getAll({ shiftId, startDate, endDate });
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await DailySettlementService.getById(req.params.id as string);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async calculate(req: Request, res: Response, next: NextFunction) {
    try {
      const { shiftId } = req.body as { shiftId: string };
      const data = await DailySettlementService.calculate(shiftId);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await DailySettlementService.create(req.body);
      res.status(201).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async confirm(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await DailySettlementService.confirm(req.params.id as string);
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}
