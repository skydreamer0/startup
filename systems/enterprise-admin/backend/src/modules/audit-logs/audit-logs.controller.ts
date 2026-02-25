import { Request, Response, NextFunction } from 'express';
import { AuditLogsService } from './audit-logs.service';
import type { ListAuditLogsQuery } from './audit-logs.schema';

const auditLogsService = new AuditLogsService();

export class AuditLogsController {
    async list(req: Request, res: Response, next: NextFunction) {
        try {
            const query = (req.validatedQuery || req.query) as unknown as ListAuditLogsQuery;
            const result = await auditLogsService.list(query);

            res.json({
                success: true,
                data: result.logs,
                meta: result.meta,
            });
        } catch (error) {
            next(error);
        }
    }
}
