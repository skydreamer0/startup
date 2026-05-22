import { Request, Response, NextFunction } from 'express';
import { ShiftService } from './shifts.service';

export class ShiftController {
  static async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const { status } = req.query as { status?: string };
      const data = await ShiftService.getAll({ status });
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ShiftService.getById(req.params.id as string);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ShiftService.create(req.body);
      res.status(201).json({ success: true, data });
    } catch (err) { next(err); }
  }

  static async close(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ShiftService.close(req.params.id as string, req.body);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }

  static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await ShiftService.delete(req.params.id as string);
      res.json({ success: true, data: null });
    } catch (err) { next(err); }
  }

  static async getReport(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await ShiftService.getReport(req.params.id as string);
      res.json({ success: true, data });
    } catch (err) { next(err); }
  }
}
