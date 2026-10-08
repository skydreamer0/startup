import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock tenant context ─────────────────────────────────
vi.mock('../lib/tenant.context', () => ({
    requireTenantId: vi.fn(() => 'test-tenant-id'),
    tenantContext: { getStore: vi.fn(() => ({ tenantId: 'test-tenant-id', plan: 'pro' })) },
}));

// ─── Mock Prisma ─────────────────────────────────────────
vi.mock('../lib/prisma', () => ({
    prisma: {
        customer: {
            findFirst: vi.fn(),
            findMany: vi.fn(),
        },
        messageBroadcast: {
            create: vi.fn(),
            findMany: vi.fn(),
            count: vi.fn(),
        },
    },
}));

// ─── Mock @line/bot-sdk ──────────────────────────────────
const mockPushMessage = vi.fn().mockResolvedValue({});
const mockMulticast = vi.fn().mockResolvedValue({});

vi.mock('@line/bot-sdk', () => ({
    messagingApi: {
        MessagingApiClient: vi.fn().mockImplementation(function () {
            return {
                pushMessage: mockPushMessage,
                multicast: mockMulticast,
            };
        }),
    },
    webhook: {},
    validateSignature: vi.fn(() => true),
}));

// ─── Mock env (default: tokens set; individual tests override) ──
vi.mock('../config/env', () => ({
    env: {
        LINE_CHANNEL_ACCESS_TOKEN: 'test-token',
        LINE_CHANNEL_SECRET: 'test-secret',
    },
}));

// IMPORTANT: Import the service AFTER all mocks are registered.
import { LineService } from '../modules/line/line.service';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { AppError } from '../lib/errors';

const mockCustomerFindFirst = vi.mocked(prisma.customer.findFirst);
const mockCustomerFindMany = vi.mocked(prisma.customer.findMany);
const mockBroadcastCreate = vi.mocked(prisma.messageBroadcast.create);

describe('LineService.pushMessage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset env to "configured" by default
        (env as { LINE_CHANNEL_ACCESS_TOKEN?: string }).LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    });

    it('throws 503 INTEGRATION_NOT_CONFIGURED when LINE_CHANNEL_ACCESS_TOKEN is unset', async () => {
        (env as { LINE_CHANNEL_ACCESS_TOKEN?: string }).LINE_CHANNEL_ACCESS_TOKEN = undefined;

        await expect(LineService.pushMessage('cust-1', 'hello')).rejects.toMatchObject({
            statusCode: 503,
            errorCode: 'INTEGRATION_NOT_CONFIGURED',
        });
    });

    it('sends a push when customer has a lineUserId', async () => {
        mockCustomerFindFirst.mockResolvedValue({
            id: 'cust-1',
            tenantId: 'test-tenant-id',
            lineUserId: 'U-abc',
        } as never);

        const result = await LineService.pushMessage('cust-1', 'hi');

        expect(mockPushMessage).toHaveBeenCalledWith({
            to: 'U-abc',
            messages: [{ type: 'text', text: 'hi' }],
        });
        expect(result).toEqual({ customerId: 'cust-1', sent: true });
    });

    it('throws 400 when customer has no lineUserId', async () => {
        mockCustomerFindFirst.mockResolvedValue({
            id: 'cust-1',
            tenantId: 'test-tenant-id',
            lineUserId: null,
        } as never);

        await expect(LineService.pushMessage('cust-1', 'hi')).rejects.toBeInstanceOf(AppError);
        expect(mockPushMessage).not.toHaveBeenCalled();
    });
});

describe('LineService.broadcastToSegment', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (env as { LINE_CHANNEL_ACCESS_TOKEN?: string }).LINE_CHANNEL_ACCESS_TOKEN = 'test-token';
    });

    it('filters customers by VIP segment and writes MessageBroadcast on success', async () => {
        mockCustomerFindMany.mockResolvedValue([
            { lineUserId: 'U-a' },
            { lineUserId: 'U-b' },
        ] as never);
        mockBroadcastCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
            id: 'bc-1',
            ...args.data,
        } as never));

        const result = await LineService.broadcastToSegment('vip', 'Hello VIP', 'Body', 'user-1');

        // VIP segment must filter on purchaseCount + totalSpent + lineUserId not null
        const findArgs = mockCustomerFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
        expect(findArgs.where).toMatchObject({
            tenantId: 'test-tenant-id',
            lineUserId: { not: null },
            purchaseCount: { gte: 3 },
            totalSpent: { gte: 10000 },
        });

        expect(mockMulticast).toHaveBeenCalledWith({
            to: ['U-a', 'U-b'],
            messages: [{ type: 'text', text: 'Hello VIP\n\nBody' }],
        });

        // Broadcast row written with sentCount=2 and status=sent
        const createArgs = mockBroadcastCreate.mock.calls[0][0] as { data: Record<string, unknown> };
        expect(createArgs.data).toMatchObject({
            title: 'Hello VIP',
            content: 'Body',
            targetSegment: 'vip',
            sentCount: 2,
            status: 'sent',
            createdBy: 'user-1',
        });
        expect(result).toMatchObject({ sentCount: 2, status: 'sent' });
    });

    it('uses correct where-clause for first_time segment', async () => {
        mockCustomerFindMany.mockResolvedValue([] as never);
        mockBroadcastCreate.mockResolvedValue({ id: 'bc-2' } as never);

        await LineService.broadcastToSegment('first_time', 't', 'c', 'user-1');

        const findArgs = mockCustomerFindMany.mock.calls[0][0] as { where: Record<string, unknown> };
        expect(findArgs.where).toMatchObject({
            lineUserId: { not: null },
            purchaseCount: { equals: 1 },
        });
    });

    it('records status=failed when segment has no matching LINE users', async () => {
        mockCustomerFindMany.mockResolvedValue([] as never);
        mockBroadcastCreate.mockImplementation(async (args: { data: Record<string, unknown> }) => ({
            id: 'bc-3',
            ...args.data,
        } as never));

        const result = await LineService.broadcastToSegment('all', 't', 'c', 'user-1');

        expect(mockMulticast).not.toHaveBeenCalled();
        expect(result).toMatchObject({ sentCount: 0, status: 'failed' });
    });
});
