import { Request, Response, NextFunction } from 'express';
import { CsvService } from './csv.service';
import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';

export class CsvController {
  static async exportProducts(req: Request, res: Response, next: NextFunction) {
    try {
      const csv = await CsvService.exportProducts();
      const filename = `products-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('﻿' + csv); // BOM for Excel UTF-8
    } catch (err) {
      next(err);
    }
  }

  static async importProducts(req: Request, res: Response, next: NextFunction) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: { code: 'NO_FILE', message: '請上傳 CSV 檔案' },
        });
      }
      const csvContent = req.file.buffer.toString('utf-8').replace(/^\uFEFF/, '');
      const { valid, errors } = await CsvService.parseProductImportCsv(csvContent);

      if (errors.length > 0) {
        return res.status(422).json({
          success: false,
          error: { code: 'CSV_VALIDATION_ERROR', message: errors.join('; ') },
        });
      }

      const tenantId = requireTenantId();
      let created = 0;
      let skipped = 0;

      for (const row of valid) {
        const existing = await prisma.product.findFirst({
          where: { sku: row.sku, tenantId },
        });
        if (existing) {
          skipped++;
          continue;
        }
        await prisma.product.create({
          data: { ...row, tenantId, status: 'active' },
        });
        created++;
      }

      return res.json({ success: true, data: { created, skipped, errors: [] } });
    } catch (err) {
      next(err);
    }
  }

  static async exportOrders(req: Request, res: Response, next: NextFunction) {
    try {
      const { start, end } = req.query;
      const startDate = start ? new Date(start as string) : undefined;
      const endDate = end ? new Date(end as string) : undefined;
      const csv = await CsvService.exportOrders(startDate, endDate);
      const filename = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('﻿' + csv);
    } catch (err) {
      next(err);
    }
  }

  static async exportCustomers(req: Request, res: Response, next: NextFunction) {
    try {
      const csv = await CsvService.exportCustomers();
      const filename = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('﻿' + csv);
    } catch (err) {
      next(err);
    }
  }
}
