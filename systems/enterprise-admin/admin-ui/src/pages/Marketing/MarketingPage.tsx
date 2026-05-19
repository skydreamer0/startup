import { useState, FormEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import PlanGate from '../../components/PlanGate';
import { lineApi, LineSegment, BroadcastsPage } from '../../api/line';

const SEGMENT_OPTIONS: { value: LineSegment; label: string }[] = [
    { value: 'all', label: '全部已綁定客戶' },
    { value: 'vip', label: 'VIP（高消費 + 多次回購）' },
    { value: 'first_time', label: '首購客戶' },
    { value: 'at_risk', label: '流失風險客戶（90 天未互動）' },
];

const STATUS_BADGE: Record<string, string> = {
    sent: 'badge-success',
    partial: 'badge-warning',
    failed: 'badge-danger',
    pending: 'badge-info',
};

function MarketingPageInner() {
    const queryClient = useQueryClient();
    const [segment, setSegment] = useState<LineSegment>('all');
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [feedback, setFeedback] = useState<string | null>(null);

    const broadcastsQuery = useQuery<BroadcastsPage>({
        queryKey: ['line', 'broadcasts'],
        queryFn: lineApi.listBroadcasts,
    });

    const broadcastMutation = useMutation({
        mutationFn: lineApi.broadcast,
        onSuccess: (data) => {
            setFeedback(`已送出 ${data.sentCount} 則訊息（狀態：${data.status}）`);
            setTitle('');
            setContent('');
            queryClient.invalidateQueries({ queryKey: ['line', 'broadcasts'] });
        },
        onError: (err: unknown) => {
            const msg = err instanceof Error ? err.message : '送出失敗，請稍後再試';
            setFeedback(msg);
        },
    });

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        setFeedback(null);
        if (!title.trim() || !content.trim()) {
            setFeedback('標題與內容皆為必填');
            return;
        }
        broadcastMutation.mutate({ segment, title: title.trim(), content: content.trim() });
    }

    return (
        <div>
            <header className="page-header">
                <div>
                    <h1 className="page-title">LINE 推播</h1>
                    <p className="page-subtitle">向特定客群發送 LINE 訊息，提升再購率與互動。</p>
                </div>
            </header>

            {/* Compose form */}
            <div className="card section-card" style={{ marginBottom: 28 }}>
                <h3 className="section-title">
                    <span className="section-icon">📣</span> 新增推播
                </h3>
                <form onSubmit={handleSubmit} className="space-y-16">
                    <div>
                        <label className="label" htmlFor="line-segment">目標客群</label>
                        <select
                            id="line-segment"
                            className="input-field"
                            value={segment}
                            onChange={(e) => setSegment(e.target.value as LineSegment)}
                        >
                            {SEGMENT_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="label" htmlFor="line-title">標題</label>
                        <input
                            id="line-title"
                            className="input-field"
                            type="text"
                            maxLength={60}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="例：本週 VIP 限定優惠"
                        />
                    </div>

                    <div>
                        <label className="label" htmlFor="line-content">訊息內容</label>
                        <textarea
                            id="line-content"
                            className="input-field"
                            rows={5}
                            maxLength={1000}
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="輸入要推播給客戶的訊息……"
                        />
                    </div>

                    <div className="flex gap-12" style={{ alignItems: 'center' }}>
                        <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={broadcastMutation.isPending}
                        >
                            {broadcastMutation.isPending ? '送出中…' : '送出推播'}
                        </button>
                        {feedback && <span className="text-sm text-muted">{feedback}</span>}
                    </div>
                </form>
            </div>

            {/* History */}
            <div className="card section-card">
                <h3 className="section-title">
                    <span className="section-icon">📜</span> 推播歷史
                </h3>
                {broadcastsQuery.isLoading ? (
                    <div className="skeleton skeleton-chart" style={{ height: 160 }} />
                ) : broadcastsQuery.isError ? (
                    <div className="empty-state">
                        <div className="empty-state-icon">❌</div>
                        <div className="empty-state-title">無法載入</div>
                        <div className="empty-state-text">推播歷史讀取失敗，請稍後再試。</div>
                    </div>
                ) : (
                    <div className="table-container">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>客群</th>
                                    <th>標題</th>
                                    <th style={{ textAlign: 'right' }}>送出數</th>
                                    <th>狀態</th>
                                    <th>送出時間</th>
                                </tr>
                            </thead>
                            <tbody>
                                {broadcastsQuery.data?.data.map((b) => (
                                    <tr key={b.id}>
                                        <td>{SEGMENT_OPTIONS.find((s) => s.value === b.targetSegment)?.label ?? b.targetSegment}</td>
                                        <td>
                                            <div className="font-semibold">{b.title}</div>
                                            <div className="text-sm text-muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 280 }}>
                                                {b.content}
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{b.sentCount}</td>
                                        <td>
                                            <span className={`badge ${STATUS_BADGE[b.status] ?? 'badge-info'}`}>
                                                {b.status.toUpperCase()}
                                            </span>
                                        </td>
                                        <td>{b.sentAt ? new Date(b.sentAt).toLocaleString() : '—'}</td>
                                    </tr>
                                ))}
                                {broadcastsQuery.data?.data.length === 0 && (
                                    <tr>
                                        <td colSpan={5}>
                                            <div className="empty-state">
                                                <div className="empty-state-icon">📭</div>
                                                <div className="empty-state-title">尚無推播紀錄</div>
                                                <div className="empty-state-text">送出第一則推播後，這裡會顯示歷史紀錄。</div>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function MarketingPage() {
    return (
        <PlanGate plan="pro">
            <MarketingPageInner />
        </PlanGate>
    );
}
