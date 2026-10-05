import { Request, Response, NextFunction } from 'express';
import { ExcelService } from './excel.service';
import { AppError } from '../../lib/errors';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function sendBuffer(res: Response, buffer: Buffer, filename: string) {
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
}

function todayStamp(): string {
    return new Date().toISOString().slice(0, 10);
}

export class ExcelController {
    static async exportProducts(_req: Request, res: Response, next: NextFunction) {
        try {
            const buf = await ExcelService.exportProducts();
            sendBuffer(res, buf, `products-${todayStamp()}.xlsx`);
        } catch (err) {
            next(err);
        }
    }

    static async exportCustomers(_req: Request, res: Response, next: NextFunction) {
        try {
            const buf = await ExcelService.exportCustomers();
            sendBuffer(res, buf, `customers-${todayStamp()}.xlsx`);
        } catch (err) {
            next(err);
        }
    }

    static async exportOrders(req: Request, res: Response, next: NextFunction) {
        try {
            const from = typeof req.query.from === 'string' ? req.query.from : undefined;
            const to = typeof req.query.to === 'string' ? req.query.to : undefined;
            const buf = await ExcelService.exportOrders(from, to);
            sendBuffer(res, buf, `orders-${todayStamp()}.xlsx`);
        } catch (err) {
            next(err);
        }
    }

    static async exportInventory(_req: Request, res: Response, next: NextFunction) {
        try {
            const buf = await ExcelService.exportInventory();
            sendBuffer(res, buf, `inventory-${todayStamp()}.xlsx`);
        } catch (err) {
            next(err);
        }
    }

    static async previewImportProducts(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.file) {
                throw new AppError(400, 'No file uploaded (expected field "file")');
            }
            const summary = await ExcelService.previewImport(req.file.buffer);
            res.json({ success: true, data: summary });
        } catch (err) {
            next(err);
        }
    }

    static async confirmImportProducts(req: Request, res: Response, next: NextFunction) {
        try {
            if (!req.file) {
                throw new AppError(400, 'No file uploaded (expected field "file")');
            }
            const previewToken = typeof req.body?.previewToken === 'string' ? req.body.previewToken : '';
            const summary = await ExcelService.importProducts(req.file.buffer, previewToken);
            res.json({ success: true, data: summary });
        } catch (err) {
            next(err);
        }
    }
}
