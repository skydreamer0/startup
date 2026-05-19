import { Request, Response, NextFunction } from 'express';
import { validateSignature } from '@line/bot-sdk';
import { LineService } from './line.service';
import { AppError } from '../../lib/errors';
import { env } from '../../config/env';

export class LineController {
    static async broadcast(req: Request, res: Response, next: NextFunction) {
        try {
            const { segment, title, content } = req.body ?? {};
            if (!segment || !title || !content) {
                throw new AppError(400, 'segment, title and content are required', 'VALIDATION_FAILED');
            }
            const userId = req.user?.userId;
            if (!userId) {
                throw new AppError(401, 'Authentication required', 'UNAUTHORIZED');
            }
            const result = await LineService.broadcastToSegment(segment, title, content, userId);
            res.status(201).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }

    static async push(req: Request, res: Response, next: NextFunction) {
        try {
            const customerId = req.params.customerId as string | undefined;
            const { text } = req.body ?? {};
            if (!customerId || !text) {
                throw new AppError(400, 'customerId and text are required', 'VALIDATION_FAILED');
            }
            const result = await LineService.pushMessage(customerId, text);
            res.status(200).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }

    static async listBroadcasts(req: Request, res: Response, next: NextFunction) {
        try {
            const result = await LineService.listBroadcasts({
                page: req.query.page as string | undefined,
                limit: req.query.limit as string | undefined,
            });
            res.status(200).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }

    /**
     * LINE Webhook endpoint. Validates the X-Line-Signature header before
     * delegating to the service. No auth/plan middleware — LINE servers
     * (not our users) call this endpoint.
     */
    static async webhook(req: Request, res: Response, next: NextFunction) {
        try {
            if (!env.LINE_CHANNEL_SECRET) {
                throw new AppError(503, 'LINE webhook not configured', 'INTEGRATION_NOT_CONFIGURED');
            }
            const signature = req.header('x-line-signature') ?? '';
            const rawBody = JSON.stringify(req.body ?? {});
            const valid = validateSignature(rawBody, env.LINE_CHANNEL_SECRET, signature);
            if (!valid) {
                throw new AppError(401, 'Invalid LINE signature', 'INVALID_SIGNATURE');
            }
            const events = Array.isArray(req.body?.events) ? req.body.events : [];
            const result = await LineService.handleWebhookEvents(events);
            res.status(200).json({ success: true, data: result });
        } catch (err) {
            next(err);
        }
    }
}
