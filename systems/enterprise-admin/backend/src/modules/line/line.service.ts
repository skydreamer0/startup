import { messagingApi, webhook } from '@line/bot-sdk';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { requireTenantId } from '../../lib/tenant.context';
import { env } from '../../config/env';

type SegmentKey = 'all' | 'vip' | 'first_time' | 'at_risk';

const MULTICAST_BATCH_SIZE = 500;
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Build and return a singleton MessagingApiClient.
 * Throws if the LINE channel access token is not configured.
 */
function getClient(): messagingApi.MessagingApiClient {
    if (!env.LINE_CHANNEL_ACCESS_TOKEN) {
        throw new AppError(503, 'LINE not configured', 'INTEGRATION_NOT_CONFIGURED');
    }
    return new messagingApi.MessagingApiClient({
        channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    });
}

/**
 * Resolve a "segment" name into a Prisma where-clause for the Customer table.
 */
function segmentWhere(segment: SegmentKey, tenantId: string): Record<string, unknown> {
    const base: Record<string, unknown> = {
        tenantId,
        lineUserId: { not: null },
    };

    switch (segment) {
        case 'all':
            return base;
        case 'vip':
            // VIP: high spenders with multiple purchases
            return { ...base, purchaseCount: { gte: 3 }, totalSpent: { gte: 10000 } };
        case 'first_time':
            return { ...base, purchaseCount: { equals: 1 } };
        case 'at_risk': {
            const cutoff = new Date(Date.now() - NINETY_DAYS_MS);
            return { ...base, lastInteractionDate: { lt: cutoff } };
        }
        default:
            throw new AppError(400, `Unknown segment: ${segment}`, 'INVALID_SEGMENT');
    }
}

function chunk<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size));
    }
    return out;
}

export class LineService {
    /**
     * Push a single text message to one customer via their stored lineUserId.
     */
    static async pushMessage(customerId: string, text: string) {
        const tenantId = requireTenantId();
        const client = getClient();

        const customer = await prisma.customer.findFirst({
            where: { id: customerId, tenantId },
        });

        if (!customer) {
            throw new AppError(404, 'Customer not found', 'CUSTOMER_NOT_FOUND');
        }
        if (!customer.lineUserId) {
            throw new AppError(
                400,
                'Customer has no linked LINE user ID',
                'LINE_USER_NOT_LINKED',
            );
        }

        await client.pushMessage({
            to: customer.lineUserId,
            messages: [{ type: 'text', text }],
        });

        return { customerId, sent: true };
    }

    /**
     * Broadcast a message to all customers matching the given segment.
     * Records a MessageBroadcast row regardless of partial failures.
     */
    static async broadcastToSegment(
        segment: SegmentKey,
        title: string,
        content: string,
        userId: string,
    ) {
        const tenantId = requireTenantId();
        const client = getClient();

        const where = segmentWhere(segment, tenantId);
        const customers = await prisma.customer.findMany({
            where,
            select: { lineUserId: true },
        });

        const userIds = customers
            .map((c) => c.lineUserId)
            .filter((id): id is string => !!id);

        let sentCount = 0;
        let status: 'sent' | 'failed' | 'partial' = 'sent';

        if (userIds.length === 0) {
            status = 'failed';
        } else {
            const batches = chunk(userIds, MULTICAST_BATCH_SIZE);
            for (const batch of batches) {
                try {
                    await client.multicast({
                        to: batch,
                        messages: [{ type: 'text', text: `${title}\n\n${content}` }],
                    });
                    sentCount += batch.length;
                } catch (err) {
                    console.error('[LINE] multicast batch failed:', err);
                    status = sentCount > 0 ? 'partial' : 'failed';
                }
            }
        }

        const broadcast = await prisma.messageBroadcast.create({
            data: {
                title,
                content,
                targetSegment: segment,
                sentCount,
                status,
                sentAt: status === 'failed' ? null : new Date(),
                createdBy: userId,
            },
        });

        return broadcast;
    }

    /**
     * Handle inbound LINE webhook events. For MVP we just log follow events.
     * Future: link a user back to a Customer row using their displayName/phone.
     */
    static async handleWebhookEvents(events: webhook.Event[]) {
        for (const event of events) {
            if (event.type === 'follow') {
                const userId = event.source?.type === 'user' ? event.source.userId : undefined;
                // For MVP, just log. A future flow will attempt to link this userId
                // to an existing Customer by phone number or display name.
                console.log('[LINE] follow event received', { userId });
            }
        }
        return { processed: events.length };
    }

    /**
     * List past broadcasts ordered by createdAt desc.
     */
    static async listBroadcasts(pagination: { page?: string; limit?: string } = {}) {
        requireTenantId();

        const page = Math.max(parseInt(pagination.page || '1'), 1);
        const limit = Math.min(Math.max(parseInt(pagination.limit || '20'), 1), 100);
        const skip = (page - 1) * limit;

        const [total, data] = await Promise.all([
            prisma.messageBroadcast.count(),
            prisma.messageBroadcast.findMany({
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
        ]);

        return { total, page, limit, data };
    }
}
