import api from './client';

export type LineSegment = 'all' | 'vip' | 'first_time' | 'at_risk';

export interface MessageBroadcast {
    id: string;
    tenantId: string;
    title: string;
    content: string;
    targetSegment: LineSegment;
    sentCount: number;
    status: string;
    sentAt: string | null;
    createdAt: string;
    createdBy: string;
}

export interface BroadcastsPage {
    total: number;
    page: number;
    limit: number;
    data: MessageBroadcast[];
}

export const lineApi = {
    listBroadcasts: async (): Promise<BroadcastsPage> => {
        const res = await api.get<{ success: boolean; data: BroadcastsPage }>('/line/broadcasts');
        return res.data.data;
    },

    broadcast: async (payload: {
        segment: LineSegment;
        title: string;
        content: string;
    }): Promise<MessageBroadcast> => {
        const res = await api.post<{ success: boolean; data: MessageBroadcast }>(
            '/line/broadcast',
            payload,
        );
        return res.data.data;
    },
};
